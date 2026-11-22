// Bande-son du site, entièrement synthétisée avec la Web Audio API (aucun fichier à charger).
// Chaque son est fabriqué à partir de deux ingrédients : du bruit filtré (chocs, frottements)
// et des oscillateurs (notes, grondements).

let audio = null;
let sortie = null;
let bruitBlanc = null;

function contexte() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    sortie = audio.createDynamicsCompressor();
    sortie.threshold.value = -14;
    sortie.ratio.value = 4;
    const volume = audio.createGain();
    volume.gain.value = 0.9;
    sortie.connect(volume).connect(audio.destination);
    bruitBlanc = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const d = bruitBlanc.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (audio.state === "suspended") audio.resume();
  return audio;
}

// Bruit passé dans un filtre, avec une enveloppe qui retombe vite : un « choc ».
function choc({ t = 0, freq = 1000, q = 1, duree = 0.06, volume = 0.3, filtre = "bandpass", freqFin = null, attaque = 0.002 }) {
  const a = contexte();
  const debut = a.currentTime + t;
  const src = a.createBufferSource();
  src.buffer = bruitBlanc;
  const f = a.createBiquadFilter();
  f.type = filtre;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, debut);
  if (freqFin) f.frequency.exponentialRampToValueAtTime(freqFin, debut + duree);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, debut);
  g.gain.exponentialRampToValueAtTime(volume, debut + attaque);
  g.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  src.connect(f).connect(g).connect(sortie);
  src.start(debut, Math.random() * 0.5);
  src.stop(debut + duree + 0.02);
}

// Une note : oscillateur avec glissando facultatif.
function note({ t = 0, freq = 440, freqFin = null, duree = 0.12, volume = 0.15, type = "sine", attaque = 0.004 }) {
  const a = contexte();
  const debut = a.currentTime + t;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, debut);
  if (freqFin) o.frequency.exponentialRampToValueAtTime(freqFin, debut + duree);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, debut);
  g.gain.exponentialRampToValueAtTime(volume, debut + attaque);
  g.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  o.connect(g).connect(sortie);
  o.start(debut);
  o.stop(debut + duree + 0.02);
}

const varie = (x, ecart = 0.08) => x * (1 + (Math.random() * 2 - 1) * ecart);

function jouer(fn) {
  if (!sons.actifs) return;
  try {
    fn();
  } catch {}
}

