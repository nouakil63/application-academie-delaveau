import { AwsClient } from "aws4fetch";

// Accès Cloudflare R2 (compatible S3) et vérification des comptes Supabase, côté serveur uniquement.
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

export const configured = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const r2 = configured ? new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" }) : null;
const objectUrl = key => `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function presign(key, method, { expires = 3600, downloadName = null } = {}) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expires));
  if (downloadName) url.searchParams.set("response-content-disposition", `attachment; filename="${downloadName.replace(/[^\w.\- ]/g, "_")}"`);
  const signed = await r2.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

export async function deleteObject(key) {
  const response = await r2.fetch(objectUrl(key), { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`Suppression R2 impossible (${response.status})`);
}

export function supabaseRest(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...init.headers }
  });
}

// Retourne { id, role } du compte qui appelle, ou null.
export async function callerFrom(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return null;
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await supabaseRest(`profiles?id=eq.${user.id}&select=id,role`);
  const [profile] = profileResponse.ok ? await profileResponse.json() : [];
  return profile || null;
}
