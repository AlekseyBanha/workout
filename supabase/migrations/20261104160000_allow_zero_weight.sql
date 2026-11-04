-- Bodyweight sets use 0 kg. The init check required weight > 0.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'workout_sets'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%weight > 0%'
  loop
    execute format('alter table public.workout_sets drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.workout_sets
  drop constraint if exists workout_sets_weight_check;

alter table public.workout_sets
  add constraint workout_sets_weight_check
  check (weight >= 0 and weight <= 999 and (weight * 2) = trunc(weight * 2));
