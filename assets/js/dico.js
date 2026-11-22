// Dictionnaire français (≈ 336 000 formes, accents retirés).
// Ordre d'essai :
//   1. assets/data/dictionnaire.txt  (généré par scripts/dictionnaire.mjs ou par le déploiement GitHub Actions)
//   2. le paquet npm « an-array-of-french-words » via le CDN jsDelivr
//   3. un petit dictionnaire de secours intégré (≈ 1 300 mots)
import { normaliser } from "./outils.js";

const PAQUET = "https://cdn.jsdelivr.net/npm/an-array-of-french-words@2";

let promesse = null;

export function chargerDictionnaire() {
  promesse ||= charger();
  return promesse;
}

async function avecDelai(p, ms) {
  let minuteur;
  try {
    return await Promise.race([p, new Promise((_, ko) => (minuteur = setTimeout(() => ko(new Error("délai dépassé")), ms)))]);
  } finally {
    clearTimeout(minuteur);
  }
}

async function charger() {
  const sources = [
    async () => {
      const r = await fetch(new URL("../data/dictionnaire.txt", import.meta.url));
      if (!r.ok) throw new Error(r.status);
      return (await r.text()).split("\n");
    },
    async () => {
      const r = await fetch(`${PAQUET}/index.json`);
      if (!r.ok) throw new Error(r.status);
      return r.json();
    },
    async () => {
      const m = await import(`${PAQUET}/+esm`);
      return m.default || m.anArrayOfFrenchWords;
    },
  ];
  for (const source of sources) {
    try {
      const liste = await avecDelai(source(), 15000);
      if (Array.isArray(liste) && liste.length > 50000) return construire(liste, "complet");
    } catch {}
  }
  const secours = (await import("../data/mots-secours.js")).default;
  return construire(secours, "secours");
}

function construire(liste, source) {
  const ensemble = new Set();
  for (const mot of liste) {
    if (!mot || /[A-Z]/.test(mot[0])) continue; // on ignore les noms propres éventuels
    const n = normaliser(mot);
    if (n.length >= 2) ensemble.add(n);
  }
  if (source === "secours") {
    // Le dictionnaire de secours n'a pas les pluriels : on les accepte.
    for (const n of [...ensemble]) if (!/[sxz]$/.test(n)) ensemble.add(n + "s");
  }
  const mots = [...ensemble];
  return {
    source,
    mots,
    contient: (mot) => ensemble.has(normaliser(mot)),
    taille: ensemble.size,
  };
}

// Syllabes pour « Bombe » : des bouts de 2 ou 3 lettres présents dans assez de mots.
const cacheSyllabes = new WeakMap();
export function syllabes(dico, difficulte) {
  let parNiveau = cacheSyllabes.get(dico);
  if (!parNiveau) {
    const comptes = new Map();
    // Un échantillon suffit pour estimer la fréquence d'une syllabe.
    const pas = Math.max(1, Math.floor(dico.mots.length / 80000));
    let total = 0;
    for (let i = 0; i < dico.mots.length; i += pas) {
      const m = dico.mots[i];
      total++;
      const vus = new Set();
      for (let n = 2; n <= 3; n++)
        for (let j = 0; j + n <= m.length; j++) vus.add(m.slice(j, j + n));
      for (const s of vus) comptes.set(s, (comptes.get(s) || 0) + 1);
    }
    // Seuils en proportion du dictionnaire : une syllabe « facile » se trouve dans beaucoup de mots.
    const seuils = { facile: 0.012, normal: 0.003, difficile: 0.0007 };
    const plafonds = { facile: Infinity, normal: 0.03, difficile: 0.006 };
    parNiveau = {};
    for (const niveau of Object.keys(seuils)) {
      const min = Math.max(2, seuils[niveau] * total);
      const max = Math.max(min + 1, plafonds[niveau] * total);
      parNiveau[niveau] = [...comptes].filter(([, c]) => c >= min && c <= max).map(([s]) => s);
    }
    if (parNiveau.difficile.length < 20) parNiveau.difficile = parNiveau.normal;
    if (parNiveau.normal.length < 20) parNiveau.normal = parNiveau.facile;
    cacheSyllabes.set(dico, parNiveau);
  }
  return parNiveau[difficulte] || parNiveau.normal;
}
