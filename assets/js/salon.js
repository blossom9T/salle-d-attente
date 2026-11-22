// Un salon : les joueurs connectés, l'hôte, et l'état partagé.
//
// Modèle « hôte qui fait autorité » : le premier arrivé fait tourner la logique
// du jeu dans son navigateur et diffuse l'état à tout le monde. Les autres
// envoient seulement leurs actions. Si l'hôte part, le suivant prend le relais.
import { creerTransport } from "./reseau.js";
import { MAX_JOUEURS } from "./config.js";
import { identifiant, alea } from "./outils.js";
import { JEUX, optionsParDefaut } from "./jeux/index.js";
import { enregistrerPartie, pointsPour } from "./classement.js";

// Les clés qui commencent par « _ » restent chez l'hôte (mot secret, dictionnaire…).
const masquer = (k, v) => (k.startsWith("_") ? undefined : v);
const copiePublique = (etat) => JSON.parse(JSON.stringify(etat, masquer));

export class Salon {
  constructor(code, profil, { surChangement, surErreur, jeuInitial, soloImmediat } = {}) {
    this.code = code;
    this.moi = {
      cle: profil.onglet,
      pid: profil.id,
      pseudo: profil.pseudo,
      couleur: profil.couleur,
      arrivee: Date.now(),
    };
    this.membres = [this.moi];
    this.hote = null;
    this.estHote = false;
    this.etat = null; // état complet (avec les clés privées si je suis l'hôte)
    this.public = null; // ce que tout le monde voit
    this.surChangement = surChangement || (() => {});
    this.surErreur = surErreur || (() => {});
    this.jeuInitial = JEUX[jeuInitial] ? jeuInitial : null;
    this.soloImmediat = soloImmediat;
    this.decalages = [];
    this.derniereDiffusion = 0;
    this.diffusionPrevue = null;
    this.ferme = false;
  }

  // ── Connexion ──────────────────────────────────────────────
  async rejoindre() {
    this.transport = creerTransport(this.code, this.moi);
    this.transport.surPresence((liste) => this.majPresence(liste));
    this.transport.surMessage((type, donnees, de) => this.recevoir(type, donnees, de));
    await this.transport.connecter();
    this.transport.envoyer("coucou", {});
    // On laisse une chance à l'hôte actuel de nous envoyer l'état du salon.
    const debut = Date.now();
    while (!this.public && Date.now() - debut < (this.membres.length > 1 ? 1200 : 350)) {
      await new Promise((r) => setTimeout(r, 60));
    }
    this.pret = true;
    this.elire();
    this.signaler();
  }

  async quitter() {
    this.ferme = true;
    clearInterval(this.horloge);
    clearTimeout(this.diffusionPrevue);
    await this.transport?.quitter();
  }

  majPresence(liste) {
    if (this.ferme) return;
    if (!liste.some((m) => m.cle === this.moi.cle)) liste = [...liste, this.moi];
    this.membres = liste.sort((a, b) => a.arrivee - b.arrivee || (a.cle < b.cle ? -1 : 1));
    if (this.membres.findIndex((m) => m.cle === this.moi.cle) >= MAX_JOUEURS) {
      this.surErreur(`Ce salon est complet (${MAX_JOUEURS} joueurs maximum).`);
      this.quitter();
      return;
    }
    if (this.pret) this.elire();
    if (this.estHote) {
      this.gererDeparts();
      this.diffuser(true);
    }
    this.signaler();
  }

  elire() {
    const ancien = this.hote;
    this.hote = this.membres[0]?.cle;
    const jeSuisHote = this.hote === this.moi.cle;
    if (jeSuisHote && !this.estHote) this.devenirHote(ancien);
    else if (!jeSuisHote && this.estHote) {
      this.estHote = false;
      clearInterval(this.horloge);
    }
    if (ancien !== this.hote) this.decalages = [];
  }

