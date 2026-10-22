# Connected profile, account settings and administration update

Website source: 93752a0c3fac03b7d1b44c2dfb8f689f9749f864. Source archive is the exact Git revision; production assets use https://admin.hellounimate.com. No QA fixtures or private account data are included.

Profile now follows the original prototype hero and nine-section menu. Settings connects real username changes, current-password-verified password changes, account verification, sign out and reversible deactivation. Deactivation requires a separate first confirmation, a short-lived session-bound challenge, typing DEACTIVATE and the current password. First confirmation does not change the account. Final confirmation revokes all member sessions while retaining records for Support reactivation; it does not cancel bookings or settle payments.

Administration separates Name, Username and a stable short UMU-000001 account code. Legacy references remain searchable and unchanged. The display selector moves to the footer and mobile header controls have consistent sizing.

Notifications include account registrations, scoped application/event approvals, qualifying reports, forum records and new cleaning/moving/airport-transfer bookings. All/New/Seen state is per administrator; viewing does not approve or resolve records. The bell refreshes every 30 seconds while the administration page is visible. Existing moderation thresholds and department/inbox permission boundaries remain enforced.

Includes the separately reviewed private assigned-job chat and continuous UM-000001 job codes, carried between client/team and separate staff/team threads. Service-specific UMC/UMM/UMAT codes were suggested but not applied pending the user's choice. Featured student lists now scroll/swipe horizontally without See all.

Verification: 192 backend tests, 111 frontend tests, website typecheck, production export and isolated browser QA. No real user was deactivated, renamed, charged or sent a test message.

Not included: unfinished full marketplace seller checkout/listing flows; Moments/Forum posting and interaction history; full privacy controls, marketplace purchase history or saved-payment-method management; expanded specialist-role approval emails/workspaces; event drafts/payment changes. Profile menu entries for unconnected features explicitly explain their current availability. Stripe remains test-only and unavailable without test configuration.

Runtime/source archives preserve the prior released baseline plus only the reviewed modules, admin assets and tests. No databases, uploaded files, credentials, dependencies or unrelated native prototype changes are included.
