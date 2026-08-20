create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'parent', 'coach', 'admin');
create type public.request_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  birth_date date,
  academy_group text,
  horse_name text,
  horse_age integer,
  horse_height integer,
  horse_partnership text,
  horse_experience text,
  created_at timestamptz not null default now()
);

create table public.parent_students (
  parent_id uuid references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  primary key (parent_id, student_id)
);

create table public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  absence_date date not null,
  reason text not null,
  document_path text,
  document_name text,
  document_type text,
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.delays (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  occurred_on date not null,
  details text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.monthly_observations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  month date not null,
  details text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(student_id, month)
);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('coach','admin')); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id, full_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name','Compte'), case when new.raw_user_meta_data->>'role'='parent' then 'parent'::public.user_role else 'student'::public.user_role end);
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.parent_students enable row level security;
alter table public.absence_requests enable row level security;
alter table public.delays enable row level security;
alter table public.monthly_observations enable row level security;

create policy "profile own or staff" on public.profiles for select to authenticated using (id=auth.uid() or public.is_staff());
create policy "student own parent or staff" on public.students for select to authenticated using (user_id=auth.uid() or public.is_staff() or exists(select 1 from public.parent_students ps where ps.student_id=id and ps.parent_id=auth.uid()));
create policy "student creates own file" on public.students for insert to authenticated with check (user_id=auth.uid());
create policy "student updates own file" on public.students for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "staff manages students" on public.students for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "parent links visible" on public.parent_students for select to authenticated using (parent_id=auth.uid() or public.is_staff());
create policy "staff manages parent links" on public.parent_students for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "absence visible to family or staff" on public.absence_requests for select to authenticated using (public.is_staff() or exists(select 1 from public.students s where s.id=student_id and (s.user_id=auth.uid() or exists(select 1 from public.parent_students ps where ps.student_id=s.id and ps.parent_id=auth.uid()))));
create policy "student creates absence" on public.absence_requests for insert to authenticated with check (exists(select 1 from public.students s where s.id=student_id and s.user_id=auth.uid()));
create policy "staff reviews absence" on public.absence_requests for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "tracking visible to family or staff" on public.delays for select to authenticated using (public.is_staff() or exists(select 1 from public.students s where s.id=student_id and (s.user_id=auth.uid() or exists(select 1 from public.parent_students ps where ps.student_id=s.id and ps.parent_id=auth.uid()))));
create policy "staff manages delays" on public.delays for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "observations visible to family or staff" on public.monthly_observations for select to authenticated using (public.is_staff() or exists(select 1 from public.students s where s.id=student_id and (s.user_id=auth.uid() or exists(select 1 from public.parent_students ps where ps.student_id=s.id and ps.parent_id=auth.uid()))));
create policy "staff manages observations" on public.monthly_observations for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('absence-documents','absence-documents',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "student uploads own absence document" on storage.objects for insert to authenticated with check (bucket_id='absence-documents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "document visible to owner or staff" on storage.objects for select to authenticated using (bucket_id='absence-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_staff()));
