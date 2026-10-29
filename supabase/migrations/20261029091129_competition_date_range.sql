-- Une date de fin facultative maintient les concours de plusieurs jours à l'affiche.
alter table public.events add column if not exists end_date date;
alter table public.events add constraint events_end_date_after_start
  check (end_date is null or end_date >= event_date);
