-- نجم الصف V2 — قاعدة البيانات الكاملة
create extension if not exists pgcrypto;

create table if not exists profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text,
 full_name text,
 role text not null default 'parent' check(role in ('teacher','parent')),
 created_at timestamptz default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,full_name,role)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),coalesce(new.raw_user_meta_data->>'role','parent'))
 on conflict(id) do update set email=excluded.email;
 return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists classes (id uuid primary key default gen_random_uuid(),name text not null,section text,created_at timestamptz default now());
create table if not exists students (
 id uuid primary key default gen_random_uuid(),full_name text not null,class_name text,section text,parent_name text,parent_email text,parent_phone text,active boolean default true,created_at timestamptz default now()
);
create table if not exists evaluation_categories (id uuid primary key default gen_random_uuid(),name text unique not null,weight numeric default 1,sort_order int default 0);
insert into evaluation_categories(name,weight,sort_order) values
('التحصيل',1,1),('المشاركة',1,2),('الانضباط',1,3),('الواجبات',1,4),('التطور',1,5),('السلوك',1,6) on conflict(name) do nothing;
create table if not exists evaluations (id uuid primary key default gen_random_uuid(),student_id uuid not null references students(id) on delete cascade,category_id uuid not null references evaluation_categories(id) on delete cascade,score numeric not null check(score between 1 and 10),evaluation_date date default current_date,note text,created_at timestamptz default now());
create table if not exists attendance (id uuid primary key default gen_random_uuid(),student_id uuid not null references students(id) on delete cascade,attendance_date date default current_date,status text not null check(status in ('حاضر','غائب','متأخر','بعذر')),note text,created_at timestamptz default now(),unique(student_id,attendance_date));
create table if not exists student_notes (id uuid primary key default gen_random_uuid(),student_id uuid not null references students(id) on delete cascade,note text not null,created_at timestamptz default now());
create table if not exists awards (id uuid primary key default gen_random_uuid(),student_id uuid not null references students(id) on delete cascade,title text not null,period text,created_at timestamptz default now());

alter table profiles enable row level security; alter table classes enable row level security; alter table students enable row level security; alter table evaluation_categories enable row level security; alter table evaluations enable row level security; alter table attendance enable row level security; alter table student_notes enable row level security; alter table awards enable row level security;

-- دوال مساعدة للصلاحيات
create or replace function public.is_teacher() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='teacher'); $$;
create or replace function public.is_parent_for_student(sid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from students where id=sid and lower(coalesce(parent_email,''))=lower(coalesce(auth.jwt()->>'email','')) and active=true); $$;

-- احذف السياسات القديمة إن وجدت
DO $$ declare r record; begin for r in select policyname,tablename from pg_policies where schemaname='public' and tablename in ('profiles','classes','students','evaluation_categories','evaluations','attendance','student_notes','awards') loop execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename); end loop; end $$;

create policy profiles_self on profiles for select using(id=auth.uid() or public.is_teacher());
create policy profiles_update_self on profiles for update using(id=auth.uid());
create policy classes_teacher_all on classes for all using(public.is_teacher()) with check(public.is_teacher());
create policy categories_auth_read on evaluation_categories for select using(auth.uid() is not null);
create policy students_teacher_all on students for all using(public.is_teacher()) with check(public.is_teacher());
create policy students_parent_read on students for select using(lower(coalesce(parent_email,''))=lower(coalesce(auth.jwt()->>'email','')) and active=true);
create policy eval_teacher_all on evaluations for all using(public.is_teacher()) with check(public.is_teacher());
create policy eval_parent_read on evaluations for select using(public.is_parent_for_student(student_id));
create policy att_teacher_all on attendance for all using(public.is_teacher()) with check(public.is_teacher());
create policy att_parent_read on attendance for select using(public.is_parent_for_student(student_id));
create policy notes_teacher_all on student_notes for all using(public.is_teacher()) with check(public.is_teacher());
create policy notes_parent_read on student_notes for select using(public.is_parent_for_student(student_id));
create policy awards_teacher_all on awards for all using(public.is_teacher()) with check(public.is_teacher());
create policy awards_parent_read on awards for select using(public.is_parent_for_student(student_id));

-- لإنشاء حساب المعلم: أنشئ المستخدم من Supabase Dashboard > Authentication > Users
-- ثم نفّذ الأمر التالي بعد معرفة UUID الخاص به:
-- update public.profiles set role='teacher',full_name='اسم المعلم' where id='USER_UUID';
