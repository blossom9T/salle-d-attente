// COURSE DE FRAPPE — le même texte pour tous, le premier qui le tape en entier gagne.
import { h, vider, alea, sons, normaliser } from "../outils.js";
import { afficheur, minutes, majCourse } from "../ui.js";
import TEXTES from "../../data/textes.js";

const DECOMPTE = 3500;

export default {
  id: "frappe",
  teinte: "#EFA3BF",
  nom: "Course de frappe",
  accroche: "Un texte, tout le monde tape en même temps. Les fautes, il faut les corriger.",
  regles: [
    "Tape le texte affiché. Une faute bloque la suite : efface-la pour continuer.",
    "Accents souples : « e » est accepté pour « é ». Passe en accents stricts pour les puristes.",
    "Le premier arrivé gagne. Ton score est ta vitesse en mots par minute (1 mot = 5 caractères).",
  ],
  min: 1,
  max: 10,
  duree: "1–2 min",
  score: { unite: "mots/min", sens: "haut", format: (v) => `${v} mots/min` },
  options: [
    { id: "longueur", nom: "Texte", valeurs: ["court", "moyen"], libelles: ["Court", "Moyen"], defaut: "court" },
    { id: "accents", nom: "Accents", valeurs: ["souples", "stricts"], libelles: ["Souples", "Stricts"], defaut: "souples" },
  ],

  creer({ joueurs, options, maintenant }) {
    const texte = alea.choisir(TEXTES[options.longueur]);
    const debut = maintenant + DECOMPTE;
    return {
      texte,
      strict: options.accents === "stricts",
      debut,
      fin: debut + Math.max(60000, texte.length * 600),
      joueurs: Object.fromEntries(joueurs.map((c) => [c, { pos: 0, fini: false, temps: null, erreurs: 0, mpm: 0 }])),
      arrivees: 0,
      fini: false,
    };
  },

  action(etat, cle, a, maintenant) {
    const j = etat.joueurs[cle];
    if (!j || j.fini || maintenant < etat.debut) return false;
    if (a.type === "pos") {
      j.pos = Math.max(0, Math.min(etat.texte.length, a.pos | 0));
      j.erreurs = a.erreurs | 0;
      j.mpm = vitesse(j.pos, maintenant - etat.debut);
      return true;
    }
    if (a.type === "fini") {
      j.pos = etat.texte.length;
      j.fini = true;
      j.temps = Math.max(1000, Math.min(Number(a.temps) || 0, maintenant - etat.debut + 2000));
      j.erreurs = a.erreurs | 0;
      j.mpm = vitesse(etat.texte.length, j.temps);
      j.place = ++etat.arrivees;
      return true;
    }
    return false;
  },

  tic(etat, maintenant) {
    if (etat.fini) return false;
    const actifs = Object.values(etat.joueurs).filter((j) => !j.parti);
    if (maintenant >= etat.fin || actifs.every((j) => j.fini)) {
      etat.fini = true;
      return true;
    }
    return false;
  },

  depart(etat, cle) {
    if (etat.joueurs[cle]) etat.joueurs[cle].parti = true;
    return true;
  },

  fin(etat) {
    if (!etat.fini) return null;
    const lignes = Object.entries(etat.joueurs).map(([cle, j]) => ({ cle, j }));
    const cmp = (a, b) =>
      a.j.fini && b.j.fini ? a.j.temps - b.j.temps : a.j.fini ? -1 : b.j.fini ? 1 : b.j.pos - a.j.pos;
    lignes.sort(cmp);
    let rang = 0;
    return lignes.map((l, i) => {
      if (i === 0 || cmp(lignes[i - 1], l) !== 0) rang = i + 1;
      const precision = Math.round((100 * etat.texte.length) / (etat.texte.length + l.j.erreurs));
      return { cle: l.cle, rang, score: l.j.mpm, detail: l.j.fini ? `${precision} % de précision` : "pas fini" };
    });
  },

  vue: vueFrappe,
};

function vitesse(caracteres, ms) {
  return ms > 0 ? Math.round(caracteres / 5 / (ms / 60000)) : 0;
}

