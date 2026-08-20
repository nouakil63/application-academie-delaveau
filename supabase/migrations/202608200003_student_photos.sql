alter table public.students add column if not exists photo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('student-photos','student-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "student uploads own profile photo"
on storage.objects for insert to authenticated
with check (bucket_id='student-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create policy "student updates own profile photo"
on storage.objects for update to authenticated
using (bucket_id='student-photos' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='student-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create policy "profile photo visible to owner family or staff"
on storage.objects for select to authenticated
using (
  bucket_id='student-photos'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.is_staff()
    or exists (
      select 1 from public.students s
      join public.parent_students ps on ps.student_id=s.id
      where s.user_id::text=(storage.foldername(name))[1]
      and ps.parent_id=auth.uid()
    )
  )
);
