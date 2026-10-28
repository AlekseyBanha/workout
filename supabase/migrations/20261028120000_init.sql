-- Workout tracker: profiles, catalog, sessions, RLS, storage.
-- Apply in the Supabase SQL editor or with `supabase db push`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  description text,
  image_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  performed_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  set_number int not null check (set_number > 0),
  weight numeric(6, 2) not null check (weight > 0 and weight <= 999 and (weight * 2) = trunc(weight * 2)),
  reps int not null check (reps > 0 and reps <= 100),
  created_at timestamptz not null default now(),
  unique (workout_id, exercise_id, set_number)
);

create index workout_sets_user_exercise_created_idx
  on public.workout_sets (user_id, exercise_id, created_at desc);

create index workouts_user_performed_idx
  on public.workouts (user_id, performed_at desc, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    'user'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role and email are not writable from a user JWT. SQL editor (no uid)
-- and the service role used by Edge Functions can still change them.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' then
    if new.role is distinct from old.role then
      raise exception 'role cannot be changed from the client';
    end if;
    if new.email is distinct from old.email then
      raise exception 'email cannot be changed from the client';
    end if;
    if new.id is distinct from old.id then
      raise exception 'id cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

create or replace function public.enforce_set_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner uuid;
begin
  select w.user_id into owner
  from public.workouts w
  where w.id = new.workout_id;

  if owner is null or owner <> new.user_id then
    raise exception 'workout owner mismatch';
  end if;

  return new;
end;
$$;

create trigger workout_sets_owner
  before insert or update on public.workout_sets
  for each row execute function public.enforce_set_owner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;

create policy profiles_select_own_or_admin
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own_or_admin
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy exercises_select_authenticated
  on public.exercises
  for select
  to authenticated
  using (true);

create policy exercises_insert_admin
  on public.exercises
  for insert
  to authenticated
  with check (public.is_admin());

create policy exercises_update_admin
  on public.exercises
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy exercises_delete_admin
  on public.exercises
  for delete
  to authenticated
  using (public.is_admin());

create policy workouts_own
  on public.workouts
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy workout_sets_own
  on public.workout_sets
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;
grant select, insert, update, delete on public.workout_sets to authenticated;

-- Anon has no RLS policy, so this grant does not expose rows.
-- The keepalive workflow can still hit the REST API and receive [].
grant select on public.exercises to anon;

-- ---------------------------------------------------------------------------
-- Storage: public read, admin write
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-images',
  'exercise-images',
  true,
  307200,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy exercise_images_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'exercise-images');

create policy exercise_images_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'exercise-images' and public.is_admin());

create policy exercise_images_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'exercise-images' and public.is_admin())
  with check (bucket_id = 'exercise-images' and public.is_admin());

create policy exercise_images_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'exercise-images' and public.is_admin());
