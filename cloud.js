import { createClient } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL;
const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

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

export async function currentCloudAccount() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
  if (error) throw error;
  return { session, profile };
}

export async function signOutCloud() { if (supabase) await supabase.auth.signOut(); }

export async function loadCloudData() {
  if (!supabase) return null;
  const [studentsResult, absencesResult, delaysResult, monthlyResult] = await Promise.all([
    supabase.from("students").select("*").order("created_at"),
    supabase.from("absence_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("delays").select("*").order("occurred_on", { ascending: false }),
    supabase.from("monthly_observations").select("*").order("month", { ascending: false })
  ]);
  const failed=[studentsResult,absencesResult,delaysResult,monthlyResult].find(result=>result.error);if(failed)throw failed.error;
  return { students:studentsResult.data, absences:absencesResult.data, delays:delaysResult.data, monthly:monthlyResult.data };
}

export async function createAbsenceRequest({ studentId, date, reason, file, userId }) {
  if (!supabase) throw new Error("Supabase n’est pas configuré");
  const requestId=crypto.randomUUID();
  const documentPath=file?await uploadAbsenceDocument(userId,requestId,file):null;
  const { data,error }=await supabase.from("absence_requests").insert({id:requestId,student_id:studentId,absence_date:date,reason,document_path:documentPath,document_name:file?.name||null,document_type:file?.type||null}).select().single();
  if(error)throw error;return data;
}

export async function reviewAbsenceRequest(id, status) {
  if (!supabase) throw new Error("Supabase n’est pas configuré");
  const account=await currentCloudAccount();
  const review=status==="pending"
    ? {status,reviewed_by:null,reviewed_at:null}
    : {status,reviewed_by:account.profile.id,reviewed_at:new Date().toISOString()};
  const {error}=await supabase.from("absence_requests").update(review).eq("id",id);
  if(error)throw error;
}

export async function createTrackingItem(type, payload) {
  if (!supabase) throw new Error("Supabase n’est pas configuré");
  const account=await currentCloudAccount();
  const table=type==="absence"?"absence_requests":type==="delay"?"delays":"monthly_observations";
  const row=type==="absence"?{student_id:payload.studentId,absence_date:payload.date,reason:payload.text,status:"approved",reviewed_by:account.profile.id,reviewed_at:new Date().toISOString()}:type==="delay"?{student_id:payload.studentId,occurred_on:payload.date,details:payload.text,created_by:account.profile.id}:{student_id:payload.studentId,month:`${payload.date.slice(0,7)}-01`,details:payload.text,created_by:account.profile.id};
  const {error}=await supabase.from(table).insert(row);if(error)throw error;
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
