// MOT MYSTÈRE — façon Wordle, en même temps pour tout le monde.
// Même mot pour tous, six essais. Vert : bonne lettre bien placée.
// Jaune : bonne lettre mal placée. On voit les grilles des autres en couleurs seulement.
import { h, vider, normaliser, alea, sons } from "../outils.js";
import { avatar, afficheur, minutes } from "../ui.js";
import { chargerDictionnaire } from "../dico.js";
import MOTS from "../../data/mots5.js";

const LONGUEUR = 5, ESSAIS = 6, PAUSE = 5000;

export default {
  id: "motmystere",
  teinte: "#9FCB8E",
  nom: "Mot mystère",
  accroche: "Le même mot de cinq lettres pour tout le monde. Six essais.",
  regles: [
    "Propose un mot de cinq lettres. Vert : la lettre est à la bonne place. Jaune : elle est dans le mot, mais ailleurs.",
    "Tout le monde cherche le même mot en même temps. Tu vois les grilles des autres, sans leurs lettres.",
    "Trouvé en 1 essai : 6 points, en 6 essais : 1 point. Le premier à trouver gagne 1 point de plus.",
  ],
  min: 1,
  max: 10,
  duree: "2–8 min",
  score: { unite: "pts", sens: "haut", format: (v) => `${v} pt${v > 1 ? "s" : ""}` },
  options: [
    { id: "manches", nom: "Manches", valeurs: [1, 3, 5], defaut: 3 },
    { id: "temps", nom: "Temps par manche", valeurs: [60, 120, 180], libelles: ["1 min", "2 min", "3 min"], defaut: 120 },
    { id: "indice", nom: "Première lettre", valeurs: ["non", "oui"], libelles: ["Cachée", "Donnée"], defaut: "non" },
  ],

  creer({ joueurs, options, maintenant }) {
    const mots = alea.melanger(MOTS).slice(0, options.manches);
    const etat = {
      manche: 0,
      total: options.manches,
      dureeManche: options.temps * 1000,
      indiceActif: options.indice === "oui",
      joueurs: Object.fromEntries(joueurs.map((c) => [c, { lignes: [], fini: false, trouve: false, temps: null, points: 0, gain: 0, tempsTotal: 0 }])),
      fini: false,
      _mots: mots,
    };
    demarrerManche(etat, maintenant);
    return etat;
  },

  action(etat, cle, a, maintenant) {
    if (a.type !== "essai" || etat.phase !== "jeu") return false;
    const j = etat.joueurs[cle];
    const essai = normaliser(a.mot || "");
    if (!j || j.fini || essai.length !== LONGUEUR) return false;
    const secret = normaliser(etat._mots[etat.manche - 1]);
    const motif = comparer(essai, secret);
    j.lignes.push(motif);
    if (motif === "v".repeat(LONGUEUR)) {
      j.trouve = j.fini = true;
      j.temps = maintenant - etat.debutManche;
      j.gain = ESSAIS + 1 - j.lignes.length;
      if (!etat.premier) {
        etat.premier = cle;
        j.gain += 1;
      }
      j.points += j.gain;
      j.tempsTotal += j.temps;
    } else if (j.lignes.length >= ESSAIS) {
      j.fini = true;
      j.tempsTotal += etat.dureeManche;
    }
    return true;
  },

  tic(etat, maintenant) {
    if (etat.fini) return false;
    if (etat.phase === "jeu") {
      const tousFinis = Object.values(etat.joueurs).every((j) => j.fini || j.parti);
      if (tousFinis || maintenant >= etat.finManche) {
        for (const j of Object.values(etat.joueurs)) if (!j.fini) j.tempsTotal += etat.dureeManche;
        etat.phase = "pause";
        etat.mot = etat._mots[etat.manche - 1];
        etat.finPause = maintenant + PAUSE;
        return true;
      }
      return false;
    }
    if (maintenant >= etat.finPause) {
      if (etat.manche >= etat.total) etat.fini = true;
      else demarrerManche(etat, maintenant);
      return true;
    }
    return false;
  },

  depart(etat, cle) {
    const j = etat.joueurs[cle];
    if (!j) return false;
    j.parti = true;
    const restants = Object.values(etat.joueurs).filter((x) => !x.parti);
    if (!restants.length) etat.fini = true;
    return true;
  },

  fin(etat) {
    if (!etat.fini) return null;
    const lignes = Object.entries(etat.joueurs).map(([cle, j]) => ({ cle, j }));
    lignes.sort((a, b) => b.j.points - a.j.points || a.j.tempsTotal - b.j.tempsTotal);
    let rang = 0;
    return lignes.map((l, i) => {
      const p = lignes[i - 1];
      if (!p || p.j.points !== l.j.points || p.j.tempsTotal !== l.j.tempsTotal) rang = i + 1;
      return { cle: l.cle, rang, score: l.j.points };
    });
  },

  vue: vueMot,
};

