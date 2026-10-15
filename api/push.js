import webpush from "web-push";

// Appelé par le webhook Supabase à chaque nouvelle ligne dans `notifications`.
// Envoie la notification sur tous les appareils abonnés du destinataire.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_WEBHOOK_SECRET } = process.env;

function supabaseRest(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, ...init.headers }
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!PUSH_WEBHOOK_SECRET || req.headers["x-webhook-secret"] !== PUSH_WEBHOOK_SECRET) return res.status(401).end();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(500).json({ error: "Variables d’environnement manquantes" });

  const notification = req.body?.record;
  if (req.body?.type !== "INSERT" || !notification?.recipient_id) return res.status(200).json({ sent: 0 });

  webpush.setVapidDetails("mailto:contact@academiedelaveau.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const response = await supabaseRest(`push_subscriptions?user_id=eq.${encodeURIComponent(notification.recipient_id)}&select=id,endpoint,p256dh,auth`);
  if (!response.ok) return res.status(502).json({ error: await response.text() });
  const subscriptions = await response.json();

  const payload = JSON.stringify({ title: notification.title, body: notification.body, tag: `notif-${notification.id}`, url: "/" });
  let sent = 0;
  await Promise.all(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (error) {
      // Abonnement expiré ou révoqué par le téléphone : on le retire.
      if (error.statusCode === 404 || error.statusCode === 410) await supabaseRest(`push_subscriptions?id=eq.${sub.id}`, { method: "DELETE" });
      else console.error("Envoi push", error.statusCode, error.body);
    }
  }));
  return res.status(200).json({ sent });
}
