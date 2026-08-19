const seed = {
  students: [
    { id: 1, name: "Léa Morel", initials: "LM", group: "Section Excellence", horse: "Orphée", incidents: 0 },
    { id: 2, name: "Jules Bernard", initials: "JB", group: "Section Espoir", horse: "Voltige", incidents: 2 },
    { id: 3, name: "Inès Leroy", initials: "IL", group: "Section Excellence", horse: "Nashville", incidents: 3 },
    { id: 4, name: "Noah Petit", initials: "NP", group: "Section Espoir", horse: "Caramel", incidents: 1 },
    { id: 5, name: "Emma Roux", initials: "ER", group: "Section Excellence", horse: "Quito", incidents: 0 },
    { id: 6, name: "Louis Garnier", initials: "LG", group: "Section Espoir", horse: "Sirocco", incidents: 1 }
  ],
  observations: [
    { id: 1, studentId: 3, type: "Retard", date: "2026-08-18", text: "Arrivée avec 25 minutes de retard à la séance de travail sur le plat.", coach: "Camille Martin", incident: true },
    { id: 2, studentId: 2, type: "Comportement", date: "2026-08-17", text: "Matériel laissé sans rangement après la séance.", coach: "Marc Duval", incident: true },
    { id: 3, studentId: 1, type: "Progrès", date: "2026-08-16", text: "Très bonne régularité dans les abords et belle attitude avec Orphée.", coach: "Camille Martin", incident: false },
    { id: 4, studentId: 3, type: "Absence", date: "2026-08-14", text: "Absence non justifiée à la préparation physique.", coach: "Marc Duval", incident: true },
    { id: 5, studentId: 3, type: "Comportement", date: "2026-08-11", text: "Consignes de sécurité non respectées dans l'écurie.", coach: "Camille Martin", incident: true },
    { id: 6, studentId: 2, type: "Retard", date: "2026-08-09", text: "Retard de 15 minutes au pansage.", coach: "Camille Martin", incident: true }
  ],
  sanctions: [
    { id: 1, studentId: 3, status: "À valider", title: "Suspension d'une épreuve", reason: "Seuil de 3 incidents actifs atteint" }
  ]
};

const profiles = {
  coach: { name: "Camille Martin", role: "Coach", initials: "CM", studentId: null },
  child: { name: "Inès Leroy", role: "Élève", initials: "IL", studentId: 3 },
  parent: { name: "Sophie Leroy", role: "Parent d’Inès", initials: "SL", studentId: 3 }
};

let state = JSON.parse(localStorage.getItem("delaveau-state")) || structuredClone(seed);
let currentRole = localStorage.getItem("delaveau-role") || "coach";
let currentView = "dashboard";
let selectedStudent = null;

const app = document.querySelector("#app");
const nav = document.querySelector("#main-nav");
const modal = document.querySelector("#modal-backdrop");

const icons = { dashboard: "⌂", students: "♙", observations: "✎", attendance: "◷", sanctions: "⚑", messages: "◇" };
const coachNav = [["dashboard","Tableau de bord"],["students","Académiciens"],["observations","Observations"],["attendance","Présences"],["sanctions","Sanctions"],["messages","Messagerie"]];
const familyNav = [["dashboard","Mon suivi"],["observations","Observations"],["attendance","Présences"],["sanctions","Décisions"],["messages","Messagerie"]];

function save() { localStorage.setItem("delaveau-state", JSON.stringify(state)); }
function student(id) { return state.students.find(s => s.id === Number(id)); }
function initials(name) { return name.split(" ").map(x => x[0]).join("").slice(0,2).toUpperCase(); }
function dateFR(date) { return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date + "T12:00:00")); }
function statusFor(count) { return count >= 3 ? ["alert","Action requise"] : count > 0 ? ["watch","À surveiller"] : ["good","À jour"]; }
function toast(message) { const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2600); }

function setProfile() {
  const p = profiles[currentRole];
  document.querySelector("#profile-name").textContent = p.name;
  document.querySelector("#profile-role").textContent = p.role;
  document.querySelector("#profile-avatar").textContent = p.initials;
}

function renderNav() {
  const items = currentRole === "coach" ? coachNav : familyNav;
  nav.innerHTML = `<div class="nav-label">Espace ${profiles[currentRole].role}</div>` + items.map(([id,label]) =>
    `<button class="nav-item ${currentView === id ? "active" : ""}" data-view="${id}"><span class="nav-icon">${icons[id]}</span>${label}</button>`
  ).join("");
  nav.querySelectorAll("[data-view]").forEach(btn => btn.onclick = () => { currentView = btn.dataset.view; selectedStudent = null; render(); });
}

function statCard(label, value, note, accent="#c49a52") {
  return `<article class="card stat-card" style="--accent:${accent}"><div class="stat-top"><span>${label}</span><span>↗</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`;
}

