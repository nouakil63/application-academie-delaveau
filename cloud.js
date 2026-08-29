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

export async function linkParentWithCode(familyCode){
  if(!supabase)throw new Error("Supabase n’est pas configuré");
  const code=(familyCode||"").trim();
  if(!code)throw new Error("Code familial requis");
  const {data,error}=await supabase.rpc("link_parent_with_code",{link_code:code});
  if(error)throw error;
  return data;
}

export async function signUpParent(email,password,fullName,familyCode){
  if(!supabase)throw new Error("Supabase n’est pas configuré");
  const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:fullName,role:"parent"}}});
  if(error)throw error;
  if(!data.session)return {...data,requiresSignIn:true,pendingFamilyCode:(familyCode||"").trim()};
  await linkParentWithCode(familyCode);
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
  const [studentsResult, absencesResult, delaysResult, monthlyResult,notificationsResult,reportCardsResult] = await Promise.all([
    supabase.from("students").select("*").order("created_at"),
    supabase.from("absence_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("delays").select("*").order("occurred_on", { ascending: false }),
    supabase.from("monthly_observations").select("*").order("month", { ascending: false }),
    supabase.from("notifications").select("*").order("created_at",{ascending:false}),
    supabase.from("report_cards").select("*").order("created_at",{ascending:false})
  ]);
  const failed=[studentsResult,absencesResult,delaysResult,monthlyResult,notificationsResult,reportCardsResult].find(result=>result.error);if(failed)throw failed.error;
  await Promise.all(studentsResult.data.map(async student=>{
    if(!student.photo_path)return;
    const {data}=await supabase.storage.from("student-photos").createSignedUrl(student.photo_path,3600);
    student.photo_url=data?.signedUrl||null;
  }));
  return { students:studentsResult.data, absences:absencesResult.data, delays:delaysResult.data, monthly:monthlyResult.data,notifications:notificationsResult.data,reportCards:reportCardsResult.data };
}

export async function uploadStudentPhoto(userId,file){
  if(!supabase||!file)return null;
  const extension=(file.name.split(".").pop()||"jpg").replace(/[^a-zA-Z0-9]/g,"").toLowerCase();
  const path=`${userId}/profile.${extension}`;
  const {error:uploadError}=await supabase.storage.from("student-photos").upload(path,file,{contentType:file.type,upsert:true});
  if(uploadError)throw uploadError;
  const {error:updateError}=await supabase.from("students").update({photo_path:path}).eq("user_id",userId);
  if(updateError)throw updateError;
  return path;
}

export async function createAbsenceRequest({ studentId, date, reason, file, userId,targetCoach,requestType="absence" }) {
  if (!supabase) throw new Error("Supabase n’est pas configuré");
  const requestId=crypto.randomUUID();
  const documentPath=file?await uploadAbsenceDocument(userId,requestId,file):null;
  const { data,error }=await supabase.from("absence_requests").insert({id:requestId,student_id:studentId,absence_date:date,reason,target_coach:targetCoach,request_type:requestType,document_path:documentPath,document_name:file?.name||null,document_type:file?.type||null}).select().single();
  if(error)throw error;return data;
}

export async function markNotificationsRead(){
  if(!supabase)return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)return;
  const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",session.user.id).is("read_at",null);
  if(error)throw error;
}

export async function reviewAbsenceRequest(id, status, comment="", equestrianCourseStatus=null) {
  if (!supabase) throw new Error("Supabase n’est pas configuré");
  const account=await currentCloudAccount();
  const review=status==="pending"
    ? {status,reviewed_by:null,reviewed_at:null,review_comment:null,reviewed_by_name:null,equestrian_course_status:null}
    : {status,reviewed_by:account.profile.id,reviewed_at:new Date().toISOString(),review_comment:comment||null,reviewed_by_name:account.profile.full_name,equestrian_course_status:equestrianCourseStatus};
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

export async function uploadReportCard({studentId,title,schoolYear,period,file}){
  if(!supabase||!file)throw new Error("Le fichier du bulletin est obligatoire");
  const account=await currentCloudAccount(),id=crypto.randomUUID(),safeName=file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"-");
  const path=`${studentId}/${id}/${safeName}`;
  const {error:uploadError}=await supabase.storage.from("report-cards").upload(path,file,{contentType:file.type,upsert:false});
  if(uploadError)throw uploadError;
  const {data,error}=await supabase.from("report_cards").insert({id,student_id:studentId,title,school_year:schoolYear,period,file_path:path,file_name:file.name,file_type:file.type||"application/pdf",uploaded_by:account.profile.id}).select().single();
  if(error)throw error;
  return data;
}

export async function signedReportCardUrl(path){
  if(!supabase||!path)return null;
  const {data,error}=await supabase.storage.from("report-cards").createSignedUrl(path,600);
  if(error)throw error;
  return data.signedUrl;
}
