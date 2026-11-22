// Point d'entrée : navigation, en-tête, et les trois écrans (accueil, salon, classement).
import { h, vider, sons, alea } from "./outils.js";
import { afficheur, avatar, icone, notifier, segmente, etiquetteJoueur } from "./ui.js";
import { moi, modifierProfil, pseudoValide, COULEURS } from "./profil.js";
import { Salon, nouveauCode } from "./salon.js";
import { LISTE_JEUX, JEUX } from "./jeux/index.js";
import { lireClassement, dernieresParties } from "./classement.js";
import { enLigne } from "./reseau.js";
import { MAX_JOUEURS } from "./config.js";
import { demarrerFond } from "./fond.js";

const app = document.getElementById("app");
let ecran = null;

// ── Navigation ───────────────────────────────────────────────
function naviguer() {
  const [chemin, requete] = (location.hash.slice(1) || "/").split("?");
  const morceaux = chemin.split("/").filter(Boolean);
  const params = new URLSearchParams(requete || "");
  ecran?.detruire?.();
  ecran = null;
  document.body.classList.remove("en-partie");
  window.scrollTo(0, 0);
  if (morceaux[0] === "salon" && /^\d{4,6}$/.test(morceaux[1])) ecran = ecranSalon(morceaux[1], params);
  else if (morceaux[0] === "classement") ecran = ecranClassement(JEUX[morceaux[1]] ? morceaux[1] : null);
  else ecran = ecranAccueil();
  document.querySelectorAll(".nav a").forEach((a) => {
    const actif = (morceaux[0] || "") === a.dataset.page;
    a.classList.toggle("actif", actif);
    if (actif) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// ── En-tête ──────────────────────────────────────────────────
function entete() {
  const boutonProfil = h("button.profil-bouton", { type: "button", onclick: ouvrirProfil });
  const majProfil = () => {
    const p = moi();
    vider(boutonProfil, avatar(p, "s"), h("span", p.pseudo || "Choisir un pseudo"));
  };
  majProfil();
  window.addEventListener("profil", majProfil);

  const boutonSon = h("button.icone-bouton", { type: "button" });
  const majSon = () => {
    vider(boutonSon, icone(sons.actifs ? "son" : "muet"));
    boutonSon.setAttribute("aria-label", sons.actifs ? "Couper les sons" : "Activer les sons");
    boutonSon.title = boutonSon.getAttribute("aria-label");
  };
  boutonSon.onclick = () => {
    sons.basculer();
    majSon();
  };
  majSon();

  const boutonTheme = h("button.icone-bouton", { type: "button" });
  const majTheme = () => {
    const nuit = document.documentElement.dataset.theme === "nuit";
    vider(boutonTheme, icone(nuit ? "soleil" : "lune"));
    boutonTheme.setAttribute("aria-label", nuit ? "Passer en thème clair" : "Passer en thème sombre");
    boutonTheme.title = boutonTheme.getAttribute("aria-label");
  };
  boutonTheme.onclick = () => {
    const nuit = document.documentElement.dataset.theme !== "nuit";
    document.documentElement.dataset.theme = nuit ? "nuit" : "jour";
    localStorage.setItem("sa.theme", nuit ? "nuit" : "jour");
    majTheme();
  };
  majTheme();

  vider(
    document.getElementById("entete"),
    h(
      "div.entete-int",
      h("a.logo", { href: "#/" }, "salle d’attente"),
      h("nav.nav", { "aria-label": "Navigation principale" }, h("a", { href: "#/", "data-page": "" }, "Jeux"), h("a", { href: "#/classement", "data-page": "classement" }, "Classement")),
      h("div.entete-outils", boutonSon, boutonTheme, boutonProfil)
    )
  );
}

// ── Profil (pseudo + couleur) ────────────────────────────────
function formulaireProfil({ onValide, libelleBouton = "Enregistrer", compact = false } = {}) {
  const p = moi();
  let couleur = p.couleur;
  const champ = h("input.champ", { id: "pseudo-" + alea.entier(1, 1e6), value: p.pseudo, maxLength: 16, autocomplete: "nickname", placeholder: "Ton pseudo de jeu" });
  const erreur = h("p.erreur-texte", { "aria-live": "polite" });
  const nuancier = h(
    "div.nuancier",
    { role: "radiogroup", "aria-label": "Ta couleur" },
    COULEURS.map((c) =>
      h("button.nuance", {
        type: "button",
        role: "radio",
        "aria-checked": String(c === couleur),
        "aria-label": `Couleur ${c}`,
        style: { "--c": c },
        onclick: (e) => {
          couleur = c;
          nuancier.querySelectorAll(".nuance").forEach((b) => b.setAttribute("aria-checked", String(b === e.currentTarget)));
        },
      })
    )
  );
  const form = h(
    `form.form-profil${compact ? ".compact" : ""}`,
    {
      onsubmit: (e) => {
        e.preventDefault();
        if (!pseudoValide(champ.value)) {
          erreur.textContent = "Ton pseudo doit faire entre 2 et 16 caractères.";
          champ.focus();
          return;
        }
        modifierProfil({ pseudo: champ.value, couleur });
        erreur.textContent = "";
        onValide?.();
      },
    },
    h("label.etiquette-champ", { for: champ.id }, "Ton pseudo"),
    h("div.ligne-champ", champ, h("button.bouton", { type: "submit" }, libelleBouton)),
    erreur,
    h("p.etiquette-champ", "Ta couleur"),
    nuancier
  );
  form.champ = champ;
  return form;
}

function ouvrirProfil() {
  const dialogue = h("dialog.dialogue");
  const fermer = () => {
    dialogue.close();
    dialogue.remove();
  };
  dialogue.append(
    h("div.dialogue-tete", h("h2", "Ton profil"), h("button.icone-bouton", { type: "button", "aria-label": "Fermer", onclick: fermer }, "×")),
    h("p.discret", "Ton pseudo est visible par les autres joueurs et dans le classement."),
    formulaireProfil({ onValide: () => { fermer(); notifier("Profil enregistré."); } })
  );
  dialogue.addEventListener("close", () => dialogue.remove());
  document.body.append(dialogue);
  dialogue.showModal();
}

// ── Accueil ──────────────────────────────────────────────────
function ecranAccueil() {
  const ecranTicket = h("div.ecran.ticket-ecran", afficheur("------", { taille: "l", titre: "Pas encore de numéro" }));
  let pseudoForm = null;

  async function prendreTicket(jeu = null, solo = false) {
    if (!pseudoValide(moi().pseudo)) {
      pseudoForm?.champ.focus();
      notifier("Choisis d'abord un pseudo.", "alerte");
      return;
    }
    const code = nouveauCode();
    const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!solo && !reduit) {
      ticket.classList.add("imprime");
      for (let i = 0; i < 8; i++) {
        vider(ecranTicket, afficheur(String(alea.entier(100000, 999999)), { taille: "l" }));
        await new Promise((r) => setTimeout(r, 55));
      }
      vider(ecranTicket, afficheur(code, { taille: "l" }));
      await new Promise((r) => setTimeout(r, 380));
    }
    location.hash = `#/salon/${code}${jeu ? `?jeu=${jeu}${solo ? "&solo=1" : ""}` : ""}`;
  }

  const ticket = h(
    "div.ticket",
    h("p.ticket-titre", "Salon n°"),
    ecranTicket,
    h("button.bouton.bouton-plein", { type: "button", onclick: () => prendreTicket() }, "Prendre un ticket"),
    h("p.ticket-note", "Tu obtiens un numéro de salon à donner à tes potes.")
  );

  const champCode = h("input.champ.champ-code", {
    id: "code-salon",
    inputMode: "numeric",
    maxLength: 6,
    pattern: "[0-9]{6}",
    placeholder: "000000",
    autocomplete: "off",
    "aria-describedby": "aide-code",
  });
  champCode.addEventListener("input", () => (champCode.value = champCode.value.replace(/\D/g, "").slice(0, 6)));
  const rejoindre = h(
    "form.rejoindre",
    {
      onsubmit: (e) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(champCode.value)) return notifier("Un numéro de salon fait 6 chiffres.", "alerte");
        if (!pseudoValide(moi().pseudo)) {
          pseudoForm?.champ.focus();
          return notifier("Choisis d'abord un pseudo.", "alerte");
        }
        location.hash = `#/salon/${champCode.value}`;
      },
    },
    h("label.etiquette-champ", { for: "code-salon" }, "Un ami t'a donné un numéro ?"),
    h("div.ligne-champ", champCode, h("button.bouton", { type: "submit" }, "Entrer")),
    h("p.discret", { id: "aide-code" }, "Ou ouvre directement le lien qu'il t'a envoyé.")
  );

  const zonePseudo = h("div.zone-pseudo");
  const majPseudo = () => {
    const p = moi();
    if (pseudoValide(p.pseudo)) {
      pseudoForm = null;
      vider(zonePseudo, h("p.joue-en-tant-que", "Tu joues en tant que ", etiquetteJoueur(p), h("button.lien", { type: "button", onclick: ouvrirProfil }, "Modifier")));
    } else {
      pseudoForm = formulaireProfil({ libelleBouton: "C'est moi", compact: true });
      vider(zonePseudo, pseudoForm);
    }
  };
  majPseudo();
  window.addEventListener("profil", majPseudo);

  const programme = h(
    "ul.programme",
    LISTE_JEUX.map((j) =>
      h(
        "li.programme-jeu",
        h("span.programme-icone", { style: { "--teinte": j.teinte } }, icone(j.id === "motmystere" ? "mot" : j.id)),
        h("div.programme-texte", h("h3", j.nom), h("p", j.accroche)),
        h("p.programme-meta", h("span", `${j.min === 1 ? "1" : j.min} à ${j.max} joueurs`), h("span", j.duree)),
        h("button.bouton.bouton-discret", { type: "button", onclick: () => prendreTicket(j.id, true) }, "Essayer seul")
      )
    )
  );

  const dernieres = h("section.dernieres");
  dernieresParties(6)
    .then((liste) => {
      if (!liste.length) return;
      vider(
        dernieres,
        h("h2.titre-section", "Dernières parties"),
        h(
          "ul.dernieres-liste",
          liste.map((p) =>
            h(
              "li",
              h("span.dernieres-jeu", JEUX[p.jeu]?.nom || p.jeu),
              etiquetteJoueur(p.gagnant),
              h("span.discret", p.nb > 1 ? `gagne à ${p.nb}, ${JEUX[p.jeu]?.score.format(p.score) || p.score}` : `en solo, ${JEUX[p.jeu]?.score.format(p.score) || p.score}`),
              h("time.discret", { datetime: p.date }, depuis(p.date))
            )
          )
        )
      );
    })
    .catch(() => {});

  vider(
    app,
    h(
      "div.accueil",
      h(
        "section.accueil-haut",
        h(
          "div.accueil-texte",
          h("h1.titre-principal", "Une partie, le temps qu’il arrive."),
          h("p.chapeau", `Six petits jeux rapides à lancer pendant un vocal, de 1 à ${MAX_JOUEURS} joueurs. Prends un ticket, donne le numéro, tout le monde rejoint.`),
          zonePseudo
        ),
        h("div.distributeur", ticket, rejoindre)
      ),
      h("section.section-programme", h("h2.titre-section", "Au programme"), programme),
      dernieres
    )
  );
  return { detruire: () => window.removeEventListener("profil", majPseudo) };
}

