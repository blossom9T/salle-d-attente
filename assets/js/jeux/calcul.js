// CALCUL ÉCLAIR — le plus de calculs justes avant la fin du chrono.
// Tout le monde reçoit exactement la même suite d'opérations (même graine).
import { h, vider, hasard, alea, sons } from "../outils.js";
import { afficheur, minutes, majCourse } from "../ui.js";

const DECOMPTE = 3000;

export default {
  id: "calcul",
  teinte: "#B9A3E3",
  nom: "Calcul éclair",
  accroche: "Les mêmes opérations pour tous. Une minute, pas de calculatrice.",
  regles: [
    "Tape le résultat : dès qu'il est juste, on passe au calcul suivant, pas besoin de valider.",
    "Entrée sur une mauvaise réponse compte comme une erreur. Tu peux passer avec la touche Échap (compte aussi comme erreur).",
    "Classement au nombre de bonnes réponses, puis au moins d'erreurs.",
  ],
  min: 1,
  max: 10,
  duree: "1–2 min",
  score: { unite: "justes", sens: "haut", format: (v) => `${v} juste${v > 1 ? "s" : ""}` },
  options: [
    { id: "duree", nom: "Durée", valeurs: [30, 60, 90], libelles: ["30 s", "1 min", "1 min 30"], defaut: 60 },
    { id: "niveau", nom: "Niveau", valeurs: ["facile", "normal", "costaud"], libelles: ["Facile", "Normal", "Costaud"], defaut: "normal" },
  ],

  creer({ joueurs, options, maintenant }) {
    const debut = maintenant + DECOMPTE;
    return {
      graine: alea.entier(1, 2 ** 31),
      niveau: options.niveau,
      debut,
      fin: debut + options.duree * 1000,
      scores: Object.fromEntries(joueurs.map((c) => [c, { justes: 0, erreurs: 0, dernier: 0 }])),
      fini: false,
    };
  },

  action(etat, cle, a, maintenant) {
    const s = etat.scores[cle];
    if (!s || a.type !== "score" || maintenant > etat.fin + 1500) return false;
    s.justes = Math.max(s.justes, Math.min(500, a.justes | 0));
    s.erreurs = Math.max(s.erreurs, a.erreurs | 0);
    s.dernier = maintenant - etat.debut;
    return true;
  },

  tic(etat, maintenant) {
    if (etat.fini || maintenant < etat.fin + 800) return false;
    etat.fini = true;
    return true;
  },

  depart() {
    return false;
  },

  fin(etat) {
    if (!etat.fini) return null;
    const lignes = Object.entries(etat.scores).map(([cle, s]) => ({ cle, s }));
    const cmp = (a, b) => b.s.justes - a.s.justes || a.s.erreurs - b.s.erreurs;
    lignes.sort(cmp);
    let rang = 0;
    return lignes.map((l, i) => {
      if (i === 0 || cmp(lignes[i - 1], l) !== 0) rang = i + 1;
      return { cle: l.cle, rang, score: l.s.justes, detail: `${l.s.erreurs} erreur${l.s.erreurs > 1 ? "s" : ""}` };
    });
  },

  vue: vueCalcul,
};

// Génère la suite de calculs à partir de la graine (identique chez tout le monde).
export function calculs(graine, niveau) {
  const r = hasard(graine);
  const liste = [];
  for (let i = 0; i < 400; i++) {
    const type = r.choisir(niveau === "facile" ? ["+", "+", "-", "×"] : ["+", "-", "×", "×", "÷"]);
    let a, b, res;
    const n = (min, max) => r.entier(min, max);
    if (type === "+") {
      [a, b] = niveau === "facile" ? [n(2, 20), n(2, 20)] : niveau === "normal" ? [n(11, 99), n(5, 99)] : [n(101, 999), n(45, 999)];
      res = a + b;
    } else if (type === "-") {
      [a, b] = niveau === "facile" ? [n(5, 20), n(1, 10)] : niveau === "normal" ? [n(20, 120), n(5, 60)] : [n(200, 999), n(45, 400)];
      if (b > a) [a, b] = [b, a];
      res = a - b;
    } else if (type === "×") {
      [a, b] = niveau === "facile" ? [n(2, 9), n(2, 9)] : niveau === "normal" ? [n(3, 12), n(3, 12)] : [n(6, 25), n(4, 15)];
      res = a * b;
    } else {
      const q = niveau === "costaud" ? n(4, 25) : n(2, 12);
      b = niveau === "costaud" ? n(4, 15) : n(2, 10);
      a = q * b;
      res = q;
    }
    liste.push({ texte: `${a} ${type === "-" ? "−" : type} ${b}`, res });
  }
  return liste;
}