function studentRow(s) {
  const [cls,label] = statusFor(s.incidents);
  return `<article class="student-row" data-student="${s.id}">
    <div class="student-main"><span class="avatar">${s.initials}</span><span><strong>${s.name}</strong><small>${s.group}</small></span></div>
    <div><span class="cell-label">Cheval</span><strong>${s.horse}</strong></div>
    <div><span class="cell-label">Incidents actifs</span><div class="incident-count" aria-label="${s.incidents} incident(s)">${[0,1,2].map(i=>`<i class="${i<s.incidents?'on':''}"></i>`).join("")}</div></div>
    <div style="display:flex;align-items:center;gap:8px"><span class="status ${cls}">${label}</span><button class="row-action" aria-label="Voir ${s.name}">›</button></div>
  </article>`;
}

function heading(kicker, title, subtitle, action="") {
  return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function renderCoachDashboard() {
  const incidentTotal = state.students.reduce((n,s)=>n+s.incidents,0);
  const alerts = state.students.filter(s=>s.incidents>=3).length;
  const recent = [...state.observations].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  app.innerHTML = heading("Mardi 18 août 2026", "Bonjour Camille", "Voici l’essentiel de la vie de l’Académie aujourd’hui.", `<button class="primary-button" id="add-observation">+ Nouvelle observation</button>`)
    + `<section class="grid stats">${statCard("Académiciens",state.students.length,"2 sections actives","#4f7d60")}${statCard("Incidents actifs",incidentTotal,"sur les 30 derniers jours","#b74d47")}${statCard("Alertes au seuil",alerts,"validation d’un coach requise","#c77d32")}${statCard("Présence aujourd’hui","92%","1 absence · 2 retards","#6f8aa1")}</section>
    <section class="grid dashboard-grid">
      <article class="card section-card"><div class="section-head"><div><span class="eyebrow">Suivi</span><h2>Académiciens à surveiller</h2></div><a href="#" data-goto="students">Voir tous</a></div><div class="student-list">${state.students.filter(s=>s.incidents>0).sort((a,b)=>b.incidents-a.incidents).map(studentRow).join("")}</div></article>
      <article class="card section-card"><div class="section-head"><div><span class="eyebrow">Activité</span><h2>Dernières notes</h2></div></div><div class="timeline">${recent.map(o=>{const s=student(o.studentId);return `<div class="timeline-item"><span class="timeline-icon">${o.incident?'!':'✓'}</span><div><strong>${s.name}</strong><p>${o.type} · ${o.text}</p><small>${dateFR(o.date)} · ${o.coach}</small></div></div>`}).join("")}</div></article>
    </section>`;
  document.querySelector("#add-observation").onclick = openObservationModal;
  bindStudentRows();
  const all = document.querySelector("[data-goto]"); if(all) all.onclick=e=>{e.preventDefault();currentView="students";render();};
}

function renderStudents() {
  app.innerHTML = heading("Effectif 2026–2027", "Les académiciens", "Une vue globale de la progression et de la vie collective.", `<button class="primary-button" id="add-observation">+ Nouvelle observation</button>`)
    + `<div class="filters"><button class="filter active">Tous · ${state.students.length}</button><button class="filter">Excellence</button><button class="filter">Espoir</button><button class="filter">Alertes · ${state.students.filter(s=>s.incidents>=3).length}</button></div>
      <section class="card section-card"><div class="student-list" id="all-students">${state.students.map(studentRow).join("")}</div></section>`;
  document.querySelector("#add-observation").onclick = openObservationModal;
  bindStudentRows();
  document.querySelectorAll(".filter").forEach(btn => btn.onclick = () => {
    document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active")); btn.classList.add("active");
    const term=btn.textContent; const list=term.startsWith("Tous")?state.students:term.startsWith("Alertes")?state.students.filter(s=>s.incidents>=3):state.students.filter(s=>s.group.includes(term));
    document.querySelector("#all-students").innerHTML=list.map(studentRow).join(""); bindStudentRows();
  });
}

function renderStudentDetail(id, family=false) {
  const s=student(id), obs=state.observations.filter(o=>o.studentId===s.id).sort((a,b)=>b.date.localeCompare(a.date)), sanction=state.sanctions.find(x=>x.studentId===s.id);
  app.innerHTML = `${family ? heading(currentRole==="parent"?"Espace parent":"Mon espace", s.name, "Un suivi partagé, factuel et transparent.") : `<button class="ghost-button" id="back">← Retour aux académiciens</button><br><br>`}
    <section class="card detail-hero"><div class="detail-person"><span class="avatar">${s.initials}</span><div><h2>${s.name}</h2><p>${s.group} · Cheval : ${s.horse}</p><span class="status ${statusFor(s.incidents)[0]}">${statusFor(s.incidents)[1]}</span></div></div><div style="display:flex;align-items:center;gap:12px"><div><strong>Seuil d’incidents</strong><small style="display:block;color:var(--muted)">Remise à zéro après décision</small></div><div class="progress-ring" style="--progress:${Math.min(100,s.incidents/3*100)}"><strong>${s.incidents}/3</strong></div></div></section>
    ${sanction ? `<div class="sanction-banner"><strong>⚑ ${sanction.title} — ${sanction.status}</strong><p>${sanction.reason}. La décision doit être expliquée et confirmée par un coach.</p>${currentRole==='coach'&&sanction.status==='À valider'?`<button class="primary-button" id="validate-sanction">Valider la décision</button>`:""}</div>`:""}
    <section class="grid two-cols"><article class="card section-card"><div class="section-head"><h2>Journal de suivi</h2>${currentRole==='coach'?`<button class="primary-button" id="add-observation">+ Ajouter</button>`:""}</div>${obs.length?obs.map(o=>`<div class="observation"><div class="observation-head"><strong>${o.type}</strong><span class="status ${o.incident?'alert':'good'}">${o.incident?'Incident':'Positif'}</span></div><p>${o.text}</p><small>${dateFR(o.date)} · ${o.coach}</small></div>`).join(""):`<div class="empty">Aucune observation pour le moment.</div>`}</article>
    <article class="card section-card"><div class="section-head"><h2>Présence ce mois</h2></div>${statCard("Taux de présence","94%","1 absence · 2 retards","#4f7d60")}<div style="margin-top:20px"><h2 style="font-size:18px">Règle de suivi</h2><p style="color:var(--muted);line-height:1.6;font-size:14px">À trois incidents actifs, l’application propose une mesure éducative. Le coach examine le contexte, échange avec l’élève et informe le responsable légal avant validation.</p></div></article></section>`;
  if(document.querySelector("#back")) document.querySelector("#back").onclick=()=>{selectedStudent=null;currentView="students";render();};
  if(document.querySelector("#add-observation")) document.querySelector("#add-observation").onclick=()=>openObservationModal(s.id);
  if(document.querySelector("#validate-sanction")) document.querySelector("#validate-sanction").onclick=()=>{sanction.status="Validée";save();toast("Décision validée et visible par la famille");render();};
}

function renderGeneric(type) {
  const content = {
    observations: ["Observations", "Toutes les notes pédagogiques et sportives.", state.observations.map(o=>{const s=student(o.studentId);return `<div class="observation"><div class="observation-head"><strong>${s.name} · ${o.type}</strong><span class="status ${o.incident?'alert':'good'}">${o.incident?'Incident':'Positif'}</span></div><p>${o.text}</p><small>${dateFR(o.date)} · ${o.coach}</small></div>`}).join("")],
    attendance: ["Présences", "Absences et retards signalés par l’équipe.", `<div class="student-list">${state.students.map(s=>`<div class="student-row"><div class="student-main"><span class="avatar">${s.initials}</span><strong>${s.name}</strong></div><div><span class="cell-label">Présence</span><strong>${s.id===3?'Retard':'Présent'}</strong></div><div><span class="cell-label">Arrivée</span><strong>${s.id===3?'09:25':'08:55'}</strong></div><span class="status ${s.id===3?'watch':'good'}">${s.id===3?'À justifier':'À l’heure'}</span></div>`).join("")}</div>`],
    sanctions: ["Décisions éducatives", "Les mesures sont proposées automatiquement, mais toujours validées humainement.", state.sanctions.length?state.sanctions.map(x=>{const s=student(x.studentId);return `<div class="sanction-banner"><strong>${s.name} · ${x.title}</strong><p>${x.reason}</p><span class="status ${x.status==='Validée'?'good':'watch'}">${x.status}</span></div>`}).join(""):`<div class="empty">Aucune décision en cours.</div>`],
    messages: ["Messagerie", "Un canal simple entre l’équipe, les élèves et les familles.", `<div class="empty"><div style="font-size:34px">◇</div><h2>Aucun nouveau message</h2><p>Les échanges liés à une observation apparaîtront ici.</p><button class="primary-button">Écrire un message</button></div>`]
  }[type];
  app.innerHTML = heading("Académie Delaveau", content[0], content[1], currentRole==='coach'&&type==='observations'?`<button class="primary-button" id="add-observation">+ Nouvelle observation</button>`:"") + `<section class="card section-card">${content[2]}</section>`;
  if(document.querySelector("#add-observation")) document.querySelector("#add-observation").onclick=openObservationModal;
}

function openObservationModal(preselect="") {
  document.querySelector("#modal-content").innerHTML = `<span class="eyebrow">Journal de suivi</span><h2 id="modal-title">Nouvelle observation</h2><p class="modal-intro">Rédigez une note factuelle. Elle sera visible selon les droits du profil.</p>
    <form id="observation-form" class="form-grid"><div class="field"><label for="student">Académicien</label><select id="student" required>${state.students.map(s=>`<option value="${s.id}" ${s.id===preselect?'selected':''}>${s.name}</option>`).join("")}</select></div>
    <div class="field"><label for="type">Type</label><select id="type"><option>Progrès</option><option>Comportement</option><option>Retard</option><option>Absence</option><option>Travail</option><option>Santé</option></select></div>
    <div class="field"><label for="note">Observation</label><textarea id="note" required placeholder="Décrivez les faits, sans jugement…"></textarea></div>
    <label class="checkbox"><input id="incident" type="checkbox"> <span>Compter comme incident actif. Au troisième incident, une mesure éducative sera proposée au coach.</span></label>
    <div class="form-actions"><button type="button" class="ghost-button" id="cancel-modal">Annuler</button><button class="primary-button">Enregistrer</button></div></form>`;
  modal.classList.remove("hidden");
  document.querySelector("#cancel-modal").onclick=closeModal;
  document.querySelector("#observation-form").onsubmit=e=>{
    e.preventDefault(); const sid=Number(document.querySelector("#student").value), isIncident=document.querySelector("#incident").checked;
    state.observations.unshift({id:Date.now(),studentId:sid,type:document.querySelector("#type").value,date:"2026-08-18",text:document.querySelector("#note").value.trim(),coach:profiles[currentRole].name,incident:isIncident});
    if(isIncident){ const s=student(sid); s.incidents++; if(s.incidents>=3&&!state.sanctions.some(x=>x.studentId===sid&&x.status==='À valider')) state.sanctions.push({id:Date.now()+1,studentId:sid,status:"À valider",title:"Suspension d'une épreuve",reason:"Seuil de 3 incidents actifs atteint"}); }
    save(); closeModal(); toast(isIncident&&student(sid).incidents>=3?"Seuil atteint : décision à examiner":"Observation enregistrée"); render();
  };
}

function openRoleModal() {
  document.querySelector("#modal-content").innerHTML=`<span class="eyebrow">Démonstration</span><h2 id="modal-title">Choisir un espace</h2><p class="modal-intro">Chaque profil voit uniquement les informations qui le concernent.</p><div class="role-grid">${Object.entries(profiles).map(([key,p])=>`<button class="role-card" data-role="${key}"><span>${key==='coach'?'♙':key==='parent'?'♧':'♘'}</span><strong>${p.role}</strong><small style="display:block;color:var(--muted);margin-top:5px">${p.name}</small></button>`).join("")}</div>`;
  modal.classList.remove("hidden");
  document.querySelectorAll("[data-role]").forEach(btn=>btn.onclick=()=>{currentRole=btn.dataset.role;localStorage.setItem("delaveau-role",currentRole);currentView="dashboard";selectedStudent=null;closeModal();render();toast(`Espace ${profiles[currentRole].role} activé`);});
}

function closeModal(){ modal.classList.add("hidden"); }
function bindStudentRows(){ document.querySelectorAll("[data-student]").forEach(el=>el.onclick=()=>{selectedStudent=Number(el.dataset.student);render();}); }

function render() {
  setProfile(); renderNav();
  if(selectedStudent) renderStudentDetail(selectedStudent);
  else if(currentRole!=="coach" && currentView==="dashboard") renderStudentDetail(profiles[currentRole].studentId,true);
  else if(currentRole==="coach" && currentView==="dashboard") renderCoachDashboard();
  else if(currentRole==="coach" && currentView==="students") renderStudents();
  else if(currentRole!=="coach") {
    const sid=profiles[currentRole].studentId, originalStudents=state.students, originalObs=state.observations, originalSanctions=state.sanctions;
    state.students=originalStudents.filter(s=>s.id===sid); state.observations=originalObs.filter(o=>o.studentId===sid); state.sanctions=originalSanctions.filter(x=>x.studentId===sid); renderGeneric(currentView); state.students=originalStudents; state.observations=originalObs; state.sanctions=originalSanctions;
  } else renderGeneric(currentView);
  renderNav();
}

document.querySelector("#role-switch-button").onclick=openRoleModal;
document.querySelector("#profile-button").onclick=openRoleModal;
document.querySelector("#modal-close").onclick=closeModal;
modal.onclick=e=>{if(e.target===modal)closeModal();};
document.querySelector("#menu-button").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");
document.querySelector("#global-search").oninput=e=>{ if(currentRole!=="coach")return; const q=e.target.value.toLowerCase(); if(q.length>1){currentView="students";renderStudents();document.querySelector("#all-students").innerHTML=state.students.filter(s=>s.name.toLowerCase().includes(q)).map(studentRow).join("");bindStudentRows();renderNav();} };
render();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
