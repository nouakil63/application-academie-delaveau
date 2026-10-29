export function eventEndDate(event) {
  return event.endDate || event.date;
}

export function eventCountdown(date, endDate = date, today) {
  if (!today) {
    const now = new Date();
    today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const end = endDate || date;
  if (end < today) return "Terminé";
  if (date <= today && end > date) return "En cours";
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  return days === 0 ? "Aujourd’hui" : days === 1 ? "Demain" : `Dans ${days} jours`;
}
