-- Chaque concours publié est annoncé une fois à chaque compte de l'Académie.
-- Les notifications alimentent aussi le webhook push existant pour les appareils abonnés.
create or replace function public.notify_event_created()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.notifications(recipient_id,kind,title,body)
  select p.id,'event',
    'Concours · '||to_char(new.event_date,'DD/MM'),
    new.title||coalesce(' à '||nullif(new.location,''),'')||'. Horaires et programme disponibles dans l’appli.'
  from public.profiles p
  where p.role in ('student','parent','coach','admin');
  return new;
end;
$$;

-- Cette fonction est uniquement appelée par le trigger existant, pas par RPC.
revoke execute on function public.notify_event_created() from public, anon, authenticated;
