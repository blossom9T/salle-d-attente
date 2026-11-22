// Enregistrement des parties et lecture du classement.
// Avec Supabase : base partagée (voir supabase/schema.sql).
// Sans Supabase : même logique, stockée dans ce navigateur.
import { enLigne, supabase } from "./reseau.js";

// Règle des points : 1 point par adversaire battu (les parties solo comptent pour les records).
export function pointsPour(rang, resultats) {
  return resultats.filter((r) => r.rang > rang).length;
}

// resultats : [{ pid, pseudo, couleur, rang, score }]
export async function enregistrerPartie({ jeu, salon, resultats }) {
  // Un même joueur peut avoir deux onglets dans un salon : on garde sa meilleure place.
  const parJoueur = new Map();
  for (const r of resultats) {
    const deja = parJoueur.get(r.pid);
    if (!deja || r.rang < deja.rang) parJoueur.set(r.pid, r);
  }
  const lignes = [...parJoueur.values()].map((r) => ({
    pid: r.pid,
    pseudo: r.pseudo,
    couleur: r.couleur,
    rang: r.rang,
    score: Number(r.score) || 0,
  }));
  if (!lignes.length) return;
  if (enLigne) {
    const sb = await supabase();
    const { error } = await sb.rpc("enregistrer_partie", { p_jeu: jeu, p_salon: salon, p_resultats: lignes });
    if (error) throw error;
    return;
  }
  const base = lireLocal();
  base.parties.unshift({ jeu, salon, date: new Date().toISOString(), nb: lignes.length, resultats: lignes });
  base.parties = base.parties.slice(0, 600);
  for (const l of lignes) base.joueurs[l.pid] = { pseudo: l.pseudo, couleur: l.couleur };
  localStorage.setItem("sa.base", JSON.stringify(base));
}

// Classement général ou d'un jeu : [{ pid, pseudo, couleur, points, victoires, parties, record }]
export async function lireClassement(jeu = null) {
  if (enLigne) {
    const sb = await supabase();
    const requete = jeu
      ? sb.from("classement_jeux").select("*").eq("jeu", jeu)
      : sb.from("classement_general").select("*");
    const { data, error } = await requete.order("points", { ascending: false }).limit(200);
    if (error) throw error;
    return data.map((d) => ({
      pid: d.joueur_id,
      pseudo: d.pseudo,
      couleur: d.couleur,
      points: d.points,
      victoires: d.victoires,
      parties: d.parties,
      record: d.record ?? null,
    }));
  }
  const base = lireLocal();
  const stats = new Map();
  for (const p of base.parties) {
    if (jeu && p.jeu !== jeu) continue;
    for (const r of p.resultats) {
      const s = stats.get(r.pid) || { pid: r.pid, points: 0, victoires: 0, parties: 0, record: null };
      s.parties++;
      if (p.nb > 1) {
        s.points += p.resultats.filter((x) => x.rang > r.rang).length;
        if (r.rang === 1) s.victoires++;
      }
      if (jeu) s.record = s.record == null ? r.score : jeu === "reflexe" ? Math.min(s.record, r.score) : Math.max(s.record, r.score);
      stats.set(r.pid, s);
    }
  }
  return [...stats.values()]
    .map((s) => ({ ...s, ...base.joueurs[s.pid] }))
    .sort((a, b) => b.points - a.points || b.victoires - a.victoires);
}

// Dernières parties : [{ jeu, date, nb, gagnant: {pseudo, couleur}, score }]
export async function dernieresParties(limite = 8) {
  if (enLigne) {
    const sb = await supabase();
    const { data, error } = await sb.from("dernieres_parties").select("*").order("jouee_le", { ascending: false }).limit(limite);
    if (error) throw error;
    return data.map((d) => ({
      jeu: d.jeu,
      date: d.jouee_le,
      nb: d.nb_joueurs,
      gagnant: { pseudo: d.gagnant, couleur: d.couleur },
      score: d.score,
    }));
  }
  return lireLocal()
    .parties.slice(0, limite)
    .map((p) => {
      const g = p.resultats.find((r) => r.rang === 1) || p.resultats[0];
      return { jeu: p.jeu, date: p.date, nb: p.nb, gagnant: { pseudo: g.pseudo, couleur: g.couleur }, score: g.score };
    });
}

function lireLocal() {
  try {
    const b = JSON.parse(localStorage.getItem("sa.base"));
    if (b?.parties) return b;
  } catch {}
  return { joueurs: {}, parties: [] };
}
