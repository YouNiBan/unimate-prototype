# UniMate source and deployment

The release branch contains the current administration deployment in `unimate-demo.zip`. Render extracts this archive and runs `hosted-server.mjs`; its persistent account database and encryption key stay outside Git.

`unimate-backend-source.zip` contains the full administration source, tests and OCR assets. `unimate-website-source.zip` contains the student website source and assets. Extract each package into its own directory, install with pnpm, and use the included package scripts. The website expects EXPO_PUBLIC_API_URL=https://admin.hellounimate.com.

The retained Expo prototype App.tsx moves its illustrative reviewer leaderboard onto a separate page with All time and Friends tabs. The connected website implements real directory listings, private student onboarding and university verification, reviewed photo-to-menu extraction, verified community reviews, connections and real reviewer rankings.

Administration supports automatic mobile/desktop layouts and a saved manual override, grouped navigation, multiple department responsibilities, Owner-only encrypted company documents and an initial UK compliance checklist for a business with no employees yet. Product sales reporting is separate from service invoices. Marketplace product checkout is not connected yet, so there is no live product-payment feed; the sales report states this explicitly. Event/forum posting and marketplace purchase flows remain unfinished and are not represented as completed sales or activity.

Validation: 160 backend tests, 75 website tests, type checking and web export passed. The menu OCR browser check extracted the sample item names and prices; publication requires a human review of recognised prices.
