-- Body measurements: catalog (admin) and per-user logs.
-- Apply in the Supabase SQL editor or with `supabase db push`.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null check (unit in ('см', 'кг')),
  hint text,
  image_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.body_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  measurement_id uuid not null references public.measurements (id) on delete restrict,
  measured_at date not null default current_date,
  value numeric(6, 1) not null check (value > 0 and value <= 400),
  created_at timestamptz not null default now(),
  unique (user_id, measurement_id, measured_at)
);

create index body_entries_user_measurement_date_idx
  on public.body_entries (user_id, measurement_id, measured_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.measurements enable row level security;
alter table public.body_entries enable row level security;

create policy measurements_select_authenticated
  on public.measurements
  for select
  to authenticated
  using (true);

create policy measurements_insert_admin
  on public.measurements
  for insert
  to authenticated
  with check (public.is_admin());

create policy measurements_update_admin
  on public.measurements
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy measurements_delete_admin
  on public.measurements
  for delete
  to authenticated
  using (public.is_admin());

create policy body_entries_own
  on public.body_entries
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy body_entries_admin_select
  on public.body_entries
  for select
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.measurements to authenticated;
grant select, insert, update, delete on public.body_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public read, admin write
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'measurement-images',
  'measurement-images',
  true,
  307200,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy measurement_images_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'measurement-images');

create policy measurement_images_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'measurement-images' and public.is_admin());

create policy measurement_images_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'measurement-images' and public.is_admin())
  with check (bucket_id = 'measurement-images' and public.is_admin());

create policy measurement_images_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'measurement-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Catalog. Re-running refreshes names and hints, and keeps uploaded photos.
-- ---------------------------------------------------------------------------

insert into public.measurements (id, name, unit, hint, sort_order)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'Вага',
    'кг',
    'Зважуйся вранці, в однакових умовах.',
    1
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'Талія',
    'см',
    'На рівні пупка, живіт розслаблений. Показує динаміку жиру в ділянці живота.',
    2
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'Груди',
    'см',
    'По найбільш виступаючих точках грудей, стрічка проходить під пахвами.',
    3
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'Біцепс',
    'см',
    'Посередині плеча, рука розслаблена. Можна додатково міряти напружену.',
    4
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    'Стегно',
    'см',
    'Посередині між пахом і коліном.',
    5
  ),
  (
    'a1000000-0000-4000-8000-000000000006',
    'Плечі',
    'см',
    'По найширшій окружності плечового пояса.',
    6
  ),
  (
    'a1000000-0000-4000-8000-000000000007',
    'Стегна (таз)',
    'см',
    'По найширшій частині сідниць.',
    7
  )
on conflict (id) do update
set
  name = excluded.name,
  unit = excluded.unit,
  hint = excluded.hint,
  sort_order = excluded.sort_order;
