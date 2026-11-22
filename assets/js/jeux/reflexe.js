// RÉFLEXE — clique dès que l'écran passe au vert.
// Chaque navigateur mesure le temps de réaction lui-même : la latence réseau ne compte pas.
import { h, vider, alea, sons } from "../outils.js";
import { avatar, afficheur } from "../ui.js";

const PENALITE = 1000, ATTENTE_MAX = 3500, BILAN = 2600;

export default {
  id: "reflexe",
  teinte: "#93B8EC",
  nom: "Réflexe",
  accroche: "Attends le vert, clique. Le plus rapide en moyenne gagne.",
  regles: [
    "L'écran passe au vert après un délai au hasard : clique (ou appuie sur Espace) le plus vite possible.",
    "Cliquer avant le vert, même pendant un flash orange, compte comme un faux départ : 1 000 ms.",
    "Le classement se fait sur la moyenne de toutes les manches. Le plus bas gagne.",
  ],
  min: 1,
  max: 10,
  duree: "1–2 min",
  score: { unite: "ms", sens: "bas", format: (v) => `${v} ms` },
  options: [{ id: "manches", nom: "Manches", valeurs: [3, 5, 8], defaut: 5 }],

  creer({ joueurs, options, maintenant }) {
    const etat = {
      manche: 0,
      total: options.manches,
      res: Object.fromEntries(joueurs.map((c) => [c, []])),
      fini: false,
    };
    demarrer(etat, maintenant);
    return etat;
  },

  action(etat, cle, a, maintenant) {
    if (a.type !== "reponse" || etat.phase !== "manche" || a.manche !== etat.manche) return false;
    const r = etat.res[cle];
    if (!r || r[etat.manche - 1] != null) return false;
    r[etat.manche - 1] = a.tot ? -1 : Math.max(80, Math.min(PENALITE, Math.round(a.ms)));
    if (Object.entries(etat.res).every(([c, x]) => x[etat.manche - 1] != null || etat.partis?.includes(c))) bilan(etat, maintenant);
    return true;
  },

  tic(etat, maintenant) {
    if (etat.fini) return false;
    if (etat.phase === "manche" && maintenant > etat.vert + ATTENTE_MAX) {
      bilan(etat, maintenant);
      return true;
    }
    if (etat.phase === "bilan" && maintenant >= etat.finBilan) {
      if (etat.manche >= etat.total) etat.fini = true;
      else demarrer(etat, maintenant);
      return true;
    }
    return false;
  },

  depart(etat, cle) {
    etat.partis = [...(etat.partis || []), cle];
    if (Object.keys(etat.res).every((c) => etat.partis.includes(c))) etat.fini = true;
    return true;
  },

  fin(etat) {
    if (!etat.fini) return null;
    const lignes = Object.keys(etat.res).map((cle) => ({ cle, score: moyenne(etat.res[cle]) }));
    lignes.sort((a, b) => a.score - b.score);
    let rang = 0;
    return lignes.map((l, i) => {
      if (i === 0 || lignes[i - 1].score !== l.score) rang = i + 1;
      return { ...l, rang };
    });
  },

  vue: vueReflexe,
};

