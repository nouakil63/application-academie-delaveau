# Interface Delaveau

La refonte conserve Montserrat, le logo et la palette d’origine : bleu #23579a,
bleu foncé #174477, fond #f7f8fa, blanc et couleurs de statut existantes.
Les appels Supabase, les règles d’accès, les notifications push et les opérations
sur les concours et les documents conservent leurs implémentations.

## Principes

- Accueil : résumé, demande prioritaire, prochain concours, puis accès aux fiches
  et documents. Les compteurs sont des raccourcis vers leur rubrique.
- Navigation : menu latéral sur ordinateur ; quatre rubriques et « Plus » sur
  mobile. Chaque rôle conserve ses espaces autorisés.
- Effectif : grille complète pour l’administration, liste filtrable pour les
  coachs, recherche par nom ou cheval.
- Suivi : accès direct entre absences, retards et avertissements.
- Saisie : choix du type avant l’ouverture du formulaire existant.
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
- Cache PWA : version 26.

## Aperçu de travail

Lancer `pnpm install --frozen-lockfile` puis `pnpm dev --host 127.0.0.1 --port 4175`.
Sans configuration Supabase locale, ouvrir :

- `/design/preview.html?role=admin`
- `/design/preview.html?role=coach`
- `/design/preview.html?role=student`
- `/design/preview.html?role=parent`
- Ajouter `&empty=1` à l’aperçu administrateur pour les états vides.

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
- Contrôle visuel sur ordinateur et à 390 px ; contrôle de débordement à 320 px.

Les vérifications d’écriture utilisent le jeu local, sans requêtes vers la base
réelle. L’authentification distante, les téléchargements de documents privés et
la livraison effective des notifications push n’ont pas été exercés.
