-- Abonnements push (un par appareil) pour recevoir les notifications appli fermée.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "users manage own push subscriptions"
on public.push_subscriptions for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Retards et bilans : l'élève et ses parents sont prévenus.
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
  insert into public.notifications(recipient_id,student_id,kind,title,body)
  select ps.parent_id,new.student_id,TG_ARGV[0],TG_ARGV[1],TG_ARGV[2]
  from public.parent_students ps where ps.student_id=new.student_id;
  return new;
end;
$$;

-- Demande envoyée par l'élève : l'admin et le coach choisi sont prévenus.
-- Absence saisie directement par l'équipe : l'élève et ses parents sont prévenus.
create or replace function public.notify_absence_created()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  owner_id uuid;
  entry_body text;
begin
  if new.status='pending' then
    insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
    select p.id,new.student_id,new.id,'absence_request',
      case when new.request_type='delay' then 'Nouvelle demande de retard' else 'Nouvelle demande d’absence' end,
      s.full_name||' · '||to_char(new.absence_date,'DD/MM/YYYY')||coalesce(' · Coach : '||new.target_coach,'')
    from public.profiles p cross join public.students s
    where s.id=new.student_id
      and (p.role='admin' or (p.role='coach' and p.full_name=new.target_coach));
  else
    entry_body := 'Une absence du '||to_char(new.absence_date,'DD/MM/YYYY')||' a été ajoutée à votre suivi.';
    select user_id into owner_id from public.students where id=new.student_id;
    if owner_id is not null then
      insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
      values(owner_id,new.student_id,new.id,'absence_recorded','Absence enregistrée',entry_body);
    end if;
    insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
    select ps.parent_id,new.student_id,new.id,'absence_recorded','Absence enregistrée',entry_body
    from public.parent_students ps where ps.student_id=new.student_id;
  end if;
  return new;
end;
$$;
