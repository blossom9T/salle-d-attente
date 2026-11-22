// Fond animé : de petites phrases traversent l'écran en ondulant, très transparentes.
// Chaque phrase reste entière et se déplace d'un seul bloc. Pour changer les phrases,
// modifie simplement la liste ci-dessous.
export const PHRASES = [
  "Sushi de dragon",
  "Pâté d'Urgot croustillant",
  "Ingratitude",
  "Sauterelle cosmique",
  "C'est la faute de Blitz",
];

const MAX_A_LECRAN = 4;
const INTERVALLE = 2600; // ms entre deux apparitions

export function demarrerFond() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const zone = document.createElement("div");
  zone.className = "fond-mots";
  zone.setAttribute("aria-hidden", "true");
  document.body.prepend(zone);

  let derniere = null;
  const lancer = () => {
    if (document.hidden || document.body.classList.contains("en-partie")) return;
    if (zone.childElementCount >= MAX_A_LECRAN) return;
    let texte;
    do texte = PHRASES[Math.floor(Math.random() * PHRASES.length)];
    while (PHRASES.length > 1 && texte === derniere);
    derniere = texte;
    envoyer(zone, texte);
  };
  setTimeout(lancer, 400);
  setTimeout(lancer, 1600);
  setInterval(lancer, INTERVALLE);
}

function envoyer(zone, texte) {
  const el = document.createElement("span");
  el.className = "fond-phrase";
  el.textContent = texte;
  el.style.fontSize = `${22 + Math.random() * 26}px`;
  zone.append(el);

  const L = innerWidth, H = innerHeight;
  const w = el.offsetWidth, h = el.offsetHeight;
  const sens = ["gauche", "droite", "bas"][Math.floor(Math.random() * 3)];
  const amplitude = 18 + Math.random() * 30;   // hauteur de la vague (px)
  const vagues = 1.5 + Math.random() * 1.5;     // nombre d'ondulations sur le trajet
  const phase = Math.random() * Math.PI * 2;
  const opacite = 0.06 + Math.random() * 0.05;

  // Point de départ et d'arrivée, puis un décalage sinusoïdal perpendiculaire au trajet.
  let depart, arrivee;
  if (sens === "gauche") {
    const y = Math.random() * (H - h);
    depart = [L + 20, y];
    arrivee = [-w - 20, y];
  } else if (sens === "droite") {
    const y = Math.random() * (H - h);
    depart = [-w - 20, y];
    arrivee = [L + 20, y];
  } else {
    const x = Math.random() * Math.max(1, L - w);
    depart = [x, -h - 20];
    arrivee = [x, H + 20];
  }

  const etapes = 24;
  const images = [];
  for (let i = 0; i <= etapes; i++) {
    const p = i / etapes;
    const onde = Math.sin(phase + p * vagues * Math.PI * 2) * amplitude;
    const x = depart[0] + (arrivee[0] - depart[0]) * p + (sens === "bas" ? onde : 0);
    const y = depart[1] + (arrivee[1] - depart[1]) * p + (sens === "bas" ? 0 : onde);
    const inclinaison = Math.cos(phase + p * vagues * Math.PI * 2) * 4;
    // Apparition en fondu, puis effacement avant la fin du trajet.
    const o = p < 0.15 ? (p / 0.15) * opacite : p > 0.7 ? Math.max(0, ((0.9 - p) / 0.2) * opacite) : opacite;
    images.push({ transform: `translate(${x}px, ${y}px) rotate(${inclinaison}deg)`, opacity: o, offset: p });
  }
  const duree = (sens === "bas" ? 14000 : 18000) + Math.random() * 8000;
  el.animate(images, { duration: duree, easing: "linear", fill: "forwards" }).onfinish = () => el.remove();
}
