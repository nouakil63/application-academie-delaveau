-- Albums photo : fichiers sur Cloudflare R2, disponibles 10 jours puis remplacés par un lien.
create table if not exists public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  taken_on date,
  archive_url text,
  expires_at timestamptz not null default now() + interval '10 days',
  purged_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.photo_albums(id) on delete cascade,
  original_key text not null,
  thumb_key text not null,
  file_name text not null,
  file_size bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists photos_album_idx on public.photos(album_id);

alter table public.photo_albums enable row level security;
alter table public.photos enable row level security;

create policy "albums visible to members" on public.photo_albums for select to authenticated using (true);
create policy "staff manages albums" on public.photo_albums for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "photos visible to members" on public.photos for select to authenticated using (true);
create policy "staff manages photos" on public.photos for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Accès payant : une ligne par élève dont la famille a réglé les photos de l'album.
create table if not exists public.album_access (
  album_id uuid not null references public.photo_albums(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (album_id, student_id)
);
alter table public.album_access enable row level security;

create policy "staff manages album access" on public.album_access for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "family sees own album access" on public.album_access for select to authenticated
using (exists(
  select 1 from public.students s where s.id=student_id and (
    s.user_id=auth.uid() or exists(select 1 from public.parent_students ps where ps.student_id=s.id and ps.parent_id=auth.uid())
  )
));

-- Quand l'accès est ouvert, l'élève et ses parents sont prévenus.
create or replace function public.notify_album_access()
returns trigger language plpgsql security definer set search_path=public
as $$
declare album public.photo_albums;
begin
  select * into album from public.photo_albums where id=new.album_id;
  insert into public.notifications(recipient_id,student_id,kind,title,body)
  select r.id,new.student_id,'photos','Vos photos sont disponibles · '||album.title,
    'Retrouvez-les en pleine qualité dans l’appli jusqu’au '||to_char(album.expires_at,'DD/MM')||'. Pensez à les télécharger !'
  from (
    select s.user_id as id from public.students s where s.id=new.student_id and s.user_id is not null
    union
    select ps.parent_id from public.parent_students ps where ps.student_id=new.student_id
  ) r;
  return new;
end;
$$;

drop trigger if exists on_album_access_granted on public.album_access;
create trigger on_album_access_granted after insert on public.album_access
for each row execute procedure public.notify_album_access();
