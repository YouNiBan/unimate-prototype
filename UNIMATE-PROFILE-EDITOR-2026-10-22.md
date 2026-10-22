# Connected profile editor and notification entry

Website source: 9904f5c8e05e32992a6d9f78a09415afb9859b42.

Edit profile now saves display name, bio, private birthday/origin, up to 12 interests, profile photo and banner. Camera/library controls accept JPEG, PNG and WebP up to 20 MB and re-encode/optimise photos before upload. Server validates image signatures and bounded size; CSRF, active member ownership and atomic revision checks protect saves. Username and password changes, verification, sign out and double-confirmed deactivation remain in Settings. Private personal details are not added to the public/session DTO.

The admin bell opens the expanded notification centre on New by default, retaining All and Seen. Opening the centre itself does not mark notifications seen.

Checks: 113 frontend tests, 194 backend tests, TypeScript and production build passed. Browser QA used disposable in-memory fictional accounts: photo/banner upload, save and reload, light/dark mobile editor, New notification selection. No real member account data was changed for testing.

Runtime/source archives extend the preceding reviewed release. They exclude databases, runtime uploads, secrets, dependencies, QA servers and unfinished event draft work. Existing secure account settings and booking/job chat remain intact. Stripe checkout is not enabled by this release.
