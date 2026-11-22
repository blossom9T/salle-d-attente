// BOMBE — le principe de Tic Tac Boum.
// Une syllabe s'affiche sur la bombe. Celui qui l'a en main doit taper un mot
// qui la contient, puis la bombe passe au suivant. La mèche a une durée cachée :
// quand elle explose, celui qui la tient perd une vie.
import { h, vider, normaliser, alea } from "../outils.js";
import { avatar } from "../ui.js";
import { sons } from "../outils.js";
import { chargerDictionnaire, syllabes } from "../dico.js";

const BONUS = "abcdefghijlmnopqrstuv"; // toutes ces lettres utilisées = une vie en plus
const MECHE_MIN = 9000, MECHE_MAX = 22000, TOUR_MIN = 3500, PAUSE_BOUM = 1800;

export default {
  id: "bombe",
  teinte: "#F2A88C",
  nom: "Bombe",
  accroche: "Un mot qui contient la syllabe, vite, avant que ça saute.",
  regles: [
    "La bombe affiche une syllabe. Si elle est devant toi, tape un mot qui la contient et valide avec Entrée.",
    "La mèche a une durée secrète. Si la bombe explose pendant ton tour, tu perds une vie.",
    "Un mot ne peut servir qu'une fois. Les accents sont facultatifs.",
    "Utilise toutes les lettres de A à V au fil de la partie pour gagner une vie.",
  ],
  min: 1,
  max: 10,
  duree: "3–6 min",
  score: { unite: "mots", sens: "haut", format: (v) => `${v} mot${v > 1 ? "s" : ""}` },
  options: [
    { id: "vies", nom: "Vies", valeurs: [1, 2, 3], defaut: 2 },
    { id: "niveau", nom: "Syllabes", valeurs: ["facile", "normal", "difficile"], libelles: ["Faciles", "Normales", "Corsées"], defaut: "normal" },
  ],

  async preparer(options) {
    const dico = await chargerDictionnaire();
    return { dico, liste: syllabes(dico, options.niveau) };
  },

  creer({ joueurs, options, maintenant, prep }) {
    const ordre = alea.melanger(joueurs);
    const etat = {
      ordre,
      tour: ordre[0],
      syllabe: "",
      saisie: "",
      joueurs: Object.fromEntries(ordre.map((c) => [c, { vies: options.vies, mots: 0, lettres: "" }])),
      viesMax: Math.max(3, options.vies),
      elimines: [],
      evenement: { n: 0 },
      dernierMot: null,
      pauseJusqua: maintenant + 1500,
      debutTour: maintenant + 1500,
      debutMeche: maintenant + 1500,
      dico: prep.dico.source,
      solo: joueurs.length === 1,
      fini: false,
      _utilises: new Set(),
      _vues: [],
      _explose: 0,
    };
    etat._prep = prep;
    nouvelleSyllabe(etat);
    etat._explose = maintenant + 1500 + meche();
    return etat;
  },

  action(etat, cle, a, maintenant) {
    if (etat.fini || cle !== etat.tour || maintenant < etat.pauseJusqua) return false;
    if (a.type === "saisie") {
      const t = String(a.t || "").slice(0, 32);
      if (t === etat.saisie) return false;
      etat.saisie = t;
      return true;
    }
    if (a.type !== "mot") return false;
    const mot = normaliser(a.t || "");
    let raison = null;
    if (!mot.includes(etat.syllabe)) raison = "syllabe";
    else if (etat._utilises.has(mot)) raison = "deja";
    else if (!etat._prep.dico.contient(mot)) raison = "inconnu";
    if (raison) {
      evenement(etat, { type: "refus", cle, mot, raison });
      return true;
    }
    etat._utilises.add(mot);
    const j = etat.joueurs[cle];
    j.mots++;
    const lettres = new Set(j.lettres + mot);
    j.lettres = [...BONUS].filter((l) => lettres.has(l)).join("");
    let bonus = false;
    if (j.lettres.length === BONUS.length) {
      j.lettres = "";
      if (j.vies < etat.viesMax) j.vies++;
      bonus = true;
    }
    etat.dernierMot = { cle, mot: String(a.t).trim().slice(0, 32) };
    evenement(etat, { type: bonus ? "bonus" : "ok", cle, mot });
    passer(etat, maintenant);
    nouvelleSyllabe(etat);
    etat._explose = Math.max(etat._explose, maintenant + TOUR_MIN);
    return true;
  },

  tic(etat, maintenant) {
    if (etat.fini || maintenant < etat._explose) return false;
    const cle = etat.tour;
    const j = etat.joueurs[cle];
    j.vies--;
    evenement(etat, { type: "boum", cle, syllabe: etat.syllabe });
    if (j.vies <= 0) eliminer(etat, cle);
    if (verifierFin(etat)) return true;
    passer(etat, maintenant + PAUSE_BOUM, j.vies > 0 ? null : cle);
    nouvelleSyllabe(etat);
    etat.pauseJusqua = maintenant + PAUSE_BOUM;
    etat.debutMeche = maintenant + PAUSE_BOUM;
    etat._explose = maintenant + PAUSE_BOUM + meche();
    return true;
  },

  depart(etat, cle, maintenant) {
    const j = etat.joueurs[cle];
    if (!j || j.vies <= 0) return false;
    j.vies = 0;
    eliminer(etat, cle);
    if (verifierFin(etat)) return true;
    if (etat.tour === cle) {
      passer(etat, maintenant, cle);
      nouvelleSyllabe(etat);
      etat._explose = Math.max(etat._explose, maintenant + TOUR_MIN);
    }
    return true;
  },

  fin(etat) {
    if (!etat.fini) return null;
    const vivants = etat.ordre.filter((c) => etat.joueurs[c].vies > 0);
    const ordre = [...vivants, ...[...etat.elimines].reverse()];
    return ordre.map((cle, i) => ({ cle, rang: i + 1, score: etat.joueurs[cle].mots }));
  },

  vue: vueBombe,
};