function demarrerManche(etat, maintenant) {
  etat.manche++;
  etat.phase = "jeu";
  etat.mot = null;
  etat.premier = null;
  etat.debutManche = maintenant + 600;
  etat.finManche = etat.debutManche + etat.dureeManche;
  etat.indice = etat.indiceActif ? normaliser(etat._mots[etat.manche - 1])[0] : null;
  for (const j of Object.values(etat.joueurs)) Object.assign(j, { lignes: [], fini: Boolean(j.parti), trouve: false, temps: null, gain: 0 });
}

// Couleurs d'un essai, avec la gestion des lettres en double.
export function comparer(essai, secret) {
  const res = Array(LONGUEUR).fill("g");
  const reste = {};
  for (let i = 0; i < LONGUEUR; i++) {
    if (essai[i] === secret[i]) res[i] = "v";
    else reste[secret[i]] = (reste[secret[i]] || 0) + 1;
  }
  for (let i = 0; i < LONGUEUR; i++) {
    if (res[i] !== "v" && reste[essai[i]] > 0) {
      res[i] = "j";
      reste[essai[i]]--;
    }
  }
  return res.join("");
}

// ── Affichage ────────────────────────────────────────────────
const CLAVIER = ["azertyuiop", "qsdfghjklm", ">wxcvbn<"];