// ── Affichage ────────────────────────────────────────────────
function vueCalcul(racine, ctx) {
  let etatCourant = null;
  let suite = null;
  let index = 0, justes = 0, erreurs = 0, serie = 0, dernierBip = null;

  const chrono = h("div.calcul-chrono.ecran");
  const operation = h("div.calcul-operation");
  const champ = h("input.champ.calcul-champ", {
    type: "text",
    inputMode: "numeric",
    autocomplete: "off",
    "aria-label": "Ta réponse",
  });
  const compteur = h("p.calcul-compteur");
  const piste = h("div.course");
  vider(racine, h("div.jeu-calcul", h("div.calcul-tete", chrono), h("div.calcul-carte", operation, champ, compteur), piste));

  function actif() {
    const t = ctx.maintenant();
    return etatCourant && ctx.moi in etatCourant.scores && t >= etatCourant.debut && t < etatCourant.fin;
  }
  function envoyer() {
    ctx.envoyer({ type: "score", justes, erreurs });
  }
  function suivant(bon) {
    if (bon) {
      justes++;
      sons.juste(serie++);
    } else {
      erreurs++;
      serie = 0;
      sons.non();
      champ.classList.remove("refus");
      void champ.offsetWidth;
      champ.classList.add("refus");
    }
    index++;
    champ.value = "";
    envoyer();
    dessiner();
  }
  champ.addEventListener("input", () => {
    champ.value = champ.value.replace(/[^0-9-]/g, "");
    if (!actif() || !suite) return;
    if (champ.value !== "" && Number(champ.value) === suite[index].res) suivant(true);
  });
  champ.addEventListener("keydown", (e) => {
    if (!actif() || !suite) return;
    if (e.key === "Enter" && champ.value !== "") suivant(Number(champ.value) === suite[index].res);
    if (e.key === "Escape") suivant(false);
  });

  function dessiner() {
    const etat = etatCourant;
    const t = ctx.maintenant();
    const joue = ctx.moi in etat.scores;
    if (t < etat.debut) {
      const sec = Math.ceil((etat.debut - t) / 1000);
      if (sec !== dernierBip && sec <= 3) {
        dernierBip = sec;
        sons.decompte();
      }
    } else if (dernierBip > 0) {
      dernierBip = 0;
      sons.decompte(true);
    }
    if (t < etat.debut) {
      vider(operation, afficheur(String(Math.ceil((etat.debut - t) / 1000)), { taille: "l" }));
      operation.classList.add("decompte");
    } else if (t >= etat.fin) {
      operation.classList.remove("decompte");
      operation.textContent = "Temps écoulé";
    } else {
      operation.classList.remove("decompte");
      operation.textContent = joue ? `${suite[index].texte} =` : "Tu regardes la partie";
    }
    champ.disabled = !actif();
    champ.hidden = !joue;
    if (actif() && document.activeElement !== champ) champ.focus();
    compteur.textContent = joue ? `${justes} juste${justes > 1 ? "s" : ""}, ${erreurs} erreur${erreurs > 1 ? "s" : ""}` : "";
    const reste = t < etat.debut ? etat.fin - etat.debut : etat.fin - t;
    vider(chrono, afficheur(minutes(reste), { taille: "s", titre: "Temps restant" }));
    chrono.classList.toggle("urgent", t >= etat.debut && reste < 10000);
  }

  function maj(etat) {
    if (!suite) suite = calculs(etat.graine, etat.niveau);
    etatCourant = etat;
    dessiner();
    const meilleur = Math.max(10, ...Object.values(etat.scores).map((s) => s.justes));
    majCourse(
      piste,
      Object.entries(etat.scores).map(([cle, s]) => ({
        cle,
        joueur: ctx.joueur(cle),
        progression: s.justes / meilleur,
        valeur: String(s.justes),
        classes: cle === ctx.moi ? "moi" : "",
      }))
    );
  }

  return { maj, detruire() {} };
}
