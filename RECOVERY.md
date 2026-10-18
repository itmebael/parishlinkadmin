# Running the admin portal

With Node.js installed, run npm start or start-admin.cmd. The admin binds to localhost:5181, separate from the client on 5180. The Windows launcher also supports the sibling portable Node.js installation.

The entry script loads the maintained admin-specific bundle. The original baptism editor, responsive navigation, settings controls and available styles were restored from upstream. Notification preferences and calendar time utilities were reconstructed and checked against the existing tests. Existing dependencies and development/build scripts are preserved.

The following optional stylesheet was not present in the incomplete local archive or upstream and was omitted from the startup page:

- /dist/assets/notification-controls.css