  devenirHote(ancien) {
    this.estHote = true;
    const jeu = this.jeuInitial || "bombe";
    if (!this.etat) {
      this.etat = { phase: "salon", jeu, options: optionsParDefaut(jeu), partie: null, resultats: null, avis: null };
    } else if (this.etat.phase === "jeu") {
      // Le jeu tournait chez l'ancien hôte : on revient au salon proprement.
      this.etat = { ...this.etat, phase: "salon", partie: null, avis: "L'hôte a quitté la partie. Retour au salon." };
    }
    this.diffuser(true);
    if (this.soloImmediat && this.etat.phase === "salon" && ancien == null) {
      this.soloImmediat = false;
      setTimeout(() => this.lancer(), 50);
    }
  }

  // ── Messages ───────────────────────────────────────────────
  recevoir(type, donnees, de) {
    if (this.ferme) return;
    if (type === "coucou" && this.estHote) {
      this.diffuser(true);
    } else if (type === "etat") {
      if (!this.accepterEtatDe(de, donnees.arrivee)) return;
      this.decalages.push(donnees.heure - Date.now());
      if (this.decalages.length > 12) this.decalages.shift();
      this.etat = donnees.e;
      this.public = donnees.e;
      this.signaler();
    } else if (type === "action" && this.estHote) {
      this.traiterAction(de, donnees.a);
    }
  }

  accepterEtatDe(cle, arrivee) {
    if (this.estHote && cle !== this.moi.cle) {
      // Deux hôtes en même temps (arrivées simultanées) : le plus ancien gagne.
      if (arrivee < this.moi.arrivee || (arrivee === this.moi.arrivee && cle < this.moi.cle)) {
        this.estHote = false;
        clearInterval(this.horloge);
        return true;
      }
      return false;
    }
    if (cle === this.hote) return true;
    const elu = this.membres.find((m) => m.cle === this.hote);
    return !this.membres.some((m) => m.cle === cle) && (!elu || arrivee <= elu.arrivee);
  }

  // Heure de l'hôte, estimée localement (pour les comptes à rebours).
  maintenant() {
    if (this.estHote || !this.decalages.length) return Date.now();
    return Date.now() + Math.max(...this.decalages);
  }

  diffuser(immediat = false) {
    if (!this.estHote || this.ferme) return;
    this.public = copiePublique(this.etat);
    this.signaler();
    // On limite le débit pour rester sous les quotas du temps réel.
    const intervalle = 90 + 15 * this.membres.length;
    const ecoule = Date.now() - this.derniereDiffusion;
    if (immediat || ecoule >= intervalle) {
      clearTimeout(this.diffusionPrevue);
      this.diffusionPrevue = null;
      this.envoyerEtat();
    } else if (!this.diffusionPrevue) {
      this.diffusionPrevue = setTimeout(() => {
        this.diffusionPrevue = null;
        this.envoyerEtat();
      }, intervalle - ecoule);
    }
  }
  envoyerEtat() {
    this.derniereDiffusion = Date.now();
    this.transport?.envoyer("etat", { e: copiePublique(this.etat), heure: Date.now(), arrivee: this.moi.arrivee });
  }

  signaler() {
    if (!this.ferme) this.surChangement(this);
  }

  // ── Commandes de l'hôte (salon) ───────────────────────────
  choisirJeu(id) {
    if (!this.estHote || this.etat.phase !== "salon" || !JEUX[id]) return;
    this.etat = { ...this.etat, jeu: id, options: optionsParDefaut(id), avis: null };
    this.diffuser(true);
  }
  changerOption(cle, valeur) {
    if (!this.estHote || this.etat.phase !== "salon") return;
    this.etat = { ...this.etat, options: { ...this.etat.options, [cle]: valeur } };
    this.diffuser(true);
  }
  retourSalon() {
    if (!this.estHote) return;
    clearInterval(this.horloge);
    this.etat = { ...this.etat, phase: "salon", partie: null, resultats: null, avis: null };
    this.diffuser(true);
  }

