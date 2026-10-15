# Création des comptes équipe

Les rôles `coach` et `admin` ne peuvent jamais être choisis depuis l'application. Cette restriction évite qu'un visiteur se donne lui-même des droits élevés.

Le nom complet du profil doit correspondre exactement au nom affiché dans l'application (`STAFF` dans `app.js`), sinon la connexion est refusée.

## Coachs

1. Créer chaque utilisateur dans **Supabase → Authentication → Users** avec son adresse e-mail.
2. Exécuter dans l'éditeur SQL :

```sql
update public.profiles
set full_name = 'Valentine Delaveau', role = 'coach'
where id = (select id from auth.users where email = 'adresse@exemple.fr');
```

## Administrateur

Il n'existe qu'un seul compte administrateur, partagé : **Admin**, adresse `contact@academiedelaveau.com`.

1. Inviter `contact@academiedelaveau.com` dans **Supabase → Authentication → Users → Invite user**, puis définir le mot de passe depuis le lien reçu.
2. Exécuter dans l'éditeur SQL :

```sql
update public.profiles
set full_name = 'Admin', role = 'admin'
where id = (select id from auth.users where email = 'contact@academiedelaveau.com');
```

3. Bloquer les anciens comptes administrateurs nominatifs. Ils ne sont pas supprimés, car leurs validations et documents passés y restent rattachés :

```sql
update auth.users
set banned_until = 'infinity'
where id in (
  select id from public.profiles
  where role = 'admin' and full_name <> 'Admin'
);
```

Ne jamais placer la clé `service_role` dans Vercel côté navigateur.