function meche() {
  return alea.entier(MECHE_MIN, MECHE_MAX);
}
function evenement(etat, e) {
  etat.evenement = { ...e, n: etat.evenement.n + 1 };
}
function nouvelleSyllabe(etat) {
  const liste = etat._prep.liste;
  let s;
  for (let i = 0; i < 30; i++) {
    s = alea.choisir(liste);
    if (!etat._vues.includes(s)) break;
  }
  etat._vues = [...etat._vues.slice(-40), s];
  etat.syllabe = s;
  etat.saisie = "";
}
function passer(etat, maintenant, exclu = null) {
  const vivants = etat.ordre.filter((c) => etat.joueurs[c].vies > 0 || c === exclu);
  const i = vivants.indexOf(etat.tour);
  const suivants = vivants.filter((c) => c !== exclu);
  if (!suivants.length) return;
  let k = (i + 1) % vivants.length;
  while (vivants[k] === exclu) k = (k + 1) % vivants.length;
  etat.tour = vivants[k];
  etat.debutTour = maintenant;
}
function eliminer(etat, cle) {
  if (!etat.elimines.includes(cle)) etat.elimines.push(cle);
}
function verifierFin(etat) {
  const vivants = etat.ordre.filter((c) => etat.joueurs[c].vies > 0);
  if ((etat.solo && vivants.length === 0) || (!etat.solo && vivants.length <= 1)) etat.fini = true;
  return etat.fini;
}

// ── Affichage ────────────────────────────────────────────────
const RAISONS = {
  syllabe: "Il manque la syllabe.",
  deja: "Déjà utilisé dans cette partie.",
  inconnu: "Pas dans le dictionnaire.",
};

