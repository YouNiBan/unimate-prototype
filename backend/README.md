# UNIMATE 优你伴 Administration

A working, separate administration service and dashboard using Node 24+ and built-in SQLite. No package installation is needed. This is a **local development foundation**, not a production service, and is not connected to the Expo app or GitHub Pages. Existing app users, posts and bookings are not automatically imported.

## Start

## Public demonstration

The shareable preview is published at `https://youniban.github.io/unimate-prototype/administration/`. It contains only fixtures defined in `preview-data.js`, never database exports. Generate `public/administration/` from the repository root with `node backend/build-preview.mjs` after changing the dashboard, and commit the generated files together with their source. Expo copies this public directory into the existing GitHub Pages deployment. The preview blocks network connections and form submission. Approve/Reject simulates decisions in browser memory and resets on reload; real account changes, uploads and messaging are unavailable. It is not a hosted production backend.

## Run the private local service

From this directory, using Node 24 or newer:

```sh
npm start
```

Open http://localhost:8090 and create your first superadmin account. There are no default credentials. Use a unique password of 8–128 characters, including at least one capital letter (A–Z) and a special character (such as !, @ or #), then re-enter it in Confirm password. Both the browser and server enforce these requirements; whitespace does not count as a special character. Existing accounts can still sign in with their current passwords. Setup is disabled after the first account is created. Run first setup on a trusted computer: another process/user on that computer could claim the initial account before you do. Keep the service bound to loopback; do not expose it through tunnels or proxies.

Optional fictional sample records (no admin account or password):

```sh
npm run seed
npm test
```

The sample loader is idempotent. It does not reset moderation decisions. All sample emails use reserved `.invalid` addresses. Set `ADMIN_PORT` to change the local port. `NODE_ENV=production` is intentionally rejected by the startup command.

## Included

### Review queues and divisions

The bell shows individual pending tasks, ordered newest first, with per-admin New/Seen tracking. Opening a task marks it seen but does not approve or resolve it. The unseen badge refreshes every 30 seconds while the page is visible. Closed tasks leave the pending list. Only tasks permitted for that role are returned.

Message centre is Owner/SuperAdmin-only while recipient-level support permissions are not yet defined. It uses persisted conversations with existing active local user/staff records, paginated message history, quick-reply templates and a chat composer. Writes are idempotent by message ID and bounded to 4,000 characters. Messages are **saved locally, not delivered**; no incoming replies, email, push, attachments or live app transport are connected. No fake user replies or delivery receipts are generated. The UI labels every message accordingly. The audit log records message references, not message bodies. Connecting delivery requires real app authentication, recipient authorization and transport; this local outbox is not a production messaging service.

Bookings has All, Cleaning, Moving, Airport transfer and Other filters with counts. Existing unclassified/event booking records remain under Other and All; none are discarded. Bookings remain Owner/SuperAdmin-only. Event approvals is a dedicated view of `approvals.kind='event'`, with approve/reject decisions and reasons. Admins can only see/decide event approvals; student, staff and other account-related approvals require Owner/SuperAdmin. These local decisions do not yet publish events or enable accounts in the live app.

Moments, forum posts and comments publish without prior moderation. `recordContentReport` is a trusted service function that accepts a verified app user's ID, validates active membership and stores one report per user/content pair. At three distinct reporters it queues one review without hiding content. The admin reports list, counts and decisions enforce that threshold. A closed review does not automatically reopen. Legacy reports without distinct-user evidence remain stored but are excluded from the queue; no invented reporters are added to real data. This local model represents each moderatable item in `posts`, with `moderation_targets` identifying moment/forum/comment. The public app's authenticated reporting integration is still required: there is intentionally no public endpoint accepting a caller-supplied user identity.

The header has sun/moon theme switching, a notification bell for current pending approval/report tasks, and EN/简体/繁體 interface controls. Core navigation, form labels and common actions are translated; submitted content, server errors and some explanatory copy retain their original language. Notifications are on-demand local task summaries, not email/push notifications. Admin accounts is accessed from Account settings rather than the sidebar.

### Ownership and account status

The hierarchy is **UniMate Owner → SuperAdmin → Admin**. The unique Owner has full access and can appoint/change SuperAdmins. SuperAdmins retain full data visibility and can manage Admins, but cannot promote anyone to SuperAdmin or alter SuperAdmin/Owner access. The Owner cannot be reassigned, deactivated or demoted through account management; ownership transfer requires a separate verified maintenance procedure. Owner assignment is explicit, not an automatic first-login promotion. Schema version 3 preserves existing accounts and adds a unique Owner constraint.

Admin account status is separate from role: **Active** or **Deactivated**. The account list can filter either status. Deactivation preserves records but blocks login and revokes existing sessions. Earlier references below to Superadmin/Normal admin correspond to the display labels SuperAdmin/Admin; the hierarchy above governs who may assign them.