function depuis(date) {
  const s = (Date.now() - new Date(date).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Salon ────────────────────────────────────────────────────
function ecranSalon(code, params) {
  if (!pseudoValide(moi().pseudo)) {
    const form = formulaireProfil({ libelleBouton: "Entrer dans le salon", onValide: () => naviguer() });
    vider(
      app,
      h(
        "div.entree-salon",
        h("div.ecran", afficheur(code, { taille: "l" })),
        h("h1.titre-page", `On t'attend dans le salon ${code}.`),
        h("p.chapeau", "Choisis un pseudo pour entrer."),
        form
      )
    );
    setTimeout(() => form.champ.focus(), 50);
    return { detruire() {} };
  }

  const cote = h("aside.salon-cote");
  const scene = h("section.salon-scene", { "aria-live": "polite" }, h("p.attente-connexion", "Connexion au salon…"));
  const cadre = h("div.salon", cote, scene);
  vider(app, cadre);

  let vueJeu = null, cleScene = null, partieAffichee = null;
  const salon = new Salon(code, moi(), {
    jeuInitial: params.get("jeu"),
    soloImmediat: params.get("solo") === "1",
    surChangement: () => dessiner(),
    surErreur: (msg) => {
      notifier(msg, "alerte", 5000);
      location.hash = "#/";
    },
  });

  const lien = `${location.origin}${location.pathname}#/salon/${code}`;
  async function copierLien() {
    try {
      await navigator.clipboard.writeText(lien);
      notifier("Lien copié. Colle-le dans le vocal.");
    } catch {
      prompt("Copie ce lien :", lien);
    }
  }

  let signatureCote = "";
  function dessinerCote() {
    const p = salon.public;
    const enJeu = p?.phase === "jeu" ? new Set(p.partie.joueurs.map((j) => j.cle)) : null;
    const signature = JSON.stringify([salon.membres.map((m) => [m.cle, m.pseudo, m.couleur]), salon.hote, enJeu && [...enJeu]]);
    if (signature === signatureCote) return;
    signatureCote = signature;
    vider(
      cote,
      h(
        "div.salon-ticket",
        h("p.ticket-titre", "Salon n°"),
        h("div.ecran", afficheur(code, { taille: "m" })),
        h("button.bouton.bouton-discret.copier", { type: "button", onclick: copierLien }, icone("copier"), "Copier le lien")
      ),
      h("h2.titre-cote", "Joueurs ", h("span.compte", `${salon.membres.length}/${MAX_JOUEURS}`)),
      h(
        "ul.joueurs",
        salon.membres.map((m) =>
          h(
            `li${m.cle === salon.moi.cle ? ".moi" : ""}`,
            avatar(m, "m"),
            h("span.joueur-nom", m.pseudo, m.cle === salon.moi.cle ? h("span.discret", " (toi)") : null),
            m.cle === salon.hote ? h("span.badge-hote", { title: "Hôte du salon" }, icone("couronne"), "hôte") : null,
            enJeu && !enJeu.has(m.cle) ? h("span.discret", "regarde") : null
          )
        )
      ),
      salon.membres.length === 1 ? h("p.discret.astuce", "Donne le numéro ou le lien à tes potes pour qu'ils te rejoignent.") : null,
      h("p.mode", enLigne ? "En ligne" : "Mode local : seuls les onglets de ce navigateur se retrouvent ici."),
      h("button.lien.quitter", { type: "button", onclick: () => (location.hash = "#/") }, icone("sortie"), "Quitter le salon")
    );
  }

  let nbMembres = 0, resultatsEntendus = null;
  function dessiner() {
    if (salon.pret && salon.membres.length > nbMembres && nbMembres > 0) sons.carillon();
    if (salon.pret) nbMembres = salon.membres.length;
    dessinerCote();
    const p = salon.public;
    if (!p) return;
    cadre.classList.toggle("en-jeu", p.phase === "jeu");
    document.body.classList.toggle("en-partie", p.phase === "jeu");
    const nouvelleCle =
      p.phase === "jeu" ? `jeu:${p.partie.id}` : p.phase === "resultats" ? `res:${p.resultats.partieId}:${p.resultats.enregistrement}:${salon.estHote}` : `${p.phase}:${p.jeu}:${JSON.stringify(p.options)}:${salon.estHote}:${salon.hote}:${p.avis}:${salon.membres.length}`;
    if (nouvelleCle !== cleScene) {
      cleScene = nouvelleCle;
      vueJeu?.detruire();
      vueJeu = null;
      partieAffichee = null;
      if (p.phase === "salon") dessinerLobby(p);
      else if (p.phase === "preparation") vider(scene, h("div.preparation", h("p.attente-connexion", `Préparation de « ${JEUX[p.jeu].nom} »…`)));
      else if (p.phase === "jeu") dessinerJeu(p);
      else if (p.phase === "resultats") dessinerResultats(p);
    } else if (p.phase === "jeu" && vueJeu) {
      partieAffichee = p.partie;
      vueJeu.maj(p.partie.etat);
    }
  }

  function dessinerLobby(p) {
    const hote = salon.membres.find((m) => m.cle === salon.hote);
    const def = JEUX[p.jeu];
    const nb = salon.membres.length;
    const choix = salon.estHote
      ? h(
          "ul.choix-jeux",
          { role: "radiogroup", "aria-label": "Jeu" },
          LISTE_JEUX.map((j) =>
            h(
              "li",
              h(
                "button.choix-jeu",
                { type: "button", role: "radio", "aria-checked": String(j.id === p.jeu), style: { "--teinte": j.teinte }, onclick: () => salon.choisirJeu(j.id) },
                icone(j.id === "motmystere" ? "mot" : j.id),
                h("span.choix-nom", j.nom),
                h("span.choix-duree", j.duree)
              )
            )
          )
        )
      : null;
    const options = h(
      "div.options",
      def.options.map((o) =>
        h(
          "div.option",
          h("span.option-nom", o.nom),
          segmente({
            nom: o.nom,
            valeurs: o.valeurs,
            libelles: o.libelles,
            valeur: p.options[o.id],
            desactive: !salon.estHote,
            onChange: (v) => salon.changerOption(o.id, v),
          })
        )
      )
    );
    const manque = def.min - nb;
    vider(
      scene,
      p.avis ? h("p.avis", p.avis) : null,
      salon.estHote ? h("h1.titre-page", "Choisis un jeu") : h("h1.titre-page", `${hote?.pseudo || "L'hôte"} choisit le jeu`),
      choix,
      h(
        "div.fiche-jeu",
        { style: { "--teinte": def.teinte } },
        h("div.fiche-tete", h("span.programme-icone", { style: { "--teinte": def.teinte } }, icone(def.id === "motmystere" ? "mot" : def.id)), h("div", h("h2", def.nom), h("p", def.accroche))),
        h("ul.regles", def.regles.map((r) => h("li", r))),
        options,
        salon.estHote
          ? h(
              "div.lancer",
              h("button.bouton.bouton-plein.bouton-grand", { type: "button", disabled: manque > 0, onclick: () => salon.lancer() }, nb === 1 ? "Lancer en solo" : `Lancer pour ${nb} joueurs`),
              manque > 0 ? h("span.discret", `Il manque ${manque} joueur${manque > 1 ? "s" : ""}.`) : null
            )
          : h("p.attente", "La partie démarre quand l'hôte la lance.")
      )
    );
  }

  function contexteJeu(partie) {
    const infos = new Map(partie.joueurs.map((j) => [j.cle, j]));
    return {
      moi: salon.moi.cle,
      joueur: (cle) => infos.get(cle) || salon.membres.find((m) => m.cle === cle) || { pseudo: "?", couleur: "#888" },
      envoyer: (a) => salon.agir(a),
      maintenant: () => salon.maintenant(),
    };
  }

  function dessinerJeu(p) {
    const def = JEUX[p.partie.jeu];
    const zone = h("div.zone-jeu");
    vider(
      scene,
      h(
        "div.jeu-tete",
        h("h1.jeu-titre", { style: { "--teinte": def.teinte } }, icone(def.id === "motmystere" ? "mot" : def.id), def.nom),
        salon.estHote ? h("button.lien", { type: "button", onclick: () => confirm("Arrêter la partie pour tout le monde ?") && salon.retourSalon() }, "Arrêter la partie") : null
      ),
      zone
    );
    partieAffichee = p.partie;
    vueJeu = def.vue(zone, contexteJeu(p.partie));
    vueJeu.maj(p.partie.etat);
  }

  function dessinerResultats(p) {
    const r = p.resultats;
    if (resultatsEntendus !== r.partieId) {
      resultatsEntendus = r.partieId;
      const moiLigne = r.lignes.find((l) => l.cle === salon.moi.cle);
      if (moiLigne?.rang === 1 && r.lignes.length > 1) {
        sons.victoire();
        confettis(r.lignes.map((l) => l.couleur));
      } else sons.fin();
    }
    const def = JEUX[r.jeu];
    const solo = r.lignes.length === 1;
    const statut = {
      "en-cours": "Enregistrement au classement…",
      ok: enLigne ? "Partie enregistrée au classement." : "Partie enregistrée dans le classement de ce navigateur.",
      erreur: "Le classement n'a pas pu être mis à jour. Vérifie la configuration Supabase (voir le README).",
    }[r.enregistrement];
    const gagnant = r.lignes[0];
    vider(
      scene,
      h("p.resultats-jeu", def.nom),
      h(
        "h1.titre-page",
        solo ? `Ton score : ${def.score.format(gagnant.score)}` : gagnant.cle === salon.moi.cle ? "Tu as gagné." : `${gagnant.pseudo} gagne la partie.`
      ),
      h(
        "ol.resultats",
        r.lignes.map((l) =>
          h(
            `li${l.cle === salon.moi.cle ? ".moi" : ""}${l.rang === 1 ? ".premier" : ""}`,
            h("span.ecran.rang", afficheur(String(l.rang), { taille: "s", titre: `Rang ${l.rang}` })),
            avatar(l, "m"),
            h("span.resultat-nom", l.pseudo, l.detail ? h("span.discret", l.detail) : null),
            h("span.resultat-score", def.score.format(l.score)),
            solo ? null : h("span.resultat-points", `+${l.points}`)
          )
        )
      ),
      h("p.discret", statut),
      salon.estHote
        ? h(
            "div.lancer",
            h("button.bouton.bouton-plein.bouton-grand", { type: "button", onclick: () => salon.lancer() }, "Rejouer"),
            h("button.bouton", { type: "button", onclick: () => salon.retourSalon() }, "Choisir un autre jeu")
          )
        : h("p.attente", "L'hôte peut relancer une partie ou choisir un autre jeu.")
    );
  }

  // Les comptes à rebours ont besoin d'être redessinés même sans nouveau message.
  const horloge = setInterval(() => {
    if (vueJeu && partieAffichee) vueJeu.maj(salon.public?.partie?.etat || partieAffichee.etat);
  }, 250);

  salon.rejoindre().catch((e) => {
    console.error(e);
    vider(scene, h("div.preparation", h("h1.titre-page", "Connexion impossible"), h("p", e.message || String(e)), h("a.bouton", { href: "#/" }, "Retour à l'accueil")));
  });
  window.__salon = salon; // pratique pour déboguer depuis la console

  return {
    detruire() {
      clearInterval(horloge);
      vueJeu?.detruire();
      salon.quitter();
    },
  };
}

function confettis(couleurs) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const zone = h("div.confettis", { "aria-hidden": "true" });
  for (let i = 0; i < 70; i++) {
    zone.append(
      h("i", {
        style: {
          left: `${Math.random() * 100}%`,
          "--c": couleurs[i % couleurs.length],
          "--x": `${(Math.random() - 0.5) * 240}px`,
          "--a": `${Math.random() * 900 - 450}deg`,
          "--d": `${1.8 + Math.random() * 1.6}s`,
          "--r": `${Math.random() * 0.5}s`,
        },
      })
    );
  }
  document.body.append(zone);
  setTimeout(() => zone.remove(), 4500);
}

// ── Classement ───────────────────────────────────────────────
function ecranClassement(jeu) {
  const contenu = h("div.classement-contenu", h("p.attente-connexion", "Chargement…"));
  const onglets = h(
    "div.onglets",
    { role: "tablist", "aria-label": "Classement" },
    [{ id: null, nom: "Général" }, ...LISTE_JEUX].map((j) =>
      h("a.onglet", { role: "tab", href: j.id ? `#/classement/${j.id}` : "#/classement", "aria-selected": String(j.id === jeu) }, j.nom)
    )
  );
  vider(
    app,
    h(
      "div.classement",
      h("h1.titre-page", "Classement"),
      h("p.chapeau", "Un point par adversaire battu à chaque partie. Les parties en solo ne rapportent pas de points mais comptent pour les records."),
      enLigne ? null : h("p.avis", "Ce classement est gardé dans ce navigateur. Branche Supabase pour un classement commun à toute la bande (voir le README)."),
      onglets,
      contenu
    )
  );
  const def = jeu ? JEUX[jeu] : null;
  const pid = moi().id;
  lireClassement(jeu)
    .then((lignes) => {
      if (!lignes.length) {
        vider(contenu, h("div.vide", h("p", "Personne n'a encore joué ici."), h("a.bouton", { href: "#/" }, "Lancer une partie")));
        return;
      }
      let rang = 0;
      vider(
        contenu,
        h(
          "table.tableau.tableau-classement",
          h(
            "thead",
            h("tr", h("th", h("span.visuellement-cache", "Rang")), h("th", "Joueur"), h("th.num", "Points"), h("th.num", "Victoires"), h("th.num", "Parties"), def ? h("th.num", "Record") : null)
          ),
          h(
            "tbody",
            lignes.map((l, i) => {
              if (i === 0 || lignes[i - 1].points !== l.points) rang = i + 1;
              return h(
                `tr${l.pid === pid ? ".moi" : ""}`,
                h("td.rang-cellule", h("span.ecran.rang", afficheur(String(rang), { taille: "s", titre: `Rang ${rang}` }))),
                h("td", etiquetteJoueur(l)),
                h("td.num.fort", String(l.points)),
                h("td.num", String(l.victoires)),
                h("td.num", String(l.parties)),
                def ? h("td.num", l.record != null ? def.score.format(Number(l.record)) : "—") : null
              );
            })
          )
        )
      );
    })
    .catch((e) => {
      console.error(e);
      vider(contenu, h("p.avis", "Impossible de lire le classement. Vérifie l'URL et la clé Supabase dans assets/js/config.js, et que schema.sql a bien été exécuté."));
    });
  return { detruire() {} };
}

// ── Démarrage ────────────────────────────────────────────────
entete();
demarrerFond();
naviguer();
window.addEventListener("hashchange", naviguer);
