import test from "node:test";
import assert from "node:assert/strict";
import { eventEndDate, eventCountdown } from "../event-timing.js";

test("un concours de quatre jours reste en cours jusqu'au dernier jour inclus", () => {
  for (const day of ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]) {
    assert.equal(eventCountdown("2026-10-29", "2026-11-01", day), "En cours");
  }
  assert.equal(eventCountdown("2026-10-29", "2026-11-01", "2026-11-02"), "Terminé");
});

test("les concours d'une journée conservent leur comportement", () => {
  const event = { date: "2026-11-01", endDate: null };
  assert.equal(eventEndDate(event), "2026-11-01");
  assert.equal(eventCountdown(event.date, event.endDate, "2026-10-30"), "Dans 2 jours");
  assert.equal(eventCountdown(event.date, event.endDate, "2026-10-31"), "Demain");
  assert.equal(eventCountdown(event.date, event.endDate, "2026-11-01"), "Aujourd’hui");
  assert.equal(eventCountdown(event.date, event.endDate, "2026-11-02"), "Terminé");
});

test("la fin du concours sert au classement des concours passés", () => {
  const event = { date: "2026-10-29", endDate: "2026-11-01" };
  assert.ok(eventEndDate(event) >= "2026-10-31");
  assert.ok(eventEndDate(event) < "2026-11-02");
});
