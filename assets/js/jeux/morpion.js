// MORPION — en duel, le gagnant reste à la table.
// Variante « 3 pions » (par défaut) : chacun n'a que trois pions,
// le quatrième fait disparaître le plus ancien. Plus de match nul.
// Seul ? On joue contre le robot.
import { h, vider, alea, sons } from "../outils.js";
import { avatar } from "../ui.js";

const LIGNES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const ROBOT = "robot";
const DELAI_COUP = 15000, PAUSE = 2600, COUPS_MAX = 40;

export default {
  id: "morpion",
  teinte: "#E5C27A",
  nom: "Morpion",
  accroche: "Trois pions chacun, le plus vieux s'efface. Le gagnant garde sa place.",
  regles: [
    "Aligne trois symboles pour gagner la manche. Version « 3 pions » : quand tu poses ton quatrième, ton plus ancien disparaît (il pâlit juste avant).",
    "À plusieurs, deux joueurs s'affrontent : le gagnant reste, le perdant retourne dans la file.",
    "15 secondes par coup, sinon un coup est joué au hasard pour toi. Le premier à atteindre l'objectif de victoires gagne.",
    "Seul, tu affrontes le robot.",
  ],
  min: 1,
  max: 10,
  duree: "2–6 min",
  score: { unite: "victoires", sens: "haut", format: (v) => `${v} victoire${v > 1 ? "s" : ""}` },
  options: [
    { id: "variante", nom: "Variante", valeurs: ["infini", "classique"], libelles: ["3 pions", "Classique"], defaut: "infini" },
    { id: "objectif", nom: "Victoires pour gagner", valeurs: [2, 3, 5], defaut: 3 },
  ],

  creer({ joueurs, options, maintenant }) {
    const file = alea.melanger(joueurs);
    const seul = joueurs.length === 1;
    const etat = {
      infini: options.variante === "infini",
      objectif: options.objectif,
      victoires: Object.fromEntries(joueurs.map((c) => [c, 0])),
      seul,
      x: file.shift(),
      o: seul ? ROBOT : file.shift(),
      file,
      champion: null,
      manche: 0,
      fini: false,
    };
    nouvelleManche(etat, maintenant);
    return etat;
  },

  action(etat, cle, a, maintenant) {
    if (a.type !== "jouer" || etat.fini || etat.gagnant !== null || maintenant < etat.debut) return false;
    if (etat[etat.trait] !== cle) return false;
    return jouer(etat, a.case, maintenant);
  },

  tic(etat, maintenant) {
    if (etat.fini) return false;
    if (etat.gagnant !== null) {
      if (maintenant < etat.finPause) return false;
      suite(etat, maintenant);
      return true;
    }
    if (maintenant < etat.debut) return false;
    const joueur = etat[etat.trait];
    if (joueur === ROBOT && maintenant >= etat.debutCoup + 700) return jouer(etat, coupRobot(etat), maintenant);
    if (maintenant >= etat.debutCoup + DELAI_COUP) {
      const libres = etat.grille.map((v, i) => (v ? null : i)).filter((i) => i !== null);
      return jouer(etat, alea.choisir(libres), maintenant);
    }
    return false;
  },

  depart(etat, cle, maintenant) {
    if (!(cle in etat.victoires)) return false;
    etat.file = etat.file.filter((c) => c !== cle);
    etat.partis = [...(etat.partis || []), cle];
    const humains = Object.keys(etat.victoires).filter((c) => !etat.partis.includes(c));
    if (humains.length === 0 || (!etat.seul && humains.length === 1)) {
      etat.fini = true;
      return true;
    }
    if ((etat.x === cle || etat.o === cle) && etat.gagnant === null) {
      const autre = etat.x === cle ? etat.o : etat.x;
      finirManche(etat, autre, null, maintenant);
    }
    return true;
  },

  fin(etat) {
    if (!etat.fini) return null;
    const lignes = Object.entries(etat.victoires).map(([cle, v]) => ({ cle, v }));
    lignes.sort((a, b) => b.v - a.v);
    let rang = 0;
    return lignes.map((l, i) => {
      if (i === 0 || lignes[i - 1].v !== l.v) rang = i + 1;
      const detail = etat.seul ? `contre le robot : ${l.v} à ${etat.victoiresRobot || 0}` : null;
      return { cle: l.cle, rang, score: l.v, detail };
    });
  },

  vue: vueMorpion,
};

function nouvelleManche(etat, maintenant) {
  etat.manche++;
  etat.grille = Array(9).fill(null);
  etat.poses = { x: [], o: [] };
  etat.trait = "x";
  etat.gagnant = null;
  etat.ligne = null;
  etat.coups = 0;
  etat.debut = maintenant + 900;
  etat.debutCoup = etat.debut;
}

