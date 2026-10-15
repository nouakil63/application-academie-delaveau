import { configured, presign, deleteObject, supabaseRest, callerFrom } from "./_r2.js";

const isStaff = caller => caller && (caller.role === "admin" || caller.role === "coach");
// Un élève ou un parent n'accède à l'album que si l'Académie a validé son paiement.
async function familyHasAccess(caller, albumId) {
  let studentIds = [];
  if (caller.role === "student") {
    const r = await supabaseRest(`students?user_id=eq.${caller.id}&select=id`);
    studentIds = r.ok ? (await r.json()).map(s => s.id) : [];
  } else if (caller.role === "parent") {
    const r = await supabaseRest(`parent_students?parent_id=eq.${caller.id}&select=student_id`);
    studentIds = r.ok ? (await r.json()).map(s => s.student_id) : [];
  }
  if (!studentIds.length) return false;
  const r = await supabaseRest(`album_access?album_id=eq.${encodeURIComponent(albumId)}&student_id=in.(${studentIds.join(",")})&select=student_id`);
  return r.ok && (await r.json()).length > 0;
}
const safeName = name => name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!configured) return res.status(503).json({ error: "Stockage photo non configuré" });
  const caller = await callerFrom(req);
  if (!caller) return res.status(401).json({ error: "Connexion requise" });
  const { action, albumId, files = [] } = req.body || {};
  if (!albumId) return res.status(400).json({ error: "Album manquant" });

  // Adresses d'envoi direct vers R2 (l'original n'est jamais recompressé).
  if (action === "upload-urls") {
    if (!isStaff(caller)) return res.status(403).end();
    const uploads = await Promise.all(files.slice(0, 50).map(async file => {
      const id = crypto.randomUUID(), base = `albums/${albumId}/${id}`;
      const originalKey = `${base}/${safeName(file.name || "photo.jpg")}`, thumbKey = `${base}/thumb.jpg`;
      return { id, originalKey, thumbKey, originalUrl: await presign(originalKey, "PUT"), thumbUrl: await presign(thumbKey, "PUT") };
    }));
    return res.status(200).json({ uploads });
  }

  // Adresses de lecture temporaires (1 h) pour la galerie et le téléchargement des originaux.
  if (action === "view-urls") {
    if (!isStaff(caller) && !(await familyHasAccess(caller, albumId))) return res.status(403).json({ error: "Photos réservées aux familles qui les ont commandées" });
    const response = await supabaseRest(`photos?album_id=eq.${encodeURIComponent(albumId)}&select=id,original_key,thumb_key,file_name`);
    if (!response.ok) return res.status(502).json({ error: await response.text() });
    const photos = await response.json();
    const urls = {};
    await Promise.all(photos.map(async p => {
      urls[p.id] = { thumb: await presign(p.thumb_key, "GET"), original: await presign(p.original_key, "GET", { downloadName: p.file_name }) };
    }));
    return res.status(200).json({ urls });
  }

  if (action === "delete-photos") {
    if (!isStaff(caller)) return res.status(403).end();
    const filter = files.length ? `&id=in.(${files.map(encodeURIComponent).join(",")})` : "";
    const response = await supabaseRest(`photos?album_id=eq.${encodeURIComponent(albumId)}${filter}&select=id,original_key,thumb_key`);
    const photos = response.ok ? await response.json() : [];
    for (const p of photos) { await deleteObject(p.original_key); await deleteObject(p.thumb_key); }
    if (photos.length) await supabaseRest(`photos?id=in.(${photos.map(p => p.id).join(",")})`, { method: "DELETE" });
    return res.status(200).json({ deleted: photos.length });
  }

  return res.status(400).json({ error: "Action inconnue" });
}
