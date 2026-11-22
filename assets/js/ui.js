// Composants d'interface : afficheur 7 segments, avatars, icônes, notifications.
import { h, svg, initiale } from "./outils.js";

// ── Afficheur 7 segments (le « numéro » de la salle d'attente) ──
const SEGMENTS = {
  0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd",
  6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg", "-": "g", " ": "",
};
const L = 15, T = 3.4; // longueur et épaisseur d'un segment
function barre(cx, cy, horizontal) {
  const a = L / 2, b = T / 2;
  const pts = horizontal
    ? [[cx - a, cy], [cx - a + b, cy - b], [cx + a - b, cy - b], [cx + a, cy], [cx + a - b, cy + b], [cx - a + b, cy + b]]
    : [[cx, cy - a], [cx + b, cy - a + b], [cx + b, cy + a - b], [cx, cy + a], [cx - b, cy + a - b], [cx - b, cy - a + b]];
  return pts.map((p) => p.map((n) => n.toFixed(2)).join(",")).join(" ");
}
const POS = {
  a: [12, 3, true], b: [20.5, 11.5, false], c: [20.5, 28.5, false],
  d: [12, 37, true], e: [3.5, 28.5, false], f: [3.5, 11.5, false], g: [12, 20, true],
};
export function afficheur(texte, { taille = "m", eteints = true, titre } = {}) {
  const chars = String(texte).split("");
  let x = 0;
  const parts = [];
  for (const c of chars) {
    if (c === ":" || c === ".") {
      const pts = c === ":" ? [[x + 3, 13], [x + 3, 27]] : [[x + 3, 37]];
      for (const [px, py] of pts) parts.push(`<rect class="on" x="${px - 1.7}" y="${py - 1.7}" width="3.4" height="3.4"/>`);
      x += 7;
      continue;
    }
    const allumes = SEGMENTS[c] ?? "";
    for (const s of "abcdefg") {
      const [cx, cy, hz] = POS[s];
      const on = allumes.includes(s);
      if (!on && !eteints) continue;
      parts.push(`<polygon class="${on ? "on" : "off"}" points="${barre(cx + x, cy, hz)}"/>`);
    }
    x += 27;
  }
  const largeur = Math.max(x - 3, 1);
  const el = svg(
    `<svg class="seg seg-${taille}" viewBox="-2 -1 ${largeur + 6} 42" role="img"><g transform="skewX(-7) translate(5 0)">${parts.join("")}</g></svg>`
  );
  el.setAttribute("aria-label", titre || String(texte));
  return el;
}

// ── Avatar ───────────────────────────────────────────────────
export function avatar(joueur, taille = "m") {
  return h(`span.avatar.avatar-${taille}`, { style: { "--c": joueur?.couleur || "#5D6B72" }, "aria-hidden": "true" }, initiale(joueur?.pseudo));
}
export function etiquetteJoueur(joueur, extra) {
  return h("span.etiquette", avatar(joueur, "s"), h("span.etiquette-nom", joueur?.pseudo || "?"), extra);
}

// ── Icônes des jeux (traits simples, couleur du texte) ───────
const ICONES = {
  bombe: `<circle cx="11" cy="14" r="7"/><path d="M15.5 8.5 18 6"/><path d="M18 6c1-1 2.5-.5 3 .5"/><path d="M8 12.5a3 3 0 0 1 2.5-2"/>`,
  mot: `<rect x="2.5" y="8" width="5.5" height="8" rx="1"/><rect x="9.25" y="8" width="5.5" height="8" rx="1"/><rect x="16" y="8" width="5.5" height="8" rx="1"/><path d="M11 13.5h2"/>`,
  morpion: `<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><path d="m4.5 4.5 3 3m0-3-3 3"/><circle cx="18" cy="18" r="1.6"/>`,
  reflexe: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>`,
  calcul: `<path d="M7 3.5v6M4 6.5h6M14 6.5h6M4.5 15.5l5 5m0-5-5 5M14 16h6M14 19.5h6"/>`,
  frappe: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14.5h8"/>`,
  copier: `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>`,
  son: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`,
  muet: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>`,
  lune: `<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>`,
  soleil: `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>`,
  couronne: `<path d="m3.5 8 4 4 4.5-6.5 4.5 6.5 4-4-1.5 10h-14z"/>`,
  sortie: `<path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h10"/>`,
};
export function icone(nom, classe = "") {
  const el = svg(`<svg class="icone ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom] || ""}</svg>`);
  return el;
}

// ── Notifications ────────────────────────────────────────────
export function notifier(message, type = "info", duree = 3200) {
  const zone = document.getElementById("notifications");
  if (!zone) return;
  const el = h(`div.notif.notif-${type}`, { role: "status" }, message);
  zone.append(el);
  setTimeout(() => {
    el.classList.add("sortie");
    setTimeout(() => el.remove(), 300);
  }, duree);
}

// ── Segmenté (choix d'options) ───────────────────────────────
export function segmente({ nom, valeurs, valeur, libelles, onChange, desactive }) {
  return h(
    "div.segmente",
    { role: "radiogroup", "aria-label": nom },
    valeurs.map((v, i) =>
      h(
        "button.segmente-choix",
        {
          type: "button",
          role: "radio",
          "aria-checked": String(v === valeur),
          disabled: desactive,
          onclick: () => onChange?.(v),
        },
        libelles ? libelles[i] : String(v)
      )
    )
  );
}

// Formate un compte à rebours en « m:ss ».
export function minutes(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Couloirs de course (Calcul éclair, Course de frappe) : les éléments restent en place
// pour que les pions glissent au lieu de sauter.
export function majCourse(conteneur, lignes, { arrivee = false } = {}) {
  conteneur._couloirs ||= new Map();
  const vus = new Set();
  for (const l of lignes) {
    let c = conteneur._couloirs.get(l.cle);
    if (!c) {
      const pion = h("span.couloir-pion", { style: { "--c": l.joueur.couleur } }, avatar(l.joueur, "s"));
      const valeur = h("span.couloir-valeur");
      const el = h("div.couloir", h("span.couloir-nom", l.joueur.pseudo), h(`div.couloir-piste${arrivee ? ".arrivee" : ""}`, pion), valeur);
      conteneur.append(el);
      c = { el, pion, valeur };
      conteneur._couloirs.set(l.cle, c);
    }
    vus.add(l.cle);
    c.el.className = "couloir" + (l.classes ? " " + l.classes : "");
    c.pion.style.left = `${Math.max(0, Math.min(1, l.progression)) * 100}%`;
    if (c.valeur.textContent !== l.valeur) c.valeur.textContent = l.valeur;
  }
  for (const [cle, c] of conteneur._couloirs) if (!vus.has(cle)) { c.el.remove(); conteneur._couloirs.delete(cle); }
}