function demarrer(etat, maintenant) {
  etat.manche++;
  etat.phase = "manche";
  etat.debut = maintenant + 1400;
  const delai = alea.entier(1600, 4800);
  etat.vert = etat.debut + delai;
  etat.leurre = alea.nombre() < 0.35 && delai > 2200 ? etat.debut + alea.entier(700, delai - 1100) : null;
}
function bilan(etat, maintenant) {
  for (const r of Object.values(etat.res)) if (r[etat.manche - 1] == null) r[etat.manche - 1] = PENALITE;
  etat.phase = "bilan";
  etat.finBilan = maintenant + BILAN;
}
function valeur(v) {
  return v == null ? null : v < 0 ? PENALITE : v;
}
function moyenne(r) {
  const v = r.map(valeur).filter((x) => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : PENALITE;
}

// ── Affichage ────────────────────────────────────────────────
function vueReflexe(racine, ctx) {
  let etatCourant = null;
  let tVert = null; // performance.now() quand le vert s'est affiché
  let maReponse = new Map(); // manche → { ms | tot }
  let boucle = null;

  const texte = h("div.reflexe-texte");
  const zone = h("button.reflexe-zone", { type: "button", "aria-live": "polite" }, texte);
  const tableau = h("div.reflexe-tableau");
  vider(racine, h("div.jeu-reflexe", zone, tableau));

  function repondre(e) {
    e?.preventDefault();
    const etat = etatCourant;
    if (!etat || etat.phase !== "manche" || !(ctx.moi in etat.res) || maReponse.has(etat.manche)) return;
    if (ctx.maintenant() < etat.debut) return;
    if (tVert == null) {
      maReponse.set(etat.manche, { tot: true });
      sons.non();
      ctx.envoyer({ type: "reponse", manche: etat.manche, tot: true });
    } else {
      const ms = performance.now() - tVert;
      maReponse.set(etat.manche, { ms: Math.round(ms) });
      sons.juste(ms < 250 ? 12 : ms < 350 ? 7 : 0);
      ctx.envoyer({ type: "reponse", manche: etat.manche, ms });
    }
    dessiner();
  }
  zone.addEventListener("pointerdown", repondre);
  const clavier = (e) => {
    if (e.code === "Space" || e.key === " ") repondre(e);
  };
  window.addEventListener("keydown", clavier);
  zone.addEventListener("click", (e) => e.preventDefault());

  function etatZone() {
    const etat = etatCourant;
    const t = ctx.maintenant();
    const rep = maReponse.get(etat.manche);
    if (etat.phase === "bilan") return rep?.tot ? "tot" : "bilan";
    if (rep) return rep.tot ? "tot" : "fait";
    if (t < etat.debut) return "pret";
    if (t >= etat.vert) return "vert";
    if (etat.leurre && t >= etat.leurre && t < etat.leurre + 550) return "leurre";
    return "attente";
  }

  function dessiner() {
    const etat = etatCourant;
    if (!etat) return;
    const z = etatZone();
    if (z === "vert" && tVert == null) {
      tVert = performance.now();
    }
    if (z !== "vert" && z !== "fait") tVert = z === "pret" || z === "attente" || z === "leurre" ? null : tVert;
    zone.dataset.etat = z;
    const rep = maReponse.get(etat.manche);
    const spectateur = !(ctx.moi in etat.res);
    let contenu;
    if (z === "pret") contenu = [h("strong", `Manche ${etat.manche} sur ${etat.total}`), h("span", "Prépare-toi.")];
    else if (z === "attente" || z === "leurre") contenu = [h("strong", "Attends le vert…")];
    else if (z === "vert") contenu = [h("strong", spectateur ? "Vert !" : "Clique !")];
    else if (z === "tot") contenu = [h("strong", "Faux départ"), h("span", "1 000 ms pour cette manche.")];
    else {
      const ms = rep?.ms ?? valeur(etat.res[ctx.moi]?.[etat.manche - 1]);
      contenu = ms != null ? [afficheur(String(ms), { taille: "l", titre: `${ms} millisecondes` }), h("span", "millisecondes")] : [h("strong", "Manche terminée")];
    }
    if (zone.dataset.vu !== z + (rep ? "r" : "")) {
      vider(texte, contenu);
      zone.dataset.vu = z + (rep ? "r" : "");
    }
  }

  function boucler() {
    dessiner();
    boucle = requestAnimationFrame(boucler);
  }
  boucle = requestAnimationFrame(boucler);

  function maj(etat) {
    if (etatCourant?.manche !== etat.manche) {
      tVert = null;
      zone.dataset.vu = "";
    }
    etatCourant = etat;
    dessiner();
    const lignes = Object.keys(etat.res).sort((a, b) => moyenne(etat.res[a]) - moyenne(etat.res[b]));
    vider(
      tableau,
      h(
        "table.tableau",
        h("thead", h("tr", h("th", "Joueur"), Array.from({ length: etat.total }, (_, i) => h("th.num", `${i + 1}`)), h("th.num", "Moyenne"))),
        h(
          "tbody",
          lignes.map((cle) => {
            const r = etat.res[cle];
            const visibles = r.map((v, i) => (i < etat.manche - 1 || etat.phase === "bilan" || etat.fini ? v : null));
            return h(
              `tr${cle === ctx.moi ? ".moi" : ""}`,
              h("td", h("span.etiquette", avatar(ctx.joueur(cle), "s"), h("span.etiquette-nom", ctx.joueur(cle).pseudo))),
              Array.from({ length: etat.total }, (_, i) => {
                const v = visibles[i];
                return h(`td.num${v === -1 ? ".tot" : ""}`, v == null ? (i === etat.manche - 1 && r[i] != null ? "✓" : "") : v === -1 ? "raté" : v);
              }),
              h("td.num.fort", visibles.some((v) => v != null) ? moyenne(visibles.filter((v) => v != null)) : "")
            );
          })
        )
      )
    );
  }

  return {
    maj,
    detruire() {
      cancelAnimationFrame(boucle);
      window.removeEventListener("keydown", clavier);
    },
  };
}