function vueMot(racine, ctx) {
  const essais = new Map(); // manche → mots tapés par moi
  let saisie = "";
  let etatCourant = null;
  let dico = null;
  let messageJusqua = 0;
  chargerDictionnaire().then((d) => (dico = d));

  const titre = h("div.mot-manche");
  const chrono = h("div.mot-chrono.ecran");
  const grille = h("div.mot-grille");
  const message = h("p.mot-message", { "aria-live": "polite" });
  const clavier = h("div.clavier");
  const autres = h("div.mot-autres");
  const touches = new Map();

  const cases = Array.from({ length: ESSAIS }, () => {
    const el = h("div.ligne");
    const cs = Array.from({ length: LONGUEUR }, () => h("span.case"));
    el.append(...cs);
    el.addEventListener("animationend", (e) => e.animationName === "secousse-simple" && el.classList.remove("refus"));
    grille.append(el);
    return { el, cases: cs };
  });
  for (const rangee of CLAVIER) {
    clavier.append(
      h(
        "div.clavier-rangee",
        [...rangee].map((t) => {
          const libelle = t === ">" ? "Entrée" : t === "<" ? "Effacer" : t.toUpperCase();
          const b = h(`button.touche${t === ">" || t === "<" ? ".large" : ""}`, { type: "button", onclick: () => appuyer(t) }, libelle);
          touches.set(t, b);
          return b;
        })
      )
    );
  }
  vider(racine, h("div.jeu-mot", h("div.mot-tete", titre, chrono), h("div.mot-corps", h("div.mot-principal", grille, message, clavier), autres)));

  function mesMots() {
    const k = etatCourant?.manche;
    if (!essais.has(k)) essais.set(k, []);
    return essais.get(k);
  }
  function peutJouer() {
    const j = etatCourant?.joueurs[ctx.moi];
    return j && !j.fini && etatCourant.phase === "jeu" && ctx.maintenant() >= etatCourant.debutManche && mesMots().length <= j.lignes.length;
  }
  function dire(texte) {
    message.textContent = texte;
    messageJusqua = Date.now() + 2200;
  }
  function appuyer(t) {
    if (!peutJouer()) return;
    if (t === "<") {
      if (saisie) sons.retireTuile();
      saisie = saisie.slice(0, -1);
    }
    else if (t === ">") {
      if (saisie.length < LONGUEUR) return dire("Il faut cinq lettres.");
      if (dico && dico.source === "complet" && !dico.contient(saisie)) {
        sons.non();
        grille.querySelector(".ligne.courante")?.classList.add("refus");
        return dire("Ce mot n'est pas dans le dictionnaire.");
      }
      mesMots().push(saisie);
      ctx.envoyer({ type: "essai", mot: saisie });
      saisie = "";
    } else if (saisie.length < LONGUEUR) {
      saisie += t;
      sons.tuile();
    }
    dessiner();
  }
  function clavierPhysique(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter") appuyer(">");
    else if (e.key === "Backspace") appuyer("<");
    else {
      const l = normaliser(e.key);
      if (l.length === 1) appuyer(l);
      else return;
    }
    e.preventDefault();
  }
  window.addEventListener("keydown", clavierPhysique);

  function dessiner() {
    const etat = etatCourant;
    if (!etat) return;
    const j = etat.joueurs[ctx.moi];
    const mots = j ? mesMots() : [];
    const lignes = j ? j.lignes : [];
    for (let r = 0; r < ESSAIS; r++) {
      let lettres = "", motif = null, classe = "";
      if (r < lignes.length) {
        motif = lignes[r];
        lettres = mots[r] || "";
      } else if (r < mots.length) {
        lettres = mots[r];
        classe = " attente";
      } else if (r === mots.length && peutJouer()) {
        lettres = saisie;
        classe = " courante";
      }
      const ligne = cases[r];
      const cl = "ligne" + classe + (ligne.el.classList.contains("refus") && classe === " courante" ? " refus" : "");
      if (ligne.el.className !== cl) ligne.el.className = cl;
      ligne.cases.forEach((c, i) => {
        const l = lettres[i];
        const indice = classe === " courante" && !l && i === 0 && etat.indice;
        const nom = `case${motif ? " " + motif[i] : ""}${l ? " pleine" : ""}${indice ? " indice" : ""}`;
        if (c.className !== nom) c.className = nom;
        const t = (l || (indice ? etat.indice : "")).toUpperCase();
        if (c.textContent !== t) c.textContent = t;
      });
    }

    // Couleurs du clavier
    const etatTouche = {};
    lignes.forEach((m, r) => {
      const mot = mots[r];
      if (!mot) return;
      [...mot].forEach((l, i) => {
        const c = m[i];
        const avant = etatTouche[l];
        if (c === "v" || (c === "j" && avant !== "v") || (c === "g" && !avant)) etatTouche[l] = c;
      });
    });
    for (const [t, b] of touches) {
      b.className = `touche${t === ">" || t === "<" ? " large" : ""}${etatTouche[t] ? " " + etatTouche[t] : ""}`;
      b.disabled = !peutJouer();
    }
  }

  let lignesEntendues = 0, mancheEntendue = 0, phaseEntendue = null;
  function maj(etat) {
    if (etatCourant && etat.manche !== etatCourant.manche) saisie = "";
    // Sons : mes tuiles qui se retournent, la victoire, la révélation du mot
    const jSon = etat.joueurs[ctx.moi];
    if (etat.manche !== mancheEntendue) {
      mancheEntendue = etat.manche;
      lignesEntendues = 0;
    }
    if (jSon && jSon.lignes.length > lignesEntendues) {
      const motif = jSon.lignes[jSon.lignes.length - 1];
      sons.revele(motif);
      if (jSon.trouve) setTimeout(() => sons.victoire(), 450);
      lignesEntendues = jSon.lignes.length;
    }
    if (etat.phase !== phaseEntendue) {
      if (etat.phase === "pause" && phaseEntendue === "jeu" && !jSon?.trouve) sons.fin();
      phaseEntendue = etat.phase;
    }
    etatCourant = etat;
    const maintenant = ctx.maintenant();
    titre.textContent = `Manche ${etat.manche} sur ${etat.total}`;
    const reste = etat.phase === "jeu" ? Math.min(etat.dureeManche, etat.finManche - maintenant) : 0;
    vider(chrono, afficheur(minutes(reste), { taille: "s", titre: "Temps restant" }));
    chrono.classList.toggle("urgent", etat.phase === "jeu" && reste < 15000);

    const j = etat.joueurs[ctx.moi];
    if (Date.now() > messageJusqua) {
      if (etat.phase === "pause") message.textContent = `Le mot était « ${etat.mot.toUpperCase()} ».`;
      else if (!j) message.textContent = "Tu regardes la partie.";
      else if (j.trouve) message.textContent = `Trouvé ! +${j.gain} point${j.gain > 1 ? "s" : ""}. On attend les autres…`;
      else if (j.fini) message.textContent = "Plus d'essais pour cette manche.";
      else if (maintenant < etat.debutManche) message.textContent = "C'est parti…";
      else message.textContent = "";
    }
    message.classList.toggle("revelation", etat.phase === "pause");
    dessiner();

    // Grilles des autres joueurs
    vider(
      autres,
      Object.entries(etat.joueurs)
        .sort((a, b) => b[1].points - a[1].points)
        .map(([cle, x]) =>
          h(
            `div.mot-autre${cle === ctx.moi ? ".moi" : ""}${x.parti ? ".parti" : ""}`,
            h("div.mot-autre-tete", avatar(ctx.joueur(cle), "s"), h("span.nom", ctx.joueur(cle).pseudo), h("span.pts", `${x.points} pt${x.points > 1 ? "s" : ""}`)),
            h(
              "div.mini-grille",
              Array.from({ length: ESSAIS }, (_, r) =>
                h("div.mini-ligne", Array.from({ length: LONGUEUR }, (_, i) => h(`i${x.lignes[r] ? "." + x.lignes[r][i] : ""}`)))
              )
            )
          )
        )
    );
  }

  return {
    maj,
    detruire() {
      window.removeEventListener("keydown", clavierPhysique);
    },
  };
}
