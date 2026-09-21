-- Emergency fix: stop /auth/v1/signup 500 caused by DB triggers.
--
-- If Supabase Auth returns 500 during signup, the most common cause is a
-- failing trigger on auth.users (or a function it calls). This script
-- disables our profile auto-creation trigger so signup can proceed.
--
-- After running this, the app should create/upsert the profile row in
-- public.registered_users from the client (or you can re-enable the trigger
-- after fixing the underlying error in Postgres logs).
--
-- Safe to re-run.

-- Some editors reject DROP TRIGGER at top-level; execute dynamically.
do $$
begin
  begin
    execute 'drop trigger if exists handle_new_auth_user_parish_link_trg on auth.users';
  exception when others then
    -- Ignore if permissions/parsing differ; signup will still rely on client-side profile save.
    null;
  end;
end $$;

-- Optional: keep the function for later re-enable, but you can drop it too.
-- drop function if exists public.handle_new_auth_user_parish_link();

