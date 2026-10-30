-- Workout list filters by user and date. Title is optional.
-- The init migration is left unchanged.

alter table public.workouts
  add column if not exists title text;

-- create index on workouts (user_id, performed_at desc)
create index if not exists workouts_user_performed_at_idx
  on public.workouts (user_id, performed_at desc);
