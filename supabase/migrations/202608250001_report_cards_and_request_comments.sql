alter table public.absence_requests
add column if not exists request_type text not null default 'absence'
check (request_type in ('absence','delay')),
add column if not exists review_comment text,
add column if not exists reviewed_by_name text;

create table if not exists public.report_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  school_year text not null,
  period text not null,
  file_path text not null,
  file_name text not null,
  file_type text not null default 'application/pdf',
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.report_cards enable row level security;

create policy "report cards visible to family or staff"
on public.report_cards for select to authenticated
using (
  public.is_staff() or exists (
    select 1 from public.students s
    where s.id=student_id and (
      s.user_id=auth.uid() or exists (
        select 1 from public.parent_students ps
        where ps.student_id=s.id and ps.parent_id=auth.uid()
      )
    )
  )
);

create policy "admins manage report cards"
on public.report_cards for all to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and role='admin'))
with check (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('report-cards','report-cards',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "admins upload report cards"
on storage.objects for insert to authenticated
with check (
  bucket_id='report-cards' and
  exists(select 1 from public.profiles where id=auth.uid() and role='admin')
);

create policy "report card files visible to authorized users"
on storage.objects for select to authenticated
using (
  bucket_id='report-cards' and exists (
    select 1 from public.report_cards r
    where r.file_path=name and (
      public.is_staff() or exists (
        select 1 from public.students s
        where s.id=r.student_id and (
          s.user_id=auth.uid() or exists (
            select 1 from public.parent_students ps
            where ps.student_id=s.id and ps.parent_id=auth.uid()
          )
        )
      )
    )
  )
);

create policy "parents view linked absence documents"
on storage.objects for select to authenticated
using (
  bucket_id='absence-documents' and exists (
    select 1 from public.students s
    join public.parent_students ps on ps.student_id=s.id
    where ps.parent_id=auth.uid()
      and s.user_id::text=(storage.foldername(name))[1]
  )
);

create or replace function public.notify_student_report_card()
returns trigger language plpgsql security definer set search_path=public
as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.students where id=new.student_id;
  if owner_id is not null then
    insert into public.notifications(recipient_id,student_id,kind,title,body)
    values(owner_id,new.student_id,'report_card','Nouveau bulletin disponible',new.title||' · '||new.period);
  end if;
  insert into public.notifications(recipient_id,student_id,kind,title,body)
  select ps.parent_id,new.student_id,'report_card','Nouveau bulletin disponible',new.title||' · '||new.period
  from public.parent_students ps where ps.student_id=new.student_id;
  return new;
end;
$$;

drop trigger if exists report_card_notification on public.report_cards;
create trigger report_card_notification after insert on public.report_cards
for each row execute procedure public.notify_student_report_card();

create or replace function public.notify_absence_created()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
  select p.id,new.student_id,new.id,'absence_request',
    case when new.request_type='delay' then 'Nouvelle demande de retard' else 'Nouvelle demande d’absence' end,
    s.full_name||' · '||to_char(new.absence_date,'DD/MM/YYYY')||coalesce(' · Coach : '||new.target_coach,'')
  from public.profiles p cross join public.students s
  where s.id=new.student_id
    and (p.role='admin' or (p.role='coach' and p.full_name=new.target_coach));
  return new;
end;
$$;

create or replace function public.notify_absence_reviewed()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  owner_id uuid;
  response_title text;
  response_body text;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    response_title := (case when new.request_type='delay' then 'Retard' else 'Absence' end)||
      case when new.status='approved' then ' accepté' else ' refusé' end;
    response_body := 'Votre demande du '||to_char(new.absence_date,'DD/MM/YYYY')||' a été '||
      case when new.status='approved' then 'acceptée' else 'refusée' end||
      coalesce(' par '||new.reviewed_by_name,'')||'.'||
      case when nullif(new.review_comment,'') is not null then ' Commentaire : '||new.review_comment else '' end;
    select user_id into owner_id from public.students where id=new.student_id;
    if owner_id is not null then
      insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
      values(owner_id,new.student_id,new.id,'absence_response',response_title,response_body);
    end if;
    insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
    select ps.parent_id,new.student_id,new.id,'absence_response',response_title,response_body
    from public.parent_students ps where ps.student_id=new.student_id;
  end if;
  return new;
end;
$$;
