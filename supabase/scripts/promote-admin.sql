-- Run in the SQL editor after creating the user in Authentication → Users.
-- Replace the email. auth.uid() is null in the SQL editor, so the
-- profile trigger allows this role change.

update public.profiles
set role = 'admin'
where email = 'alekseybanga2001@gmail.com';
