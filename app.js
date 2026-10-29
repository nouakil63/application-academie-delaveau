import equestrianImage from "./assets/equipe-academie.jpg";
import { eventEndDate, eventCountdown } from "./event-timing.js";
import { icon as uiIcon, enhanceIcons } from "./ui.js";
import { cloudConfigured, passwordRecoveryRequested, currentCloudAccount, signIn, signUpParent, requestPasswordReset, updatePassword, enablePushOnThisDevice, disablePushOnThisDevice, linkParentWithCode, signOutCloud, loadCloudData, createAbsenceRequest, reviewAbsenceRequest, createTrackingItem, signedDocumentUrl, uploadStudentPhoto, markNotificationsRead, uploadReportCard, signedReportCardUrl, saveEvent, deleteEvent, uploadEventDocument, deleteEventDocument, saveEventEntry, deleteEventEntry, updateWarning, deleteWarning, supabase } from "./cloud.js";

const EMPTY_STATE = { students: [], observations: [], sanctions: [] };
const STAFF = {
  coach: ["Valentine Delaveau", "Patrice Delaveau", "Antoine", "Bertrand Lebarbier", "Coach Démo"],
  admin: ["Admin"]
};

if (localStorage.getItem("delaveau-data-version") !== "2") {
  localStorage.removeItem("delaveau-state");
  localStorage.removeItem("delaveau-session");
  localStorage.setItem("delaveau-data-version", "2");
}

function readSessionCookie() { try { const item=document.cookie.split("; ").find(row=>row.startsWith("delaveau_session=")); return item?JSON.parse(decodeURIComponent(item.split("=").slice(1).join("="))):null; } catch { return null; } }
function persistSession(user) { localStorage.setItem("delaveau-session",JSON.stringify(user)); document.cookie=`delaveau_session=${encodeURIComponent(JSON.stringify(user))}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`; }
function clearPersistentSession() { localStorage.removeItem("delaveau-session"); document.cookie="delaveau_session=; Max-Age=0; Path=/; SameSite=Lax; Secure"; }

let state = loadJSON("delaveau-state", EMPTY_STATE);
state.absences ||= [];
state.delays ||= [];
state.monthlyObservations ||= [];
state.notifications ||= [];
state.reportCards ||= [];
state.events ||= [];
state.eventEntries ||= [];
state.eventDocuments ||= [];
let parentAccounts = loadJSON("delaveau-parent-accounts", []);
let currentUser = loadJSON("delaveau-session", null) || readSessionCookie();
let currentRole = currentUser?.role || null;
let currentView = "dashboard";
let selectedStudent = null;
let signup = { step: 0, data: {} };
let tourIndex = 0;
let notificationChannel = null;
let presentationMode = false;
let presentationOriginalUser = null;

const app = document.querySelector("#app");
const nav = document.querySelector("#main-nav");
const modal = document.querySelector("#modal-backdrop");
const authScreen = document.querySelector("#auth-screen");
const icons = Object.fromEntries(Object.entries({dashboard:"home",tracking:"tracking",absences:"calendar",delays:"clock",monthly:"note",students:"users",entry:"plus",request:"plus",notifications:"bell",reportCards:"document",events:"trophy"}).map(([key,name])=>[key,uiIcon(name)]));
const staffNav = [["dashboard","Vue d’ensemble"],["students","Élèves"],["events","Concours"],["notifications","Réception"],["entry","Ajouter au suivi"],["reportCards","Bulletins"]];
const studentNav = [["dashboard","Vue d’ensemble"],["tracking","Mon suivi"],["events","Concours"],["notifications","Réception"],["request","Prévenir l’équipe"],["reportCards","Bulletins"]];
const parentNav = [["dashboard","Vue d’ensemble"],["tracking","Suivi de mon enfant"],["events","Concours"],["notifications","Réception"],["reportCards","Bulletins"]];
const adminNav = staffNav;

const signupSteps = [
  { key: "firstName", title: "Quel est ton prénom ?", hint: "Le prénom utilisé au sein de l’Académie.", type: "text", placeholder: "Ton prénom" },
  { key: "lastName", title: "Quel est ton nom ?", hint: "Il restera visible uniquement par l’équipe autorisée.", type: "text", placeholder: "Ton nom" },
  { key: "birthDate", title: "Quelle est ta date de naissance ?", hint: "Elle nous permet de sécuriser ton dossier.", type: "date" },
  { key: "group", title: "Quelle section vas-tu rejoindre ?", hint: "Choisis ton parcours actuel.", options: ["Section Excellence", "Section Espoir"] },
  { key: "horse", title: "Quel est le nom de ton cheval ?", hint: "Tu peux écrire « Aucun » si tu n’en as pas encore.", type: "text", placeholder: "Nom du cheval" },
  { key: "horseAge", title: "Quel âge a ton cheval ?", hint: "Indique son âge actuel en années.", type: "number", placeholder: "Par exemple : 9" },
  { key: "horseHeight", title: "Quelle est sa taille ?", hint: "Indique sa taille au garrot en centimètres.", type: "number", placeholder: "Par exemple : 168" },
  { key: "horsePartnership", title: "Depuis combien de temps évoluez-vous ensemble ?", hint: "Indique la durée de votre expérience en couple.", type: "text", placeholder: "Par exemple : 2 ans" },
  { key: "horseExperience", title: "Quelle est la plus grande épreuve déjà sautée ensemble ?", hint: "Précise le niveau, la hauteur ou l’intitulé de l’épreuve.", type: "text", placeholder: "Par exemple : Grand Prix 1,20 m" },
  { key: "photo", title: "Ajoute une photo de profil", hint: "Facultatif · ton visage sera visible uniquement par les personnes autorisées.", type: "file", optional: true },
  { key: "email", title: "Quelle est ton adresse e-mail ?", hint: "Elle servira à retrouver ton compte.", type: "email", placeholder: "prenom@exemple.fr" },
  { key: "password", title: "Choisis un mot de passe", hint: "Au moins 6 caractères pour ce prototype.", type: "password", placeholder: "••••••••" }
];
const horseSignupKeys = ["horse","horseAge","horseHeight","horsePartnership","horseExperience"];
function activeSignupSteps(){return signup.data.group==="Section Espoir"?signupSteps.filter(step=>!horseSignupKeys.includes(step.key)):signupSteps;}