// ── Affichage ────────────────────────────────────────────────
function vueFrappe(racine, ctx) {
  let etatCourant = null;
  let erreurs = 0;
  let correct = 0;
  let termine = false;
  let envoiPrevu = null;
  let spans = [];
  let dernierBip = null;

  const chrono = h("div.frappe-chrono.ecran");
  const stats = h("p.frappe-stats");
  const texte = h("div.frappe-texte");
  const champ = h("textarea.frappe-champ", {
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: false,
    "aria-label": "Tape le texte ici",
  });
  const zone = h("div.frappe-zone", { onclick: () => champ.focus() }, texte, champ);
  const decompte = h("div.frappe-decompte");
  const piste = h("div.course");
  vider(racine, h("div.jeu-frappe", h("div.frappe-tete", stats, chrono), h("div.frappe-cadre", zone, decompte), piste));

  const egal = (a, b) => a === b || (!etatCourant.strict && normaliser(a) === normaliser(b) && normaliser(a) !== "");

  champ.addEventListener("input", (e) => {
    const etat = etatCourant;
    if (!etat || termine || !(ctx.moi in etat.joueurs) || ctx.maintenant() < etat.debut) {
      champ.value = "";
      return;
    }
    const saisi = champ.value.replace(/\n/g, " ");
    if (e.inputType?.startsWith("insert")) {
      const i = saisi.length - 1;
      if (i >= 0 && !(i < etat.texte.length && egal(saisi[i], etat.texte[i]))) {
        erreurs++;
        sons.bip(160, 0.07, 0.05, "square");
      } else sons.touche();
    }
    if (saisi.length > etat.texte.length + 5) champ.value = saisi.slice(0, etat.texte.length + 5);
    correct = 0;
    while (correct < saisi.length && correct < etat.texte.length && egal(saisi[correct], etat.texte[correct])) correct++;
    dessinerTexte(saisi.length);
    if (correct === etat.texte.length) {
      termine = true;
      champ.blur();
      sons.ok();
      ctx.envoyer({ type: "fini", temps: ctx.maintenant() - etat.debut, erreurs });
    } else if (!envoiPrevu) {
      envoiPrevu = setTimeout(() => {
        envoiPrevu = null;
        if (!termine) ctx.envoyer({ type: "pos", pos: correct, erreurs });
      }, 200);
    }
  });
  champ.addEventListener("paste", (e) => e.preventDefault());

  function dessinerTexte(longueurSaisie) {
    spans.forEach((s, i) => {
      s.className = i < correct ? "ok" : i < longueurSaisie ? "faux" : i === longueurSaisie ? "curseur" : "";
    });
  }

  function maj(etat) {
    if (!etatCourant) {
      spans = [...etat.texte].map((c) => h("span", c));
      vider(texte, spans);
      dessinerTexte(0);
    }
    etatCourant = etat;
    const t = ctx.maintenant();
    const joue = ctx.moi in etat.joueurs;
    const enCours = t >= etat.debut && t < etat.fin;
    champ.disabled = !joue || termine || !enCours;
    if (joue && enCours && !termine && document.activeElement !== champ) champ.focus();

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
      decompte.hidden = false;
      vider(decompte, afficheur(String(Math.ceil((etat.debut - t) / 1000)), { taille: "l" }));
    } else decompte.hidden = true;

    const moi = etat.joueurs[ctx.moi];
    const mpm = termine && moi?.fini ? moi.mpm : t > etat.debut ? vitesse(correct, t - etat.debut) : 0;
    stats.textContent = !joue
      ? "Tu regardes la course."
      : termine
        ? moi?.fini ? `Arrivé ${moi.place === 1 ? "premier" : `${moi.place}e`} ! ${moi.mpm} mots par minute.` : "Arrivé !"
        : `${mpm} mots par minute, ${erreurs} faute${erreurs > 1 ? "s" : ""}`;
    vider(chrono, afficheur(minutes(t < etat.debut ? etat.fin - etat.debut : etat.fin - t), { taille: "s", titre: "Temps restant" }));

    majCourse(
      piste,
      Object.entries(etat.joueurs).map(([cle, x]) => ({
        cle,
        joueur: ctx.joueur(cle),
        progression: x.pos / etat.texte.length,
        valeur: x.pos ? String(x.mpm) : "",
        classes: [cle === ctx.moi ? "moi" : "", x.fini ? "arrive" : ""].join(" ").trim(),
      })),
      { arrivee: true }
    );
  }

  return { maj, detruire() { clearTimeout(envoiPrevu); } };
}
