# Photos (Cloudflare R2)

Les originaux du photographe sont stockés sans compression sur Cloudflare R2. L'appli crée en plus une vignette légère pour la galerie. Chaque album reste 10 jours : une tâche quotidienne (cron Vercel, 3 h UTC) supprime ensuite les fichiers et l'album n'affiche plus que son lien d'archive.

## 1. Cloudflare
1. Créer un compte sur cloudflare.com puis ouvrir **R2 Object Storage** (activer le plan gratuit ; une carte bancaire peut être demandée).
2. **Create bucket** : nom `academie-photos`, emplacement automatique. Laisser l'accès public **désactivé**.
3. Dans le bucket → **Settings → CORS Policy → Edit**, coller :
   ```json
   [
     {
       "AllowedOrigins": ["https://application-academie-delaveau.vercel.app"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **R2 → Manage R2 API Tokens → Create API token** : permission **Object Read & Write**, limitée au bucket `academie-photos`. Noter l'**Access Key ID**, le **Secret Access Key** et l'**Account ID** (affiché sur la page R2).

## 2. Vercel → Settings → Environment Variables (Production), puis redéployer
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET` = `academie-photos`
- `CRON_SECRET` : longue chaîne aléatoire (protège la suppression automatique)

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà présents pour les notifications.

## 3. Supabase → SQL Editor
Exécuter `supabase/migrations/202610150006_photo_albums.sql`.

## 4. Utilisation
Après l’envoi des photos, ouvrir l’album et cocher dans « Familles ayant payé » chaque élève dont la famille a réglé. Seules ces familles voient et téléchargent les photos ; elles sont prévenues par notification au moment où la case est cochée.
