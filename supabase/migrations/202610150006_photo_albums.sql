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

create or replace function public.notify_album_created()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.notifications(recipient_id,kind,title,body)
  select p.id,'photos','Nouvelles photos · '||new.title,
    'Les photos sont disponibles dans l’appli jusqu’au '||to_char(new.expires_at,'DD/MM')||'. Pensez à télécharger vos préférées !'
  from public.profiles p where p.role in ('student','parent');
  return new;
end;
$$;

drop trigger if exists on_album_created on public.photo_albums;
create trigger on_album_created after insert on public.photo_albums
for each row execute procedure public.notify_album_created();