- First-admin setup, sign-in and sign-out, with persisted 8-hour sessions.
- Member suspension/restoration, application approval/rejection, post hiding/restoration and report resolution/dismissal. Every decision requires a reason and an expected current status to prevent stale edits.
- Booking assignment, staff calendars and holidays, and service completion with local invoice creation; no live payment, cancellation or refund operations.
- Searchable, paginated lists (25 records per request), status filters, record details, role-aware overview counts and a Superadmin activity log. Lists search names/emails or titles/authors on the server; literal search input is escaped, bounded and parameterized. SQLite indexes support common list/status queries.
- **SuperAdmin** can see and manage all available resources, subject to Owner-only role-management restrictions; **Admin** can manage event approvals, posts and reports only. Admins cannot access users, admin accounts, money, invoices, bookings or the activity log, including direct API requests. Their overview excludes account and booking counts. Local invoice records are available to Owner/SuperAdmin; live accounting integrations are not connected.
- Superadmins can create either role under Admin accounts, change roles and disable/reactivate accounts. New account passwords must be entered by the human operator; no default credentials are issued. Changes require a reason, preserve at least one active Superadmin, disallow self-demotion/deactivation and revoke the affected account's sessions. Admin lists and audit records never include password hashes. Email invitations and forgotten-password recovery are not implemented.
- Account settings lets each signed-in admin change their own password, requiring their current password and confirmation of a policy-compliant, different new password. Five verification attempts per 15 minutes are allowed. Success revokes all of that account's sessions and records a credential-free audit event. Account identity comes from the session, never request fields. Superadmins also have a shortcut here to manage other admins; normal admins cannot do so. Enter and submit real credentials yourself, not through an assistant.
- Original `moderator` accounts migrate to Normal admin with their existing password and sessions preserved. Legacy `viewer` accounts remain read-only for approvals/posts/reports only; they cannot view accounts or financial records. New viewer accounts cannot be created. SQLite schema version 2 migrates the role constraint transactionally.
- Atomic status changes and append-only audit entries, with before/after states. These records cannot be edited through the application, but a machine/database owner can alter the database; this is not tamper-proof off-site auditing.

All decisions affect **only this service's records**. Resolving a report does not automatically hide its post; use Posts to moderate the linked post separately. Approving a linked staff application creates its local user and matching team membership automatically. It does not provision live app access; live signup and authentication are not connected.

### Staff, documents and invoices

Staff applications and approved staff have separate lists, with an All teams filter. Owner/SuperAdmin-only HR records include contact, identity-check, vehicle, insurance and job-certificate references. Company documents support local authenticated PDF storage and download. These records are not production-ready encrypted document storage; do not commit any database or uploaded files.

Completing a service creates one local invoice with an immutable booking snapshot and a sequential `UM-INV-YYYY-000001` reference. Repeated completion does not duplicate invoices. Owner/SuperAdmin can view due, overdue and closed invoices and record payment or void status. Invoices and activity logs are denied to normal Admins, including at API level. These are internal records, not delivered tax invoices or connected payments; due dates currently default to completion day.

## Security and storage

Passwords use salted scrypt hashes. Session tokens are random, stored as hashes and sent in HttpOnly, SameSite=Strict cookies. Same-origin/Host checks and session-bound CSRF tokens protect mutations. Login attempts are limited by address and account; password hashing concurrency and request body size are bounded. Queries bind user values and resource names are allowlisted. The dashboard renders record content as text, never raw HTML.

Data is stored in `data/unimate.sqlite` and SQLite sidecar files. This directory and environment secrets are ignored by Git. Local startup uses restrictive permissions. Do not upload this directory, publish credentials, or use real personal data in samples. For a consistent backup, stop the service before copying the entire data directory to a protected location. There is no built-in backup or password-reset system yet.

## Before connecting or deploying publicly

Choose backend hosting and a production database; GitHub Pages hosts only the frontend. Complete an independent security review, ongoing versioned migrations, encrypted backups and restore testing, TLS with Secure cookies, production origin/host configuration, MFA or managed identity, admin invitation delivery and password recovery, distributed rate limiting, off-host security/audit monitoring and retention policies. Add failed-login auditing and alerting. Define real user identities, tenancy and ownership, validate imports, and integrate the mobile/web app's reads and writes with authenticated APIs. Add deployment and end-to-end tests for that integration. Never enable production by merely removing the local-only startup guard.

## Checks

`npm test` runs isolated temporary-database tests for setup, login, CSRF/origin enforcement, permissions, rate limiting, persistence, moderation, stale writes, audit integrity, admin account creation/revocation, legacy migration and static assets. Tests do not modify your local database.

The capacity check inserts 500 fictional member records, traverses all 20 pages without duplicates, checks search/status filtering, and runs 20 concurrent list requests. It prints local elapsed time, which is a diagnostic rather than a performance guarantee. This validates administration of a 500-record community, **not 500 simultaneous signed-in users**, media traffic or production app scaling. The live app's user authentication and workload still need integration and realistic load tests on the chosen hosting. SQLite and a single process are suitable for this local administration prototype; production sizing depends on actual traffic, write volume and availability requirements.
