-- Avertissements : plusieurs par mois, date exacte, et suppression propre.
alter table public.monthly_observations drop constraint if exists monthly_observations_student_id_month_key;
alter table public.monthly_observations add column if not exists occurred_on date;
update public.monthly_observations set occurred_on = month where occurred_on is null;

-- Un avertissement supprimé disparaît aussi des alertes de l'élève et des parents
-- (la notification est créée dans la même transaction, donc au même instant).
create or replace function public.remove_warning_notifications()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  delete from public.notifications
  where kind='monthly' and student_id=old.student_id and created_at=old.created_at;
  return old;
end;
$$;

drop trigger if exists on_monthly_observation_deleted on public.monthly_observations;
create trigger on_monthly_observation_deleted after delete on public.monthly_observations
for each row execute procedure public.remove_warning_notifications();
