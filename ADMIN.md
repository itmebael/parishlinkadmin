This folder serves the DioLink parish administration portal. Existing administrator accounts use the `parish` auth role. Client (`user`) accounts and public registration are excluded.

The maintained application is `dist/index.html` and `dist/assets/index-v20260422157000.js`; `src/App.jsx` is only a development wrapper. Client screen functions were removed from the maintained bundle. The former `vite-dist` build was removed, and `site-build` was regenerated. Vercel publishes only `site-build`.

Run `npm run build` to publish the maintained application into `site-build`. Do not overwrite `dist` with a Vite build. The SQL directory is preserved unchanged; this change does not apply database migrations or alter the Supabase project's authentication settings or row-level security policies.

The portal checks the account role returned by authentication on login, refresh, callback, and session restoration. An app metadata role takes precedence over the existing user metadata role. Database authorization continues to depend on the project's existing policies.

`scripts/check-admin-only.mjs` tests role rejection and browser login/session behavior with mocked authentication responses. It requires `scripts/preview-design.mjs` on port 5181 and a browser debugging endpoint on port 9223 (override with `BROWSER_DEBUG_PORT`). No real credentials or database writes are used by these checks.

`scripts/make-admin-only.mjs` records the one-time bundle migration; it must not be rerun on the already migrated bundle. `scripts/admin-login.txt` holds its readable login component input.
