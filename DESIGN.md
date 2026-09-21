# DioLink design

The Parish and User portals use a warm white and sage palette, Lora headings,
and DM Sans body text. System fonts provide fallbacks if Google Fonts is unavailable.

- Shared design: `dist/assets/heaven.css`
- Church illustration: `dist/assets/heaven-church.svg`
- Application entry: `dist/index.html`
- Maintained application bundle: `dist/assets/index-v20260422157000.js`

Run `npm.cmd run dev` in PowerShell. Run `npm.cmd run build` to produce
`site-build/`, then `npm.cmd run preview` to preview that output.
The build preserves `dist/`: it contains the application and must not be cleared.

Browser verification uses `scripts/preview-design.mjs` on port 5181 and an isolated
Chrome debugging session on port 9223. `scripts/check-heaven-design.mjs` checks
22 routes at desktop and mobile widths, calendar navigation, the booking dialog,
mobile navigation, password visibility, registration layout, and theme switching.
These checks use mock account data and intercept database calls; they do not
validate live database transactions. Screenshots are saved to `.design-preview/`.

The missing application files were restored from the local `dio-main.zip` backup.
Diocese routes, screens, and chat were removed again before applying the redesign.
