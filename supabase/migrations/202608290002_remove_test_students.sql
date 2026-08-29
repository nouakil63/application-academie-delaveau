-- Remove the temporary/test student accounts shown in the Académie app.
-- This targets student rows only; the admin account named Norman is not affected.
--
-- Supabase protects storage.objects against direct SQL deletion.
-- Storage files must be removed via the Storage API / dashboard separately.

do $$
declare
  target record;
begin
  for target in
    select id, user_id, full_name
    from public.students
    where full_name in ('Norman Ouakil', 'Aristide Augier')
  loop
    -- Related database rows (parent links, absences, delays, notifications,
    -- monthly observations and report-card metadata) are removed by FK cascades.
    delete from public.students where id = target.id;

    -- Remove the corresponding Auth account/profile.
    if target.user_id is not null then
      delete from auth.users where id = target.user_id;
    end if;
  end loop;
end
$$;