// Applique les règles (avec la disparition du plus vieux pion en variante « 3 pions »).
function appliquer(grille, poses, symbole, i, infini) {
  const g = [...grille];
  const p = { x: [...poses.x], o: [...poses.o] };
  if (infini && p[symbole].length === 3) g[p[symbole].shift()] = null;
  g[i] = symbole;
  p[symbole].push(i);
  return { g, p };
}
function ligneGagnante(g, s) {
  return LIGNES.find((l) => l.every((i) => g[i] === s)) || null;
}

function jouer(etat, i, maintenant) {
  if (!Number.isInteger(i) || i < 0 || i > 8 || etat.grille[i]) return false;
  const s = etat.trait;
  const { g, p } = appliquer(etat.grille, etat.poses, s, i, etat.infini);
  etat.grille = g;
  etat.poses = p;
  etat.coups++;
  etat.dernier = i;
  const ligne = ligneGagnante(g, s);
  if (ligne) finirManche(etat, etat[s], ligne, maintenant);
  else if (g.every(Boolean) || etat.coups >= COUPS_MAX) finirManche(etat, "", null, maintenant);
  else {
    etat.trait = s === "x" ? "o" : "x";
    etat.debutCoup = maintenant;
  }
  return true;
}

function finirManche(etat, gagnant, ligne, maintenant) {
  etat.gagnant = gagnant; // "" = match nul
  etat.ligne = ligne;
  etat.finPause = maintenant + PAUSE;
  if (gagnant && gagnant !== ROBOT) {
    etat.victoires[gagnant]++;
    if (etat.victoires[gagnant] >= etat.objectif) etat.finPause = maintenant + 1800;
  }
  if (gagnant === ROBOT) etat.victoiresRobot = (etat.victoiresRobot || 0) + 1;
}

// Après une manche : qui reste, qui sort.
function suite(etat, maintenant) {
  const objectifAtteint = Object.values(etat.victoires).some((v) => v >= etat.objectif) || (etat.victoiresRobot || 0) >= etat.objectif;
  if (objectifAtteint) {
    etat.fini = true;
    return;
  }
  const partis = etat.partis || [];
  const { x, o, gagnant } = etat;
  if (etat.seul || etat.file.length === 0) {
    // Duel : on inverse simplement qui commence.
    const restants = [x, o].filter((c) => !partis.includes(c));
    etat.x = restants.length === 2 ? o : restants[0];
    etat.o = restants.length === 2 ? x : etat.file.shift();
  } else {
    // Le gagnant reste (en cas de nul, c'est le champion en place qui reste).
    const reste = gagnant || (etat.champion && [x, o].includes(etat.champion) ? etat.champion : x);
    const sort = reste === x ? o : x;
    if (!partis.includes(sort)) etat.file.push(sort);
    etat.champion = reste;
    etat.x = etat.file.shift();
    etat.o = reste;
  }
  nouvelleManche(etat, maintenant);
}

// Le robot : petit minimax sur quelques coups, avec un peu d'erreur pour rester battable.
function coupRobot(etat) {
  const moi = etat.trait;
  const lui = moi === "x" ? "o" : "x";
  const libres = etat.grille.map((v, i) => (v ? null : i)).filter((i) => i !== null);
  if (Math.random() < 0.18) return alea.choisir(libres);
  const profondeurMax = etat.infini ? 4 : 9;
  function valeur(g, p, trait, profondeur) {
    const precedent = trait === "x" ? "o" : "x";
    if (ligneGagnante(g, precedent)) return precedent === moi ? 10 - profondeur : profondeur - 10;
    if (profondeur >= profondeurMax || g.every(Boolean)) return 0;
    let meilleur = trait === moi ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (g[i]) continue;
      const r = appliquer(g, p, trait, i, etat.infini);
      const v = valeur(r.g, r.p, trait === "x" ? "o" : "x", profondeur + 1);
      meilleur = trait === moi ? Math.max(meilleur, v) : Math.min(meilleur, v);
    }
    return meilleur;
  }
  let meilleurs = [], score = -Infinity;
  for (const i of libres) {
    const r = appliquer(etat.grille, etat.poses, moi, i, etat.infini);
    const v = valeur(r.g, r.p, lui, 1);
    if (v > score) [score, meilleurs] = [v, [i]];
    else if (v === score) meilleurs.push(i);
  }
  return alea.choisir(meilleurs);
}

