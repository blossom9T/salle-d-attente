// Petits outils partagés : DOM, texte, hasard, sons.

// ── DOM ──────────────────────────────────────────────────────
// h("div.classe#id", {attributs}, enfants...)
export function h(tag, attrs, ...enfants) {
  const [nom, ...reste] = tag.split(/(?=[.#])/);
  const el = document.createElement(nom || "div");
  for (const r of reste) {
    if (r[0] === ".") el.classList.add(r.slice(1));
    else el.id = r.slice(1);
  }
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    enfants.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith("--")) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    }
    else if (k === "html") el.innerHTML = v;
    else if (k in el && k !== "list" && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  ajouter(el, enfants);
  return el;
}
function ajouter(el, enfants) {
  for (const e of enfants.flat(Infinity)) {
    if (e == null || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
}
export function vider(el, ...enfants) {
  el.replaceChildren();
  ajouter(el, enfants);
  return el;
}
export function svg(markup) {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

// ── Texte ────────────────────────────────────────────────────
// « Été » → « ete » : minuscules, sans accents, lettres seules.
export function normaliser(s) {
  return String(s)
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}
export function initiale(pseudo) {
  return (String(pseudo || "?").trim()[0] || "?").toUpperCase();
}
export function pluriel(n, mot, motPluriel) {
  return `${n} ${n > 1 ? motPluriel || mot + "s" : mot}`;
}

// ── Hasard ───────────────────────────────────────────────────
// Générateur pseudo-aléatoire avec graine : tout le monde obtient la même suite.
export function hasard(graine) {
  let a = typeof graine === "number" ? graine >>> 0 : hacher(String(graine));
  const suivant = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    nombre: suivant,
    entier: (min, max) => min + Math.floor(suivant() * (max - min + 1)),
    choisir: (liste) => liste[Math.floor(suivant() * liste.length)],
    melanger(liste) {
      const l = [...liste];
      for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(suivant() * (i + 1));
        [l[i], l[j]] = [l[j], l[i]];
      }
      return l;
    },
  };
}
function hacher(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const alea = hasard(Date.now() ^ Math.floor(Math.random() * 1e9));
export function identifiant() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Classement d'une partie ──────────────────────────────────
// Donne un rang à chaque ligne (les ex æquo partagent le même rang).
export function classer(lignes, comparer) {
  const triees = [...lignes].sort(comparer);
  let rang = 0;
  return triees.map((l, i) => {
    if (i === 0 || comparer(triees[i - 1], l) !== 0) rang = i + 1;
    return { ...l, rang };
  });
}

// Les sons vivent dans sons.js ; on les ré-exporte ici pour les jeux.
export { sons } from "./sons.js";
