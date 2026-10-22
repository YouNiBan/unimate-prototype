# Public profile privacy

Website source: 2a90ab9eb0bb1f215cf5592f57a0236101471665.
Backend baseline: 17cbf382a2f43c249efd531a62c0660674518417.

Public profile header: display name, username, university (when shared), age in years (when shared), interests. No invented university or interest values.

Profile → Manage profile privacy contains separate Show age and Show university switches with explicit save. Settings are account-scoped, persisted server-side, CSRF-protected, audited and revision-checked. Age defaults hidden; university preserves its previously visible default.

Public DTOs redact hidden values, including Friends discovery search and same-university filters. Full birthday, legal full name, sign-in email and university email remain private. Self Public view uses the same redacted DTO as other members.

Checks: 203 backend tests, 120 frontend tests, TypeScript, production build, fictional-account browser save/reload/public-preview checks. Existing production members and their settings were not altered during testing. No QA records or local data are included.
