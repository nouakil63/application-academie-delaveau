import test from "node:test";
import assert from "node:assert/strict";
import { parseProgramme, parseClassLine, normalizeTime, dateForDay, matchRider, compareEntries, eventDays } from "../event-programme.js";

const PROGRAMME = `Jeudi 

Warm Up - 120 - 13h

18 Capucine

Vendredi 

Pro 2 - 130 - Vitesse - 13:30

5 Capucine
56 Aristide

Amateur 2 - 105 - temps dif - 16:15

17 Flore
24 Malissa

Samedi 

Pro 3 - 125 - temps dif - 13:30

17 Aristide

Amateur 2 - 110 - temps dif - 10:30

1 Sonia 
24 Flore

Amateur 1 - 120 - temps dif - 15:45 

8 Léna 

Dimanche 

Amateur 2 - 105 - temps dif - 11h

34 Malissa

Amateur 1 - 115 - temps dif - 13h

11 Sonia
20 Flore

Amateur 1 - 120 - barrage - 14:30
`;

test("un programme de quatre jours collé tel quel est lu jour par jour", () => {
  const { days, warnings } = parseProgramme(PROGRAMME);
  assert.deepEqual(warnings, []);
  assert.deepEqual(days.map(d => d.label), ["Jeudi", "Vendredi", "Samedi", "Dimanche"]);
  assert.deepEqual(days.map(d => d.classes.length), [1, 2, 3, 3]);
  const vendredi = days[1];
  assert.equal(vendredi.classes[0].label, "Pro 2 · 130 · Vitesse");
  assert.equal(vendredi.classes[0].time, "13h30");
  assert.deepEqual(vendredi.classes[0].riders, [{ bib: "5", name: "Capucine" }, { bib: "56", name: "Aristide" }]);
  assert.equal(vendredi.classes[1].label, "Amateur 2 · 105 · Temps différé");
  assert.equal(vendredi.classes[1].time, "16h15");
  assert.equal(days[0].classes[0].label, "Warm Up · 120");
  assert.equal(days[0].classes[0].time, "13h00");
  assert.deepEqual(days[2].classes[2].riders, [{ bib: "8", name: "Léna" }]);
  const barrage = days[3].classes[2];
  assert.equal(barrage.label, "Amateur 1 · 120 · Barrage");
  assert.deepEqual(barrage.riders, []);
  assert.equal(days.flatMap(d => d.classes).flatMap(c => c.riders).length, 12);
});

test("les épreuves acceptent plusieurs écritures", () => {
  assert.equal(parseClassLine("Pro 2 130 Vitesse 13h30").label, "Pro 2 · 130 · Vitesse");
  assert.equal(parseClassLine("Grand Prix 1,20 m - barrage - 14:30").label, "Grand Prix · 120 · Barrage");
  assert.equal(parseClassLine("Club 3 – 1m05 – TD – 9h").label, "Club 3 · 105 · Temps différé");
  assert.equal(parseClassLine("Club 3 – 1m05 – TD – 9h").time, "09h00");
  assert.equal(parseClassLine("Prépa 90 - 9h30").label, "Prépa 90");
  assert.equal(parseClassLine("Warm-Up - 120 - 13h").label, "Warm-Up · 120");
  assert.equal(parseClassLine("Poney A2 - 80").time, null);
  assert.equal(normalizeTime("13 h 05"), "13h05");
  assert.equal(normalizeTime("120"), null);
});

test("les cavaliers sans dossard, les jours datés et les lignes inconnues sont gérés", () => {
  const { days, warnings } = parseProgramme("12 Inconnu\nVendredi 13/11\nClub 2 - 95 - 9h\nCamille\nn°7 Hugo Morel\nLouise - 8\nBarrage\nnimporte - quoi - vraiment");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Inconnu/);
  assert.equal(days.length, 1);
  assert.equal(days[0].dayOfMonth, 13);
  assert.equal(days[0].month, 11);
  assert.equal(days[0].weekday, 5);
  assert.deepEqual(days[0].classes[0].riders, [{ bib: "", name: "Camille" }, { bib: "7", name: "Hugo Morel" }, { bib: "8", name: "Louise" }]);
  assert.deepEqual(days[0].classes.slice(1).map(c => c.label), ["Barrage", "Nimporte · Quoi · Vraiment"]);
});

test("chaque jour annoncé retrouve sa date dans la durée du concours", () => {
  const { days } = parseProgramme(PROGRAMME);
  assert.deepEqual(days.map(d => dateForDay(d, "2026-11-12", "2026-11-15")), ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  assert.equal(dateForDay(days[3], "2026-11-12", "2026-11-14"), null);
  assert.equal(dateForDay(days[0], "2026-11-12"), "2026-11-12");
  assert.equal(dateForDay({ weekday: 5, dayOfMonth: 13, month: 11 }, "2026-11-12", "2026-11-15"), "2026-11-13");
  assert.equal(dateForDay({ weekday: 5, dayOfMonth: 20, month: null }, "2026-11-12", "2026-11-15"), null);
  assert.deepEqual(eventDays("2026-11-12", "2026-11-15"), ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  assert.deepEqual(eventDays("2026-11-12", null), ["2026-11-12"]);
});

test("un prénom est rapproché d'un élève, sans deviner en cas de doute", () => {
  const students = [{ id: 1, name: "Capucine Martin" }, { id: 2, name: "Flore Dupont" }, { id: 3, name: "Flore Leroy" }, { id: 4, name: "Léna Dubois" }];
  assert.equal(matchRider("Capucine", students).student.id, 1);
  assert.equal(matchRider("capucine martin", students).student.id, 1);
  assert.equal(matchRider("Lena", students).student.id, 4);
  const flore = matchRider("Flore", students);
  assert.equal(flore.student, null);
  assert.deepEqual(flore.candidates.map(s => s.id), [2, 3]);
  assert.equal(matchRider("Flore Leroy", students).student.id, 3);
  assert.equal(matchRider("Dupont", students).student.id, 2);
  assert.deepEqual(matchRider("Inconnu", students), { student: null, candidates: [] });
});

test("le programme se classe par jour puis par heure de départ", () => {
  const entries = [
    { classDate: "2026-11-13", classTime: "16h15", sortOrder: 0 },
    { classDate: "2026-11-12", classTime: "13h00", sortOrder: 5 },
    { classDate: "2026-11-13", classTime: "13h30", sortOrder: 9 },
    { classDate: null, classTime: null, sortOrder: 1 }
  ];
  assert.deepEqual([...entries].sort(compareEntries).map(e => `${e.classDate}|${e.classTime}`), ["null|null", "2026-11-12|13h00", "2026-11-13|13h30", "2026-11-13|16h15"]);
});
