// Profil du joueur : un identifiant stable (pour le classement), un pseudo, une couleur.
// Gardé dans le navigateur. Un onglet peut avoir son propre profil (sessionStorage),
// pratique pour tester un salon à plusieurs sur le même ordinateur.
import { identifiant, alea } from "./outils.js";

export const COULEURS = [
  "#2C5BD8", "#D9362B", "#138A56", "#D48A00", "#7B4FD6",
  "#D63C8C", "#0E8FA3", "#8A5A35", "#4F6470", "#6B9A12",
];

const CLE = "sa.profil";

function lire() {
  try {
    return JSON.parse(sessionStorage.getItem(CLE) || localStorage.getItem(CLE) || "null");
  } catch {
    return null;
  }
}

let profil = lire();
if (!profil?.id) {
  profil = { id: identifiant(), pseudo: "", couleur: alea.choisir(COULEURS) };
  localStorage.setItem(CLE, JSON.stringify(profil));
}

// Chaque onglet a aussi son propre identifiant de connexion :
// deux onglets ouverts = deux places dans un salon.
let onglet = sessionStorage.getItem("sa.onglet");
if (!onglet) {
  onglet = identifiant().slice(0, 8);
  sessionStorage.setItem("sa.onglet", onglet);
}

export function moi() {
  return { ...profil, onglet };
}

export function modifierProfil({ pseudo, couleur }) {
  profil = {
    ...profil,
    pseudo: (pseudo ?? profil.pseudo).trim().slice(0, 16),
    couleur: couleur ?? profil.couleur,
  };
  const ecraseParOnglet = sessionStorage.getItem(CLE);
  (ecraseParOnglet ? sessionStorage : localStorage).setItem(CLE, JSON.stringify(profil));
  window.dispatchEvent(new CustomEvent("profil"));
  return profil;
}

export function pseudoValide(p) {
  const s = String(p || "").trim();
  return s.length >= 2 && s.length <= 16;
}
