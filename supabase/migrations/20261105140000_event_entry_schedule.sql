-- Le programme d'un concours sur plusieurs jours : chaque engagement connaît
-- le jour de son épreuve et l'heure de départ de celle-ci.
-- riding_time reste l'heure « à cheval » propre au cavalier.
alter table public.event_entries add column if not exists class_date date;
alter table public.event_entries add column if not exists class_time text;

create index if not exists event_entries_schedule_idx on public.event_entries(event_id, class_date, class_time);
