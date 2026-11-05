// Lecture d'un programme de concours collé tel qu'il circule entre coachs :
//
//   Vendredi
//   Pro 2 - 130 - Vitesse - 13:30
//   5 Capucine
//   56 Aristide
//
// Chaque jour regroupe des épreuves, chaque épreuve liste ses cavaliers avec leur dossard.

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const CLASS_KEYWORDS = /^(club|poney|ponam|amateur|pro|warm|prepa|as poney|elite|cso|grand prix|gp|derby|hunter|equifun|dressage|cce|chrono)\b/;
const FORMATS = [
  [/^(temps\s*dif(f)?(ere)?|td)$/, "Temps différé"],
  [/^(vitesse|vit)$/, "Vitesse"],
  [/^(barrage|bar)$/, "Barrage"],
  [/^(grand\s*prix|gp)$/, "Grand Prix"],
  [/^(chrono|chronometre)$/, "Chrono"],
  [/^(deux\s*phases|2\s*phases)$/, "Deux phases"]
];

export function normalizeText(value) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// "13h", "13:30", "13 h 30", "13H30" → "13h00", "13h30".
export function normalizeTime(value) {
  const match = /^(\d{1,2})\s*[h:]\s*(\d{2})?$/i.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]), minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}`;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatLabel(value) {
  const normalized = normalizeText(value);
  const known = FORMATS.find(([pattern]) => pattern.test(normalized));
  return known ? known[1] : capitalize(value.trim());
}

// "120", "120 cm", "1m20", "1,20 m" → "120".
function heightOf(part) {
  const plain = /^(\d{2,3})\s*(cm)?$/i.exec(part.trim());
  if (plain) return plain[1];
  const metric = /^(\d)\s*[m,.]\s*(\d{2})\s*m?$/i.exec(part.trim());
  return metric ? `${metric[1]}${metric[2]}` : null;
}

const TIME_PATTERN = /(^|[\s\-–—|·,])(\d{1,2}\s*[h:]\s*(?:\d{2})?)(?=$|[\s\-–—|·,])/gi;

export function parseClassLine(line) {
  let rest = line.trim(), time = null;
  for (const match of rest.matchAll(TIME_PATTERN)) {
    const candidate = normalizeTime(match[2]);
    if (candidate) { time = candidate; rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`; }
  }
  // Séparateurs : tiret entouré d'espaces ou collé à un chiffre, barre, point médian, virgule hors « 1,20 ».
  const parts = rest.split(/\s+[-–—|·,]\s+|\s*[|·]\s*|(?<!\d),\s*|,\s*(?!\d)|(?<=\d)\s*[-–—]\s*|\s*[-–—]\s*(?=\d)/).map(p => p.trim()).filter(Boolean);
  let level = "", height = "", format = [];
  for (const part of parts) {
    const asHeight = heightOf(part);
    if (asHeight && !height) { height = asHeight; continue; }
    if (!level) {
      // « Pro 2 130 Vitesse » ou « Grand Prix 1,20 m » : la hauteur est collée au niveau.
      // « Prépa 90 » reste entier : la hauteur fait partie du nom officiel de l'épreuve.
      const inline = /^(.*?\S)\s+(\d{2,3}|\d\s*[m,.]\s*\d{2}\s*m?)(?:\s+(.+))?$/.exec(part);
      if (inline && !height && (inline[3] || /[m,.]/.test(inline[2]))) { level = inline[1]; height = heightOf(inline[2]) || inline[2]; if (inline[3]) format.push(formatLabel(inline[3])); }
      else level = part;
      continue;
    }
    format.push(formatLabel(part));
  }
  level = level.replace(/\s+/g, " ").trim();
  const label = [capitalize(level), height, ...format].filter(Boolean).join(" · ");
  return { level: capitalize(level), height, format: format.join(" · "), time, label };
}

function parseDayLine(line) {
  const normalized = normalizeText(line);
  const match = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b\s*:?\s*(.*)$/.exec(normalized);
  if (!match) return null;
  const date = /(\d{1,2})(?:\s*[\/.\-]\s*(\d{1,2}))?/.exec(match[2]);
  return { label: capitalize(line.trim().replace(/\s*:\s*$/, "")), weekday: WEEKDAYS.indexOf(match[1]), dayOfMonth: date ? Number(date[1]) : null, month: date?.[2] ? Number(date[2]) : null };
}

const NAME = "[^\\d\\n]{1,80}?";
const RIDER_PATTERNS = [
  new RegExp(`^(?:n[°o]\\s*)?(\\d{1,4})\\s*[-–:.)]?\\s*(${NAME})$`, "i"),
  new RegExp(`^(${NAME})\\s*[-–:(]?\\s*(?:n[°o]\\s*)?(\\d{1,4})\\)?$`, "i")
];

