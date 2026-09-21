-- Public read of parishes for the login / user registration dropdown.
--
-- Table DDL (columns, unique indexes on name/email): sql/parishes.sql
-- Run that file first (or ensure public.parishes matches it).
--
-- If the dropdown stays on "Loading parishes..." and the browser network
-- tab shows 200 with [] or 401/403, re-apply: sql/parishes_registration_rls_fix.sql
--
-- The app requests:
--   GET /rest/v1/parishes?select=id,parish_name&order=parish_name.asc&limit=10000
-- without a logged-in user, so **anon** must be allowed to SELECT.

grant select on public.parishes to anon;

-- If you created policies in sql/parishes.sql, anon can already read via
-- "parishes_select_public". The grant above is safe alongside RLS.
