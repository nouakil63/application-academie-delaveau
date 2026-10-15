# Notifications push (appli fermée)

Chaque ligne ajoutée dans `notifications` déclenche un webhook Supabase vers la fonction Vercel `api/push.js`. Celle-ci envoie la notification sur tous les appareils abonnés du destinataire.

## Qui est prévenu de quoi

| Action | Destinataires |
| --- | --- |
| Élève envoie une demande d'absence ou de retard | Admin + coach choisi |
| Réponse à une demande | Élève + parents |
| Absence saisie par l'équipe | Élève + parents |
| Retard saisi par l'équipe | Élève + parents |
| Avertissement | Élève + parents |
| Bulletin publié | Élève + parents |
| Concours publié | Tous les élèves et parents |

## Mise en place

1. **Supabase → SQL Editor** : exécuter `supabase/migrations/202610150001_push_notifications.sql`.
2. **Vercel → Settings → Environment Variables** (Production), puis redéployer :
   - `SUPABASE_URL` : URL du projet Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` : Supabase → Project Settings → API keys → `service_role` (ne jamais préfixer par `VITE_`)
   - `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` : paire de clés VAPID. La clé publique doit être identique à celle de `cloud.js` (ou à `VITE_VAPID_PUBLIC_KEY` si définie)
   - `PUSH_WEBHOOK_SECRET` : longue chaîne aléatoire
3. **Supabase → Database → Webhooks → Create a new hook** :
   - Table `notifications`, événement `Insert`
   - Type `HTTP Request`, méthode `POST`, URL `https://<domaine-prod>/api/push`
   - En-tête HTTP `x-webhook-secret` = la valeur de `PUSH_WEBHOOK_SECRET`
4. Sur chaque téléphone : Mon compte → activer les notifications. Sur iPhone, l'appli doit d'abord être ajoutée à l'écran d'accueil (iOS 16.4 minimum).
