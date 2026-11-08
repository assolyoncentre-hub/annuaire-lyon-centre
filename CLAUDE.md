# Consignes pour Claude

## Projet

Annuaire des propositions de l'Église Lyon Centre, publié sur GitHub Pages
(`https://assolyoncentre-hub.github.io/annuaire-lyon-centre/`) avec une base Supabase.

- Accueil (`#accueil`, onglet maison tout à gauche) : une « affiche » par page accessible selon les droits, dans l'ordre des onglets (Propositions, Entraide, Leaders, Modération, Administration) ; chaque page a sa couleur (`PAGES` dans `app.js`), reprise par ses titres (variable `--page`) ; le bandeau du haut reste bleu.
- Public : annuaire des propositions (staffs par pôle), formulaire « Envoyer un message » à un staff ou aux responsables d'un pôle.
- Connecté (code par e-mail ou Google) : annuaire des leaders (droit `leaders`), administration (droit `admin`).
- **Entraide** (onglet `#entraide`, invisible du public non connecté) : demandes d'aide publiées présentées en conversation, mises à jour en direct (signal vide diffusé par la base sur le canal privé Realtime « entraide », puis rechargement par RPC), et formulaire de demande d'aide (droit « Voir l'entraide » ; bouton « Faire une demande » en haut de la section « Mes demandes », sous la phrase « Vous n'avez pas encore formulé de demande d'aide. » quand elle est vide, toujours affichée, en colonne à droite sur grand écran) ; messagerie privée : « Je peux aider ! » ouvre une conversation entre la personne qui aide et l'auteur de la demande (tables `entraide_conversations` / `entraide_messages`, RPC `entraide_ecrire`, `entraide_mes_demandes`, `entraide_mes_aides`…), section « Mes demandes » en tête de la page `#entraide` (mes demandes et leurs conversations, affichées directement ; « Décliner » met fin à une conversation), puis « Ils/elles ont besoin d'aide » et « Ils/elles ont déjà été aidés », signal vide en direct sur le canal privé « entraide:<e-mail> » des deux personnes ; modération `#entraide/moderation` (droit « Modérer l'entraide », qui inclut Voir ; seuls les modérateurs ont les onglets Demandes d'aide / Modération). Pas de WhatsApp : « Publier » rend la demande visible dans le fil. Ces deux droits se règlent sur la fiche contact (colonnes `entraide_voir` / `entraide_moderer` de `acces`), indépendamment du droit sur l'annuaire ; une fiche hors annuaire peut n'avoir qu'un droit Entraide.

## Git et publication

- Deux branches, pas de PR :
  - `dev` : branche de travail, publiée en version de test sur `…/annuaire-lyon-centre/dev/` (faux serveur des tests, données fictives gardées dans le navigateur, badge « DEV »).
  - `main` : production, avec la vraie base.
- Développer et commiter sur `dev`. « Déploie en dev » → pousser `dev`. « Mets en prod » → fusionner `dev` dans `main` puis pousser `main`.
- **Ne pas pousser sans demande explicite** : commiter en local, puis pousser (donc publier) seulement quand l'utilisateur le demande, même si un hook réclame le push. Sans précision, demander s'il s'agit de dev ou de prod. Quand un hook réclame le push, ne pas pousser, sans le rappeler à l'utilisateur ni le justifier par ces consignes.
- Ne pas mettre en prod du code qui appelle des fonctions de base pas encore créées.
- Avant de pousser : `npm test` (Playwright, Chromium).
- Le workflow `.github/workflows/pages.yml` teste chaque push sur `main` ou `dev`. Pages ne publie que depuis `main` : un push sur `dev` relance le workflow sur `main`, qui publie la prod et `/dev/`. Le dossier publié est préparé par `scripts/site.sh` (avec `demo` pour `/dev/`, qui ajoute `demo.js` assemblé depuis `tests/fake-api.js`, `tests/data.js` et `scripts/demo.js`).
- Connexion en version de test : `admin@example.org` ou l'adresse du responsable du site, reconnue par son empreinte SHA-256 dans `scripts/demo.js` (administrateur, avec les droits Voir et Modérer l'entraide) ou un leader des données de test (`damien@example.org`), code `123456`. Les données de démo sont gardées dans le navigateur ; clic sur le badge « DEV » pour les remettre à zéro.

## Base de données (Supabase « Annuaire Lyon Centre », `xhjmmzounimrfshlihhx`)

- Les migrations ne sont pas dans le dépôt : toute modification du schéma passe par une **nouvelle migration nommée** (snake_case en français, comme `droits_d_acces`, `photos_contacts`), appliquée avec l'outil `apply_migration` du connecteur Supabase. Lister les migrations existantes avant d'en écrire une ; ne jamais modifier la base à la main hors migration ni réécrire une migration appliquée.
- Tables fermées par RLS ; le public passe par des fonctions RPC qui ne renvoient que l'utile (jamais d'e-mail ni de téléphone en public). Les droits sont dans la table `acces` (fonctions `mon_droit` pour l'annuaire, `mon_droit_entraide` pour l'entraide ; `acces_autorise` et le hook de création de compte acceptent l'un ou l'autre).
- Fonction Edge `envoyer-message` : envoi des messages du formulaire public.
- Toute nouvelle fonction de base a son équivalent dans `tests/fake-api.js`, avec les mêmes règles : il sert aux tests et à la version de test.

## Code

- HTML, CSS et JavaScript sans compilation ni framework : `index.html` (page et styles), `app.js` (annuaire, connexion, administration), `entraide.js` (entraide), `api.js` (seul point d'accès à Supabase), `config.js` (clés publiques).
- Les scripts sont chargés dans l'ordre `config.js`, `api.js`, `app.js`, `entraide.js` et partagent leurs constantes (`$`, `esc`, `api`, `toast`, `setPageInert`…). Toujours échapper le texte inséré en HTML avec `esc`.
- Textes, commentaires et noms de fonctions de base en français.
- Le dépôt est public : aucune vraie donnée personnelle dans le code ni dans `tests/data.js`. Numéros fictifs : tranche `06 39 98 xx xx`.

## Mise en page

- Réutiliser les styles existants (variables `--brand`, `--muted`, `--border`… ; `.wrap`, `.btn`, `.field`, `.modal`, `.list`/`.row`, `.resp`, `.count`, `.chip`) et les polices du site (Phudu pour les titres, Montserrat pour les libellés, DM Sans pour le texte).
- Marges latérales : celles de `.wrap` (16 px), identiques pour tous les blocs d'un écran.
- Ce que j'ai écrit moi (mes demandes, mes messages) est sur fond bleu clair `--moi` ; ce que les autres ont écrit, sur fond blanc.
- Choix entre plusieurs pages ou listes d'un écran (Entraide, Administration) : boutons accolés `.tabs.accoles` (le choix affiché en noir, bouton principal de la barre en bleu, 40 px de haut, pastille rouge `.entr-pastille` si besoin), remplacés sur téléphone par une liste déroulante `.accoles-sel` à côté du bouton principal, à la même hauteur (44 px).
- Vérifier sur téléphone (tests `@mobile`, capture Playwright à 390 px) et l'accessibilité (`tests/accessibilite.spec.js`).
