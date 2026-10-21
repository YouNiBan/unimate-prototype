# UniMate source and deployment

The release branch contains the current administration deployment in `unimate-demo.zip`. Render extracts this archive and runs `hosted-server.mjs`; its persistent account database and encryption key stay outside Git.

`unimate-backend-source.zip` contains the full administration source, tests and OCR assets. `unimate-website-source.zip` contains the student website source and assets. Extract each package into its own directory, install with pnpm, and use the included package scripts. The website expects EXPO_PUBLIC_API_URL=https://admin.hellounimate.com.

The retained Expo prototype App.tsx moves its illustrative reviewer leaderboard onto a separate page with All time and Friends tabs. The connected website implements real directory listings, private student onboarding and university verification, reviewed photo-to-menu extraction, verified community reviews, connections and real reviewer rankings.

Administration supports automatic mobile/desktop layouts and a saved manual override, grouped navigation, multiple department responsibilities, Owner-only encrypted company documents and an initial UK compliance checklist for a business with no employees yet. Product sales reporting is separate from service invoices. Marketplace product checkout is not connected yet, so there is no live product-payment feed; the sales report states this explicitly. Event/forum posting and marketplace purchase flows remain unfinished and are not represented as completed sales or activity.

Sign-in has an optional Keep me signed in checkbox. New unchecked sign-ins use a browser-session cookie; checked sign-ins persist for up to 30 days, including after two-factor verification. Existing remembered sessions retain their original expiry.

Validation: 170 backend tests, 85 website tests, type checking and web export passed. The menu OCR browser check extracted the sample item names and prices; publication requires a human review of recognised prices.

Mobile administration: record tables reflow into labelled cards with visible View actions. Admin accounts use compact searchable summaries and separate detail/permission dialogs. The mobile staff calendar uses a dated agenda. Message centre has no section dropdown. Small-screen forms, menus, long text, message controls and dialogs wrap within safe edges; desktop retains its table and calendar layouts. Checked at 320, 390 and 520 px, plus desktop.

Member management: Owner and SuperAdmin can approve verified access without university email confirmation, temporarily suspend with an end date, restore access early, and permanently remove a member account after typing its readable Member ID. Admin approval preserves personal email login and does not manufacture university email proof. Deletion removes credentials, private profile and public restaurant reviews; business/audit records remain and the username stays reserved. This is an administrator control, not yet a student-initiated deletion flow.

Student signup requires a unique case-insensitive username of 3–30 letters, numbers, dots or underscores, with available suggestions and atomic server enforcement. Authenticated header order: Notifications, Location, Theme, Language. Public footer and About identify UniMate LTD. Connected website source commit: fb8dc8e5a41a6a65dacb84e737b55633bb32ba9d.

Website follow-up v31 corrects the welcome prompt for already-verified members and uses container sizing to stack profile controls in forced mobile view. The independent Render deployment remains the tested backend release at 8827524ec442b1307cbfe24adc42f20ec267f2a1.

Website v32 removes setup progress and Finish later from completed profiles. Partial details can still be saved on Profile. Home keeps a nondismissed reminder until personal details and verified/tester access are complete. 85 website tests, typecheck and production export passed.