function looksLikeClass(text) {
  const normalized = normalizeText(text);
  return CLASS_KEYWORDS.test(normalized) || FORMATS.some(([pattern]) => pattern.test(normalized));
}

function parseRiderLine(line, inClass) {
  const text = line.trim();
  if (/[h:]\s*\d{2}\b|\d\s*h\b/i.test(text)) return null;
  for (const [index, pattern] of RIDER_PATTERNS.entries()) {
    const match = pattern.exec(text);
    if (match) {
      const [bib, name] = index === 0 ? [match[1], match[2]] : [match[2], match[1]];
      const cleanName = name.trim().replace(/[-–:]+$/, "").trim();
      if (!cleanName || looksLikeClass(cleanName)) return null;
      return { bib, name: cleanName };
    }
  }
  // Un prénom seul sous une épreuve : engagement terrain, le dossard sera donné sur place.
  if (inClass && /^[^\d]{2,60}$/.test(text) && text.split(/\s+/).length <= 3 && !/[-–—|·,]/.test(text) && !looksLikeClass(text)) return { bib: "", name: text };
  return null;
}

export function parseProgramme(text) {
  const days = [], warnings = [];
  let day = null, currentClass = null;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/^[\s•*\-–—]+(?=\S)/, "").trim();
    if (!line) continue;
    const asDay = parseDayLine(line);
    if (asDay) { day = { ...asDay, classes: [] }; days.push(day); currentClass = null; continue; }
    const asRider = parseRiderLine(line, Boolean(currentClass));
    if (asRider) {
      if (!currentClass) { warnings.push(`« ${line} » : aucun cavalier avant la première épreuve, ligne ignorée.`); continue; }
      currentClass.riders.push(asRider);
      continue;
    }
    const parsed = parseClassLine(line);
    if (!parsed.label) { warnings.push(`« ${line} » : ligne non comprise, ignorée.`); continue; }
    if (!day) { day = { label: null, weekday: null, dayOfMonth: null, month: null, classes: [] }; days.push(day); }
    currentClass = { ...parsed, riders: [] };
    day.classes.push(currentClass);
  }
  return { days, warnings };
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Renvoie la date comprise entre start et end (inclus) qui correspond au jour annoncé.
export function dateForDay(day, start, end = start, maxDays = 14) {
  if (!start) return null;
  const cursor = new Date(`${start}T12:00:00`);
  const last = end && end >= start ? end : start;
  for (let step = 0; step < maxDays; step++) {
    const iso = isoDate(cursor);
    if (iso > last) break;
    if (day.dayOfMonth ? cursor.getDate() === day.dayOfMonth && (!day.month || cursor.getMonth() + 1 === day.month) : day.weekday !== null && cursor.getDay() === day.weekday) return iso;
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

// Retrouve l'élève à partir du prénom (ou du nom complet) écrit dans le programme.
export function matchRider(name, students) {
  const wanted = normalizeText(name);
  if (!wanted) return { student: null, candidates: [] };
  const named = students.map(s => ({ student: s, full: normalizeText(s.name), tokens: normalizeText(s.name).split(" ") }));
  const exact = named.filter(x => x.full === wanted);
  if (exact.length === 1) return { student: exact[0].student, candidates: exact.map(x => x.student) };
  const firstName = named.filter(x => x.tokens[0] === wanted || x.full.startsWith(`${wanted} `));
  if (firstName.length === 1) return { student: firstName[0].student, candidates: firstName.map(x => x.student) };
  if (firstName.length > 1) return { student: null, candidates: firstName.map(x => x.student) };
  const anyToken = named.filter(x => x.tokens.includes(wanted) || wanted.split(" ").every(token => x.tokens.includes(token)));
  return { student: anyToken.length === 1 ? anyToken[0].student : null, candidates: anyToken.map(x => x.student) };
}

// Tri d'un programme : par jour, puis par heure de départ, puis dans l'ordre de saisie.
export function compareEntries(a, b) {
  return (a.classDate || "").localeCompare(b.classDate || "") || (a.classTime || "").localeCompare(b.classTime || "") || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

// Liste des jours d'un concours, du premier au dernier (14 jours maximum).
export function eventDays(start, end = start, maxDays = 14) {
  if (!start) return [];
  const days = [], cursor = new Date(`${start}T12:00:00`), last = end && end >= start ? end : start;
  for (let step = 0; step < maxDays; step++) {
    const iso = isoDate(cursor);
    if (iso > last) break;
    days.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
