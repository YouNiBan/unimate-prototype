# UniMate clarity and username safety release

Backend: tested v35 source plus only member-usernames.mjs and the shared username safety policy, with two new policy tests. No account records, environment, payment settings or persistent data are included or modified by this package.

185 backend tests passed in an isolated checkout of the packaged source. New registrations and username changes reject a bounded list of profanity, slurs and common obfuscations; the policy is not a guarantee of universal moderation. Existing usernames are not renamed. Harmful candidates receive neutral suggestions.

Frontend: dark-mode legacy card token aliases, readable headings/fields/placeholders/actions; blank initial flight number; account usernames displayed on own profile; successful signup no longer rechecks its own newly reserved username; explicit account-ready screen after email confirmation and sign-in handoff.

105 frontend tests passed, including three new regressions. Website source: 5afa32b2219e0176aa971f3193c443a491734495; Sites v36 / appgdep_6ad9e48be0e481918037b6988092a6de succeeded 2026-10-22 10:25:34 UTC. Larger profile/marketplace/Friends/Moments restorations, self-deactivation, role approval email/role workspaces and Events drafts/chat/test payments are NOT included in this focused release.

No real account was created, renamed, suspended, deleted or charged in QA. Backend runtime preserves the previous tested server and all other modules; unfinished Events work is excluded.
