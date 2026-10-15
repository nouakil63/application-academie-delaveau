import { configured, deleteObject, supabaseRest } from "./_r2.js";

// Tâche quotidienne (cron Vercel) : supprime les fichiers des albums de plus de 10 jours.
// L'album reste visible avec son lien d'archive.
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  if (!configured) return res.status(503).json({ error: "Stockage photo non configuré" });
  const albumsResponse = await supabaseRest(`photo_albums?expires_at=lt.${new Date().toISOString()}&purged_at=is.null&select=id`);
  const albums = albumsResponse.ok ? await albumsResponse.json() : [];
  let removed = 0;
  for (const album of albums) {
    const photosResponse = await supabaseRest(`photos?album_id=eq.${album.id}&select=id,original_key,thumb_key`);
    const photos = photosResponse.ok ? await photosResponse.json() : [];
    for (const p of photos) { await deleteObject(p.original_key); await deleteObject(p.thumb_key); removed++; }
    await supabaseRest(`photos?album_id=eq.${album.id}`, { method: "DELETE" });
    await supabaseRest(`photo_albums?id=eq.${album.id}`, { method: "PATCH", body: JSON.stringify({ purged_at: new Date().toISOString() }) });
  }
  return res.status(200).json({ albums: albums.length, photos: removed });
}
