-- Le programme d'un concours est visible par toute l'Académie (élèves et parents compris).
-- Le nom du cavalier est copié dans la ligne pour ne pas ouvrir l'accès aux fiches élèves.
alter table public.event_entries add column if not exists rider_name text;

create or replace function public.set_event_entry_rider_name()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  select full_name into new.rider_name from public.students where id=new.student_id;
  return new;
end;
$$;

drop trigger if exists event_entry_rider_name on public.event_entries;
create trigger event_entry_rider_name before insert or update of student_id on public.event_entries
for each row execute procedure public.set_event_entry_rider_name();

update public.event_entries e set rider_name=s.full_name from public.students s where s.id=e.student_id;

drop policy if exists "event entries visible to family or staff" on public.event_entries;
create policy "event entries visible to members" on public.event_entries for select to authenticated using (true);
