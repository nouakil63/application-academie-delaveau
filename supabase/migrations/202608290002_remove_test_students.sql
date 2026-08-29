-- Remove the temporary/test student accounts shown in the Académie app.
-- This targets student rows only; the admin account named Norman is not affected.

do $$
declare
  target record;
begin
  for target in
    select id, user_id, full_name
    from public.students
    where full_name in ('Norman Ouakil', 'Aristide Augier')
  loop
    -- Files owned by the student.
    delete from storage.objects
    where bucket_id = 'report-cards'
      and name like target.id::text || '/%';

    if target.user_id is not null then
      delete from storage.objects
      where bucket_id in ('student-photos', 'absence-documents')
        and name like target.user_id::text || '/%';
    end if;

    -- Related rows such as parent links, absences, delays and reports
    -- are removed by the foreign-key cascades attached to the student.
    delete from public.students where id = target.id;

    -- Finally remove the corresponding authentication account/profile.
    if target.user_id is not null then
      delete from auth.users where id = target.user_id;
    end if;
  end loop;
end
$$;
