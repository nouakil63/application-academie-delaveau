import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const cloudConfigured = Boolean(url && publishableKey);
export const supabase = cloudConfigured
  ? createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export async function signUpStudent(email, password, fullName) {
  if (!supabase) throw new Error("Supabase n’est pas configuré");
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, role: "student" } } });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error("Supabase n’est pas configuré");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function uploadAbsenceDocument(userId, requestId, file) {
  if (!supabase || !file) return null;
  const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${userId}/${requestId}/${safeName}`;
  const { error } = await supabase.storage.from("absence-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function signedDocumentUrl(path) {
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage.from("absence-documents").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
