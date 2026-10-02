-- نجم الصف V2 — مخطط قاعدة البيانات
-- نفّذ هذا الملف في Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('teacher','parent','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  grade text not null,
  section text not null,
  academic_year text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  full_name text not null,
  student_code text unique,
  photo_url text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.parent_students (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key(parent_id, student_id)
);

create table if not exists public.evaluation_categories (
  id text primary key,
  name text not null,
  weight numeric(5,4) not null check (weight >= 0 and weight <= 1),
  icon text
);

insert into public.evaluation_categories(id,name,weight,icon) values
('discipline','الانضباط',.25,'🧭'),
('homework','الوظائف',.20,'📚'),
('memorization','الحفظ',.20,'📖'),
('participation','المشاركة',.15,'🙋'),
('attendance','الحضور والالتزام',.10,'🕐'),
('cooperation','التعاون والسلوك',.10,'🤝')
on conflict(id) do update set name=excluded.name,weight=excluded.weight,icon=excluded.icon;

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  category_id text not null references public.evaluation_categories(id),
  score integer not null check (score between 1 and 10),
  teacher_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  note text not null,
  visible_to_parent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.parent_students enable row level security;
alter table public.evaluation_categories enable row level security;
alter table public.evaluations enable row level security;
alter table public.teacher_notes enable row level security;

-- صلاحيات الملفات الشخصية
create policy "profile_self" on public.profiles for select using (id = auth.uid());

-- المعلم يرى صفوفه، والمدير يرى الجميع
create policy "teacher_classes" on public.classes for select using (
  teacher_id = auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);

-- الطلاب: المعلم يرى طلاب صفوفه، وولي الأمر يرى الطلاب المرتبطين به
create policy "student_access" on public.students for select using (
  exists(select 1 from public.classes c where c.id=students.class_id and c.teacher_id=auth.uid())
  or exists(select 1 from public.parent_students ps where ps.student_id=students.id and ps.parent_id=auth.uid())
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);

create policy "parent_links_self" on public.parent_students for select using (parent_id=auth.uid());

create policy "categories_authenticated" on public.evaluation_categories for select using (auth.uid() is not null);

create policy "eval_teacher_insert" on public.evaluations for insert with check (
  teacher_id=auth.uid() and exists(
    select 1 from public.students s join public.classes c on c.id=s.class_id
    where s.id=evaluations.student_id and c.teacher_id=auth.uid()
  )
);
create policy "eval_teacher_select" on public.evaluations for select using (
  teacher_id=auth.uid()
  or exists(select 1 from public.parent_students ps where ps.student_id=evaluations.student_id and ps.parent_id=auth.uid())
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);

create policy "notes_teacher_all" on public.teacher_notes for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy "notes_parent_select" on public.teacher_notes for select using (
  visible_to_parent=true and exists(select 1 from public.parent_students ps where ps.student_id=teacher_notes.student_id and ps.parent_id=auth.uid())
);

-- ملاحظة: إنشاء المستخدمين وربط parent_students يمكن أن يتم من لوحة Supabase
-- أو عبر واجهة إدارية لاحقة بعد التأكد من الصلاحيات.
