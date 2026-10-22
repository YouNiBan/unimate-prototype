# UniMate profile and messaging release

Website source: 4ba33641def0f97a099f5fb8bc7fddf87cc90743.
Backend baseline: 47f616963e8129eada0efd36dabbc5cea76fc22f.

- Private full names are separate from public display names. New signups require complete names; existing incomplete records are flagged and members are prompted to complete them. Owner/SuperAdmin corrections are version-checked and audited.
- Friends discovery, shared-interest/university/event/mutual filters, incoming/outgoing requests, Accept/Decline/Cancel, following/followers and block lists use live account data.
- Public member profiles expose explicit public fields only. Private email, full name, birthday and origin details never enter the public profile response.
- Mutual follows become friends. Personal chats require current friendship on every read, send and attachment request. Blocks, suspension and friendship removal revoke access. Service workers use official team/job inboxes, not personal client chats.
- Shared support chat now uses profile photos, current display names, consistent outline icons, incoming/outgoing bubbles and a responsive desktop/mobile layout. Image attachments have no filename caption; opening an image offers Save image. PDF filenames are retained.
- Moments/Forum profile tabs show only explicitly ownership-linked published posts with audience checks. This release does not implement global post publishing, likes/comments, group chats or end-to-end encryption.
- Existing official support/team identity and staff job-reference permissions are preserved.

Checks: 202 backend tests; 118 frontend tests plus Node default discovery validation; TypeScript; production build; fictional in-memory browser QA. No QA records, local database, credentials or unfinished event-draft changes are packaged.

Runtime remains unimate-demo.zip. Source ZIPs are backups and must match this release; backend persistent production data is retained separately on its disk.
