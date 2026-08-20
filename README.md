# Suivi Académie Delaveau

Prototype interactif de suivi éducatif et sportif pour les coachs, académiciens et responsables légaux.

L'interface est conçue en priorité pour téléphone et peut être installée comme une application mobile lorsqu'elle est publiée sur un hébergement HTTPS.

## Fonctionnalités

- trois espaces distincts : coach, élève et administrateur ;
- écran de connexion avec les rôles Élève, Coach et Admin ;
- profils coach préremplis : Valentine, Patrice, Antoine et Bertrand ;
- profils administrateur : Sabrine et Norman ;
- inscription élève guidée, une question par écran ;
- visite interactive à la première utilisation ;
- suivi simplifié des absences ;
- suivi simplifié des retards ;
- une observation de progression chaque mois ;
- espace parent rattaché au compte de l’enfant ;
- recherche et fiches individuelles pour l’équipe ;
- données de démonstration conservées dans le navigateur (`localStorage`).

## Lancer l’application

Sous Windows, double-cliquer simplement sur `LANCER-APPLICATION.bat`.

Autre possibilité : ouvrir directement `index.html` dans Chrome, Edge ou Firefox.

Pour utiliser un serveur local :

```powershell
python -m http.server 4173
```

Puis ouvrir `http://localhost:4173`.

## Infrastructure Supabase + Vercel

Le dépôt contient maintenant :

- le schéma PostgreSQL et les règles de sécurité dans `supabase/migrations/` ;
- un bucket privé `absence-documents` pour les justificatifs ;
- la configuration de déploiement `vercel.json` ;
- un exemple des variables nécessaires dans `.env.example` ;
- le client Supabase dans `cloud.js`.

Après création du projet Supabase, appliquer la migration puis définir dans Vercel `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`. La clé `service_role` ne doit jamais être exposée dans l'application.

## Important avant une mise en production

Ce prototype ne contient pas encore de serveur ni d’authentification réelle. Une version de production devra inclure une base de données, une authentification sécurisée, la journalisation des accès, une politique de conservation des données et la conformité RGPD adaptée aux données de mineurs.
