// Liste des jeux. Pour en ajouter un : crée un fichier sur le modèle des autres et ajoute-le ici.
import bombe from "./bombe.js";
import motmystere from "./motmystere.js";
import morpion from "./morpion.js";
import reflexe from "./reflexe.js";
import calcul from "./calcul.js";
import frappe from "./frappe.js";

export const LISTE_JEUX = [bombe, motmystere, morpion, reflexe, calcul, frappe];
export const JEUX = Object.fromEntries(LISTE_JEUX.map((j) => [j.id, j]));

export function optionsParDefaut(id) {
  return Object.fromEntries((JEUX[id]?.options || []).map((o) => [o.id, o.defaut]));
}
