-- How to let Parish (and User) registrations log in immediately without
-- having to click a verification email.
--
-- Two-step setup. Do both once.
--
-- ============================================================================
-- STEP 1 — Disable email confirmations in the Supabase project
-- ============================================================================
-- This is a project-level toggle, not SQL. Do it in the Supabase dashboard:
--
--   1. Supabase Dashboard -> Authentication -> Sign In / Providers
--   2. Find the "Email" provider and open its settings
--   3. Turn OFF "Confirm email"  (some versions label it "Enable email
--      confirmations")
--   4. Click Save.
--
-- After this, any new sign-up returns a session token in the same response,
-- so the dashboard's patched registration flow can log the user straight in
-- and save the parish/priest/user profile rows with that token.
--
-- ============================================================================
-- STEP 2 — (optional) Auto-confirm anyone who registered earlier while
--          email confirmation was ON
-- ============================================================================
-- Any account created before Step 1 is stuck as "email not confirmed" and
-- can't log in. Run this in the Supabase SQL Editor to retroactively mark
-- every registered parish / user account as confirmed.
--
-- NOTE: only the project owner can write to auth.users. The Supabase SQL
-- Editor runs as the postgres role, so this works.

update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now()),
       confirmed_at       = coalesce(confirmed_at,       now())
 where email_confirmed_at is null
   and coalesce(raw_user_meta_data ->> 'role', '') in ('parish', 'user');

-- Or, if you want to confirm one specific email only:
--
--   update auth.users
--      set email_confirmed_at = coalesce(email_confirmed_at, now()),
--          confirmed_at       = coalesce(confirmed_at,       now())
--    where lower(email) = lower('parish.example@gmail.com')
--      and email_confirmed_at is null;

-- ============================================================================
-- STEP 3 — (optional sanity check)
-- ============================================================================
-- List accounts that are still unconfirmed:
--
--   select id, email, raw_user_meta_data ->> 'role' as role, created_at
--     from auth.users
--    where email_confirmed_at is null
--    order by created_at desc;
