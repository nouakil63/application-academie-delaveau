create table if not exists public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  description text,
  link_url text not null,
  published boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.photo_albums enable row level security;

create policy "albums visible when published or staff"
on public.photo_albums for select to authenticated
using (published or public.is_staff());

create policy "admins manage albums"
on public.photo_albums for all to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and role='admin'))
with check (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));

create or replace function public.notify_photo_album_published()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.published and (tg_op='INSERT' or not old.published) then
    insert into public.notifications(recipient_id,kind,title,body)
    select p.id,'photo_album','Nouvelles photos disponibles',
      new.title||' · Les photos sont accessibles depuis l’espace Photos.'
    from public.profiles p where p.role in ('student','parent');
  end if;
  return new;
end;
$$;

drop trigger if exists photo_album_published on public.photo_albums;
create trigger photo_album_published
after insert or update of published on public.photo_albums
for each row execute procedure public.notify_photo_album_published();