// ── Affichage ────────────────────────────────────────────────
const SYMBOLES = {
  x: `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M24 24 76 76M76 24 24 76"/></svg>`,
  o: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="27"/></svg>`,
};

function vueMorpion(racine, ctx) {
  let derniereManche = 0, dernierCoup = -1;
  const infos = (cle) => (cle === ROBOT ? { pseudo: "Le robot", couleur: "#4F6470" } : ctx.joueur(cle));
  const duel = h("div.morpion-duel");
  const tour = h("p.morpion-tour", { "aria-live": "polite" });
  const minuteur = h("div.morpion-minuteur", h("i"));
  const cases = Array.from({ length: 9 }, (_, i) =>
    h("button.morpion-case", { type: "button", "aria-label": `Case ${i + 1}`, onclick: () => ctx.envoyer({ type: "jouer", case: i }) })
  );
  const plateau = h("div.morpion-plateau", cases);
  const tableau = h("div.morpion-scores");
  vider(racine, h("div.jeu-morpion", duel, h("div.morpion-centre", plateau, minuteur, tour), tableau));

  function maj(etat) {
    const maintenant = ctx.maintenant();
    const jx = infos(etat.x), jo = infos(etat.o);
    const actif = etat[etat.trait];
    vider(
      duel,
      h(`div.morpion-camp${etat.gagnant === null && etat.trait === "x" ? ".actif" : ""}`, { style: { "--c": jx.couleur } }, h("span.symbole", { html: SYMBOLES.x }), avatar(jx, "m"), h("span.nom", jx.pseudo)),
      h("span.morpion-contre", "contre"),
      h(`div.morpion-camp${etat.gagnant === null && etat.trait === "o" ? ".actif" : ""}`, { style: { "--c": jo.couleur } }, h("span.symbole", { html: SYMBOLES.o }), avatar(jo, "m"), h("span.nom", jo.pseudo))
    );

    const vaPartir = etat.infini && etat.gagnant === null && etat.poses[etat.trait].length === 3 ? etat.poses[etat.trait][0] : -1;
    const aMoi = actif === ctx.moi && etat.gagnant === null && maintenant >= etat.debut;
    cases.forEach((b, i) => {
      const s = etat.grille[i];
      const proprietaire = s ? infos(etat[s]) : null;
      b.className = "morpion-case" + (s ? " " + s : "") + (i === vaPartir ? " va-partir" : "") + (etat.ligne?.includes(i) ? " gagnante" : "");
      b.style.setProperty("--c", proprietaire?.couleur || "transparent");
      if (b.dataset.s !== (s || "")) {
        b.innerHTML = s ? SYMBOLES[s] : "";
        b.dataset.s = s || "";
      }
      b.disabled = !aMoi || Boolean(s);
    });
    if (etat.manche !== derniereManche) derniereManche = etat.manche;
    const signatureCoup = `${etat.manche}:${etat.coups}`;
    if (signatureCoup !== dernierCoup && etat.coups > 0) {
      const premier = dernierCoup === -1;
      dernierCoup = signatureCoup;
      if (!premier) {
        sons.pion();
        // En variante « 3 pions », un pion vient de disparaître ?
        const total = etat.grille.filter(Boolean).length;
        if (etat.infini && total < Math.min(etat.coups, 6)) setTimeout(() => sons.retirePion(), 150);
        if (etat.gagnant !== null && etat.gagnant !== "") setTimeout(() => (etat.gagnant === ctx.moi ? sons.victoire() : sons.fin()), 350);
      }
    }

    const resteCoup = Math.max(0, etat.debutCoup + DELAI_COUP - maintenant);
    minuteur.firstChild.style.transform = `scaleX(${etat.gagnant === null ? resteCoup / DELAI_COUP : 0})`;
    minuteur.classList.toggle("urgent", resteCoup < 5000);

    if (etat.gagnant !== null) {
      tour.textContent = etat.gagnant === "" ? "Match nul." : etat.gagnant === ctx.moi ? "Tu gagnes la manche !" : `${infos(etat.gagnant).pseudo} gagne la manche.`;
    } else if (maintenant < etat.debut) tour.textContent = `Manche ${etat.manche}`;
    else if (aMoi) tour.textContent = "À toi de jouer.";
    else tour.textContent = `${infos(actif).pseudo} réfléchit…`;

    const file = etat.file.length ? h("p.morpion-file", "Ensuite : ", etat.file.map((c) => infos(c).pseudo).join(", ")) : null;
    vider(
      tableau,
      h("h3", `Premier à ${etat.objectif} victoires`),
      h(
        "ol",
        Object.entries(etat.victoires)
          .concat(etat.seul ? [[ROBOT, etat.victoiresRobot || 0]] : [])
          .sort((a, b) => b[1] - a[1])
          .map(([cle, v]) => h("li", avatar(infos(cle), "s"), h("span.nom", infos(cle).pseudo), h("span.compte", Array.from({ length: etat.objectif }, (_, i) => h(`i${i < v ? ".gagne" : ""}`)))))
      ),
      file
    );
  }
  return { maj, detruire() {} };
}
