# Création des comptes équipe

Les rôles `coach` et `admin` ne peuvent jamais être choisis depuis l'application. Cette restriction évite qu'un visiteur se donne lui-même des droits élevés.

1. Créer chaque utilisateur dans **Supabase → Authentication → Users** avec son adresse e-mail.
2. Retrouver son identifiant UUID.
3. Exécuter dans l'éditeur SQL :

```sql
update public.profiles
set full_name = 'Valentine Delaveau', role = 'coach'
where id = 'UUID_DU_COMPTE';
```

Utiliser `admin` uniquement pour Sabrine et Norman. Ne jamais placer la clé `service_role` dans Vercel côté navigateur.
