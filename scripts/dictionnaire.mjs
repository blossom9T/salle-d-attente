// Génère assets/data/dictionnaire.txt (un mot par ligne, sans accents) à partir
// du paquet npm « an-array-of-french-words » (~336 000 mots, licence MIT).
//
// Le déploiement GitHub Actions le fait tout seul. Pour le faire à la main :
//   npm install --no-save an-array-of-french-words@2.0.0
//   node scripts/dictionnaire.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let liste;
try {
  liste = require("an-array-of-french-words");
} catch {
  const m = await import("an-array-of-french-words");
  liste = m.default ?? m.anArrayOfFrenchWords;
}
if (!Array.isArray(liste) && Array.isArray(liste?.default)) liste = liste.default;
if (!Array.isArray(liste)) throw new Error("Format du paquet inattendu.");

const normaliser = (s) =>
  String(s)
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

const mots = [...new Set(liste.map(normaliser).filter((m) => m.length >= 2))].sort();
writeFileSync(new URL("../assets/data/dictionnaire.txt", import.meta.url), mots.join("\n"));
console.log(`Dictionnaire : ${mots.length} mots écrits dans assets/data/dictionnaire.txt`);
