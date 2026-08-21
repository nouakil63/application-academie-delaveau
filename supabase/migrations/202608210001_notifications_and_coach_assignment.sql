alter table public.absence_requests add column if not exists target_coach text;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  absence_request_id uuid references public.absence_requests(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

alter publication supabase_realtime add table public.notifications;

create policy "users read own notifications"
on public.notifications for select to authenticated
using (recipient_id=auth.uid());

create policy "users update own notifications"
on public.notifications for update to authenticated
using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

create or replace function public.notify_absence_created()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
  select p.id,new.student_id,new.id,'absence_request','Nouvelle demande d’absence',
    s.full_name||' · '||to_char(new.absence_date,'DD/MM/YYYY')||coalesce(' · Coach : '||new.target_coach,'')
  from public.profiles p cross join public.students s
  where s.id=new.student_id
    and (p.role='admin' or (p.role='coach' and p.full_name=new.target_coach));
  return new;
end;
$$;

drop trigger if exists on_absence_request_created on public.absence_requests;
create trigger on_absence_request_created after insert on public.absence_requests
for each row execute procedure public.notify_absence_created();

create or replace function public.notify_absence_reviewed()
returns trigger language plpgsql security definer set search_path=public
as $$
declare owner_id uuid;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    select user_id into owner_id from public.students where id=new.student_id;
    if owner_id is not null then
      insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
      values(owner_id,new.student_id,new.id,'absence_response',
        case when new.status='approved' then 'Absence acceptée' else 'Absence refusée' end,
        'Votre demande du '||to_char(new.absence_date,'DD/MM/YYYY')||' a été '||case when new.status='approved' then 'acceptée.' else 'refusée.' end);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_absence_request_reviewed on public.absence_requests;
create trigger on_absence_request_reviewed after update on public.absence_requests
for each row execute procedure public.notify_absence_reviewed();

create or replace function public.notify_student_tracking()
returns trigger language plpgsql security definer set search_path=public
as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.students where id=new.student_id;
  if owner_id is not null then
    insert into public.notifications(recipient_id,student_id,kind,title,body)
    values(owner_id,new.student_id,TG_ARGV[0],TG_ARGV[1],TG_ARGV[2]);
  end if;
  return new;
end;
$$;

drop trigger if exists on_monthly_observation_created on public.monthly_observations;
create trigger on_monthly_observation_created after insert on public.monthly_observations
for each row execute procedure public.notify_student_tracking('monthly','Nouveau bilan mensuel','Un nouveau bilan mensuel est disponible dans votre espace.');

drop trigger if exists on_delay_created on public.delays;
create trigger on_delay_created after insert on public.delays
for each row execute procedure public.notify_student_tracking('delay','Nouveau retard enregistré','Un retard vient d’être ajouté à votre suivi.');
