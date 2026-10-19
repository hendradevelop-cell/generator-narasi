-- Skema awal: login (Supabase Auth) + peran user/admin + riwayat generasi narasi.
-- Jalankan di Supabase SQL Editor (atau `supabase db push`).
-- Idempoten: aman dijalankan ulang.

-- ============================================================
-- PROFILES (1 baris per akun auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  nama text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Profil dibuat otomatis saat akun auth dibuat (termasuk lewat Admin API dari backend).
-- Akun pertama menjadi admin (bootstrap); akun berikutnya default 'user' dan role-nya
-- ditentukan admin lewat halaman Admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nama, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nama', ''),
    case
      when exists (select 1 from public.profiles where role = 'admin') then 'user'
      else 'admin'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: akun yang terlanjur dibuat sebelum migrasi dijalankan tetap mendapat profil.
-- Semua dimasukkan sebagai 'user', lalu akun paling awal dipromosikan menjadi admin
-- bila belum ada admin sama sekali.
insert into public.profiles (id, email, nama, role)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'nama', ''),
  'user'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

update public.profiles p
set role = 'admin'
where p.id = (
  select u.id
  from auth.users u
  join public.profiles pr on pr.id = u.id
  where pr.role <> 'admin'
  order by u.created_at asc
  limit 1
)
and not exists (select 1 from public.profiles where role = 'admin');

drop policy if exists "profiles: baca sendiri atau semua (admin)" on public.profiles;
create policy "profiles: baca sendiri atau semua (admin)"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: admin mengubah profil" on public.profiles;
create policy "profiles: admin mengubah profil"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- GENERATIONS (satu baris per klik "Generate Narasi")
-- ============================================================
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  topik text not null default '',
  headline text not null default '',
  brief text not null default '',
  durasi_detik numeric not null default 0,
  jumlah_varian_diminta integer not null default 0,
  jumlah_varian_hasil integer not null default 0,
  anti_duplikat boolean not null default true,
  mode text not null default 'mock',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);
create index if not exists generations_created_idx
  on public.generations (created_at desc);

alter table public.generations enable row level security;

drop policy if exists "generations: baca sendiri atau semua (admin)" on public.generations;
create policy "generations: baca sendiri atau semua (admin)"
  on public.generations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ============================================================
-- NARRATIONS (satu baris per varian tersimpan; sumber riwayat anti-duplikat)
-- ============================================================
create table if not exists public.narrations (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid references public.generations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  topik text not null default '',
  label text not null default '',
  teks text not null,
  teks_normal text not null,
  created_at timestamptz not null default now()
);

create index if not exists narrations_created_idx
  on public.narrations (created_at desc);
create index if not exists narrations_generation_idx
  on public.narrations (generation_id);

alter table public.narrations enable row level security;

drop policy if exists "narrations: baca sendiri atau semua (admin)" on public.narrations;
create policy "narrations: baca sendiri atau semua (admin)"
  on public.narrations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Penulisan riwayat dilakukan backend memakai service role key (bypass RLS),
-- sehingga tidak ada policy insert/update/delete untuk role authenticated.

-- ============================================================
-- GRANTS (wajib untuk project Supabase baru)
-- Sejak 2026, tabel yang dibuat via SQL tidak otomatis terekspos ke Data API.
-- Anon tidak diberi akses; authenticated hanya baca + update role melalui RLS.
-- ============================================================
revoke all on public.profiles from anon;
revoke all on public.generations from anon;
revoke all on public.narrations from anon;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.generations to authenticated;
grant select on public.narrations to authenticated;

-- Service role dipakai backend untuk menulis riwayat.
grant usage on schema public to service_role;
grant all on public.profiles to service_role;
grant all on public.generations to service_role;
grant all on public.narrations to service_role;

