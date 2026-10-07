Parish Announcement now contains Announcements and Bulletins tabs. Both support
Draft, Published, and Archived posts; editing; deletion; images; and documents.
Announcements include Notice and Financial Report. Bulletins use the five supplied
categories. The existing announcement access policies are preserved.

Apply `parish_publishing.sql` in Supabase SQL Editor after the existing announcement,
parishes, and registered_users tables. This repository change does not run SQL on
the live project. The migration is re-runnable and inserts no sample posts.

The publisher's verified auth email must match `parishes.email`. The new bulletin
policies authorize that match through auth.users, not user-editable metadata.
Members can read Published bulletins for their linked parish only.

Files are stored in the private `parish-post-attachments` bucket at
`{parish_id}/{announcement|bulletin}/{post_id}/{random_id}.{extension}`.
The app records name, MIME type, size, path, and durable authenticated HTTPS URL
in `attachments`, and image URLs in `photo_urls`. Draft/Archived attachments are
publisher-only. Members can sign attachments referenced by Published posts in
their parish. The UI obtains fresh one-hour signed URLs for previews/downloads.
Never persist expiring signed links as the only attachment reference.

The separate member app must use its JWT to POST
`/storage/v1/object/sign/parish-post-attachments/{encoded_path}` with
`{"expiresIn":3600}` and open the returned signedURL. An authenticated storage URL
in photo_urls cannot be used as a plain img src without an Authorization header.
Existing external HTTPS photo URLs remain supported and survive editing.
See https://supabase.com/docs/guides/storage/serving/downloads for private downloads.

Each post supports up to 10 attachments. The storage bucket enforces 10 MB per
file and the allowed image/document MIME types. The UI also caps each upload at
50 MB. Newly uploaded files are cleaned up if saving fails. Removed attachments
are deleted after the post update succeeds; storage cleanup failures are reported.

Verification: `node scripts/check-parish-publishing.mjs`, with the existing local
preview on port 5181 and browser debugging on port 9223. Tests use mocked auth,
REST, and storage responses; they do not validate deployed database RLS or write
to the live database.
