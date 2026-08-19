# Suivi Académie Delaveau

Prototype interactif de suivi éducatif et sportif pour les coachs, académiciens et responsables légaux.

L'interface est conçue en priorité pour téléphone et peut être installée comme une application mobile lorsqu'elle est publiée sur un hébergement HTTPS.

## Fonctionnalités

- trois espaces de démonstration : coach, élève et parent ;
- observations positives et incidents factuels ;
- suivi des absences et retards ;
- compteur d’incidents actifs ;
- proposition d’une mesure éducative au troisième incident ;
- validation humaine obligatoire par un coach ;
- recherche et fiches individuelles ;
- données de démonstration conservées dans le navigateur (`localStorage`).

## Lancer l’application

Sous Windows, double-cliquer simplement sur `LANCER-APPLICATION.bat`.

Autre possibilité : ouvrir directement `index.html` dans Chrome, Edge ou Firefox.

Pour utiliser un serveur local :

```powershell
python -m http.server 4173
```

Puis ouvrir `http://localhost:4173`.

## Important avant une mise en production

Ce prototype ne contient pas encore de serveur ni d’authentification réelle. Une version de production devra inclure une base de données, une authentification sécurisée, la journalisation des accès, une politique de conservation des données et la conformité RGPD adaptée aux données de mineurs.