function loadJSON(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : structuredClone(fallback); } catch { return structuredClone(fallback); } }
function save() { localStorage.setItem("delaveau-state", JSON.stringify(state)); }
function openPendingPhotoDB(){return new Promise((resolve,reject)=>{if(!("indexedDB" in window))return resolve(null);const request=indexedDB.open("delaveau-signup",1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("pending-photos"))request.result.createObjectStore("pending-photos");};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function savePendingSignupPhoto(email,file){if(!file)return;const db=await openPendingPhotoDB();if(!db)return;const payload={buffer:await file.arrayBuffer(),name:file.name,type:file.type,lastModified:file.lastModified};await new Promise((resolve,reject)=>{const tx=db.transaction("pending-photos","readwrite");tx.objectStore("pending-photos").put(payload,email.toLowerCase());tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
async function getPendingSignupPhoto(email){const db=await openPendingPhotoDB();if(!db)return null;const payload=await new Promise((resolve,reject)=>{const tx=db.transaction("pending-photos","readonly");const request=tx.objectStore("pending-photos").get(email.toLowerCase());request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});db.close();if(!payload)return null;return new File([payload.buffer],payload.name,{type:payload.type,lastModified:payload.lastModified});}
async function clearPendingSignupPhoto(email){const db=await openPendingPhotoDB();if(!db)return;await new Promise((resolve,reject)=>{const tx=db.transaction("pending-photos","readwrite");tx.objectStore("pending-photos").delete(email.toLowerCase());tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
function student(id) { return state.students.find(s => String(s.id) === String(id)); }
function mapRequest(x){return {id:x.id,studentId:x.student_id,date:x.absence_date,createdAt:x.created_at,text:x.reason,reason:x.reason,targetCoach:x.target_coach,requestType:x.request_type||"absence",reviewComment:x.review_comment,reviewedBy:x.reviewed_by_name,reviewedAt:x.reviewed_at,equestrianCourseStatus:x.equestrian_course_status,justification:x.document_name||"Aucun justificatif",documentPath:x.document_path,documentType:x.document_type,source:x.target_coach?"student":"staff",status:x.status==="pending"?"À vérifier":x.status==="approved"?"Validée":"Refusée"};}
function mapCloudData(data) {
  const requests=(data.absences||[]).map(mapRequest),delayRequests=requests.filter(x=>x.requestType==="delay"),absenceRequests=requests.filter(x=>x.requestType!=="delay");
  return {students:data.students.map(s=>({id:s.id,userId:s.user_id,name:s.full_name,initials:initials(s.full_name),photoUrl:s.photo_url||null,group:s.academy_group||"Section non renseignée",birthDate:s.birth_date,guardianCode:s.guardian_code,horse:s.horse_name,horseAge:s.horse_age,horseHeight:s.horse_height,horsePartnership:s.horse_partnership,horseExperience:s.horse_experience,incidents:0})),observations:[],sanctions:[],absences:absenceRequests,delays:[...delayRequests,...data.delays.map(x=>({id:x.id,studentId:x.student_id,date:x.occurred_on,text:x.details,reason:x.details,requestType:"delay",source:"staff",status:"Validée"}))],monthlyObservations:data.monthly.map(x=>({id:x.id,studentId:x.student_id,date:x.occurred_on||x.month,month:(x.occurred_on||x.month).slice(0,7),text:x.details,source:"staff",status:"Validée"})),reportCards:(data.reportCards||[]).map(x=>({id:x.id,studentId:x.student_id,title:x.title,schoolYear:x.school_year,period:x.period,filePath:x.file_path,fileName:x.file_name,fileType:x.file_type,createdAt:x.created_at})),notifications:(data.notifications||[]).map(n=>({id:n.id,requestId:n.absence_request_id,studentId:n.student_id,title:n.title,text:n.body,kind:n.kind,date:n.created_at?.slice(0,10),createdAt:n.created_at,read:Boolean(n.read_at)})),events:(data.events||[]).map(e=>({id:e.id,title:e.title,date:e.event_date,endDate:e.end_date,location:e.location,message:e.message})),eventEntries:(data.eventEntries||[]).map(x=>({id:x.id,eventId:x.event_id,studentId:x.student_id,classLabel:x.class_label,bib:x.bib,ridingTime:x.riding_time,sortOrder:x.sort_order,riderName:x.rider_name})),eventDocuments:(data.eventDocuments||[]).map(d=>({id:d.id,eventId:d.event_id,filePath:d.file_path,fileName:d.file_name,fileType:d.file_type,url:d.url}))};
}
async function refreshCloudState(){if(!cloudConfigured)return;const data=await loadCloudData();state=mapCloudData(data);save();}
function initials(name) { return name.split(" ").filter(Boolean).map(x => x[0]).join("").slice(0,2).toUpperCase(); }
function studentPortrait(s,className="") { return s?.photoUrl?`<img class="student-photo ${className}" src="${s.photoUrl}" alt="Photo de ${s.name}">`:`<span class="avatar ${className}">${s?.initials||"?"}</span>`; }
function dateFR(date) { return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date + "T12:00:00")); }
function todayISO() { return new Date().toISOString().slice(0,10); }
function statusFor(count) { return count >= 3 ? ["alert","Action requise"] : count > 0 ? ["watch","À surveiller"] : ["good","À jour"]; }
function toast(message) { const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2600); }
async function registerAppServiceWorker(){if(!("serviceWorker" in navigator)||!location.protocol.startsWith("http"))return null;return navigator.serviceWorker.register("/service-worker.js",{scope:"/"});}
async function showPhoneNotification(title,body,tag=`academie-${Date.now()}`){if(!("Notification" in window)||Notification.permission!=="granted")return;const registration=await navigator.serviceWorker.ready;await registration.showNotification(title,{body,icon:"/assets/logo-academie-delaveau.png",badge:"/assets/logo-academie-delaveau.png",tag,data:{url:"/"}});}
async function enablePhoneNotifications(){if(!("Notification" in window))return toast("Les notifications ne sont pas disponibles sur ce téléphone");const permission=await Notification.requestPermission();if(permission!=="granted")return toast("Autorisation refusée dans les réglages du téléphone");await registerAppServiceWorker();if(cloudConfigured){try{await enablePushOnThisDevice(await navigator.serviceWorker.ready);}catch(error){console.error("Abonnement push",error);}}await showPhoneNotification("Notifications activées","Vous recevrez ici les nouvelles alertes de l’Académie.");toast("Notifications téléphone activées");closeModal();}
function startRealtimeNotifications(){if(!supabase||!currentUser?.userId)return;if(notificationChannel)supabase.removeChannel(notificationChannel);notificationChannel=supabase.channel(`user-alerts-${currentUser.userId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`recipient_id=eq.${currentUser.userId}`},payload=>{const n=payload.new,item={id:n.id,requestId:n.absence_request_id,studentId:n.student_id,title:n.title,text:n.body,kind:n.kind,date:n.created_at?.slice(0,10),createdAt:n.created_at,read:false};state.notifications.unshift(item);save();renderNav();showPhoneNotification(item.title,item.text,`notif-${n.id}`).catch(console.error);toast(item.title);}).subscribe();if("Notification" in window&&Notification.permission==="granted"&&"serviceWorker" in navigator)navigator.serviceWorker.ready.then(enablePushOnThisDevice).catch(error=>console.error("Abonnement push",error));}
function emptyBlock(icon, title, text) { return `<div class="empty"><div style="font-size:34px;color:var(--forest)">${icon}</div><h2>${title}</h2><p>${text}</p></div>`; }

function renderAuthLanding() {
  document.body.classList.add("auth-active"); authScreen.classList.remove("hidden");
  document.querySelector(".app-shell").inert = true;
  const roles = [["student","Élève","Mon parcours","horse"],["parent","Parent","Le suivi de mon enfant","users"],["coach","Coach","Accompagner mes élèves","tracking"],["admin","Administration","La vie de l’Académie","settings"]];
  authScreen.innerHTML = `<div class="portal">
    <header class="portal-header"><div class="portal-brand"><img src="/assets/logo-academie-delaveau.png" alt=""><span class="brand-wordmark"><small>ACADÉMIE</small><strong>DELAVEAU</strong></span></div><button class="portal-signup" id="auth-signup">Créer un compte ${uiIcon("arrow")}</button></header>
    <div class="portal-intro"><div class="portal-copy"><span class="eyebrow">L’exigence. La passion. Le partage.</span><h1>Un esprit<br>d’équipe.<br><span>Une ambition<br>commune.</span></h1><p>Le suivi, les concours et le lien avec l’équipe.<br>Toute votre Académie, au même endroit.</p><button class="portal-scroll" id="auth-login">Accéder à mon espace ${uiIcon("arrow")}</button></div><figure class="portal-visual"><img src="${equestrianImage}" alt="Les cavaliers de l’Académie Delaveau réunis à cheval dans le manège" fetchpriority="high"><figcaption><span>LE GOÛT DE PROGRESSER</span><strong>À chaque foulée,<br>ensemble.</strong></figcaption><span class="photo-corner" aria-hidden="true">AD.</span></figure></div>
    <section class="portal-access" aria-labelledby="portal-access-title"><div class="portal-access-heading"><span class="eyebrow">À vous de jouer</span><h2 id="portal-access-title">Rejoignez votre espace.</h2></div><div class="portal-roles">${roles.map(([role,title,description,icon],i)=>`<button data-auth-role="${role}"><span class="portal-role-number">0${i+1}</span><span class="portal-role-icon">${uiIcon(icon)}</span><strong>${title}</strong><small>${description}</small><span class="round-arrow">${uiIcon("arrow")}</span></button>`).join("")}</div></section>
    <footer class="portal-footer"><span>ACADÉMIE DELAVEAU</span><span>Le quotidien au service de votre passion.</span></footer>
  </div>`;
  document.querySelector("#auth-signup").onclick = renderSignupChoice;
  document.querySelector("#auth-login").onclick = () => {
    authScreen.querySelector("[data-auth-role]").focus({preventScroll:true});
    authScreen.querySelector(".portal-access").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
  };
  authScreen.querySelectorAll("[data-auth-role]").forEach(button => button.onclick = () => {
    const role = button.dataset.authRole;
    if (role === "student") renderStudentLogin();
    else if (role === "parent") renderParentAccess();
    else renderStaffChoice(role);
  });
}

function renderSignupChoice() {
  authScreen.innerHTML=`<div class="auth-wrap"><button class="auth-back" id="auth-back">← Retour</button><img class="auth-logo" src="/assets/logo-academie-delaveau.png" alt="Académie Delaveau"><div class="auth-heading"><span class="eyebrow">Inscription</span><h1>Créer un compte</h1><p>Qui souhaitez-vous inscrire ?</p></div><div class="role-choices signup-role-choices"><button class="auth-choice" id="signup-student"><span class="auth-choice-icon">${uiIcon("horse")}</span><strong>Élève</strong><small>Créer mon dossier</small></button><button class="auth-choice" id="signup-parent"><span class="auth-choice-icon">${uiIcon("users")}</span><strong>Parent</strong><small>Créer mon espace</small></button></div></div>`;
  document.querySelector("#auth-back").onclick=renderAuthLanding;
  document.querySelector("#signup-student").onclick=()=>{signup={step:0,data:{}};renderSignup();};
  document.querySelector("#signup-parent").onclick=()=>renderParentAccess("create");
}
function renderAuthHome() { renderAuthLanding(); }

function renderStudentLogin() {
  authScreen.innerHTML=`<div class="auth-wrap"><button class="auth-back" id="auth-back">← Retour</button><section class="signup-card"><div class="auth-heading"><span class="eyebrow">Espace élève</span><h1>Connexion</h1><p>Utilise les identifiants choisis lors de ton inscription.</p></div><form id="student-login-form" class="form-grid"><div class="field"><label for="student-email">Adresse e-mail</label><input id="student-email" type="email" required placeholder="eleve@exemple.fr"></div><div class="field"><label for="student-password">Mot de passe</label><input id="student-password" type="password" required placeholder="Ton mot de passe"></div><button class="primary-button">Se connecter</button><button type="button" class="text-button" id="forgot-password">Mot de passe oublié ?</button></form></section></div>`;
  document.querySelector("#auth-back").onclick=()=>renderAuthHome("login");
  document.querySelector("#forgot-password").onclick=()=>renderForgotPassword(document.querySelector("#student-email").value,renderStudentLogin);
  document.querySelector("#student-login-form").onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,submit=form.querySelector("button[type='submit'], button:not([type])");
    const email=document.querySelector("#student-email").value.trim().toLowerCase(),password=document.querySelector("#student-password").value;
    submit.disabled=true; submit.textContent="Connexion…";
    try{
      if(cloudConfigured){
        const {user}=await signIn(email,password);
        try{const pendingPhoto=await getPendingSignupPhoto(email);if(pendingPhoto){await uploadStudentPhoto(user.id,pendingPhoto);await clearPendingSignupPhoto(email);}}catch(error){console.warn("Récupération de la photo de profil",error);}
        const account=await currentCloudAccount();
        if(!account?.profile)throw new Error("Votre profil n’est pas encore configuré");
        if(account.profile.role!=="student")throw new Error("Ce compte n’est pas un compte élève");
        await refreshCloudState();
        const pupil=state.students.find(s=>s.userId===user.id);
        if(!pupil)throw new Error("Fiche élève introuvable");
        login({name:pupil.name,role:"student",initials:pupil.initials,studentId:pupil.id,userId:user.id});
        return;
      }
      const account=state.students.find(s=>(s.email||"").toLowerCase()===email&&s.password===password);
      if(!account)throw new Error("E-mail ou mot de passe incorrect");
      login({name:account.name,role:"student",initials:account.initials,studentId:account.id});
    }catch(error){
      console.error("Student sign in",error);
      toast(error.message||"Connexion impossible");
      submit.disabled=false; submit.textContent="Se connecter";
    }
  };
}
function childOptions() { return state.students.length ? state.students.map(s=>`<option value="${s.id}">${s.name} · ${s.group}</option>`).join("") : `<option value="">Aucun élève inscrit</option>`; }
function renderParentAccess(mode="login") {
  const isCreate=mode==="create";
  authScreen.innerHTML = `<div class="auth-wrap"><button class="auth-back" id="auth-back">← Retour</button><section class="signup-card"><div class="auth-heading"><span class="eyebrow">Espace parent</span><h1>${isCreate?"Créer mon compte":"Connexion parent"}</h1><p>${isCreate?"Créez votre espace dès maintenant. Le code familial peut être ajouté maintenant ou plus tard.":"Connectez-vous à votre espace parent."}</p></div><div class="auth-tabs"><button class="${!isCreate?'active':''}" data-parent-mode="login">Se connecter</button><button class="${isCreate?'active':''}" data-parent-mode="create">Créer un compte</button></div><form id="parent-form" class="form-grid">${isCreate?`<div class="field"><label for="parent-name">Votre nom et prénom</label><input id="parent-name" required autocomplete="name" placeholder="Sophie Martin"></div>`:""}<div class="field"><label for="parent-code">Code familial de l’enfant <span style="font-weight:400">(${isCreate?"facultatif":"si besoin"})</span></label><input id="parent-code" maxlength="8" autocapitalize="characters" placeholder="Exemple : A7B4C9D2"><small class="field-help">${isCreate?"Si votre enfant n’a pas encore créé son compte, laissez ce champ vide. Vous pourrez le rattacher plus tard.":"Laissez vide si votre enfant est déjà rattaché."}</small></div><div class="field"><label for="parent-email">Votre adresse e-mail</label><input id="parent-email" type="email" required autocomplete="email" placeholder="parent@exemple.fr"></div><div class="field"><label for="parent-password">Votre mot de passe</label><input id="parent-password" type="password" minlength="6" required autocomplete="${isCreate?'new-password':'current-password'}" placeholder="6 caractères minimum"></div><button class="primary-button">${isCreate?"Créer mon compte":"Se connecter"}</button>${isCreate?"":`<button type="button" class="text-button" id="forgot-password">Mot de passe oublié ?</button>`}</form></section></div>`;
  document.querySelector("#auth-back").onclick = isCreate ? renderSignupChoice : ()=>renderAuthHome("login");
  document.querySelectorAll("[data-parent-mode]").forEach(button=>button.onclick=()=>renderParentAccess(button.dataset.parentMode));
  if(!isCreate)document.querySelector("#forgot-password").onclick=()=>renderForgotPassword(document.querySelector("#parent-email").value,()=>renderParentAccess("login"));
  document.querySelector("#parent-form").onsubmit = async event => {
    event.preventDefault();
    const submit=event.submitter,email=document.querySelector("#parent-email").value.trim().toLowerCase(),password=document.querySelector("#parent-password").value,code=document.querySelector("#parent-code").value.trim();
    submit.disabled=true;submit.textContent=isCreate?"Création…":"Connexion…";
    try{
      if(!cloudConfigured)throw new Error("La connexion sécurisée est indisponible");
      if(isCreate){
        const result=await signUpParent(email,password,document.querySelector("#parent-name").value.trim(),code);
        if(result?.requiresSignIn){
          if(result.pendingFamilyCode)localStorage.setItem("delaveau-pending-parent-code",result.pendingFamilyCode);
          else localStorage.removeItem("delaveau-pending-parent-code");
          toast("Compte créé. Confirmez votre e-mail puis reconnectez-vous.");
          return renderParentAccess("login");
        }
      } else {
        await signIn(email,password);
      }
      const account=await currentCloudAccount();
      if(!account?.profile||account.profile.role!=="parent")throw new Error("Ce compte n’est pas un compte parent");
      await refreshCloudState();
      const pendingCode=code||localStorage.getItem("delaveau-pending-parent-code")||"";
      if(pendingCode&&!state.students.length){
        await linkParentWithCode(pendingCode);
        localStorage.removeItem("delaveau-pending-parent-code");
        await refreshCloudState();
      }
      login({name:account.profile.full_name,role:"parent",initials:initials(account.profile.full_name),studentId:state.students[0]?.id||null,userId:account.profile.id});
    }catch(error){
      if(cloudConfigured)await signOutCloud();
      toast(error.message||"Connexion impossible");
      submit.disabled=false;submit.textContent=isCreate?"Créer mon compte":"Se connecter";
    }
  };
}
function renderStaffChoice(role) {
  if (STAFF[role].length === 1) { const name = STAFF[role][0]; return cloudConfigured ? renderStaffLogin(role, name) : login({ name, role, initials: initials(name), studentId: null }); }
  const title = role === "coach" ? "Quel coach êtes-vous ?" : "Quel administrateur êtes-vous ?";
  authScreen.innerHTML = `<div class="auth-wrap"><button class="auth-back" id="auth-back">← Retour</button><div class="auth-heading"><span class="eyebrow">Espace ${role === "coach" ? "coach" : "administration"}</span><h1>${title}</h1><p>Sélectionnez votre profil.</p></div><div class="person-choices">${STAFF[role].map(name => `<button class="person-choice" data-person="${name}"><span class="avatar">${initials(name)}</span><span><strong>${name}</strong><small>${role === "coach" ? "Coach Académie" : "Administrateur"}</small></span></button>`).join("")}</div></div>`;
  document.querySelector("#auth-back").onclick = renderAuthHome;
  authScreen.querySelectorAll("[data-person]").forEach(button => button.onclick = () => cloudConfigured?renderStaffLogin(role,button.dataset.person):login({ name: button.dataset.person, role, initials: initials(button.dataset.person), studentId: null }));
}
function renderStaffLogin(role,name){authScreen.innerHTML=`<div class="auth-wrap"><button class="auth-back" id="auth-back">← Retour</button><section class="signup-card"><div class="auth-heading"><span class="eyebrow">${role==="coach"?"Coach":"Administration"}</span><h1>${name}</h1><p>Utilisez les identifiants sécurisés de votre compte équipe.</p></div><form id="staff-login-form" class="form-grid"><div class="field"><label for="staff-email">Adresse e-mail</label><input id="staff-email" type="email" autocomplete="email" required></div><div class="field"><label for="staff-password">Mot de passe</label><input id="staff-password" type="password" autocomplete="current-password" required></div><button class="primary-button">Se connecter</button><button type="button" class="text-button" id="forgot-password">Mot de passe oublié ?</button></form></section></div>`;document.querySelector("#forgot-password").onclick=()=>renderForgotPassword(document.querySelector("#staff-email").value,()=>renderStaffLogin(role,name));document.querySelector("#auth-back").onclick=()=>STAFF[role].length===1?renderAuthHome():renderStaffChoice(role);document.querySelector("#staff-login-form").onsubmit=async e=>{e.preventDefault();try{await signIn(document.querySelector("#staff-email").value.trim(),document.querySelector("#staff-password").value);const account=await currentCloudAccount();if(account.profile.role!==role||account.profile.full_name!==name){await signOutCloud();throw new Error("Ce compte ne correspond pas au profil sélectionné");}await refreshCloudState();login({name,role,initials:initials(name),studentId:null,userId:account.profile.id});}catch(error){toast(error.message||"Connexion impossible");}};}
function setSignupLoading(active){document.querySelector("#signup-loader")?.remove();if(!active)return;const loader=document.createElement("div");loader.id="signup-loader";loader.className="signup-loader";loader.setAttribute("role","status");loader.setAttribute("aria-live","polite");loader.innerHTML=`<div class="signup-loader-mark"><img src="/assets/logo-academie-delaveau.png" alt=""><span></span></div><strong>Création de ton compte…</strong><p>Nous préparons ton espace personnel.</p>`;authScreen.appendChild(loader);}
function renderSignup() {
  const steps=activeSignupSteps(),step=steps[signup.step],value=signup.data[step.key]||"",progress=Math.round(((signup.step+1)/steps.length)*100);
  const control=step.options?`<div class="signup-options">${step.options.map(option=>`<button type="button" class="signup-option ${value===option?"selected":""}" data-option="${option}">${option}</button>`).join("")}</div>`:step.type==="file"?`<div class="signup-photo"><div class="signup-photo-preview" id="signup-photo-preview">${signup.data.photoPreview?`<img src="${signup.data.photoPreview}" alt="Aperçu de la photo">`:`<span>♙</span><small>Aucune photo</small>`}</div><input id="signup-value" type="file" accept="image/jpeg,image/png,image/webp"><label for="signup-value">${signup.data.photo?"Changer la photo":"Choisir une photo"}</label><small>JPG, PNG ou WebP · 5 Mo maximum</small></div>`:`<input class="signup-input" id="signup-value" type="${step.type}" value="${value}" placeholder="${step.placeholder||""}" autocomplete="${step.type==="password"?"new-password":"off"}" required>`;
  authScreen.innerHTML=`<div class="auth-wrap signup-wrap"><button class="auth-back" id="auth-back">← ${signup.step?"Question précédente":"Retour"}</button><section class="signup-card"><div class="signup-meta"><span>Création du compte</span><span>${signup.step+1}/${steps.length}</span></div><div class="signup-progress" style="--signup-progress:${progress}%"><span></span></div><form id="signup-form"><div class="signup-question"><h2>${step.title}</h2><p>${step.hint}</p>${control}</div><div class="signup-actions"><span>${progress}%</span><button class="primary-button">${signup.step===steps.length-1?"Créer mon compte":step.type==="file"&&!signup.data.photo?"Continuer sans photo":"Continuer →"}</button></div></form></section></div>`;
  document.querySelector("#auth-back").onclick = () => { if (signup.step === 0) renderSignupChoice(); else { signup.step--; renderSignup(); } };
  document.querySelectorAll("[data-option]").forEach(button => button.onclick = () => { signup.data[step.key] = button.dataset.option;if(step.key==="group"&&button.dataset.option==="Section Espoir")horseSignupKeys.forEach(key=>delete signup.data[key]);document.querySelectorAll("[data-option]").forEach(x => x.classList.remove("selected")); button.classList.add("selected"); });
  if(step.type==="file")document.querySelector("#signup-value").onchange=event=>{const file=event.target.files[0];if(!file)return;if(file.size>5*1024*1024){event.target.value="";return toast("La photo doit faire moins de 5 Mo");}signup.data.photo=file;signup.data.photoPreview=URL.createObjectURL(file);renderSignup();};
  document.querySelector("#signup-form").onsubmit=async event=>{event.preventDefault();if(!step.options&&step.type!=="file")signup.data[step.key]=document.querySelector("#signup-value").value.trim();if(!step.optional&&!signup.data[step.key])return toast("Merci de répondre avant de continuer");if(step.key==="password"&&signup.data.password.length<6)return toast("Le mot de passe doit contenir 6 caractères minimum");if(signup.step<steps.length-1){signup.step++;renderSignup();return;}const name=`${signup.data.firstName} ${signup.data.lastName}`,hasHorse=signup.data.group==="Section Excellence";setSignupLoading(true);if(cloudConfigured){try{const {data,error}=await supabase.auth.signUp({email:signup.data.email,password:signup.data.password,options:{data:{role:"student",full_name:name,birth_date:signup.data.birthDate,academy_group:signup.data.group,horse_name:hasHorse?signup.data.horse:null,horse_age:hasHorse?Number(signup.data.horseAge):null,horse_height:hasHorse?Number(signup.data.horseHeight):null,horse_partnership:hasHorse?signup.data.horsePartnership:null,horse_experience:hasHorse?signup.data.horseExperience:null}}});if(error)throw error;if(!data.session){if(signup.data.photo){try{await savePendingSignupPhoto(signup.data.email,signup.data.photo);}catch(error){console.warn("Photo en attente non sauvegardée",error);}}setSignupLoading(false);toast("Compte créé : confirmez votre adresse e-mail");return renderStudentLogin();}if(signup.data.photo)await uploadStudentPhoto(data.user.id,signup.data.photo);await refreshCloudState();const pupil=state.students.find(s=>s.userId===data.user.id);login({name,role:"student",initials:initials(name),studentId:pupil.id,userId:data.user.id});}catch(error){setSignupLoading(false);toast(error.message||"Inscription impossible");}return;}const photoUrl=signup.data.photo?await readFileData(signup.data.photo):null;const newStudent={id:Date.now(),name,initials:initials(name),photoUrl,group:signup.data.group,horse:hasHorse?signup.data.horse:null,horseAge:hasHorse?Number(signup.data.horseAge):null,horseHeight:hasHorse?Number(signup.data.horseHeight):null,horsePartnership:hasHorse?signup.data.horsePartnership:null,horseExperience:hasHorse?signup.data.horseExperience:null,incidents:0,birthDate:signup.data.birthDate,email:signup.data.email,password:signup.data.password};state.students.push(newStudent);save();login({name,role:"student",initials:newStudent.initials,studentId:newStudent.id});};
  setTimeout(() => document.querySelector("#signup-value")?.focus(), 100);
}
function login(user) { currentUser = user; currentRole = user.role; currentView = "dashboard"; selectedStudent = null; persistSession(user); document.body.classList.remove("auth-active"); authScreen.classList.add("hidden"); render();startRealtimeNotifications(); setTimeout(() => maybeStartTour(), 500); }
async function logout() {
  closeModal(); closeTour(false);
  try {
    if(notificationChannel&&supabase) await supabase.removeChannel(notificationChannel);
    if(cloudConfigured) await disablePushOnThisDevice().catch(error=>console.warn("Désabonnement push",error));
    if(cloudConfigured) await signOutCloud();
  } catch(error) {
    console.warn("Déconnexion distante incomplète",error);
  } finally {
    notificationChannel=null;
    clearPersistentSession();
    currentUser=null;
    currentRole=null;
    renderAuthLanding();
  }
}
function setProfile() {
  if (!currentUser) return;
  const role = currentRole === "admin" ? "Administration" : currentRole === "coach" ? "Coach" : currentRole === "parent" ? "Parent" : "Élève";
  document.querySelector("#profile-name").textContent = currentUser.name;
  document.querySelector("#profile-role").textContent = role;
  document.querySelector("#topbar-avatar").textContent = currentUser.initials;
  document.querySelector(".search").hidden = !isStaff();
}
function navigationItems() {
  return currentRole === "admin" ? adminNav : currentRole === "coach" ? staffNav : currentRole === "parent" ? (currentUser.studentId ? parentNav : [["dashboard","Vue d’ensemble"]]) : studentNav;
}
function navigate(view) {
  currentView = view; selectedStudent = null; selectedEvent = null;
  document.querySelector("#global-search").value = "";
  closeModal(); render(); window.scrollTo({top:0,behavior:"instant"});
  app.focus({preventScroll:true});
}
function renderNav() {
  if (!currentUser) return;
  const items = navigationItems(), activeView = selectedStudent ? "students" : ["absences","delays","monthly"].includes(currentView) ? "tracking" : currentView;
  const unread = state.notifications.filter(n=>!n.read).length;
  const mobileLabels = { dashboard:"Accueil", students:"Élèves", tracking:"Suivi", events:"Concours", notifications:"Réception" };
  nav.innerHTML = items.map(([id,label],i)=>`<button class="nav-item ${i>3?"nav-secondary":""} ${activeView===id?"active":""}" data-view="${id}" ${activeView===id?'aria-current="page"':""}><span class="nav-icon">${icons[id]}</span><span class="nav-label-text"><span class="desktop-label">${label}</span><span class="mobile-label">${mobileLabels[id]||label}</span></span>${id==="notifications"&&unread?`<b class="nav-badge">${unread}</b>`:""}</button>`).join("") + `<button class="nav-item nav-more ${["entry","request","reportCards"].includes(activeView)?"active":""}" id="more-navigation" aria-haspopup="dialog"><span class="nav-icon">${uiIcon("more")}</span><span>Plus</span></button>`;
  nav.querySelectorAll("[data-view]").forEach(button=>button.onclick=()=>navigate(button.dataset.view));
  document.querySelector("#more-navigation").onclick=openNavigationMenu;
  document.querySelector(".notification-dot").hidden=!unread;
  document.querySelector("#current-page-label").textContent=selectedStudent?"Fiche élève":({absences:"Absences",delays:"Retards",monthly:"Avertissements"}[currentView]||items.find(([id])=>id===currentView)?.[1]||"Mon espace");
}

function openNavigationMenu() {
  document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Votre Académie</span><h2 id="modal-title">Tous vos espaces</h2><p class="modal-intro">Retrouvez chaque rubrique de l’application.</p><nav class="more-menu" aria-label="Tous les espaces">${navigationItems().map(([view,label])=>`<button data-more-view="${view}"><span>${icons[view]}</span>${label}${uiIcon("chevron")}</button>`).join("")}<button id="more-account"><span>${uiIcon("user")}</span>Mon compte${uiIcon("chevron")}</button></nav>`;
  showModal();
  document.querySelectorAll("[data-more-view]").forEach(button=>button.onclick=()=>navigate(button.dataset.moreView));
  document.querySelector("#more-account").onclick=()=>{closeModal();openAccountModal();};
}
function dashboardMetric(icon, value, label, view) {
  return `<button class="overview-metric" data-dashboard-view="${view}"><span class="metric-label">${uiIcon(icon)} ${label}</span><span class="metric-value">${String(value).padStart(2,"0")}<span class="metric-arrow">${uiIcon("arrow")}</span></span></button>`;
}
function dashboardEvent(event = upcomingEvents()[0]) {
  if(!event)return `<section class="meet-card is-empty"><img class="meet-image" src="${equestrianImage}" alt=""><div class="meet-shade"></div><div class="meet-top"><span>LA SAISON CONTINUE</span>${uiIcon("trophy")}</div><div class="meet-copy"><span class="eyebrow">Côté concours</span><h2>La suite<br>se prépare.</h2><p>Le prochain rendez-vous apparaîtra ici.</p><button class="white-link" data-dashboard-view="events">Explorer les concours ${uiIcon("arrow")}</button></div></section>`;
  const count=eventEntries(event.id).length,d=eventDay(event.date);
  return `<button class="meet-card" data-open-event="${event.id}" aria-label="Ouvrir le concours ${esc(event.title)}"><img class="meet-image" src="${equestrianImage}" alt=""><span class="meet-shade"></span><span class="meet-top"><span>PROCHAIN RENDEZ-VOUS</span><em>${eventCountdown(event.date,event.endDate)}</em></span><span class="meet-copy"><span class="meet-date">${d.day}<small>${d.month}</small></span><strong>${esc(event.title)}</strong><small class="meet-location">${event.endDate&&event.endDate!==event.date?`${esc(eventDateLabel(event))}<br>`:""}${esc(event.location||"Lieu à préciser")}</small></span><span class="meet-bottom"><span>${isStaff()?`${count} engagement${count>1?"s":""}`:"Horaires & programme"}</span><span class="round-arrow">${uiIcon("arrow")}</span></span></button>`;
}
function workspaceHeading(title, description, action = "") {
  const date = new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(new Date());
  return `<header class="workspace-heading"><div><span class="workspace-date"><i></i> ${date}</span><h1>${title}</h1><p>${description}</p></div>${action}</header>`;
}
function taskRow(item) {
  const s=student(item.studentId),kind=item.requestType==="delay"?"Retard":"Absence";
  return `<button class="task-row view-request" data-request="${item.id}" aria-label="Ouvrir la demande de ${esc(s?.name||"l’élève")}"><span class="task-avatar">${studentPortrait(s)}</span><span class="task-copy"><strong>${esc(s?.name||"Élève")}</strong><small>${kind} · ${dateFR(item.date)}</small></span><span class="task-state ${item.status==="À vérifier"?"pending":""}">${item.status==="À vérifier"?(familyRole()?"En attente":"À examiner"):esc(item.status)}</span>${uiIcon("arrow")}</button>`;
}
function resourceLinks() {
  return `<section class="resource-panel"><span class="eyebrow">À portée de main</span><h2>Les bons outils.<br>Au bon moment.</h2><div class="resource-links"><button data-dashboard-view="reportCards">${uiIcon("document")}<span>Bulletins scolaires</span>${uiIcon("arrow")}</button><button data-dashboard-view="${isStaff()?"entry":"tracking"}">${uiIcon("tracking")}<span>${isStaff()?"Ajouter au suivi":"Mon suivi"}</span>${uiIcon("arrow")}</button><button data-dashboard-view="events">${uiIcon("trophy")}<span>Agenda des concours</span>${uiIcon("arrow")}</button></div></section>`;
}

function bindDashboardActions() {
  app.querySelectorAll("[data-dashboard-view]").forEach(button=>button.onclick=()=>navigate(button.dataset.dashboardView));
}

function statCard(label, value, note, accent="#23579a") { return `<article class="card stat-card" style="--accent:${accent}"><div class="stat-top"><span>${label}</span><span>↗</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`; }
function heading(kicker, title, subtitle, action="") { return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function isEspoirStudent(s){return (s?.group||"").toLowerCase().includes("espoir");}
function studentRow(s) {
  const abs=countFor(state.absences,s.id),delays=countFor(state.delays,s.id),reports=countFor(state.monthlyObservations,s.id);
  return `<article class="student-card-modern"><button class="student-profile-open" data-student="${s.id}" aria-label="Ouvrir la fiche de ${esc(s.name)}"><span class="directory-avatar">${studentPortrait(s)}</span><span class="directory-person"><span class="directory-section">${esc((s.group||"Section non renseignée").replace("Section ",""))}</span><strong>${esc(s.name)}</strong><small>${isEspoirStudent(s)?"Parcours Espoir":`${uiIcon("horse")} ${esc(s.horse||"Cheval non renseigné")}`}</small></span><span class="directory-counts"><span><b>${abs}</b><small>Absences</small></span><span><b>${delays}</b><small>Retards</small></span><span><b>${reports}</b><small>Avertissements</small></span></span><span class="round-arrow">${uiIcon("arrow")}</span></button></article>`;
}

function homeStudentCard(s){
  const pending=coachPendingFor(s.id),activity=countFor(state.absences,s.id)+countFor(state.delays,s.id);
  return `<button class="home-student-row ${pending?"needs-attention":""}" data-student="${s.id}" aria-label="Ouvrir la fiche de ${s.name}">${studentPortrait(s,"home-student-photo")}<span class="home-student-copy"><span class="home-student-meta"><b>${(s.group||"Section non renseignée").replace("Section ","")}</b>${pending?`<em>${pending} à traiter</em>`:""}</span><strong>${s.name}</strong>${isEspoirStudent(s)?"":`<small><span aria-hidden="true">♘</span> ${s.horse||"Cheval non renseigné"}</small>`}</span><span class="home-student-side">${activity?`<small>${activity} suivi${activity>1?"s":""}</small>`:""}<b aria-hidden="true">→</b></span></button>`;
}

function renderStaffDashboard() {
  const incidentTotal = state.students.reduce((n,s)=>n+s.incidents,0), alerts = state.students.filter(s=>s.incidents>=3).length, recent = [...state.observations].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4), firstName = currentUser.name.split(" ")[0];
  app.innerHTML = heading("Aujourd’hui", `Bonjour ${firstName}`, currentRole === "admin" ? "Pilotez la vie de l’Académie depuis votre espace." : "Voici l’essentiel de la vie de l’Académie aujourd’hui.", `<button class="primary-button" id="add-observation">+ Nouvel avertissement</button>`) + `<section class="grid stats" id="dashboard-stats">${statCard("Académiciens",state.students.length,state.students.length ? "inscrits dans l’application" : "aucun compte élève")}${statCard("Incidents actifs",incidentTotal,"sur la période en cours","#b74d47")}${statCard("Alertes au seuil",alerts,"validation humaine requise","#c77d32")}${statCard("Présences","—","aucune présence saisie","#6f8aa1")}</section><section class="grid dashboard-grid"><article class="card section-card"><div class="section-head"><div><span class="eyebrow">Suivi</span><h2>Académiciens à surveiller</h2></div><a href="#" data-goto="students">Voir tous</a></div><div class="student-list">${state.students.filter(s=>s.incidents>0).sort((a,b)=>b.incidents-a.incidents).map(studentRow).join("") || emptyBlock("♙","Tout va bien","Aucun incident actif pour le moment.")}</div></article><article class="card section-card"><div class="section-head"><div><span class="eyebrow">Activité</span><h2>Dernières notes</h2></div></div><div class="timeline">${recent.map(o=>{const s=student(o.studentId);return s ? `<div class="timeline-item"><span class="timeline-icon">${o.incident?'!':'✓'}</span><div><strong>${s.name}</strong><p>${o.type} · ${o.text}</p><small>${dateFR(o.date)} · ${o.coach}</small></div></div>` : ""}).join("") || emptyBlock("✎","Aucune note","Les nouveaux avertissements apparaîtront ici.")}</div></article></section>`;
  document.querySelector("#add-observation").onclick = openObservationModal; bindStudentRows(); document.querySelector("[data-goto]").onclick = event => { event.preventDefault(); currentView="students"; render(); };
}
function renderStudents() {
  if(currentRole==="coach")return renderCoachStudents();
  app.innerHTML=heading("L’équipe de demain","Chaque parcours compte.","Retrouvez rapidement un élève, son cheval et les éléments essentiels de son suivi.",`<button class="primary-button" id="new-entry">+ Ajouter au suivi</button>`)+`<section class="student-toolbar"><label class="student-search"><span>⌕</span><input id="student-search-input" type="search" placeholder="Rechercher un élève ou un cheval…" aria-label="Rechercher un élève"></label><select id="student-group-filter" aria-label="Filtrer par groupe"><option value="">Tous les groupes · ${state.students.length}</option>${[...new Set(state.students.map(s=>s.group).filter(Boolean))].map(group=>`<option value="${group}">${group}</option>`).join("")}</select></section><div class="carousel-label"><span>Les académiciens</span><small>Toutes les fiches, au même endroit</small></div><div class="student-list student-directory" id="all-students">${state.students.map(studentRow).join("")||emptyBlock("♘","Aucun élève inscrit","Les élèves apparaîtront ici après la création de leur compte.")}</div>`;
  const updateList=()=>{const query=document.querySelector("#student-search-input").value.trim().toLowerCase(),group=document.querySelector("#student-group-filter").value;const list=state.students.filter(s=>(!group||s.group===group)&&(!query||`${s.name} ${s.horse||""}`.toLowerCase().includes(query)));document.querySelector("#all-students").innerHTML=list.map(studentRow).join("")||emptyBlock("⌕","Aucun résultat","Essayez un autre nom, cheval ou groupe.");bindStudentRows();};
  document.querySelector("#new-entry").onclick=()=>openStaffEntryModal();document.querySelector("#student-search-input").oninput=updateList;document.querySelector("#student-group-filter").onchange=updateList;bindStudentRows();
}
function coachPendingFor(studentId){return [...state.absences,...state.delays].filter(item=>String(item.studentId)===String(studentId)&&item.source==="student"&&item.status==="À vérifier"&&item.targetCoach===currentUser.name).length;}
function coachStudentCard(s) {
  const abs=countFor(state.absences,s.id),delays=countFor(state.delays,s.id),pending=coachPendingFor(s.id),reports=countFor(state.monthlyObservations,s.id);
  return `<article class="coach-student-card ${pending?"needs-attention":""}" data-coach-student="${s.id}" data-coach-group="${esc(s.group)}" data-coach-pending="${pending}"><button class="coach-student-open student-profile-open" data-student="${s.id}" aria-label="Ouvrir la fiche de ${esc(s.name)}"><span class="directory-avatar">${studentPortrait(s)}</span><span class="directory-person"><span class="directory-section">${esc((s.group||"Section non renseignée").replace("Section ",""))}${pending?`<em>${pending} à traiter</em>`:""}</span><strong>${esc(s.name)}</strong><small>${isEspoirStudent(s)?"Parcours Espoir":`${uiIcon("horse")} ${esc(s.horse||"Cheval non renseigné")}`}</small></span><span class="directory-counts"><span><b>${abs}</b><small>Absences</small></span><span><b>${delays}</b><small>Retards</small></span><span><b>${reports}</b><small>Avertissements</small></span></span><span class="round-arrow">${uiIcon("arrow")}</span></button></article>`;
}

function renderCoachStudents(){
  const groups=[...new Set(state.students.map(s=>s.group).filter(Boolean))],pendingTotal=state.students.reduce((total,s)=>total+coachPendingFor(s.id),0);
  app.innerHTML=`<div class="coach-roster-page"><header class="coach-roster-header"><div><span class="eyebrow">Mes académiciens</span><h1>Chaque parcours compte.</h1><p><strong>${state.students.length}</strong> élève${state.students.length>1?"s":""} accessible${state.students.length>1?"s":""}${pendingTotal?` · <span>${pendingTotal} à traiter</span>`:""}</p></div><button class="primary-button" id="new-entry"><span aria-hidden="true">＋</span> Ajouter au suivi</button></header><section class="coach-roster-tools" aria-label="Recherche et filtres"><label class="coach-roster-search" for="coach-student-search"><span aria-hidden="true">⌕</span><input id="coach-student-search" type="search" aria-label="Rechercher un élève ou un cheval" placeholder="Nom de l’élève ou du cheval" autocomplete="off"><button type="button" id="clear-coach-search" aria-label="Effacer la recherche" hidden>×</button></label><select id="coach-group-filter" aria-label="Filtrer les élèves par groupe"><option value="">Tous les groupes</option>${groups.map(group=>`<option value="${group}">${group}</option>`).join("")}</select><div class="coach-filter-tabs" role="group" aria-label="Filtrer par priorité"><button class="active" data-coach-filter="all">Tous</button><button data-coach-filter="pending">À traiter${pendingTotal?` · ${pendingTotal}`:""}</button></div></section><div class="coach-roster-count"><strong id="coach-result-count">${state.students.length}</strong><span id="coach-result-title">élèves affichés</span></div><section class="coach-student-grid" id="coach-student-grid">${state.students.map(coachStudentCard).join("")||emptyBlock("♙","Aucun élève","Les inscriptions apparaîtront ici.")}</section><div class="coach-roster-empty hidden" id="coach-roster-empty">${emptyBlock("⌕","Aucun élève trouvé","Modifiez la recherche ou les filtres.")}</div></div>`;
  let priority="all";const search=document.querySelector("#coach-student-search"),group=document.querySelector("#coach-group-filter"),clear=document.querySelector("#clear-coach-search");
  const update=()=>{const query=search.value.trim().toLowerCase(),selectedGroup=group.value;let count=0;document.querySelectorAll("[data-coach-student]").forEach(card=>{const s=student(card.dataset.coachStudent),show=(!query||`${s.name} ${s.horse||""}`.toLowerCase().includes(query))&&(!selectedGroup||s.group===selectedGroup)&&(priority==="all"||Number(card.dataset.coachPending)>0);card.hidden=!show;if(show)count++;});clear.hidden=!query;document.querySelector("#coach-result-count").textContent=count;document.querySelector("#coach-result-title").textContent=priority==="pending"?(count>1?"demandes élèves à traiter":"demande élève à traiter"):(count>1?"élèves affichés":"élève affiché");document.querySelector("#coach-roster-empty").classList.toggle("hidden",count>0);};
  search.oninput=update;group.onchange=update;clear.onclick=()=>{search.value="";search.focus();update();};document.querySelectorAll("[data-coach-filter]").forEach(button=>button.onclick=()=>{priority=button.dataset.coachFilter;document.querySelectorAll("[data-coach-filter]").forEach(item=>item.classList.toggle("active",item===button));update();});document.querySelector("#new-entry").onclick=()=>openStaffEntryModal();document.querySelectorAll(".coach-student-open").forEach(button=>button.onclick=()=>{selectedStudent=button.dataset.student;render();});
}
function renderStudentDetail(id, own=false) {
  const s=student(id); if (!s) return renderMissingStudent(); const obs=state.observations.filter(o=>o.studentId===s.id).sort((a,b)=>b.date.localeCompare(a.date)), sanction=state.sanctions.find(x=>x.studentId===s.id);
  app.innerHTML = `${own ? heading("Mon espace", s.name, "Un suivi sportif et éducatif clair.") : `<button class="ghost-button" id="back">← Retour aux académiciens</button><br><br>`}<section class="card detail-hero"><div class="detail-person"><span class="avatar">${s.initials}</span><div><h2>${s.name}</h2><p>${s.group} · Cheval : ${s.horse || "Non renseigné"}</p><span class="status ${statusFor(s.incidents)[0]}">${statusFor(s.incidents)[1]}</span></div></div><div style="display:flex;align-items:center;gap:12px"><div><strong>Seuil d’incidents</strong><small style="display:block;color:var(--muted)">Une décision reste toujours humaine</small></div><div class="progress-ring" style="--progress:${Math.min(100,s.incidents/3*100)}"><strong>${s.incidents}/3</strong></div></div></section>${sanction ? `<div class="sanction-banner"><strong>⚑ ${sanction.title} — ${sanction.status}</strong><p>${sanction.reason}.</p>${currentRole!=='student'&&sanction.status==='À valider'?`<button class="primary-button" id="validate-sanction">Valider la décision</button>`:""}</div>`:""}<section class="grid two-cols"><article class="card section-card"><div class="section-head"><h2>Journal de suivi</h2>${currentRole!=='student'?`<button class="primary-button" id="add-observation">+ Ajouter</button>`:""}</div>${obs.map(o=>`<div class="observation"><div class="observation-head"><strong>${o.type}</strong><span class="status ${o.incident?'alert':'good'}">${o.incident?'Incident':'Positif'}</span></div><p>${o.text}</p><small>${dateFR(o.date)} · ${o.coach}</small></div>`).join("") || emptyBlock("✎","Aucun avertissement","Ton journal de suivi est encore vide.")}</article><article class="card section-card"><div class="section-head"><h2>Présence</h2></div>${emptyBlock("◷","Aucune donnée","Les présences et retards apparaîtront ici.")}<div><h2 style="font-size:18px">Règle de suivi</h2><p style="color:var(--muted);line-height:1.6;font-size:14px">À trois incidents actifs, l’application propose une mesure éducative. Le contexte est toujours examiné avant validation.</p></div></article></section>`;
  document.querySelector("#back")?.addEventListener("click",()=>{selectedStudent=null;currentView="students";render();}); document.querySelector("#add-observation")?.addEventListener("click",()=>openObservationModal(s.id)); document.querySelector("#validate-sanction")?.addEventListener("click",()=>{sanction.status="Validée";save();toast("Décision validée");render();});
}
function renderMissingStudent() { app.innerHTML = heading("Mon espace","Compte élève introuvable","Reconnectez-vous ou recréez votre compte.") + `<button class="primary-button" id="missing-logout">Revenir à la connexion</button>`; document.querySelector("#missing-logout").onclick=logout; }

function renderGeneric(type) {
  const filteredObs = currentRole === "student" ? state.observations.filter(o=>o.studentId===currentUser.studentId) : state.observations, filteredSanctions = currentRole === "student" ? state.sanctions.filter(x=>x.studentId===currentUser.studentId) : state.sanctions;
  const observations = filteredObs.map(o=>{const s=student(o.studentId);return s ? `<div class="observation"><div class="observation-head"><strong>${s.name} · ${o.type}</strong><span class="status ${o.incident?'alert':'good'}">${o.incident?'Incident':'Positif'}</span></div><p>${o.text}</p><small>${dateFR(o.date)} · ${o.coach}</small></div>` : ""}).join("");
  const content = { observations:["Avertissements","Les avertissements adressés par l’équipe.",observations||emptyBlock("✎","Aucun avertissement","Le journal est vide pour le moment.")], attendance:["Présences","Les absences et retards enregistrés.",emptyBlock("◷","Aucune présence saisie","Les présences seront affichées dès leur premier enregistrement.")], sanctions:["Décisions éducatives","Les mesures proposées et validées.",filteredSanctions.map(x=>{const s=student(x.studentId);return s?`<div class="sanction-banner"><strong>${s.name} · ${x.title}</strong><p>${x.reason}</p><span class="status ${x.status==='Validée'?'good':'watch'}">${x.status}</span></div>`:""}).join("")||emptyBlock("⚑","Aucune décision","Aucune mesure éducative en cours.")], messages:["Messagerie","Les échanges avec l’équipe et les élèves.",emptyBlock("◇","Aucun message","Vos nouvelles conversations apparaîtront ici.")], admin:["Réglages","Gestion de l’application et des accès.",`<div class="grid two-cols">${statCard("Coachs",STAFF.coach.length,"profils préconfigurés")}${statCard("Administrateurs",STAFF.admin.length,"accès de gestion")}</div><div style="margin-top:24px"><h2>Comptes élèves</h2><p style="color:var(--muted)">${state.students.length} compte(s) créé(s) sur cet appareil.</p></div>`] }[type];
  app.innerHTML = heading("Académie Delaveau",content[0],content[1],currentRole!=="student"&&type==="observations"?`<button class="primary-button" id="add-observation">+ Nouvel avertissement</button>`:"") + `<section class="card section-card">${content[2]}</section>`; document.querySelector("#add-observation")?.addEventListener("click",openObservationModal);
}
function openObservationModal(preselect="") {
  if (!state.students.length) return toast("Aucun élève n’est encore inscrit");
  document.querySelector("#modal-content").innerHTML = `<span class="eyebrow">Journal de suivi</span><h2 id="modal-title">Nouvel avertissement</h2><p class="modal-intro">Rédigez une note factuelle et précise.</p><form id="observation-form" class="form-grid"><div class="field"><label for="student">Académicien</label><select id="student" required>${state.students.map(s=>`<option value="${s.id}" ${s.id===Number(preselect)?'selected':''}>${s.name}</option>`).join("")}</select></div><div class="field"><label for="type">Type</label><select id="type"><option>Progrès</option><option>Comportement</option><option>Retard</option><option>Absence</option><option>Travail</option><option>Santé</option></select></div><div class="field"><label for="note">Avertissement</label><textarea id="note" required placeholder="Décrivez les faits, sans jugement…"></textarea></div><label class="checkbox"><input id="incident" type="checkbox"> <span>Compter comme incident actif. Au troisième incident, une mesure éducative sera proposée.</span></label><div class="form-actions"><button type="button" class="ghost-button" id="cancel-modal">Annuler</button><button class="primary-button">Enregistrer</button></div></form>`;
  showModal(); document.querySelector("#cancel-modal").onclick=closeModal; document.querySelector("#observation-form").onsubmit=event=>{ event.preventDefault(); const sid=Number(document.querySelector("#student").value), isIncident=document.querySelector("#incident").checked; state.observations.unshift({id:Date.now(),studentId:sid,type:document.querySelector("#type").value,date:todayISO(),text:document.querySelector("#note").value.trim(),coach:currentUser.name,incident:isIncident}); if(isIncident){const s=student(sid);s.incidents++;if(s.incidents>=3&&!state.sanctions.some(x=>x.studentId===sid&&x.status==='À valider'))state.sanctions.push({id:Date.now()+1,studentId:sid,status:"À valider",title:"Mesure éducative à définir",reason:"Seuil de 3 incidents actifs atteint"});} save();closeModal();toast(isIncident&&student(sid).incidents>=3?"Seuil atteint : décision à examiner":"Avertissement enregistré");render(); };
}
function openAccountModal() { const notificationState="Notification" in window?Notification.permission:"unsupported",ownStudent=currentRole==="student"?student(currentUser.studentId):null,canPresent=presentationMode||["coach","admin"].includes(currentRole);document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Mon compte</span><h2 id="modal-title">${currentUser.name}</h2><p class="modal-intro">${currentRole === "admin" ? "Administrateur" : currentRole === "coach" ? "Coach" : currentRole === "parent" ? "Parent" : "Élève"} de l’Académie Delaveau</p>${presentationMode?`<div class="presentation-account-note"><span>↔</span><div><strong>Mode démonstration actif</strong><small>Changez librement d’espace avec le sélecteur en bas.</small></div></div>`:ownStudent?.guardianCode?`<div class="family-code-card"><div><small>Code familial</small><strong>${ownStudent.guardianCode}</strong><p>À transmettre uniquement à vos parents.</p></div><button id="copy-family-code">Copier</button></div>`:""}${presentationMode?"":`<div class="phone-notification-card"><span>♢</span><div><strong>Notifications sur le téléphone</strong><small>${notificationState==="granted"?"Activées":notificationState==="denied"?"Refusées dans les réglages":"Recevoir les alertes même en dehors de cette page"}</small></div>${notificationState==="granted"?`<b>Activées</b>`:`<button id="enable-phone-notifications" ${notificationState==="unsupported"?"disabled":""}>Activer</button>`}</div>`}<div class="form-grid">${canPresent?`<button class="presentation-launch-button" id="presentation-toggle">${presentationMode?"Quitter le mode démonstration":"Activer le sélecteur de profils"}</button>`:""}${presentationMode?"":`<button class="ghost-button" id="restart-tour">Revoir la visite guidée</button><button class="primary-button" id="logout-button">Se déconnecter</button>`}</div>`; showModal();document.querySelector("#presentation-toggle")?.addEventListener("click",()=>{closeModal();presentationMode?stopPresentation():startPresentation();});document.querySelector("#logout-button")?.addEventListener("click",logout);document.querySelector("#enable-phone-notifications")?.addEventListener("click",enablePhoneNotifications);document.querySelector("#copy-family-code")?.addEventListener("click",async()=>{await navigator.clipboard.writeText(ownStudent.guardianCode);toast("Code familial copié");});document.querySelector("#restart-tour")?.addEventListener("click",()=>{closeModal();startTour();}); }
let modalReturnFocus = null;
function showModal() {
  if(modal.classList.contains("hidden"))modalReturnFocus=document.activeElement;
  modal.classList.remove("hidden"); document.body.classList.add("modal-open");
  document.querySelector(".app-shell").inert=true;
  enhanceIcons(modal);
  document.querySelector(".modal")?.scrollTo({top:0});
  document.querySelector("#modal-close").focus();
}
function closeModal() {
  const wasOpen=!modal.classList.contains("hidden");
  modal.classList.add("hidden");document.body.classList.remove("modal-open");
  document.querySelector(".app-shell").inert=!authScreen.classList.contains("hidden");
  if(wasOpen&&modalReturnFocus?.isConnected)modalReturnFocus.focus({preventScroll:true});
  modalReturnFocus=null;
}
document.addEventListener("keydown",event=>{
  if(modal.classList.contains("hidden")||document.body.classList.contains("confirmation-open"))return;
  if(event.key==="Escape"){event.preventDefault();closeModal();}
  if(event.key!=="Tab")return;
  const items=[...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
  const first=items[0],last=items.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});

function showActionConfirmation({eyebrow="Confirmation",title,message,warning="",choices=[],confirmLabel="Confirmer"}){
  return new Promise(resolve=>{
    const backdrop=document.createElement("div");backdrop.className="action-dialog-backdrop";
    backdrop.innerHTML=`<section class="action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title"><button type="button" class="action-dialog-close" aria-label="Fermer">×</button><span class="eyebrow">${eyebrow}</span><h2 id="action-dialog-title">${title}</h2><p>${message}</p>${warning?`<div class="action-dialog-warning"><span aria-hidden="true">!</span><p>${warning}</p></div>`:""}<form>${choices.length?`<fieldset class="course-choice"><legend>Participation au cours équestre</legend>${choices.map(choice=>`<label><input type="radio" name="action-choice" value="${choice.value}" required><span><strong>${choice.label}</strong><small>${choice.description}</small></span></label>`).join("")}</fieldset>`:""}<div class="action-dialog-actions"><button type="button" class="ghost-button action-dialog-cancel">Annuler</button><button class="primary-button action-dialog-confirm" ${choices.length?"disabled":""}>${confirmLabel}</button></div></form></section>`;
    const returnFocus=document.activeElement,shell=document.querySelector(".app-shell"),shellWasInert=shell.inert;
    document.body.appendChild(backdrop);document.body.classList.add("confirmation-open");
    shell.inert=true;modal.inert=true;enhanceIcons(backdrop);
    const finish=value=>{backdrop.remove();document.body.classList.remove("confirmation-open");shell.inert=shellWasInert;modal.inert=false;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});resolve(value);};
    backdrop.addEventListener("keydown",event=>{
      if(event.key==="Escape"){event.preventDefault();finish(null);return;}
      if(event.key!=="Tab")return;
      const items=[...backdrop.querySelectorAll('button:not([disabled]),input:not([disabled])')],first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    backdrop.querySelector(".action-dialog-close").focus();
    backdrop.querySelector(".action-dialog-close").onclick=()=>finish(null);backdrop.querySelector(".action-dialog-cancel").onclick=()=>finish(null);backdrop.onclick=e=>{if(e.target===backdrop)finish(null);};
    const confirm=backdrop.querySelector(".action-dialog-confirm");backdrop.querySelectorAll('[name="action-choice"]').forEach(input=>input.onchange=()=>confirm.disabled=false);
    backdrop.querySelector("form").onsubmit=e=>{e.preventDefault();finish(choices.length?backdrop.querySelector('[name="action-choice"]:checked')?.value:true);};
    requestAnimationFrame(()=>backdrop.classList.add("visible"));
  });
}
function presentationDemoStudent(){return state.students.find(s=>s.name==="Élève Démo")||state.students.find(s=>s.name.includes("Démo"))||state.students[0];}
function startPresentation(){if(!["coach","admin"].includes(currentRole))return toast("Connectez-vous avec un compte équipe");presentationOriginalUser={...currentUser};presentationMode=true;closeTour(false);switchPresentationRole(currentRole);toast("Sélecteur de profils activé");}
function switchPresentationRole(role){if(!presentationMode||!["parent","student","coach","admin"].includes(role))return;const demo=presentationDemoStudent(),original=presentationOriginalUser,profiles={parent:{name:"Parent Démo",initials:"PD",studentId:demo?.id},student:{name:demo?.name||"Élève Démo",initials:demo?.initials||"ÉD",studentId:demo?.id},coach:{name:original?.role==="coach"?original.name:"Coach Démo",initials:original?.role==="coach"?original.initials:"CD",studentId:null},admin:{name:original?.role==="admin"?original.name:"Admin",initials:original?.role==="admin"?original.initials:"AD",studentId:null}};currentRole=role;currentUser={...profiles[role],role,userId:original?.userId};currentView="dashboard";selectedStudent=null;scrollTo({top:0,behavior:"smooth"});render();}
function stopPresentation(){presentationMode=false;document.body.classList.remove("presentation-active");document.querySelector("#presentation-dock")?.remove();currentUser=presentationOriginalUser;currentRole=currentUser?.role||null;currentView="dashboard";selectedStudent=null;presentationOriginalUser=null;render();toast("Présentation terminée");}
function renderPresentationDock(){if(!presentationMode)return;document.body.classList.add("presentation-active");let dock=document.querySelector("#presentation-dock");if(!dock){dock=document.createElement("aside");dock.id="presentation-dock";dock.className="presentation-dock";dock.setAttribute("aria-label","Changer d’espace de démonstration");document.body.appendChild(dock);}dock.innerHTML=`<div class="presentation-switch-label"><small>Mode démonstration</small><strong>Afficher l’espace</strong></div><div class="presentation-role-switch" role="group" aria-label="Choisir le profil affiché">${[["parent","Parent"],["student","Élève"],["coach","Coach"],["admin","Admin"]].map(([role,label])=>`<button data-presentation-role="${role}" class="${currentRole===role?"active":""}" aria-pressed="${currentRole===role}">${label}</button>`).join("")}</div><button id="presentation-exit" class="presentation-exit" aria-label="Quitter le mode démonstration">Fermer</button>`;dock.querySelectorAll("[data-presentation-role]").forEach(button=>button.onclick=()=>switchPresentationRole(button.dataset.presentationRole));dock.querySelector("#presentation-exit").onclick=stopPresentation;}
document.addEventListener("submit",event=>{if(!presentationMode)return;event.preventDefault();event.stopImmediatePropagation();toast("Mode présentation : aucun enregistrement effectué");},true);
document.addEventListener("click",event=>{if(!presentationMode||!event.target.closest(".request-decision,.undo-decision,#validate-sanction"))return;event.preventDefault();event.stopImmediatePropagation();toast("Action désactivée pendant la présentation");},true);
function bindStudentRows(){enhanceIcons(app);document.querySelectorAll("[data-student]").forEach(el=>el.onclick=()=>{selectedStudent=el.dataset.student;render();});}

const tourSteps = [ { selector:"#dashboard-stats",title:"Votre suivi en un regard",text:"Ces repères donnent accès aux informations essentielles de votre espace.",staffOnly:false }, { selector:'#main-nav',title:"Vos espaces",text:"Passez du suivi aux concours, aux messages et aux bulletins depuis cette navigation." }, { selector:"#role-switch-button",title:"Votre profil",text:"Touchez ici pour revoir la visite ou vous déconnecter en toute sécurité." } ];
function relevantTourSteps(){return tourSteps.filter(step=>!step.staffOnly||currentRole!=="student").filter(step=>document.querySelector(step.selector));}
function maybeStartTour(){if(!currentUser||!authScreen.classList.contains("hidden"))return;if(!localStorage.getItem(`delaveau-tour-${currentRole}`))startTour();}
function startTour(){tourIndex=0;document.querySelector("#tour-layer").classList.remove("hidden");showTourStep();}
function showTourStep(){ const steps=relevantTourSteps(); if(tourIndex>=steps.length)return closeTour(true); const step=steps[tourIndex], target=document.querySelector(step.selector); if(!target){tourIndex++;return showTourStep();} target.scrollIntoView({behavior:"smooth",block:"center"}); setTimeout(()=>{ const rect=target.getBoundingClientRect(), focus=document.querySelector("#tour-focus"), card=document.querySelector("#tour-card"), margin=6; Object.assign(focus.style,{left:`${rect.left-margin}px`,top:`${rect.top-margin}px`,width:`${rect.width+margin*2}px`,height:`${rect.height+margin*2}px`}); document.querySelector("#tour-count").textContent=`Étape ${tourIndex+1} sur ${steps.length}`;document.querySelector("#tour-title").textContent=step.title;document.querySelector("#tour-text").textContent=step.text;document.querySelector("#tour-next").textContent=tourIndex===steps.length-1?"Terminer":"Suivant"; if(innerWidth>760){const below=rect.bottom+18,top=below+220<innerHeight?below:Math.max(15,rect.top-238),left=Math.min(innerWidth-345,Math.max(15,rect.left));Object.assign(card.style,{top:`${top}px`,left:`${left}px`});} },350); }
function closeTour(done=true){document.querySelector("#tour-layer").classList.add("hidden");if(done&&currentRole)localStorage.setItem(`delaveau-tour-${currentRole}`,"done");}

function scopedStudentId() { return currentRole === "student" || currentRole === "parent" ? currentUser.studentId : null; }
function countFor(list, studentId=null) { return studentId ? list.filter(item=>item.studentId===studentId).length : list.length; }
function studentRequests() { return [...state.absences,...state.delays].filter(item=>item.source==="student").filter(item=>currentRole!=="coach"||item.targetCoach===currentUser.name).filter(item=>!familyRole()||String(item.studentId)===String(currentUser.studentId)).sort((a,b)=>(b.createdAt||b.date).localeCompare(a.createdAt||a.date)); }
function requestCard(item) { const s=student(item.studentId),hasDocument=item.justification&&item.justification!=="Aucun justificatif",kind=item.requestType==="delay"?"Retard":"Absence"; return `<article class="request-item ${item.status==="À vérifier"?"request-pending":""}"><div class="request-item-head"><div class="request-person"><span class="avatar">${s?.initials||"?"}</span><div><span class="eyebrow">${kind} · ${dateFR(item.date)}</span><strong>${s?.name||"Élève"}</strong></div></div><span class="status ${item.status==="À vérifier"?"watch":item.status==="Refusée"?"alert":"good"}">${item.status||"À vérifier"}</span></div><p>${item.reason||item.text||"Aucun motif précisé"}</p><div class="request-meta"><span class="document-chip ${hasDocument?"attached":""}">${hasDocument?"▣ Justificatif joint":"◇ Sans justificatif"}</span><span>Coach : ${item.targetCoach||"Équipe"}</span></div><button class="secondary-button view-request" data-request="${item.id}">${item.status==="À vérifier"&&["coach","admin"].includes(currentRole)?"Examiner la demande":"Ouvrir la demande"} →</button></article>`; }
function bindRequestButtons() { document.querySelectorAll(".view-request").forEach(button=>button.onclick=()=>openRequestModal(button.dataset.request)); }
async function openRequestModal(id) {
  const item=[...state.absences,...state.delays].find(x=>x.id===id), s=item&&student(item.studentId); if(!item)return toast("Demande introuvable");
  const documentUrl=item.documentPath&&cloudConfigured?await signedDocumentUrl(item.documentPath):item.documentData;
  const documentView=documentUrl?item.documentType?.startsWith("image/")?`<img class="document-preview" src="${documentUrl}" alt="Justificatif de ${s?.name||"l’élève"}">`:`<iframe class="document-preview pdf-preview" src="${documentUrl}" title="Justificatif PDF"></iframe><a class="secondary-button document-link" href="${documentUrl}" target="_blank">Ouvrir le PDF</a>`:`<div class="document-empty">Aucun document joint à cette demande.</div>`;
  const decided=item.status!=="À vérifier",canReview=["coach","admin"].includes(currentRole),kind=item.requestType==="delay"?"retard":"absence";
  const courseDecision=item.equestrianCourseStatus==="maintained"?`<div class="course-decision maintained"><span>✓</span><div><small>Cours équestre</small><strong>Cours avec son cheval maintenu</strong></div></div>`:item.equestrianCourseStatus==="not_maintained"?`<div class="course-decision not-maintained"><span>–</span><div><small>Cours équestre</small><strong>Pas de cours avec son cheval</strong></div></div>`:`<div class="course-decision unknown"><span>?</span><div><small>Cours équestre</small><strong>Participation non renseignée</strong></div></div>`;
  const decisionView=decided?`<div class="decision-summary ${item.status==="Refusée"?"rejected":""}"><span>${item.status==="Validée"?"✓":"!"}</span><div><small>Décision</small><strong>Demande ${item.status.toLowerCase()}</strong><p>${item.reviewedBy?`Décision prise par ${item.reviewedBy}.`:"Décision enregistrée par l’équipe."}</p>${item.reviewComment?`<blockquote>${item.reviewComment}</blockquote>`:`<em>Aucun commentaire laissé.</em>`}</div></div>${courseDecision}${canReview?`<button class="undo-decision request-decision" data-status="À vérifier">↶ Annuler la décision</button>`:""}`:canReview?`<div class="field decision-comment"><label for="decision-comment">Commentaire pour l’élève et ses parents</label><textarea id="decision-comment" placeholder="Facultatif · expliquez brièvement votre décision…"></textarea></div><div class="decision-actions"><button class="ghost-button request-decision" data-status="Refusée">Refuser</button><button class="primary-button request-decision" data-status="Validée">Accepter</button></div>`:`<div class="decision-summary pending"><span>◷</span><div><small>Décision</small><strong>En attente de réponse</strong><p>Le coach destinataire n’a pas encore traité cette demande.</p></div></div>`;
  document.querySelector("#modal-content").innerHTML=`<div class="request-modal-head"><span class="avatar">${s?.initials||"?"}</span><div><span class="eyebrow">Demande de ${kind}</span><h2 id="modal-title">${s?.name||"Élève"}</h2><p class="modal-intro">${dateFR(item.date)}</p></div><span class="status ${item.status==="À vérifier"?"watch":item.status==="Refusée"?"alert":"good"}">${item.status}</span></div><div class="request-detail"><div><small>Motif déclaré</small><p>${item.reason||item.text||"—"}</p></div><div><small>Coach destinataire</small><strong>${item.targetCoach||"Équipe"}</strong></div><div><small>Document transmis</small><strong>${item.justification||"Aucun justificatif"}</strong></div>${documentView}</div>${decisionView}<button class="ghost-button request-close" id="request-close">Fermer</button>`;
  showModal();document.querySelector("#request-close").onclick=closeModal;document.querySelectorAll(".request-decision").forEach(button=>button.onclick=async()=>{const newStatus=button.dataset.status,cloudStatus=newStatus==="Validée"?"approved":newStatus==="Refusée"?"rejected":"pending",comment=document.querySelector("#decision-comment")?.value.trim()||"";let courseStatus=null;if(newStatus!=="À vérifier"){courseStatus=await showActionConfirmation({eyebrow:"Décision du coach",title:"Et pour le cours équestre ?",message:`La demande sera ${newStatus.toLowerCase()}. Indiquez maintenant si ${s?.name||"l’élève"} participe au cours avec son cheval.`,warning:"Ce choix sera visible par l’élève et ses parents.",choices:[{value:"maintained",label:"Cours maintenu",description:"L’élève participe au cours avec son cheval."},{value:"not_maintained",label:"Pas de cours équestre",description:"L’élève ne participe pas au cours avec son cheval."}],confirmLabel:"Valider la décision"});if(!courseStatus)return;}button.disabled=true;try{if(cloudConfigured){await reviewAbsenceRequest(item.id,cloudStatus,comment,courseStatus);await refreshCloudState();}else{item.status=newStatus;if(newStatus==="À vérifier"){delete item.reviewedBy;delete item.reviewedAt;delete item.reviewComment;delete item.equestrianCourseStatus;}else{item.reviewedBy=currentUser.name;item.reviewedAt=todayISO();item.reviewComment=comment;item.equestrianCourseStatus=courseStatus;}save();}closeModal();toast(newStatus==="À vérifier"?"Décision annulée · demande remise en attente":`Demande ${newStatus.toLowerCase()}`);render();}catch(error){button.disabled=false;toast(error.message||"La décision n’a pas pu être enregistrée");}});
}
function renderParentAwaitingChild() {
  const firstName=currentUser.name.split(" ")[0];
  app.innerHTML=workspaceHeading(`Bonjour ${esc(firstName)}.`,"Votre espace parent est prêt. Rattachez votre enfant pour suivre son parcours.")+`<section class="form-surface parent-link-surface"><div class="section-head"><div><span class="eyebrow">Rattachement</span><h2>Ajouter mon enfant</h2></div></div><p style="color:var(--muted);line-height:1.6">Demandez à votre enfant son <strong>code familial à 8 caractères</strong>. Il est disponible dans son profil dès que son compte élève est créé.</p><form id="parent-link-child-form" class="form-grid" style="margin-top:20px"><div class="field"><label for="parent-link-code">Code familial</label><input id="parent-link-code" required maxlength="8" autocapitalize="characters" placeholder="Exemple : A7B4C9D2"><small class="field-help">Vous pouvez revenir sur cet écran plus tard si votre enfant n’est pas encore inscrit.</small></div><button class="primary-button">Rattacher mon enfant</button></form></section>`;
  document.querySelector("#parent-link-child-form").onsubmit=async event=>{
    event.preventDefault();
    const submit=event.submitter,code=document.querySelector("#parent-link-code").value.trim();
    submit.disabled=true;submit.textContent="Rattachement…";
    try{
      await linkParentWithCode(code);
      await refreshCloudState();
      const child=state.students[0];
      if(!child)throw new Error("Le rattachement n’a pas pu être confirmé");
      currentUser.studentId=child.id;
      persistSession(currentUser);
      toast(`${child.name} est maintenant rattaché à votre compte`);
      currentView="dashboard";
      render();
    }catch(error){
      submit.disabled=false;submit.textContent="Rattacher mon enfant";
      toast(error.message||"Impossible de rattacher cet enfant");
    }
  };
}

function renderSimpleDashboard() {
  if(currentRole==="parent"&&!currentUser.studentId)return renderParentAwaitingChild();
  const sid=scopedStudentId(),child=sid?student(sid):null,firstName=currentUser.name.split(" ")[0],absences=state.absences.filter(x=>!sid||String(x.studentId)===String(sid)),delays=state.delays.filter(x=>!sid||String(x.studentId)===String(sid)),monthly=state.monthlyObservations.filter(x=>!sid||String(x.studentId)===String(sid)),requests=studentRequests();
  const parent=currentRole==="parent";
  app.innerHTML=workspaceHeading(parent&&child?`Le parcours de ${esc(child.name.split(" ")[0])}.`:`Bonjour ${esc(firstName)}.`,parent?"Chaque étape compte. Retrouvez ici son quotidien à l’Académie.":"Une nouvelle journée pour avancer, ensemble.",!parent?`<button class="primary-button hero-action" data-dashboard-view="request">${uiIcon("plus")} Prévenir l’équipe</button>`:"")+
    (parent&&state.students.length>1?`<div class="parent-child-switcher"><label for="parent-child-switch">Enfant suivi</label><select id="parent-child-switch">${state.students.map(s=>`<option value="${s.id}" ${String(s.id)===String(sid)?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div>`:"")+`
    <div class="dashboard-stage"><section class="journey-panel"><div class="section-caption"><span class="eyebrow">01 — Le fil du parcours</span>${child?studentPortrait(child,"journey-avatar"):""}</div><h2>Jour après jour,<br>on avance.</h2><p>Absences, retards, avertissements :<br>tous les repères de ${parent?"son":"votre"} suivi.</p><section class="journey-metrics" id="dashboard-stats" aria-label="Résumé du suivi">${dashboardMetric("calendar",absences.length,"Absences","absences")}${dashboardMetric("clock",delays.length,"Retards","delays")}${dashboardMetric("note",monthly.length,"Avertissements","monthly")}</section><button class="white-link" data-dashboard-view="tracking">Explorer ${parent?"le":"mon"} suivi ${uiIcon("arrow")}</button></section>${dashboardEvent()}</div>
    <div class="dashboard-bottom"><section class="roster-panel"><div class="home-section-head"><div><span class="eyebrow">02 — Le lien avec l’équipe</span><h2>${parent?"Ses":"Mes"} dernières demandes.</h2></div><button class="text-button" data-dashboard-view="notifications">Tout voir ${uiIcon("arrow")}</button></div><div class="task-list">${requests.slice(0,3).map(taskRow).join("")||emptyBlock("✓","Aucune demande pour le moment","Les échanges concernant les absences et retards apparaîtront ici.")}</div>${child&&!isEspoirStudent(child)?`<div class="partner-strip"><span>${uiIcon("horse")}</span><div><small>LE DUO</small><strong>${esc(child.horse||"Cheval non renseigné")}</strong></div><p>${esc(child.horseExperience||"Épreuve non renseignée")}<small>${[child.horseAge?`${esc(child.horseAge)} ans`:"",child.horseHeight?`${esc(child.horseHeight)} cm`:"",child.horsePartnership?`Ensemble depuis ${esc(child.horsePartnership)}`:""].filter(Boolean).join(" · ")}</small></p></div>`:""}</section>${resourceLinks()}</div>`;
  document.querySelector("#parent-child-switch")?.addEventListener("change",e=>{currentUser.studentId=e.target.value;persistSession(currentUser);render();});
  bindRequestButtons();bindDashboardActions();
}

function renderTrackingHub(){
  const sid=scopedStudentId(),items=[{id:"absences",icon:"○",title:"Absences",count:countFor(state.absences,sid),text:"Demandes et absences enregistrées"},{id:"delays",icon:"◷",title:"Retards",count:countFor(state.delays,sid),text:"Historique des retards"},{id:"monthly",icon:"✎",title:"Avertissements",count:countFor(state.monthlyObservations,sid),text:"Avertissements de l’équipe"}];
  app.innerHTML=heading("Mon suivi","Tout votre suivi","Choisissez une rubrique pour consulter son historique.")+`<section class="tracking-hub">${items.map(item=>`<button data-tracking-view="${item.id}"><span aria-hidden="true">${item.icon}</span><span><strong>${item.title}</strong><small>${item.text}</small></span><b>${item.count}<i>→</i></b></button>`).join("")}</section>`;document.querySelectorAll("[data-tracking-view]").forEach(button=>button.onclick=()=>{currentView=button.dataset.trackingView;render();});
}
function trackingTabs(active) {
  return `<nav class="tracking-tabs" aria-label="Rubriques du suivi">${[["absences","Absences"],["delays","Retards"],["monthly","Avertissements"]].map(([view,label])=>`<button data-tracking-tab="${view}" ${active===view?'aria-current="page"':""}>${label}</button>`).join("")}</nav>`;
}
function renderTrackingSection(type) {
  const sid=scopedStudentId();
  const config={absences:{title:"Absences",subtitle:"Toutes les absences enregistrées.",list:state.absences,icon:"○",empty:"Aucune absence enregistrée"},delays:{title:"Retards",subtitle:"Tous les retards enregistrés.",list:state.delays,icon:"◷",empty:"Aucun retard enregistré"},monthly:{title:"Avertissements",subtitle:"Les avertissements adressés à l’élève.",list:state.monthlyObservations,icon:"✎",empty:"Aucun avertissement"}}[type];
  const items=config.list.filter(item=>!sid||item.studentId===sid).sort((a,b)=>(b.date||b.month||"").localeCompare(a.date||a.month||""));
  app.innerHTML=heading("Suivi",config.title,config.subtitle)+trackingTabs(type)+`<section class="content-list">${items.length?items.map(item=>{const s=student(item.studentId),isRequest=item.source==="student";return `<article class="content-row ${isRequest?"content-row-action":""}"><span class="content-row-icon" aria-hidden="true">${config.icon}</span><div><div class="content-row-head"><strong>${s?s.name:currentUser.name}</strong><span class="status ${item.status==="À vérifier"?"watch":item.status==="Refusée"?"alert":"good"}">${item.status||"Publié"}</span></div><p>${item.text||item.reason||""}</p><small>${item.date?dateFR(item.date):item.month}${item.author?` · ${item.author}`:""}</small>${item.reviewComment?`<em>Commentaire : ${item.reviewComment}</em>`:""}</div>${isRequest?`<button class="view-request" data-request="${item.id}" aria-label="Ouvrir la demande du ${dateFR(item.date)}">→</button>`:""}</article>`}).join(""):emptyBlock(config.icon,config.empty,"Les nouvelles informations apparaîtront ici.")}</section>`;bindRequestButtons();
}
function renderStaffHome() {
  const requests=studentRequests(),pending=requests.filter(item=>item.status==="À vérifier"),unread=state.notifications.filter(item=>!item.read).length,firstName=currentUser.name.split(" ")[0];
  const recentStudents=[...state.students].sort((a,b)=>coachPendingFor(b.id)-coachPendingFor(a.id)).slice(0,4);
  app.innerHTML=workspaceHeading("La vie de l’Académie.",`Bonjour ${esc(firstName)}. Voici l’essentiel pour accompagner vos élèves.`,`<button class="primary-button hero-action" id="quick-entry">${uiIcon("plus")} Ajouter au suivi</button>`)+`
    <div class="dashboard-stage"><section class="today-panel"><div class="section-caption"><span class="eyebrow">01 — Votre journée</span><span class="live-label">${pending.length?"À votre attention":"À jour"}</span></div><div class="today-title"><h2>${pending.length?"À vous de jouer.":"L’esprit tranquille."}</h2><span class="today-count">${String(pending.length).padStart(2,"0")}</span></div><p class="today-description">${pending.length?`demande${pending.length>1?"s":""} à examiner pour préparer la journée.`:"Toutes les demandes ont été traitées."}</p><div class="task-list">${pending.slice(0,3).map(taskRow).join("")||`<div class="quiet-state">${uiIcon("check")}<p>Vous êtes à jour.<br><span>Les prochaines demandes apparaîtront ici.</span></p></div>`}</div><button class="text-button panel-link" data-dashboard-view="notifications">Ouvrir la boîte de réception ${uiIcon("arrow")}</button></section>${dashboardEvent()}</div>
    <section class="overview-metrics" id="dashboard-stats" aria-label="Résumé de l’Académie">${dashboardMetric("users",state.students.length,"Académiciens","students")}${dashboardMetric("clock",pending.length,"Demandes en attente","notifications")}${dashboardMetric("bell",unread,"Notifications non lues","notifications")}</section>
    <div class="dashboard-bottom"><section class="roster-panel"><div class="home-section-head"><div><span class="eyebrow">02 — L’équipe de demain</span><h2>Vos académiciens.</h2></div><button class="text-button" data-dashboard-view="students">Tout l’effectif ${uiIcon("arrow")}</button></div><div class="home-student-list">${recentStudents.map(homeStudentCard).join("")||emptyBlock("♙","Une équipe à construire","Les élèves apparaîtront ici après leur inscription.")}</div></section>${resourceLinks()}</div>`;
  document.querySelector("#quick-entry").onclick=()=>openStaffEntryModal();
  bindRequestButtons();bindStudentRows();bindDashboardActions();
}

function renderStudentSheet(id) {
  const s=student(id);
  if(!s){selectedStudent=null;return renderStudents();}
  const abs=state.absences.filter(x=>String(x.studentId)===String(s.id));
  const del=state.delays.filter(x=>String(x.studentId)===String(s.id));
  const monthly=state.monthlyObservations.filter(x=>String(x.studentId)===String(s.id)).sort((a,b)=>(b.date||b.month||"").localeCompare(a.date||a.month||""));
  const recent=[
    ...abs.map(item=>({kind:"Absence",icon:"○",date:item.date,text:item.reason||item.text||"Absence enregistrée",status:item.status||"Validée"})),
    ...del.map(item=>({kind:"Retard",icon:"◷",date:item.date,text:item.reason||item.text||"Retard enregistré",status:item.status||"Validée"})),
    ...monthly.map(item=>({kind:"Avertissement",icon:"✎",date:item.date||`${item.month}-01`,text:item.text||"Avertissement publié",status:"Publié"}))
  ].filter(item=>item.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  const group=(s.group||"Section non renseignée").replace("Section ","");
  const isEspoir=isEspoirStudent(s);
  const horse=s.horse||"Non renseigné";
  const birth=s.birthDate?dateFR(s.birthDate):"Non renseignée";
  app.innerHTML=`<div class="student-sheet-v2">
    <button class="student-sheet-back" id="back-to-students"><span aria-hidden="true">←</span> Toutes les fiches</button>
    <section class="student-sheet-identity">
      <div class="student-sheet-person">
        ${studentPortrait(s,"student-sheet-avatar")}
        <div class="student-sheet-name">
          <span class="student-sheet-group">${group}</span>
          <h1>${s.name}</h1>
          <div class="student-sheet-meta">
            <span><small>Date de naissance</small><strong>${birth}</strong></span>
            ${isEspoir?"":`<span><small>Cheval partenaire</small><strong>${horse}</strong></span>`}
          </div>
        </div>
      </div>
      <button class="primary-button student-sheet-add" id="sheet-entry"><span aria-hidden="true">＋</span> Ajouter au suivi</button>
    </section>

    <section class="student-sheet-kpis" aria-label="Résumé du suivi">
      <article><span aria-hidden="true">○</span><div><strong>${abs.length}</strong><small>Absence${abs.length>1?"s":""}</small></div></article>
      <article><span aria-hidden="true">◷</span><div><strong>${del.length}</strong><small>Retard${del.length>1?"s":""}</small></div></article>
      <article><span aria-hidden="true">✎</span><div><strong>${monthly.length}</strong><small>Avertissement${monthly.length>1?"s":""}</small></div></article>
    </section>

    <div class="student-sheet-layout ${isEspoir?"single":""}">
${isEspoir?"":`      <section class="student-sheet-panel">
        <div class="student-sheet-panel-head">
          <div><span class="eyebrow">Profil sportif</span><h2>Informations équestres</h2></div>
        </div>
        <div class="student-sheet-info-grid">
          <div><small>Cheval</small><strong>${horse}</strong></div>
          <div><small>Âge</small><strong>${s.horseAge?`${s.horseAge} ans`:"—"}</strong></div>
          <div><small>Taille</small><strong>${s.horseHeight?`${s.horseHeight} cm`:"—"}</strong></div>
          <div><small>Couple formé depuis</small><strong>${s.horsePartnership||"—"}</strong></div>
          <div class="student-sheet-info-wide"><small>Plus grande épreuve sautée ensemble</small><strong>${s.horseExperience||"—"}</strong></div>
        </div>
      </section>`}

      <section class="student-sheet-panel">
        <div class="student-sheet-panel-head">
          <div><span class="eyebrow">Chronologie</span><h2>Suivi récent</h2></div>
        </div>
        <div class="student-sheet-recent">
          ${recent.length?recent.map(item=>`<article class="student-sheet-event"><span class="student-sheet-event-icon" aria-hidden="true">${item.icon}</span><div><div><strong>${item.kind}</strong><small>${dateFR(item.date)}</small></div><p>${item.text}</p></div><span class="student-sheet-event-status ${item.status==="À vérifier"?"pending":item.status==="Refusée"?"rejected":""}">${item.status}</span></article>`).join(""):emptyBlock("✎","Aucun suivi pour le moment","Les prochaines informations apparaîtront ici.")}
        </div>
      </section>
    </div>
    <section class="student-sheet-panel warning-panel">
      <div class="student-sheet-panel-head">
        <div><span class="eyebrow">Discipline</span><h2>Avertissements <span class="count-pill">${monthly.length}</span></h2></div>
      </div>
      ${monthly.length?monthly.map(item=>`<article class="warning-item"><div><small>${dateFR(item.date||`${item.month}-01`)}</small><p>${esc(item.text)}</p></div><div class="warning-actions"><button class="ghost-button" data-edit-warning="${item.id}">Modifier</button><button class="ghost-button danger" data-delete-warning="${item.id}">Supprimer</button></div></article>`).join(""):`<p class="event-empty">Aucun avertissement pour ${esc(s.name.split(" ")[0])}.</p>`}
    </section>
  </div>`;
  document.querySelectorAll("[data-edit-warning]").forEach(b=>b.onclick=()=>openWarningModal(b.dataset.editWarning));
  document.querySelectorAll("[data-delete-warning]").forEach(b=>b.onclick=()=>removeWarning(b.dataset.deleteWarning));
  document.querySelector("#back-to-students").onclick=()=>{selectedStudent=null;currentView="students";render();};
  document.querySelector("#sheet-entry").onclick=()=>openStaffEntryModal(s.id);
}
function openWarningModal(id){
  const item=state.monthlyObservations.find(x=>x.id===id);if(!item)return;
  const s=student(item.studentId);
  document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Avertissement</span><h2 id="modal-title">Modifier l’avertissement</h2><p class="modal-intro">${esc(s?.name||"Élève")} et ses parents verront le texte modifié. Aucune nouvelle notification n’est envoyée.</p><form id="warning-form" class="form-grid"><div class="field"><label for="warning-date">Date</label><input id="warning-date" type="date" required value="${item.date||`${item.month}-01`}"></div><div class="field"><label for="warning-text">Texte</label><textarea id="warning-text" rows="6" required>${esc(item.text)}</textarea></div><div class="form-actions"><button type="button" class="ghost-button" id="cancel-warning">Annuler</button><button class="primary-button">Enregistrer</button></div></form>`;
  showModal();document.querySelector("#cancel-warning").onclick=closeModal;
  document.querySelector("#warning-form").onsubmit=async e=>{
    e.preventDefault();const submit=e.submitter;submit.disabled=true;submit.textContent="Enregistrement…";
    try{await updateWarning(id,{date:document.querySelector("#warning-date").value,text:document.querySelector("#warning-text").value.trim()});await refreshCloudState();closeModal();toast("Avertissement modifié");render();}
    catch(error){submit.disabled=false;submit.textContent="Enregistrer";toast(error.message||"Modification impossible");}
  };
}
async function removeWarning(id){
  const item=state.monthlyObservations.find(x=>x.id===id),s=item&&student(item.studentId);
  if(!item||!confirm(`Supprimer cet avertissement de ${s?.name||"l’élève"} ? Il disparaîtra aussi de son espace et de celui de ses parents.`))return;
  try{await deleteWarning(id);await refreshCloudState();toast("Avertissement supprimé");render();}catch(error){toast(error.message||"Suppression impossible");}
}
function openStaffEntryModal(preselect="") {
  if(!state.students.length)return toast("Aucun élève inscrit");
  document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Ajouter au suivi</span><h2 id="modal-title">Nouvelle saisie</h2><p class="modal-intro">Choisissez le type d’information et l’élève concerné.</p><form id="staff-entry-form" class="form-grid"><div class="field"><label for="entry-student">Élève</label><select id="entry-student">${state.students.map(s=>`<option value="${s.id}" ${String(preselect)===String(s.id)?'selected':''}>${s.name}</option>`).join("")}</select></div><div class="field"><label for="entry-type">Type</label><select id="entry-type"><option value="absence">Absence</option><option value="delay">Retard</option><option value="monthly">Avertissement</option></select></div><div class="field"><label for="entry-date">Date</label><input id="entry-date" type="date" value="${todayISO()}" required></div><div class="field"><label for="entry-text">Détails</label><textarea id="entry-text" required placeholder="Ajoutez une information claire et factuelle…"></textarea></div><div class="form-actions"><button type="button" class="ghost-button" id="cancel-entry">Annuler</button><button class="primary-button">Enregistrer</button></div></form>`;
  showModal();document.querySelector("#cancel-entry").onclick=closeModal;document.querySelector("#staff-entry-form").onsubmit=async e=>{e.preventDefault();const studentId=document.querySelector("#entry-student").value,type=document.querySelector("#entry-type").value,date=document.querySelector("#entry-date").value,text=document.querySelector("#entry-text").value.trim(),base={id:Date.now(),studentId,date,text,reason:text,author:currentUser.name,source:"staff",status:"Validée"};if(cloudConfigured){try{await createTrackingItem(type,{studentId,date,text});await refreshCloudState();closeModal();toast("Suivi mis à jour");return render();}catch(error){return toast(error.message||"Enregistrement impossible");}}if(type==="absence")state.absences.unshift(base);else if(type==="delay")state.delays.unshift(base);else state.monthlyObservations.unshift({...base,month:date.slice(0,7)});save();closeModal();toast("Suivi mis à jour");render();};
}
function readFileData(file) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);}); }
function renderAbsenceRequest() {
  const s=student(currentUser.studentId);app.innerHTML=heading("Prévenir l’équipe","Faire une demande","Absence ou retard : transmettez les informations au coach concerné.")+`<section class="form-surface request-card"><form id="absence-request-form" class="form-grid"><fieldset class="request-type-picker"><legend>Type de demande</legend><label><input type="radio" name="request-type" value="absence" checked><span>○</span><strong>Absence</strong></label><label><input type="radio" name="request-type" value="delay"><span>◷</span><strong>Retard</strong></label></fieldset><div class="field"><label for="request-coach">Coach destinataire</label><select id="request-coach" required><option value="">Choisir un coach</option>${STAFF.coach.map(name=>`<option value="${name}">${name}</option>`).join("")}</select><small class="field-help">L’administration recevra également la demande.</small></div><div class="field"><label for="request-date" id="request-date-label">Date de l’absence</label><div class="date-control"><span class="date-display" id="request-date-display">${dateFR(todayISO())}</span><input id="request-date" type="date" min="${todayISO()}" value="${todayISO()}" required aria-labelledby="request-date-label"></div></div><div class="field"><label for="request-reason">Motif</label><textarea id="request-reason" required placeholder="Expliquez brièvement la situation…"></textarea></div><div class="field file-field"><span>Justificatif</span><input id="request-file" type="file" accept="image/*,.pdf"><label class="file-picker" for="request-file">＋ Ajouter une photo ou un PDF</label><small class="file-name" id="request-file-name">Aucun document sélectionné</small><small class="file-help">Facultatif · 5 Mo maximum</small></div><button class="primary-button">Envoyer la demande</button></form></section>`;
  document.querySelectorAll('[name="request-type"]').forEach(input=>input.onchange=()=>{document.querySelector("#request-date-label").textContent=input.value==="delay"?"Date du retard":"Date de l’absence";});
  document.querySelector("#request-date").onchange=event=>{document.querySelector("#request-date-display").textContent=event.target.value?dateFR(event.target.value):"Choisir une date";};
  document.querySelector("#request-file").onchange=event=>{const file=event.target.files[0];document.querySelector("#request-file-name").textContent=file?file.name:"Aucun document sélectionné";};
  document.querySelector("#absence-request-form").onsubmit=async e=>{e.preventDefault();const submit=e.submitter,date=document.querySelector("#request-date").value,targetCoach=document.querySelector("#request-coach").value,reason=document.querySelector("#request-reason").value.trim(),requestType=document.querySelector('[name="request-type"]:checked').value,file=document.querySelector("#request-file").files[0];if(file&&file.size>5*1024*1024)return toast("Le justificatif doit faire moins de 5 Mo");const confirmed=await showActionConfirmation({eyebrow:"Avant l’envoi",title:`Confirmer la demande de ${requestType==="delay"?"retard":"absence"}`,message:`Votre demande sera transmise à ${targetCoach} ainsi qu’à l’administration.`,warning:requestType==="absence"?"Une demande d’absence entraîne, dans la quasi-totalité des cas, une absence au cours équestre avec votre cheval. Seule l’équipe peut accorder une exception.":"Un retard peut modifier votre participation au cours avec votre cheval. L’équipe précisera sa décision dans sa réponse.",confirmLabel:"Confirmer et envoyer"});if(!confirmed)return;submit.disabled=true;submit.textContent="Envoi…";try{if(cloudConfigured){await createAbsenceRequest({studentId:s.id,date,reason,file,userId:currentUser.userId,targetCoach,requestType});await refreshCloudState();toast(`Demande envoyée à ${targetCoach}`);currentView=requestType==="delay"?"delays":"absences";return render();}const requestId=Date.now(),documentData=file?await readFileData(file):null,item={id:requestId,studentId:s.id,date,createdAt:new Date().toISOString(),text:reason,reason,targetCoach,requestType,justification:file?.name||"Aucun justificatif",documentData,documentType:file?.type||null,author:s.name,source:"student",status:"À vérifier"};(requestType==="delay"?state.delays:state.absences).unshift(item);save();toast(`Demande envoyée à ${targetCoach}`);currentView=requestType==="delay"?"delays":"absences";render();}catch(error){submit.disabled=false;submit.textContent="Envoyer la demande";toast(error.message||"La demande n’a pas pu être enregistrée");}};
}
function reportCardItem(item){const s=student(item.studentId);return `<article class="report-card-item"><span class="report-card-icon" aria-hidden="true">▤</span><div><small>${item.schoolYear} · ${item.period}</small><strong>${item.title}</strong><p>${currentRole==="student"||currentRole==="parent"?"Document scolaire":s?.name||"Élève"} · ${item.fileName}</p></div><button class="open-report-card" data-report-card="${item.id}">Ouvrir</button></article>`;}
async function openReportCard(id){const item=state.reportCards.find(x=>x.id===id);if(!item)return toast("Bulletin introuvable");try{const url=await signedReportCardUrl(item.filePath);window.open(url,"_blank","noopener");}catch(error){toast(error.message||"Le bulletin ne peut pas être ouvert");}}
function openReportCardUpload(){
  if(currentRole!=="admin")return;
  document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Espace bulletins</span><h2 id="modal-title">Publier un bulletin</h2><p class="modal-intro">Le document sera visible par l’élève, ses parents et l’équipe.</p><form id="report-card-form" class="form-grid"><div class="field"><label for="report-student">Élève</label><select id="report-student" required>${state.students.map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select></div><div class="field"><label for="report-title">Titre du bulletin</label><input id="report-title" required placeholder="Bulletin du premier trimestre"></div><div class="form-split"><div class="field"><label for="report-year">Année scolaire</label><input id="report-year" required value="2026–2027" placeholder="2026–2027"></div><div class="field"><label for="report-period">Période</label><select id="report-period" required><option>Trimestre 1</option><option>Trimestre 2</option><option>Trimestre 3</option><option>Semestre 1</option><option>Semestre 2</option></select></div></div><div class="field file-field"><span>Document</span><input id="report-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required><label class="file-picker" for="report-file">＋ Choisir le bulletin</label><small class="file-name" id="report-file-name">PDF ou photo · 10 Mo maximum</small></div><div class="form-actions"><button type="button" class="ghost-button" id="cancel-report">Annuler</button><button class="primary-button">Publier le bulletin</button></div></form>`;
  showModal();document.querySelector("#cancel-report").onclick=closeModal;document.querySelector("#report-file").onchange=e=>{document.querySelector("#report-file-name").textContent=e.target.files[0]?.name||"PDF ou photo · 10 Mo maximum";};document.querySelector("#report-card-form").onsubmit=async e=>{e.preventDefault();const submit=e.submitter,file=document.querySelector("#report-file").files[0];if(file.size>10*1024*1024)return toast("Le bulletin doit faire moins de 10 Mo");submit.disabled=true;submit.textContent="Publication…";try{await uploadReportCard({studentId:document.querySelector("#report-student").value,title:document.querySelector("#report-title").value.trim(),schoolYear:document.querySelector("#report-year").value.trim(),period:document.querySelector("#report-period").value,file});await refreshCloudState();closeModal();toast("Bulletin publié et famille notifiée");render();}catch(error){submit.disabled=false;submit.textContent="Publier le bulletin";toast(error.message||"Publication impossible");}};
}
function renderReportCards(){
  const sid=scopedStudentId(),items=state.reportCards.filter(item=>!sid||String(item.studentId)===String(sid));
  app.innerHTML=heading("Documents scolaires","Bulletins",currentRole==="admin"?"Publiez et retrouvez les bulletins transmis par les établissements partenaires.":"Retrouvez ici tous les bulletins scolaires publiés par l’Académie.",currentRole==="admin"?`<button class="primary-button" id="upload-report-card">＋ Publier un bulletin</button>`:"")+`<section class="report-card-list">${items.map(reportCardItem).join("")||emptyBlock("▤","Aucun bulletin disponible",currentRole==="admin"?"Publiez le premier document pour un élève.":"Les bulletins apparaîtront ici dès leur publication.")}</section>`;
  document.querySelector("#upload-report-card")?.addEventListener("click",openReportCardUpload);document.querySelectorAll("[data-report-card]").forEach(button=>button.onclick=()=>openReportCard(button.dataset.reportCard));
}
function notificationItem(item){
  const category=item.kind==="absence_request"||item.kind==="absence_response"?"requests":"updates";
  const icon=item.kind==="absence_response"?(item.title.includes("accepté")?"✓":"!"):item.kind==="monthly"?"✎":item.kind==="delay"?"◷":item.kind==="event"?"♞":"◇";
  const label=category==="requests"?"Demande":"Suivi";
  const title=item.title.replace("Absence refusé","Absence refusée").replace("Absence accepté","Absence acceptée");
  return `<article class="inbox-event ${item.wasUnread?"is-new":""}" data-alert-category="${category}" data-alert-unread="${item.wasUnread}"><div class="inbox-event-rail"><span aria-hidden="true">${icon}</span></div><div class="inbox-event-body"><div class="inbox-event-meta"><span>${label}</span><time>${item.createdAt?dateFR(item.createdAt.slice(0,10)):dateFR(item.date)}</time></div><strong>${title}</strong><p>${item.text}</p>${item.kind==="event"?`<button class="inbox-event-action" data-open-event="${upcomingEvents()[0]?.id||""}">Voir le concours <span aria-hidden="true">→</span></button>`:""}${item.requestId?`<button class="view-request inbox-event-action" data-request="${item.requestId}">Voir le détail <span aria-hidden="true">→</span></button>`:""}</div></article>`;
}
function inboxDocumentItem(item){const s=student(item.studentId);return `<article class="inbox-event inbox-document" data-alert-category="documents" data-alert-unread="false"><div class="inbox-event-rail"><span aria-hidden="true">▤</span></div><div class="inbox-event-body"><div class="inbox-event-meta"><span>Document uploadé</span><time>${item.createdAt?dateFR(item.createdAt.slice(0,10)):""}</time></div><strong>${item.title}</strong><p>${item.schoolYear} · ${item.period}${familyRole()?"":` · ${s?.name||"Élève"}`}</p><button class="inbox-event-action open-report-card" data-report-card="${item.id}">Ouvrir le fichier <span aria-hidden="true">→</span></button></div></article>`;}
function alertFilters(){return `<div class="inbox-tabs" role="group" aria-label="Filtrer les alertes"><button class="active" data-alert-filter="all">Tout</button><button data-alert-filter="unread">Non lu</button><button data-alert-filter="requests">Demandes</button><button data-alert-filter="documents">Documents</button></div>`;}
function bindAlertFilters(){document.querySelectorAll("[data-alert-filter]").forEach(button=>button.onclick=()=>{document.querySelectorAll("[data-alert-filter]").forEach(item=>item.classList.toggle("active",item===button));const filter=button.dataset.alertFilter;let visible=0;document.querySelectorAll("[data-alert-category]").forEach(item=>{const show=filter==="all"||(filter==="unread"&&item.dataset.alertUnread==="true")||item.dataset.alertCategory===filter;item.hidden=!show;if(show)visible++;});document.querySelector("#filtered-alerts-empty")?.classList.toggle("hidden",visible>0);});}
function inboxRequestRow(item){const s=student(item.studentId),type=item.requestType==="delay"?"Retard":"Absence",tone=item.status==="À vérifier"?"pending":item.status==="Refusée"?"rejected":"approved";return `<button class="inbox-request-row view-request" data-request="${item.id}"><span class="inbox-request-date"><b>${new Date(`${item.date}T12:00:00`).getDate()}</b><small>${new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(new Date(`${item.date}T12:00:00`)).replace(".","")}</small></span><span class="inbox-request-copy"><small>${type}${!familyRole()?` · ${s?.name||"Élève"}`:""}</small><strong>${item.reason||"Aucun motif indiqué"}</strong></span><span class="inbox-request-status ${tone}">${item.status}</span><span class="inbox-request-arrow" aria-hidden="true">›</span></button>`;}
function familyRole(){return currentRole==="student"||currentRole==="parent";}
function renderNotifications(){
  const requests=studentRequests(),pending=requests.filter(r=>r.status==="À vérifier"),family=familyRole(),focus=family?requests[0]:pending[0],sid=scopedStudentId(),documents=state.reportCards.filter(item=>!sid||String(item.studentId)===String(sid));
  let notices=(state.notifications||[]).filter(n=>n.kind!=="report_card").map(n=>({...n,wasUnread:!n.read}));
  if(presentationMode&&family)notices=requests.filter(item=>item.status!=="À vérifier").map(item=>({id:`demo-${item.id}`,requestId:item.id,studentId:item.studentId,kind:"absence_response",title:`${item.requestType==="delay"?"Retard":"Absence"} ${item.status==="Validée"?"acceptée":"refusée"}`,text:`La demande du ${dateFR(item.date)} a été ${item.status==="Validée"?"acceptée":"refusée"}${item.reviewedBy?` par ${item.reviewedBy}`:" par l’équipe"}.${item.reviewComment?` Commentaire : ${item.reviewComment}`:""}`,date:item.reviewedAt||item.date,createdAt:item.reviewedAt||item.createdAt,wasUnread:false,read:true}));
  const unread=notices.filter(n=>n.wasUnread).length,streamCount=notices.length+documents.length;
  if(!presentationMode){state.notifications.forEach(n=>n.read=true);save();if(cloudConfigured)markNotificationsRead().catch(console.error);}
  const header=`<header class="inbox-header"><div><span class="eyebrow">${family?"Mon espace":"Équipe"}</span><h1>Boîte de réception</h1><p>${family?"Les nouvelles de votre suivi, sans rien manquer.":"Les demandes importantes, au même endroit."}</p></div>${unread?`<span class="inbox-unread"><b>${unread}</b> non ${unread>1?"lues":"lue"}</span>`:`<span class="inbox-clear">✓ À jour</span>`}</header>`;
  const focusBlock=focus?`<section class="inbox-focus"><div class="inbox-focus-top"><span>${family?"Dernière demande":"À traiter en priorité"}</span><span class="status ${focus.status==="À vérifier"?"watch":focus.status==="Refusée"?"alert":"good"}">${focus.status}</span></div><h2>${focus.requestType==="delay"?"Retard":"Absence"} du ${dateFR(focus.date)}</h2><p>${focus.reason||"Aucun motif indiqué"}</p>${focus.reviewComment?`<blockquote>« ${focus.reviewComment} »</blockquote>`:""}<button class="view-request" data-request="${focus.id}">${focus.status==="À vérifier"&&!family?"Examiner la demande":"Ouvrir la demande"}<span aria-hidden="true">→</span></button></section>`:`<section class="inbox-focus inbox-focus-clear"><span aria-hidden="true">✓</span><div><h2>Tout est à jour</h2><p>Aucune demande ne nécessite votre attention.</p></div></section>`;
  const stream=`<section class="inbox-content"><div class="inbox-content-title"><div><span class="eyebrow">Chronologie</span><h2>Activité récente</h2></div></div>${streamCount?alertFilters():""}<div class="inbox-stream">${notices.map(notificationItem).join("")}${documents.map(inboxDocumentItem).join("")}</div>${streamCount?`<div class="filtered-empty hidden" id="filtered-alerts-empty"><strong>Rien à afficher ici</strong><p>Choisissez un autre filtre.</p></div>`:emptyBlock("◇","Aucune actualité","Les prochaines informations apparaîtront ici.")}</section>`;
  const requestList=`<section class="inbox-requests"><div class="inbox-content-title"><div><span class="eyebrow">Historique</span><h2>${family?"Mes demandes":"Toutes les demandes"}</h2></div><span>${requests.length}</span></div><div>${requests.map(inboxRequestRow).join("")||emptyBlock("○","Aucune demande","Les demandes apparaîtront ici.")}</div></section>`;
  app.innerHTML=`<div class="inbox-page">${header}<div class="inbox-layout"><div>${focusBlock}${stream}</div><aside>${requestList}</aside></div></div>`;
  bindRequestButtons();bindAlertFilters();document.querySelectorAll("[data-report-card]").forEach(button=>button.onclick=()=>openReportCard(button.dataset.reportCard));renderNav();
}
function renderEntryPage() {
  const items=[["absence","calendar","Une absence","Enregistrer l’absence d’un élève."],["delay","clock","Un retard","Ajouter un retard à son suivi."],["monthly","note","Un avertissement","Rédiger un avertissement pour l’élève."]];
  app.innerHTML=heading("Au quotidien","Ajouter au suivi","Quelle information souhaitez-vous transmettre ?")+`<section class="entry-options">${items.map(([type,icon,title,text])=>`<button class="entry-option" data-entry-type="${type}"><span>${uiIcon(icon)}</span><h2>${title}</h2><p>${text}</p><b>Commencer ${uiIcon("arrow")}</b></button>`).join("")}</section><p class="entry-note">${uiIcon("users")} Chaque information rejoint la fiche de l’élève et reste accessible aux personnes autorisées.</p>`;
  app.querySelectorAll("[data-entry-type]").forEach(button=>button.onclick=()=>{openStaffEntryModal();const input=document.querySelector("#entry-type");if(input)input.value=button.dataset.entryType;});
}

// ---------- Concours ----------
let selectedEvent=null;
const EVENT_CLASS_SUGGESTIONS=["Club 4","Club 3","Club 2","Club 1","Club Elite","Prépa 90","Poney A2","Poney A1","Poney A Elite","Poney 4","Poney 3","Poney 2","Poney 1","Poney Elite","As Poney 2D"];
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function localISO(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
function isStaff(){return currentRole==="coach"||currentRole==="admin";}
function eventDay(date){const d=new Date(`${date}T12:00:00`);return {weekday:new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(d),day:d.getDate(),month:new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(d),long:new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(d)};}
function upcomingEvents(){return state.events.filter(e=>eventEndDate(e)>=localISO()).sort((a,b)=>a.date.localeCompare(b.date));}
function pastEvents(){return state.events.filter(e=>eventEndDate(e)<localISO()).sort((a,b)=>b.date.localeCompare(a.date));}
function eventEntries(eventId,sid=null){return state.eventEntries.filter(x=>x.eventId===eventId&&(!sid||String(x.studentId)===String(sid)));}
function bibLabel(entry){return entry.bib?`Dossard n° ${esc(entry.bib)}`:"Engagement terrain";}
function eventDateLabel(event){const start=eventDay(event.date).long;return event.endDate&&event.endDate!==event.date?`Du ${start} au ${eventDay(event.endDate).long}`:start.charAt(0).toUpperCase()+start.slice(1);}
function eventDateBlock(event,className=""){const d=eventDay(event.date);return `<span class="event-date ${className}" aria-hidden="true"><small>${d.weekday}</small><strong>${d.day}</strong><small>${d.month}</small></span>`;}

function eventCard(event){
  const sid=isStaff()?null:scopedStudentId(),mine=eventEntries(event.id,sid),past=eventEndDate(event)<localISO();
  const summary=isStaff()?`${eventEntries(event.id).length} engagement${eventEntries(event.id).length>1?"s":""}`:mine.length?mine.map(x=>esc(x.classLabel)).join(" · "):"Programme à venir";
  return `<button class="event-card ${past?"is-past":""}" data-open-event="${event.id}">${eventDateBlock(event)}<span class="event-card-body"><em>${past?"Terminé":eventCountdown(event.date,event.endDate)}</em><strong>${esc(event.title)}</strong><small>${event.endDate&&event.endDate!==event.date?`${esc(eventDateLabel(event))} · `:""}${event.location?`${esc(event.location)} · `:""}${summary}</small></span><b aria-hidden="true">→</b></button>`;
}

function eventHighlight(){
  const next=upcomingEvents()[0];
  if(!next)return "";
  const sid=isStaff()?null:scopedStudentId(),mine=eventEntries(next.id,sid),child=sid?student(sid):null,first=mine[0];
  const detail=isStaff()?`${eventEntries(next.id).length} engagement${eventEntries(next.id).length>1?"s":""} · ${state.eventDocuments.filter(d=>d.eventId===next.id).length} document(s)`:first?`${child&&currentRole==="parent"?`${esc(child.name.split(" ")[0])} · `:""}${esc(first.classLabel)}${first.ridingTime?` · à cheval ${esc(first.ridingTime)}`:""}${mine.length>1?` · +${mine.length-1} épreuve${mine.length>2?"s":""}`:""}`:"Horaires et programme disponibles";
  return `<button class="event-highlight" data-open-event="${next.id}">${eventDateBlock(next,"large")}<span><small>Prochain concours · ${eventCountdown(next.date,next.endDate)}</small><strong>${esc(next.title)}</strong><p>${detail}</p></span><b aria-hidden="true">→</b></button>`;
}

function renderEvents() {
  if(selectedEvent&&state.events.some(e=>e.id===selectedEvent))return renderEventDetail(selectedEvent);
  selectedEvent=null;
  const upcoming=upcomingEvents(),past=pastEvents();
  app.innerHTML=heading("Au rythme de la saison","En piste.",isStaff()?"Préparez les concours, partagez les horaires, accompagnez chaque cavalier.":"Vos prochains rendez-vous, les horaires et le programme de l’Académie.",isStaff()?`<button class="primary-button" id="new-event">${uiIcon("plus")} Nouveau concours</button>`:"")+
    `<div class="competition-stage">${dashboardEvent()}<section class="competition-agenda"><div class="home-section-head"><div><span class="eyebrow">LE CALENDRIER</span><h2>Les prochains départs.</h2></div><span class="count-pill">${upcoming.length}</span></div><div class="event-list">${upcoming.map(eventCard).join("")||emptyBlock("♞","La saison se prépare","Les prochains concours seront annoncés ici.")}</div></section></div>`+
    (past.length?`<details class="event-past"><summary>Les concours passés <span>${past.length}</span></summary><div class="event-list">${past.map(eventCard).join("")}</div></details>`:"");
  document.querySelector("#new-event")?.addEventListener("click",()=>openEventModal());
  bindDashboardActions();
}

function entryRow(entry,withStudent,highlight=false){
  const s=student(entry.studentId),name=entry.riderName||s?.name||"Élève";
  return `<article class="entry-row ${highlight?"is-mine":""}"><div class="entry-time"><small>À cheval</small><strong>${esc(entry.ridingTime||"—")}</strong></div><div class="entry-main">${withStudent?`<strong>${esc(name)}</strong>${highlight?`<em class="entry-mine">${currentRole==="parent"?"Votre enfant":"Vous"}</em>`:""}<small>${bibLabel(entry)}</small>`:`<strong>${esc(entry.classLabel)}</strong><small>${bibLabel(entry)}</small>`}</div>${isStaff()?`<div class="entry-actions"><button class="event-icon-btn" data-edit-entry="${entry.id}" aria-label="Modifier">✎</button><button class="event-icon-btn danger" data-delete-entry="${entry.id}" aria-label="Retirer">×</button></div>`:entry.bib?`<span class="entry-bib" aria-hidden="true">${esc(entry.bib)}</span>`:""}</article>`;
}

function renderEventDetail(id){
  const event=state.events.find(e=>e.id===id),d=eventDay(event.date),documents=state.eventDocuments.filter(x=>x.eventId===id);
  const sid=isStaff()?null:scopedStudentId(),child=sid?student(sid):null,mine=eventEntries(id,sid);
  let programme;
  if(isStaff()){
    const all=eventEntries(id),groups=[...new Set(all.map(x=>x.classLabel))];
    programme=`<section class="event-section"><div class="home-section-head"><div><span class="eyebrow">Programme</span><h2>Cavaliers engagés <span class="count-pill">${all.length}</span></h2></div><button class="primary-button" id="add-entry">＋ Ajouter</button></div>${groups.map(label=>`<div class="entry-group"><h3>${esc(label)}</h3>${all.filter(x=>x.classLabel===label).map(x=>entryRow(x,true)).join("")}</div>`).join("")||`<p class="event-empty">Ajoutez chaque cavalier avec son épreuve, son dossard et son heure à cheval. Ils verront uniquement leur propre programme.</p>`}</section>`;
  }else{
    const all=eventEntries(id),groups=[...new Set(all.map(x=>x.classLabel))],isMine=x=>sid&&String(x.studentId)===String(sid);
    programme=`<section class="event-section"><div class="home-section-head"><div><span class="eyebrow">Programme</span><h2>${currentRole==="parent"&&child?`Le programme de ${esc(child.name.split(" ")[0])}`:"Mon programme"}</h2></div></div>${mine.map(x=>entryRow(x,false)).join("")||`<p class="event-empty">Le programme n’est pas encore saisi. Il apparaîtra ici dès que l’équipe l’aura publié.</p>`}${mine.some(x=>!x.bib)?`<p class="event-hint">Engagement terrain : l’inscription se fait sur place, le coach vous donnera le dossard.</p>`:""}</section>`+
      (all.length?`<section class="event-section"><div class="home-section-head"><div><span class="eyebrow">Toute l’Académie</span><h2>Cavaliers engagés <span class="count-pill">${new Set(all.map(x=>x.studentId)).size}</span></h2></div></div>${groups.map(label=>`<div class="entry-group"><h3>${esc(label)}</h3>${all.filter(x=>x.classLabel===label).map(x=>entryRow(x,true,isMine(x))).join("")}</div>`).join("")}</section>`:"");
  }
  app.innerHTML=`<button class="back-link" id="events-back">← Tous les concours</button><section class="event-hero">${eventDateBlock(event,"large")}<div><span class="event-countdown">${eventCountdown(event.date,event.endDate)}</span><h1>${esc(event.title)}</h1><p>${esc(eventDateLabel(event))}${event.location?` · ${esc(event.location)}`:""}</p></div></section>`+
    (event.message?`<section class="event-message"><span class="eyebrow">Message de l’équipe</span><p>${esc(event.message).replace(/\n/g,"<br>")}</p></section>`:"")+
    programme+
    `<section class="event-section"><div class="home-section-head"><div><span class="eyebrow">Documents</span><h2>Horaires officiels</h2></div>${isStaff()?`<label class="ghost-button file-inline">＋ Ajouter<input id="add-event-docs" type="file" accept="image/*,application/pdf" multiple hidden></label>`:""}</div>${documents.length?`<div class="event-docs">${documents.map(doc=>`<div class="event-doc"><button data-open-doc="${doc.id}" aria-label="Ouvrir ${esc(doc.fileName)}">${doc.fileType.startsWith("image/")&&doc.url?`<img src="${doc.url}" alt="" loading="lazy">`:`<span class="event-doc-file">PDF</span>`}<small>${esc(doc.fileName)}</small></button>${isStaff()?`<button class="event-icon-btn danger" data-delete-doc="${doc.id}" aria-label="Supprimer le document">×</button>`:""}</div>`).join("")}</div><p class="event-hint">Horaires indicatifs, susceptibles d’évoluer pendant le concours.</p>`:`<p class="event-empty">Aucun document pour le moment.</p>`}</section>`+
    (isStaff()?`<div class="event-admin"><button class="ghost-button" id="edit-event">Modifier le concours</button><button class="ghost-button danger" id="delete-event">Supprimer</button></div>`:"");
  document.querySelector("#events-back").onclick=()=>{selectedEvent=null;render();};
  document.querySelectorAll("[data-open-doc]").forEach(b=>b.onclick=()=>openEventDocument(b.dataset.openDoc));
  if(!isStaff())return;
  document.querySelector("#add-entry").onclick=()=>openEntryModal(id);
  document.querySelectorAll("[data-edit-entry]").forEach(b=>b.onclick=()=>openEntryModal(id,b.dataset.editEntry));
  document.querySelectorAll("[data-delete-entry]").forEach(b=>b.onclick=()=>runEventAction(()=>deleteEventEntry(b.dataset.deleteEntry),"Cavalier retiré du programme","Retirer ce cavalier du programme ?"));
  document.querySelectorAll("[data-delete-doc]").forEach(b=>{const doc=documents.find(x=>x.id===b.dataset.deleteDoc);b.onclick=()=>runEventAction(()=>deleteEventDocument(doc.id,doc.filePath),"Document supprimé","Supprimer ce document ?");});
  document.querySelector("#add-event-docs").onchange=e=>{const files=[...e.target.files];if(files.length)runEventAction(async()=>{for(const file of files)await uploadEventDocument(id,file);},`${files.length} document${files.length>1?"s":""} ajouté${files.length>1?"s":""}`);};
  document.querySelector("#edit-event").onclick=()=>openEventModal(id);
  document.querySelector("#delete-event").onclick=()=>runEventAction(async()=>{await deleteEvent(id);selectedEvent=null;},"Concours supprimé","Supprimer ce concours, son programme et ses documents ?");
}

async function runEventAction(action,success,confirmText=null){
  if(confirmText&&!confirm(confirmText))return;
  try{await action();await refreshCloudState();toast(success);render();}catch(error){toast(error.message||"Action impossible");}
}

function openEventDocument(id){
  const doc=state.eventDocuments.find(x=>x.id===id);
  if(!doc?.url)return toast("Document indisponible, rechargez la page");
  if(!doc.fileType.startsWith("image/"))return window.open(doc.url,"_blank","noopener");
  document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Horaires officiels</span><h2 id="modal-title">${esc(doc.fileName)}</h2><img class="event-doc-full" src="${doc.url}" alt="${esc(doc.fileName)}"><div class="form-actions"><a class="ghost-button" href="${doc.url}" target="_blank" rel="noopener">Ouvrir en plein écran</a><button class="primary-button" id="close-doc">Fermer</button></div>`;
  showModal();document.querySelector("#close-doc").onclick=closeModal;
}

function openEventModal(id=null){
  const event=id?state.events.find(e=>e.id===id):null;
  document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Concours</span><h2 id="modal-title">${event?"Modifier le concours":"Nouveau concours"}</h2><p class="modal-intro">${event?"Les familles verront les changements immédiatement.":"Les parents, élèves, coachs et administrateurs seront prévenus par notification."}</p><form id="event-form" class="form-grid"><div class="field"><label for="event-title">Nom du concours</label><input id="event-title" required placeholder="Concours Club Ponam" value="${esc(event?.title)}"></div><div class="form-split"><div class="field"><label for="event-date">Date de début</label><input id="event-date" type="date" required value="${event?.date||""}"></div><div class="field"><label for="event-end-date">Date de fin <span class="optional">(facultatif)</span></label><input id="event-end-date" type="date" min="${event?.date||""}" value="${event?.endDate||""}"></div></div><div class="field"><label for="event-location">Lieu</label><input id="event-location" placeholder="Ponam" value="${esc(event?.location)}"></div><div class="field"><label for="event-message">Message aux familles <span class="optional">(facultatif)</span></label><textarea id="event-message" rows="4" placeholder="Les cavaliers sans dossard sont en engagement terrain, Camille vous dira tout.">${esc(event?.message)}</textarea></div>${event?"":`<div class="field file-field"><span>Horaires officiels <span class="optional">(facultatif)</span></span><input id="event-files" type="file" accept="image/*,application/pdf" multiple><label class="file-picker" for="event-files">＋ Ajouter photos ou PDF</label><small class="file-name" id="event-files-name">Photos des affiches d’horaires, PDF…</small></div>`}<div class="form-actions"><button type="button" class="ghost-button" id="cancel-event">Annuler</button><button class="primary-button">${event?"Enregistrer":"Publier le concours"}</button></div></form>`;
  showModal();document.querySelector("#cancel-event").onclick=closeModal;
  document.querySelector("#event-date").onchange=e=>{document.querySelector("#event-end-date").min=e.target.value;};
  document.querySelector("#event-files")?.addEventListener("change",e=>{const n=e.target.files.length;document.querySelector("#event-files-name").textContent=n?`${n} fichier${n>1?"s":""} sélectionné${n>1?"s":""}`:"Photos des affiches d’horaires, PDF…";});
  document.querySelector("#event-form").onsubmit=async e=>{
    e.preventDefault();const submit=e.submitter;submit.disabled=true;submit.textContent="Enregistrement…";
    try{
      const savedId=await saveEvent({id,title:document.querySelector("#event-title").value.trim(),date:document.querySelector("#event-date").value,endDate:document.querySelector("#event-end-date").value,location:document.querySelector("#event-location").value.trim(),message:document.querySelector("#event-message").value.trim()});
      for(const file of document.querySelector("#event-files")?.files||[])await uploadEventDocument(savedId,file);
      await refreshCloudState();closeModal();selectedEvent=savedId;currentView="events";toast(event?"Concours mis à jour":"Concours publié, tous les profils prévenus");render();
    }catch(error){submit.disabled=false;submit.textContent=event?"Enregistrer":"Publier le concours";toast(error.message||"Enregistrement impossible");}
  };
}

function openEntryModal(eventId,entryId=null,keep={}){
  const entry=entryId?state.eventEntries.find(x=>x.id===entryId):null,labels=[...new Set([...eventEntries(eventId).map(x=>x.classLabel),...EVENT_CLASS_SUGGESTIONS])];
  const value=entry||keep;
  document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Programme</span><h2 id="modal-title">${entry?"Modifier l’engagement":"Ajouter un cavalier"}</h2><p class="modal-intro">Seuls le cavalier et ses parents verront cette ligne.</p><form id="entry-form" class="form-grid"><div class="field"><label for="entry-student">Élève</label><select id="entry-student" required><option value="">Choisir un élève</option>${[...state.students].sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${s.id}" ${String(value.studentId)===String(s.id)?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div><div class="field"><label for="entry-class">Épreuve</label><input id="entry-class" required list="entry-class-list" placeholder="Club 3" value="${esc(value.classLabel)}"><datalist id="entry-class-list">${labels.map(l=>`<option value="${esc(l)}">`).join("")}</datalist></div><div class="form-split"><div class="field"><label for="entry-bib">Dossard</label><input id="entry-bib" inputmode="numeric" placeholder="Vide = terrain" value="${esc(entry?.bib)}"></div><div class="field"><label for="entry-time">À cheval</label><input id="entry-time" placeholder="07h45" value="${esc(value.ridingTime)}"></div></div><div class="form-actions"><button type="button" class="ghost-button" id="${entry?"cancel-entry":"save-entry-next"}">${entry?"Annuler":"Enregistrer + suivant"}</button><button class="primary-button">Enregistrer</button></div></form>`;
  showModal();
  const read=()=>({id:entryId,eventId,studentId:document.querySelector("#entry-student").value,classLabel:document.querySelector("#entry-class").value.trim(),bib:document.querySelector("#entry-bib").value.trim(),ridingTime:document.querySelector("#entry-time").value.trim(),sortOrder:entry?.sortOrder??eventEntries(eventId).length});
  const save=async(next)=>{const form=document.querySelector("#entry-form");if(!form.reportValidity())return;const data=read();try{await saveEventEntry(data);await refreshCloudState();render();if(next){openEntryModal(eventId,null,{classLabel:data.classLabel,ridingTime:data.ridingTime});toast(`${student(data.studentId)?.name||"Cavalier"} ajouté`);}else{closeModal();toast("Programme enregistré");}}catch(error){toast(error.message||"Enregistrement impossible");}};
  document.querySelector("#entry-form").onsubmit=e=>{e.preventDefault();save(false);};
  if(entry)document.querySelector("#cancel-entry").onclick=closeModal;else document.querySelector("#save-entry-next").onclick=()=>save(true);
}

app.addEventListener("click",e=>{const target=e.target.closest("[data-open-event]");if(!target)return;selectedEvent=target.dataset.openEvent;currentView="events";closeModal();render();window.scrollTo({top:0});});

function render() { if(!currentUser)return renderAuthLanding(); document.body.classList.remove("auth-active"); authScreen.classList.add("hidden"); document.querySelector(".app-shell").inert=false; setProfile();renderNav(); if(selectedStudent&&(currentRole==="coach"||currentRole==="admin"))renderStudentSheet(selectedStudent);else if(currentView==="dashboard"&&(currentRole==="coach"||currentRole==="admin"))renderStaffHome();else if(currentView==="dashboard")renderSimpleDashboard();else if(currentView==="tracking"&&(currentRole==="student"||currentRole==="parent"))renderTrackingHub();else if(currentView==="students"&&(currentRole==="admin"||currentRole==="coach"))renderStudents();else if(currentView==="entry"&&(currentRole==="admin"||currentRole==="coach"))renderEntryPage();else if(currentView==="events")renderEvents();else if(currentView==="reportCards")renderReportCards();else if(currentView==="notifications")renderNotifications();else if(currentView==="request"&&currentRole==="student")renderAbsenceRequest();else if(["absences","delays","monthly"].includes(currentView))renderTrackingSection(currentView);else renderSimpleDashboard();renderNav();renderPresentationDock();enhanceIcons(app);app.querySelectorAll("[data-tracking-tab]").forEach(button=>button.onclick=()=>navigate(button.dataset.trackingTab)); }

document.querySelector("#role-switch-button").onclick=openAccountModal;
document.querySelector("#modal-close").onclick=closeModal;
modal.onclick=event=>{if(event.target===modal)closeModal();};
document.querySelector("#global-search").oninput=event=>{
  if(!isStaff())return;
  const value=event.target.value;
  if(!value.trim()&&currentView!=="students")return;
  currentView="students";selectedStudent=null;selectedEvent=null;render();
  const field=document.querySelector(currentRole==="coach"?"#coach-student-search":"#student-search-input");
  if(field){field.value=value;field.dispatchEvent(new Event("input",{bubbles:true}));}
};
document.querySelector("#notifications-button").onclick=()=>navigate("notifications");
document.querySelector("#help-button").onclick=()=>{navigate("dashboard");startTour();};
document.querySelector(".brand").onclick=event=>{event.preventDefault();navigate("dashboard");};
document.querySelectorAll("[data-ui-icon]").forEach(el=>el.innerHTML=uiIcon(el.dataset.uiIcon));
document.querySelector("#tour-next").onclick=()=>{tourIndex++;showTourStep();};
document.querySelector("#tour-skip").onclick=()=>closeTour(true);
addEventListener("resize",()=>{if(!document.querySelector("#tour-layer").classList.contains("hidden"))showTourStep();});
function renderForgotPassword(email,back){
  authScreen.innerHTML=`<div class="auth-wrap"><button class="auth-back" id="auth-back">← Retour</button><section class="signup-card"><div class="auth-heading"><span class="eyebrow">Mot de passe oublié</span><h1>Réinitialiser</h1><p>Indiquez l’adresse e-mail du compte. Un lien pour choisir un nouveau mot de passe y sera envoyé.</p></div><form id="forgot-form" class="form-grid"><div class="field"><label for="forgot-email">Adresse e-mail</label><input id="forgot-email" type="email" required autocomplete="email"></div><button class="primary-button">Envoyer le lien</button></form></section></div>`;
  document.querySelector("#forgot-email").value=email||"";
  document.querySelector("#auth-back").onclick=back;
  document.querySelector("#forgot-form").onsubmit=async event=>{
    event.preventDefault();
    const submit=event.submitter;submit.disabled=true;submit.textContent="Envoi…";
    try{
      await requestPasswordReset(document.querySelector("#forgot-email").value.trim().toLowerCase());
      toast("Si un compte existe pour cette adresse, un e-mail vient d’être envoyé.");
      back();
    }catch(error){
      toast(error.message||"Envoi impossible");
      submit.disabled=false;submit.textContent="Envoyer le lien";
    }
  };
}
function renderNewPassword(){
  document.body.classList.add("auth-active");authScreen.classList.remove("hidden");
  authScreen.innerHTML=`<div class="auth-wrap"><section class="signup-card"><div class="auth-heading"><span class="eyebrow">Mot de passe oublié</span><h1>Nouveau mot de passe</h1><p>Choisissez votre nouveau mot de passe.</p></div><form id="new-password-form" class="form-grid"><div class="field"><label for="new-password">Nouveau mot de passe</label><input id="new-password" type="password" minlength="6" required autocomplete="new-password" placeholder="6 caractères minimum"></div><div class="field"><label for="new-password-confirm">Confirmer le mot de passe</label><input id="new-password-confirm" type="password" minlength="6" required autocomplete="new-password"></div><button class="primary-button">Enregistrer</button></form></section></div>`;
  document.querySelector("#new-password-form").onsubmit=async event=>{
    event.preventDefault();
    const submit=event.submitter,password=document.querySelector("#new-password").value;
    if(password!==document.querySelector("#new-password-confirm").value)return toast("Les deux mots de passe ne correspondent pas");
    submit.disabled=true;submit.textContent="Enregistrement…";
    try{
      await updatePassword(password);
      await signOutCloud();
      toast("Mot de passe modifié. Vous pouvez vous connecter.");
      renderAuthHome();
    }catch(error){
      toast(error.message||"Modification impossible");
      submit.disabled=false;submit.textContent="Enregistrer";
    }
  };
}
async function startPasswordRecovery(){
  const {data:{session}}=await supabase.auth.getSession();
  history.replaceState(null,"",window.location.pathname);
  clearPersistentSession();currentUser=null;currentRole=null;
  if(session)return renderNewPassword();
  await signOutCloud();
  renderAuthHome();
  toast("Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.");
}
async function boot(){if(cloudConfigured&&passwordRecoveryRequested){await registerAppServiceWorker().catch(console.error);return startPasswordRecovery();}await registerAppServiceWorker().catch(console.error);if(cloudConfigured){try{const account=await currentCloudAccount();if(account){await refreshCloudState();const role=account.profile.role,pupil=role==="student"?state.students.find(s=>s.userId===account.profile.id):null,parentChild=role==="parent"?state.students.find(s=>String(s.id)===String(currentUser?.studentId))||state.students[0]:null;currentUser={name:account.profile.full_name,role,initials:initials(account.profile.full_name),studentId:pupil?.id||parentChild?.id||null,userId:account.profile.id};currentRole=role;persistSession(currentUser);}else{currentUser=null;currentRole=null;clearPersistentSession();}}catch(error){console.error("Supabase initialization",error);currentUser=null;currentRole=null;}}render();if(currentUser){startRealtimeNotifications();setTimeout(()=>maybeStartTour(),600);}}
await boot();