export const sons = {
  actifs: localStorage.getItem("sa.sons") !== "non",
  basculer() {
    this.actifs = !this.actifs;
    localStorage.setItem("sa.sons", this.actifs ? "oui" : "non");
    if (this.actifs) this.carillon();
    return this.actifs;
  },

  // ── Génériques ─────────────────────────────────────────────
  bip(freq = 660, duree = 0.08, volume = 0.08, type = "sine") {
    jouer(() => note({ freq, duree, volume: volume * 1.6, type }));
  },
  ok() {
    jouer(() => {
      note({ freq: 880, duree: 0.09, volume: 0.13, type: "triangle" });
      note({ t: 0.07, freq: 1320, duree: 0.14, volume: 0.13, type: "triangle" });
    });
  },
  non() {
    jouer(() => {
      note({ freq: 200, freqFin: 150, duree: 0.18, volume: 0.1, type: "square" });
      choc({ freq: 300, q: 2, duree: 0.08, volume: 0.08 });
    });
  },
  // « Ding-dong » d'une salle d'attente : quelqu'un arrive dans le salon.
  carillon() {
    jouer(() => {
      note({ freq: 784, duree: 0.9, volume: 0.12, type: "sine", attaque: 0.01 });
      note({ freq: 1568, duree: 0.4, volume: 0.03, type: "sine" });
      note({ t: 0.32, freq: 622, duree: 1.1, volume: 0.12, type: "sine", attaque: 0.01 });
      note({ t: 0.32, freq: 1244, duree: 0.5, volume: 0.03, type: "sine" });
    });
  },
  // Décompte « 3, 2, 1 » puis départ.
  decompte(dernier = false) {
    jouer(() => note({ freq: dernier ? 1046 : 523, duree: dernier ? 0.35 : 0.14, volume: 0.13, type: "triangle" }));
  },
  victoire() {
    jouer(() => {
      [523, 659, 784, 1046].forEach((f, i) => note({ t: i * 0.09, freq: f, duree: 0.28, volume: 0.12, type: "triangle" }));
      note({ t: 0.36, freq: 1568, duree: 0.6, volume: 0.05, type: "sine" });
    });
  },
  fin() {
    jouer(() => {
      note({ freq: 659, duree: 0.25, volume: 0.1, type: "triangle" });
      note({ t: 0.12, freq: 523, duree: 0.4, volume: 0.1, type: "triangle" });
    });
  },

  // ── Bombe ──────────────────────────────────────────────────
  // Tic (aigu) et tac (grave), comme une vieille horloge mécanique.
  tic(aigu = true) {
    jouer(() => {
      choc({ freq: varie(aigu ? 3400 : 2300, 0.03), q: 9, duree: 0.035, volume: 0.32 });
      note({ freq: aigu ? 1900 : 1400, duree: 0.03, volume: 0.04, type: "square" });
    });
  },
  boum() {
    jouer(() => {
      note({ freq: 140, freqFin: 32, duree: 1.1, volume: 0.55, type: "sine", attaque: 0.005 });
      note({ freq: 70, freqFin: 28, duree: 1.3, volume: 0.35, type: "triangle" });
      choc({ freq: 2400, freqFin: 120, q: 0.7, duree: 1.2, volume: 0.6, filtre: "lowpass", attaque: 0.003 });
      choc({ t: 0.02, freq: 600, q: 0.5, duree: 0.5, volume: 0.35 });
    });
  },
  mecheAllumee() {
    jouer(() => choc({ freq: 5000, freqFin: 2500, q: 0.8, duree: 0.25, volume: 0.06, filtre: "highpass", attaque: 0.02 }));
  },

  // ── Mot mystère : lettres en bois façon Scrabble ───────────
  tuile() {
    jouer(() => {
      choc({ freq: varie(2600, 0.15), q: 4, duree: 0.045, volume: 0.32 });
      choc({ freq: varie(900, 0.1), q: 3, duree: 0.06, volume: 0.16 });
    });
  },
  retireTuile() {
    jouer(() => choc({ freq: varie(1800, 0.1), q: 3, duree: 0.035, volume: 0.14 }));
  },
  // Les tuiles se retournent une à une : une note par couleur.
  revele(motif) {
    jouer(() =>
      [...motif].forEach((c, i) => {
        const t = 0.06 * i + 0.12;
        choc({ t, freq: 2200, q: 5, duree: 0.035, volume: 0.14 });
        if (c === "v") note({ t, freq: [784, 880, 988, 1046, 1175][i], duree: 0.2, volume: 0.08, type: "triangle" });
        else if (c === "j") note({ t, freq: 587, duree: 0.14, volume: 0.06, type: "triangle" });
      })
    );
  },

  // ── Morpion : pion en bois ─────────────────────────────────
  pion() {
    jouer(() => {
      choc({ freq: 700, freqFin: 1300, q: 1.2, duree: 0.12, volume: 0.05, attaque: 0.04 }); // il glisse…
      const t = 0.11;
      note({ t, freq: varie(190, 0.05), freqFin: 140, duree: 0.12, volume: 0.32, type: "sine", attaque: 0.002 }); // …et se pose
      choc({ t, freq: varie(1100, 0.1), q: 5, duree: 0.07, volume: 0.32 });
      choc({ t, freq: 380, q: 2, duree: 0.09, volume: 0.22 });
    });
  },
  retirePion() {
    jouer(() => choc({ freq: 1600, freqFin: 500, q: 1.5, duree: 0.18, volume: 0.07, attaque: 0.03 }));
  },

  // ── Course de frappe & calcul ──────────────────────────────
  touche() {
    jouer(() => {
      choc({ freq: varie(4200, 0.12), q: 6, duree: 0.022, volume: 0.13 });
      choc({ freq: varie(1200, 0.1), q: 2, duree: 0.03, volume: 0.06 });
    });
  },
  juste(serie = 0) {
    jouer(() => note({ freq: 660 * Math.pow(2, Math.min(serie, 12) / 12), duree: 0.1, volume: 0.11, type: "triangle" }));
  },
};
