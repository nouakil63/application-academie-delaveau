alter table public.students
add column if not exists guardian_code text unique
default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

update public.students
set guardian_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where guardian_code is null;

create or replace function public.link_parent_with_code(link_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare linked_student uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='parent') then
    raise exception 'Ce compte n’est pas un compte parent';
  end if;
  select id into linked_student from public.students where guardian_code=upper(trim(link_code));
  if linked_student is null then raise exception 'Code familial incorrect'; end if;
  insert into public.parent_students(parent_id,student_id) values(auth.uid(),linked_student) on conflict do nothing;
  return linked_student;
end;
$$;

grant execute on function public.link_parent_with_code(text) to authenticated;
