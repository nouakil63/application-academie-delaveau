# Interface Delaveau — nouvelle expérience

La refonte conserve Montserrat, le logo et la palette d’origine : bleu #23579a,
bleu foncé #174477, fond #f7f8fa, blanc et couleurs de statut existantes.
Les appels Supabase, les règles d’accès, les notifications push et les opérations
sur les concours et les documents conservent leurs implémentations.

## Principes

- Direction : mise en page éditoriale et sportive, grands titres, photographies
  d’ambiance, compositions asymétriques et actions présentées au premier plan.
- Connexion : les quatre profils sont accessibles directement depuis l’accueil.
- Accueil équipe : file de demandes à examiner, concours en vedette, compteurs
  interactifs, effectif et documents. Accueil famille : parcours de l’enfant,
  suivi, demandes et informations du duo cavalier/cheval.
- Navigation : bandeau horizontal sur ordinateur ; barre flottante avec quatre
  rubriques et « Plus » sur mobile. Chaque rôle conserve ses espaces autorisés.
- Effectif : registre commun à l’administration et aux coachs, recherche par
  nom ou cheval, filtres existants conservés. La fiche sépare le profil sportif,
  les compteurs et la chronologie.
- Concours : photographie de couverture, agenda et programme par épreuve.
- Réception : informations entrantes et historique organisés en deux colonnes
  sur ordinateur. Bulletins présentés sous forme de fiches document.
- Suivi : accès direct entre absences, retards et avertissements.
- Saisie : choix du type avant l’ouverture du formulaire existant. Panneau latéral
  sur ordinateur ; panneau remontant depuis le bas sur téléphone.
- Espacements : rythme de 4/8/12/16/20/24/28/32/40/48 px ; composants espacés,
  titres et informations secondaires distincts.
- Composants : boutons de 44–48 px, champs de 48 px et texte de 16 px dans
  les champs mobiles ; bordures sobres ; icônes SVG en couleur courante.
- Accessibilité : focus visible, lien d’évitement, intitulés de champs, contenu
  derrière les fenêtres modales inerte, focus contenu dans le dialogue,
  fermeture par Échap et retour du focus, réduction des animations respectée.

## Organisation

- `style.css` : styles existants et variantes fonctionnelles.
- `interface.css` : tokens et présentation commune, chargée après la base.
- `ui.js` : icônes partagées et remplacement des anciens glyphes décoratifs.
- `app.js` : rendus et navigation ; les gestionnaires de soumission sont conservés.
- `assets/ambiance-equestre.webp` : visuel illustratif optimisé (79 Ko).
- Cache PWA : version 27.

## Aperçu de travail

Lancer `pnpm install --frozen-lockfile` puis `pnpm dev --host 127.0.0.1 --port 4175`.
Sans configuration Supabase locale, ouvrir :

- `/design/preview.html?role=admin`
- `/design/preview.html?role=coach`
- `/design/preview.html?role=student`
- `/design/preview.html?role=parent`
- Ajouter `&empty=1` à l’aperçu administrateur pour les états vides.
- Ajouter `&unlinked=1` à l’aperçu parent pour le rattachement d’un enfant.

Ce fichier initialise des données entièrement fictives dans le stockage du
navigateur sur l’origine locale. Il refuse les domaines distants, les builds
de production et les environnements connectés à Supabase. Il n’est pas une
entrée du build Vite et n’est pas inclus dans `dist`.

## Vérifications réalisées

- Build avec les versions verrouillées dans `pnpm-lock.yaml`, syntaxe JavaScript
  et absence d’erreurs de whitespace dans le diff.
- Recherche administrateur et coach, résultat vide puis effacement de recherche.
- Ouverture d’une fiche et présélection d’un identifiant élève de type chaîne.
- Enregistrement d’une absence dans le jeu local et mise à jour de la fiche.
- Parcours élève : retard, choix du coach, confirmation, envoi local et historique.
- Parcours coach : examen, acceptation, participation au cours équestre et compteur.
- Parcours parent : suivi de l’enfant, programme individuel et programme partagé.
- Menu mobile « Plus », bulletins, filtres des alertes et états vides.
- Écrans de connexion et navigation entre les profils.
- Contrôle visuel sur ordinateur, tablette à 820 px et téléphone à 390 px ;
  contrôle de débordement à 320 px, notamment accueil, réception et états vides.
- Panneau de saisie à 620 px sur ordinateur, navigation mobile fixe, visibilité
  des statuts de demande, absence d’erreurs JavaScript pendant ces parcours.

Les vérifications d’écriture utilisent le jeu local, sans requêtes vers la base
réelle. L’authentification distante, les téléchargements de documents privés et
la livraison effective des notifications push n’ont pas été exercés.

## Visuel d’ambiance

Généré avec l’outil intégré `imagegen` ; conversion WebP sans retouche visuelle.
Fichier utilisé : `assets/ambiance-equestre.webp` (1536 × 1024). Ce portrait est
illustratif et ne représente pas un cheval réel identifié de l’Académie.

Prompt :

> Use case: photorealistic-natural. Create a premium editorial equestrian sports photograph for a French horse-riding academy application interface. Landscape 3:2 composition. A magnificent dark bay horse wearing refined dark leather bridle, neck and head captured in a close three-quarter side view, looking left, outdoors near a show-jumping arena. No person visible. Strong elegant athletic presence, detailed natural coat, subtle windswept mane. Horse occupies the right two-thirds with a quiet deep blue grey background and soft trees, natural overcast Normandy morning light, muted cool colour grading, crisp focus on horse, gentle background blur. Sophisticated professional sports magazine photography, authentic texture, not glossy 3D. Background subdued and uncluttered; leave usable negative space on the left and bottom for interface text to be added in HTML. No text, no logos, no watermarks, no lettering, no border. This is an illustrative mood image, not depicting a specific known horse or real academy.
