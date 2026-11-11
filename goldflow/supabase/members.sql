-- Puts Mordain and Wulfgar on the guest list (run after creating the two users in Supabase Auth).
insert into public.members (user_id, display_name, color)
select id, 'Mordain', '#f2c45a' from auth.users where lower(email) = 'mordain@goldflow.app'
on conflict (user_id) do update set display_name = excluded.display_name;
insert into public.members (user_id, display_name, color)
select id, 'Wulfgar', '#8fc3d6' from auth.users where lower(email) = 'wulfgar@goldflow.app'
on conflict (user_id) do update set display_name = excluded.display_name;
select display_name from public.members;