function vueBombe(racine, ctx) {
  let dernierEvt = 0;
  let envoiPrevu = null;
  let monTour = false;
  const places = new Map();

  const table = h("div.bombe-table");
  const fleche = h("div.bombe-fleche");
  const syllabe = h("div.bombe-syllabe");
  const bombe = h("div.bombe-objet", fleche, h("div.bombe-corps", syllabe), h("div.bombe-meche"));
  const champ = h("input.champ.bombe-champ", {
    type: "text",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: false,
    maxLength: 32,
    placeholder: "Attends ton tour…",
    "aria-label": "Ton mot",
  });
  const aide = h("p.bombe-aide");
  const alphabet = h("div.bombe-alphabet", { "aria-label": "Lettres utilisées" });
  const avertissement = h("p.bombe-dico");
  const formulaire = h(
    "form.bombe-formulaire",
    {
      onsubmit: (e) => {
        e.preventDefault();
        if (!monTour || !champ.value.trim()) return;
        ctx.envoyer({ type: "mot", t: champ.value });
      },
    },
    champ,
    aide
  );
  let erreurJusqua = 0;
  champ.addEventListener("input", () => {
    const moi = places.get(ctx.moi);
    if (monTour && moi) moi.texte.textContent = champ.value;
    if (monTour) sons.touche();
    if (!monTour || envoiPrevu) return;
    envoiPrevu = setTimeout(() => {
      envoiPrevu = null;
      if (monTour) ctx.envoyer({ type: "saisie", t: champ.value });
    }, 90);
  });

  table.append(bombe);
  vider(racine, h("div.jeu-bombe", table, formulaire, alphabet, avertissement));

  function placer(etat) {
    const n = etat.ordre.length;
    etat.ordre.forEach((cle, i) => {
      let p = places.get(cle);
      if (!p) {
        const j = ctx.joueur(cle);
        const vies = h("span.bombe-vies");
        const texte = h("span.bombe-texte");
        const el = h("div.bombe-place", { "data-cle": cle }, avatar(j, "m"), h("span.bombe-nom", j.pseudo), vies, texte);
        table.append(el);
        p = { el, vies, texte };
        places.set(cle, p);
      }
      const angle = n === 1 ? -Math.PI / 2 : -Math.PI / 2 + (i * 2 * Math.PI) / n;
      p.angle = angle;
      p.el.style.left = `${50 + 41 * Math.cos(angle)}%`;
      p.el.style.top = `${50 + 38 * Math.sin(angle)}%`;
    });
  }

  // Tic-tac : de plus en plus rapide à mesure que la mèche brûle.
  // Le tempo dépend du temps écoulé, pas du temps restant (qui reste secret).
  let dernier = null, aigu = true, minuteurTic = null, detruit = false;
  function tictac() {
    if (detruit) return;
    let attente = 200;
    const e = dernier;
    if (e && !e.fini) {
      const t = ctx.maintenant();
      if (t >= e.pauseJusqua) {
        const ecoule = (t - e.debutMeche) / 1000;
        attente = Math.max(150, 560 - ecoule * 24);
        sons.tic(aigu);
        aigu = !aigu;
      }
    }
    minuteurTic = setTimeout(tictac, attente);
  }
  tictac();

  function maj(etat) {
    dernier = etat;
    placer(etat);
    const maintenant = ctx.maintenant();
    const enPause = maintenant < etat.pauseJusqua;
    monTour = etat.tour === ctx.moi && !enPause && !etat.fini && etat.joueurs[ctx.moi]?.vies > 0;

    syllabe.textContent = etat.syllabe.toUpperCase();
    const p = places.get(etat.tour);
    if (p) fleche.style.transform = `rotate(${(p.angle * 180) / Math.PI + 90}deg)`;

    for (const [cle, place] of places) {
      const j = etat.joueurs[cle];
      place.el.classList.toggle("actif", cle === etat.tour && !etat.fini);
      place.el.classList.toggle("elimine", j.vies <= 0);
      vider(place.vies, Array.from({ length: etat.viesMax }, (_, i) => h(`i${i < j.vies ? ".pleine" : ""}`)));
      if (cle === etat.tour) place.texte.textContent = cle === ctx.moi ? champ.value : etat.saisie;
      else if (etat.dernierMot?.cle === cle) place.texte.textContent = etat.dernierMot.mot;
      else place.texte.textContent = "";
    }

    // Événements (une seule fois chacun)
    const e = etat.evenement;
    if (e.n !== dernierEvt) {
      dernierEvt = e.n;
      const place = places.get(e.cle);
      if (e.type === "boum") {
        sons.boum();
        table.classList.remove("explose");
        void table.offsetWidth;
        table.classList.add("explose");
        place?.el.classList.add("touche");
        setTimeout(() => place?.el.classList.remove("touche"), 900);
      } else if (e.type === "ok" || e.type === "bonus") {
        if (e.cle === ctx.moi) {
          champ.value = "";
          sons.ok();
        } else sons.bip(520, 0.05, 0.04);
        if (e.type === "bonus") place?.el.classList.add("bonus");
        setTimeout(() => place?.el.classList.remove("bonus"), 1200);
      } else if (e.type === "refus" && e.cle === ctx.moi) {
        sons.non();
        aide.textContent = RAISONS[e.raison];
        aide.classList.add("erreur");
        erreurJusqua = Date.now() + 2500;
        champ.classList.remove("refus");
        void champ.offsetWidth;
        champ.classList.add("refus");
      }
    }

    // Saisie
    const jMoi = etat.joueurs[ctx.moi];
    champ.disabled = !monTour;
    if (monTour) {
      champ.placeholder = `Un mot avec « ${etat.syllabe.toUpperCase()} »`;
      if (document.activeElement !== champ) champ.focus();
      if (Date.now() > erreurJusqua) {
        aide.textContent = "Entrée pour valider";
        aide.classList.remove("erreur");
      }
    } else {
      if (etat.tour !== ctx.moi) champ.value = "";
      champ.placeholder = !jMoi ? "Tu regardes la partie" : jMoi.vies <= 0 ? "Tu es éliminé" : enPause ? "…" : `C'est à ${ctx.joueur(etat.tour).pseudo}`;
      aide.textContent = "";
      aide.classList.remove("erreur");
    }
    bombe.classList.toggle("tictac", !enPause && !etat.fini);
    bombe.classList.toggle("a-moi", monTour);

    // Alphabet bonus
    if (jMoi) {
      vider(alphabet, [...BONUS].map((l) => h(`span${jMoi.lettres.includes(l) ? ".utilisee" : ""}`, l.toUpperCase())));
    } else alphabet.replaceChildren();

    avertissement.textContent =
      etat.dico === "secours" ? "Dictionnaire complet indisponible : seuls les mots courants sont reconnus." : "";
  }

  return { maj, detruire() { detruit = true; clearTimeout(minuteurTic); clearTimeout(envoiPrevu); } };
}