  async lancer() {
    if (!this.estHote || this.lancement) return;
    const def = JEUX[this.etat.jeu];
    const joueurs = this.membres.slice(0, MAX_JOUEURS);
    if (joueurs.length < def.min) return;
    this.lancement = true;
    try {
      this.etat = { ...this.etat, phase: "preparation", avis: null, resultats: null };
      this.diffuser(true);
      const prep = def.preparer ? await def.preparer(this.etat.options) : null;
      if (!this.estHote || this.ferme) return;
      const partie = {
        id: identifiant().slice(0, 8),
        jeu: def.id,
        options: { ...this.etat.options },
        joueurs: joueurs.map(({ cle, pid, pseudo, couleur }) => ({ cle, pid, pseudo, couleur })),
        etat: def.creer({
          joueurs: joueurs.map((j) => j.cle),
          options: this.etat.options,
          maintenant: Date.now(),
          prep,
          hasard: alea,
        }),
      };
      partie.etat._prep = prep;
      this.etat = { ...this.etat, phase: "jeu", partie };
      this.diffuser(true);
      clearInterval(this.horloge);
      this.horloge = setInterval(() => this.tic(), 100);
    } catch (e) {
      console.error(e);
      this.etat = { ...this.etat, phase: "salon", avis: "La partie n'a pas pu démarrer : " + (e.message || e) };
      this.diffuser(true);
    } finally {
      this.lancement = false;
    }
  }

  // ── Boucle de jeu (hôte uniquement) ───────────────────────
  agir(action) {
    if (this.estHote) this.traiterAction(this.moi.cle, action);
    else this.transport?.envoyer("action", { a: action });
  }

  traiterAction(cle, action) {
    if (this.etat?.phase !== "jeu" || !action) return;
    const { partie } = this.etat;
    if (!partie.joueurs.some((j) => j.cle === cle)) return;
    const def = JEUX[partie.jeu];
    let change = false;
    try {
      change = def.action(partie.etat, cle, action, Date.now());
    } catch (e) {
      console.error(e);
    }
    if (change) this.apresChangement();
  }

  tic() {
    if (!this.estHote || this.etat?.phase !== "jeu") return clearInterval(this.horloge);
    const { partie } = this.etat;
    let change = false;
    try {
      change = JEUX[partie.jeu].tic(partie.etat, Date.now());
    } catch (e) {
      console.error(e);
    }
    if (change) this.apresChangement();
  }

  gererDeparts() {
    if (this.etat?.phase !== "jeu") return;
    const { partie } = this.etat;
    const presents = new Set(this.membres.map((m) => m.cle));
    let change = false;
    for (const j of partie.joueurs) {
      if (!presents.has(j.cle) && !j.parti) {
        j.parti = true;
        change = JEUX[partie.jeu].depart(partie.etat, j.cle, Date.now()) || change;
      }
    }
    if (change) this.apresChangement();
  }

  apresChangement() {
    const { partie } = this.etat;
    const fin = JEUX[partie.jeu].fin(partie.etat);
    if (fin) return this.terminer(fin);
    this.diffuser();
  }

  terminer(fin) {
    clearInterval(this.horloge);
    const { partie } = this.etat;
    const infos = new Map(partie.joueurs.map((j) => [j.cle, j]));
    const lignes = fin
      .filter((r) => infos.has(r.cle))
      .map((r) => ({ ...infos.get(r.cle), rang: r.rang, score: r.score, detail: r.detail ?? null }));
    for (const l of lignes) l.points = lignes.length > 1 ? pointsPour(l.rang, lignes) : 0;
    lignes.sort((a, b) => a.rang - b.rang);
    this.etat = {
      ...this.etat,
      phase: "resultats",
      resultats: { jeu: partie.jeu, partieId: partie.id, lignes, enregistrement: "en-cours" },
    };
    this.diffuser(true);
    enregistrerPartie({ jeu: partie.jeu, salon: this.code, resultats: lignes })
      .then(() => this.marquerEnregistrement(partie.id, "ok"))
      .catch((e) => {
        console.error(e);
        this.marquerEnregistrement(partie.id, "erreur");
      });
  }

  marquerEnregistrement(partieId, statut) {
    if (!this.estHote || this.etat.resultats?.partieId !== partieId) return;
    this.etat = { ...this.etat, resultats: { ...this.etat.resultats, enregistrement: statut } };
    this.diffuser(true);
  }
}

export function nouveauCode() {
  return String(alea.entier(100000, 999999));
}
