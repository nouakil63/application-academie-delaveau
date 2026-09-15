create table if not exists public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  description text,
  published boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.photo_albums(id) on delete cascade,
  file_path text not null,
  thumb_path text,
  file_name text not null,
  file_type text not null default 'image/jpeg',
  file_size bigint,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.photo_tags (
  photo_id uuid not null references public.album_photos(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  tagged_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (photo_id, student_id)
);

create index if not exists album_photos_album_idx on public.album_photos(album_id);
create index if not exists photo_tags_student_idx on public.photo_tags(student_id);

alter table public.photo_albums enable row level security;
alter table public.album_photos enable row level security;
alter table public.photo_tags enable row level security;

create policy "albums visible when published or staff"
on public.photo_albums for select to authenticated
using (published or public.is_staff());

create policy "admins manage albums"
on public.photo_albums for all to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and role='admin'))
with check (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));

create policy "photos visible when album published or staff"
on public.album_photos for select to authenticated
using (
  public.is_staff() or exists (
    select 1 from public.photo_albums a where a.id=album_id and a.published
  )
);

create policy "admins manage album photos"
on public.album_photos for all to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and role='admin'))
with check (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));

create policy "tags visible when album published or staff"
on public.photo_tags for select to authenticated
using (
  public.is_staff() or exists (
    select 1 from public.album_photos p
    join public.photo_albums a on a.id=p.album_id
    where p.id=photo_id and a.published
  )
);

create policy "family or staff adds photo tags"
on public.photo_tags for insert to authenticated
with check (
  public.is_staff() or (
    exists (
      select 1 from public.album_photos p
      join public.photo_albums a on a.id=p.album_id
      where p.id=photo_id and a.published
    ) and exists (
      select 1 from public.students s
      where s.id=student_id and (
        s.user_id=auth.uid() or exists (
          select 1 from public.parent_students ps
          where ps.student_id=s.id and ps.parent_id=auth.uid()
        )
      )
    )
  )
);

create policy "family or staff removes photo tags"
on public.photo_tags for delete to authenticated
using (
  public.is_staff() or tagged_by=auth.uid() or exists (
    select 1 from public.students s
    where s.id=student_id and (
      s.user_id=auth.uid() or exists (
        select 1 from public.parent_students ps
        where ps.student_id=s.id and ps.parent_id=auth.uid()
      )
    )
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('session-photos','session-photos',false,52428800,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

create policy "admins upload session photos"
on storage.objects for insert to authenticated
with check (
  bucket_id='session-photos' and
  exists(select 1 from public.profiles where id=auth.uid() and role='admin')
);

create policy "admins delete session photos"
on storage.objects for delete to authenticated
using (
  bucket_id='session-photos' and
  exists(select 1 from public.profiles where id=auth.uid() and role='admin')
);

create policy "session photos visible to authorized users"
on storage.objects for select to authenticated
using (
  bucket_id='session-photos' and (
    public.is_staff() or exists (
      select 1 from public.album_photos p
      join public.photo_albums a on a.id=p.album_id
      where (p.file_path=name or p.thumb_path=name) and a.published
    )
  )
);

create or replace function public.notify_photo_album_published()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.published and (tg_op='INSERT' or not old.published) then
    insert into public.notifications(recipient_id,kind,title,body)
    select p.id,'photo_album','Nouvelles photos disponibles',
      new.title||' · Les photos sont en ligne dans l’espace Photos.'
    from public.profiles p where p.role in ('student','parent');
  end if;
  return new;
end;
$$;

drop trigger if exists photo_album_published on public.photo_albums;
create trigger photo_album_published
after insert or update of published on public.photo_albums
for each row execute procedure public.notify_photo_album_published();
