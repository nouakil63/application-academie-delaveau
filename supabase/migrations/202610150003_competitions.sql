-- Concours : horaires, programme de chaque cavalier et documents (affiches d'horaires).
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  location text,
  message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_label text not null,
  bib text,
  riding_time text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.event_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_entries_event_idx on public.event_entries(event_id);
create index if not exists event_entries_student_idx on public.event_entries(student_id);
create index if not exists event_documents_event_idx on public.event_documents(event_id);

alter table public.events enable row level security;
alter table public.event_entries enable row level security;
alter table public.event_documents enable row level security;

-- Les horaires d'un concours concernent tout le club : visibles par tous les comptes connectés.
create policy "events visible to members" on public.events for select to authenticated using (true);
create policy "staff manages events" on public.events for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "event documents visible to members" on public.event_documents for select to authenticated using (true);
create policy "staff manages event documents" on public.event_documents for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Le programme individuel n'est visible que par l'élève, ses parents et l'équipe.
create policy "event entries visible to family or staff" on public.event_entries for select to authenticated
using (public.is_staff() or exists(
  select 1 from public.students s where s.id=student_id and (
    s.user_id=auth.uid() or exists(select 1 from public.parent_students ps where ps.student_id=s.id and ps.parent_id=auth.uid())
  )
));
create policy "staff manages event entries" on public.event_entries for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets(id,name,public) values('event-documents','event-documents',false) on conflict (id) do nothing;

create policy "event files visible to members" on storage.objects for select to authenticated
using (bucket_id='event-documents');
create policy "staff uploads event files" on storage.objects for insert to authenticated
with check (bucket_id='event-documents' and public.is_staff());
create policy "staff deletes event files" on storage.objects for delete to authenticated
using (bucket_id='event-documents' and public.is_staff());

-- Un concours publié : tous les élèves et parents sont prévenus.
create or replace function public.notify_event_created()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.notifications(recipient_id,kind,title,body)
  select p.id,'event',
    'Concours · '||to_char(new.event_date,'DD/MM'),
    new.title||coalesce(' à '||nullif(new.location,''),'')||'. Horaires et programme disponibles dans l’appli.'
  from public.profiles p where p.role in ('student','parent');
  return new;
end;
$$;

drop trigger if exists on_event_created on public.events;
create trigger on_event_created after insert on public.events
for each row execute procedure public.notify_event_created();
