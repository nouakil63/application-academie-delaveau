create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare selected_role public.user_role;
begin
  selected_role := case when new.raw_user_meta_data->>'role'='parent' then 'parent'::public.user_role else 'student'::public.user_role end;
  insert into public.profiles(id, full_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name','Compte'), selected_role);
  if selected_role='student' then
    insert into public.students(user_id,full_name,birth_date,academy_group,horse_name,horse_age,horse_height,horse_partnership,horse_experience)
    values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Élève'),nullif(new.raw_user_meta_data->>'birth_date','')::date,new.raw_user_meta_data->>'academy_group',new.raw_user_meta_data->>'horse_name',nullif(new.raw_user_meta_data->>'horse_age','')::integer,nullif(new.raw_user_meta_data->>'horse_height','')::integer,new.raw_user_meta_data->>'horse_partnership',new.raw_user_meta_data->>'horse_experience');
  end if;
  return new;
end;
$$;

create policy "staff creates absences" on public.absence_requests for insert to authenticated with check (public.is_staff());
