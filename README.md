# Salle d'attente

Six petits jeux rapides à lancer pendant un vocal, de 1 à 10 joueurs.
On prend un ticket (un numéro de salon à 6 chiffres), on le donne aux autres, tout le monde rejoint.

| Jeu | Principe | Joueurs |
|---|---|---|
| **Bombe** | Le principe de Tic Tac Boum : un mot qui contient la syllabe avant que la bombe explose. | 1 à 10 |
| **Mot mystère** | Façon Wordle, le même mot pour tout le monde en même temps, six essais. | 1 à 10 |
| **Morpion** | Variante « 3 pions » (le plus ancien s'efface), le gagnant garde sa place. Seul : contre un robot. | 1 à 10 |
| **Réflexe** | Clique dès que l'écran passe au vert. Gare aux flashs orange. | 1 à 10 |
| **Calcul éclair** | Les mêmes opérations pour tous, le plus de bonnes réponses en une minute. | 1 à 10 |
| **Course de frappe** | Le même texte pour tous, le premier qui le tape en entier gagne. | 1 à 10 |

Le site est 100 % statique (HTML, CSS, JavaScript sans framework ni compilation) : il tourne tel quel sur GitHub Pages. Le temps réel et la base de données passent par [Supabase](https://supabase.com) (offre gratuite).

---

## 1. Mettre le site en ligne sur GitHub Pages

1. Crée un dépôt sur GitHub (par exemple `salle-d-attente`) et envoie-y le contenu de ce dossier :

   ```bash
   git init
   git add .
   git commit -m "Salle d'attente"
   git branch -M main
   git remote add origin https://github.com/TON-PSEUDO/salle-d-attente.git
   git push -u origin main
   ```

2. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploiement.yml` se lance à chaque `push` sur `main`. Il ajoute le dictionnaire français complet et publie le site. Au bout d'une minute, le site est à l'adresse `https://TON-PSEUDO.github.io/salle-d-attente/` (lien visible dans l'onglet **Actions**).

> Sans GitHub Actions, tu peux aussi choisir **Source : Deploy from a branch** (branche `main`, dossier `/`). Le site marche pareil, le dictionnaire est alors chargé depuis le CDN jsDelivr.

À ce stade, le site fonctionne déjà, mais en **mode local** : les salons ne relient que les onglets d'un même navigateur et le classement reste dans ce navigateur. Pour jouer à plusieurs depuis des ordinateurs différents, il faut l'étape 2.

## 2. Brancher Supabase (jeu en ligne + classement commun)

Compte 5 minutes.

1. Crée un compte puis un projet sur [supabase.com](https://supabase.com) (offre gratuite, région Europe).
2. Dans le projet : **SQL Editor → New query**, colle tout le contenu de `supabase/schema.sql`, puis **Run**. Ça crée les tables, les vues du classement, la fonction d'enregistrement et les règles de sécurité.
3. Va dans **Project Settings → API** (ou **Data API / API Keys**) et récupère :
   - l'**URL du projet** (`https://xxxxxxxx.supabase.co`) ;
   - la **clé publique** : `anon public` ou `publishable` (commence par `eyJ…` ou `sb_publishable_…`). **Jamais** la clé `service_role` / `secret`.
4. Colle-les dans `assets/js/config.js` :

   ```js
   export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   export const SUPABASE_CLE = "sb_publishable_xxxxxxxxxxxx";
   ```

5. `git commit` + `git push`. Le salon affiche maintenant « En ligne » et la page Classement est commune à toute la bande.

La clé publique est faite pour être visible dans le code du site : les tables sont en lecture seule pour elle (RLS), et l'écriture ne passe que par la fonction `enregistrer_partie`, qui vérifie les données.

## 3. Tester sur ton ordinateur

**Le plus simple : double-clique sur `jouer.html`.** C'est tout le site dans un seul fichier, qui marche sans serveur (solo, sons, classement de ce navigateur). Il se régénère avec `python scripts/hors-ligne.py` après une modification du code.

Pour tester comme en ligne (plusieurs onglets dans un même salon) :

Les modules JavaScript ne marchent pas en ouvrant `index.html` par double-clic : il faut un petit serveur.

```bash
python -m http.server 8000
# puis http://localhost:8000
```

Sans Supabase, ouvre plusieurs onglets sur le même numéro de salon pour simuler plusieurs joueurs. Astuce pour avoir des pseudos différents dans chaque onglet, dans la console du navigateur :

```js
sessionStorage.setItem("sa.profil", JSON.stringify({ id: crypto.randomUUID(), pseudo: "Yanis", couleur: "#D9362B" })); location.reload();
```

Pour avoir le dictionnaire complet en local (sinon il vient du CDN) :

```bash
npm install --no-save an-array-of-french-words@2.0.0
node scripts/dictionnaire.mjs
```

---

## Comment ça marche

### Les salons

- Chaque salon est un canal **Supabase Realtime** (`salle-attente:427193`). La **présence** donne la liste des joueurs connectés, le **broadcast** transporte les messages.
- **Le premier arrivé est l'hôte.** La logique du jeu tourne dans son navigateur : il reçoit les actions des autres (« j'ai tapé ce mot », « j'ai cliqué »), applique les règles et renvoie l'état de la partie à tout le monde. Les autres ne font qu'afficher et envoyer leurs actions.
- Si l'hôte part, le joueur arrivé juste après prend le relais automatiquement (la partie en cours s'arrête, on revient au salon).
- Les informations secrètes (le mot de Mot mystère, la durée de la mèche de la Bombe) restent chez l'hôte : dans le code, ce sont les clés qui commencent par `_`, retirées avant chaque envoi.
- Les temps de réaction de Réflexe sont mesurés dans le navigateur de chaque joueur : la latence réseau n'avantage personne.
- Sans Supabase, le même code tourne sur `BroadcastChannel` (communication entre onglets).

### La base de données

```
jeux (1) ──< parties (1) ──< resultats >── (1) joueurs
```

| Table | Rôle |
|---|---|
| `jeux` | Les 6 jeux et le sens du record (`plus_petit_meilleur` : vrai pour Réflexe). |
| `joueurs` | Un identifiant créé par le navigateur, un pseudo, une couleur. Pas de compte, pas de mot de passe. |
| `parties` | Une ligne par partie : jeu, salon, nombre de joueurs, date. |
| `resultats` | Le rang, le score et les points de chaque joueur dans une partie. |

Vues lues par le site : `classement_general`, `classement_jeux` (avec le record de chaque joueur par jeu) et `dernieres_parties`.

**Règle des points** : 1 point par adversaire battu. Une partie gagnée à 10 rapporte 9 points, une partie solo 0 point (mais elle compte pour les records).

À la fin d'une partie, l'hôte appelle une seule fois `enregistrer_partie(jeu, salon, resultats)`. Cette fonction (`security definer`) vérifie le jeu, le nombre de joueurs (1 à 10), les rangs, l'absence de doublon, et refuse deux enregistrements du même salon à moins de 3 secondes d'intervalle.

### Les fichiers

```
index.html
assets/
  css/style.css            styles (thème clair et sombre)
  js/config.js             ← l'URL et la clé Supabase
  js/app.js                navigation, accueil, salon, classement
  js/salon.js              salon : présence, hôte, boucle de jeu
  js/reseau.js             transports Supabase Realtime / BroadcastChannel
  js/classement.js         lecture et écriture du classement
  js/dico.js               dictionnaire français + syllabes de la Bombe
  js/profil.js             pseudo, couleur, identifiant du joueur
  js/sons.js               bande-son synthétisée (tic-tac, boum, tuiles, pion en bois…)
  js/ui.js, js/outils.js   composants (afficheur 7 segments, avatars…) et utilitaires
  js/jeux/*.js             un fichier par jeu
  data/                    mots du Mot mystère, textes de la course, dictionnaire de secours
  fonts/                   DM Sans, Archivo Black, Anonymous Pro (licence OFL)
supabase/schema.sql        la base de données
scripts/dictionnaire.mjs   génère assets/data/dictionnaire.txt
.github/workflows/         déploiement GitHub Pages
```

### Ajouter un jeu

Copie un jeu simple comme `assets/js/jeux/reflexe.js` et ajoute-le dans `assets/js/jeux/index.js`. Un jeu, c'est un objet avec :

- `id`, `nom`, `accroche`, `regles`, `min`, `max`, `duree`, `score` (unité, sens, format) et `options` ;
- côté hôte : `creer()` (état de départ), `action()` (un joueur agit), `tic()` (appelé 10 fois par seconde pour les chronos), `depart()` (un joueur quitte), `fin()` (renvoie le classement quand c'est terminé) ;
- côté affichage : `vue(element, ctx)` qui renvoie `{ maj(etat), detruire() }`.

Pense aussi à ajouter son identifiant dans la table `jeux` (`insert into jeux …`).

---

## Si quelque chose coince

- **« Connexion impossible » dans un salon** : vérifie l'URL et la clé dans `config.js`. Dans Supabase, **Realtime → Settings**, l'accès public aux canaux doit être autorisé.
- **Le classement ne se met pas à jour** : `schema.sql` n'a sans doute pas été exécuté en entier. Relance-le, il ne supprime rien.
- **La Bombe refuse des mots courants** : le dictionnaire complet n'a pas pu se charger (le site affiche alors un message). Vérifie que l'étape « Dictionnaire français » du workflow est passée, ou génère `assets/data/dictionnaire.txt` à la main.
- **Limites de l'offre gratuite Supabase** : largement suffisante pour une bande d'amis. Le site limite lui-même le nombre de messages envoyés par seconde.
- **Triche** : comme l'hôte fait tourner le jeu dans son navigateur, quelqu'un qui bidouille la console peut tricher. C'est un site entre potes, pas un tournoi.

## Crédits

- Dictionnaire : [an-array-of-french-words](https://github.com/words/an-array-of-french-words) (licence MIT).
- Polices : DM Sans, Archivo Black, Anonymous Pro (SIL Open Font License, fichiers dans `assets/fonts`).
- Tic Tac Boum et Wordle sont des marques de leurs propriétaires ; les jeux de ce site en reprennent seulement le principe.
