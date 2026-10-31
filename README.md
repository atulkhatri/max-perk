# Card Offers

Know which Canadian credit card to use for every purchase. A mobile-first
responsive web app: sign in, add the cards you own, and get a ranked
best-card answer for any store + category — with points and estimated dollar
value side by side, store-card comparison, loyalty stacking nudges,
perk-aware ranking, redemption guidance, new-card suggestions, and tracked
offers at check time.

## Quick start (local)

Prerequisites: Node.js 22+, npm, Java (for the Firestore emulator),
Firebase CLI (`npm install -g firebase-tools`).

```powershell
npm ci
npm run emulators
```

In a second terminal, seed the demo account, then start the app:

```powershell
node scripts/seed-emulators.mjs
npm run dev
```

Open http://127.0.0.1:5173 in a browser and sign in with the seeded
test account:

- email: `tester@example.com`
- password: `tester-1234`

The demo wallet contains Amex Cobalt, PC Financial World Elite Mastercard,
and Triangle World Elite Mastercard. Try “Loblaws” with and without a spend
amount, then “Best Buy” (coverage-first) and “Canadian Tire” (store-card
comparison). Re-run the seed script any time; it reuses the account and
restores the demo wallet.

The emulator UI is available at http://127.0.0.1:4000 while emulators run.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server (uses emulators per `.env.development`) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the ranking/catalog test suite once |
| `npm run emulators` | Start Auth + Firestore emulators |
| `npm run seed:emulators` | Seed the demo account + wallet (same as `node scripts/seed-emulators.mjs`) |
| `npm run catalog:fetch` | Snapshot the 12 official issuer pages + extract fee/earn signals |
| `npm run catalog:diff` | Diff the two latest snapshots for issuer-term changes |
| `npm run catalog:sync:dry` | Validate the curated JSON and preview the Firestore write plan |
| `npm run catalog:sync:emulator` | Sync the catalog into the local emulator (needs `npm run emulators`) |
| `npm run catalog:sync -- --confirm` | Publish the catalog to production Firestore (needs a service-account key) |
| `npm run deploy` | Build and deploy hosting + Firestore rules (needs `firebase login`) |

## Configuration

Environment files (see `.env.example` for every variable):

- `.env.development` — local work against the emulators.
- `.env.production` — live Firebase project, emulators off.

Firebase web keys ship in the client bundle by design; access control lives
in `firestore.rules` (users read/write only their own `users/{uid}` wallet).
After enabling providers, deploy rules with
`firebase deploy --only firestore:rules`.

## Project layout

- `src/strings.ts` — every user-visible string in one file; `APP_NAME` renames the app.
- `src/theme/` — light/dark/system modes + accent colours, persisted per browser.
- `data/` — curated catalog source of truth (`catalog.curated.json`: 96 cards
  across personal + business segments, 30 programs, 26 merchants, 2 loyalty
  programs, 4 illustrative offers), official issuer URL registry (96 sources),
  and weekly page snapshots. See `data/README.md`.
- `src/data/seeds/` — typed wrappers over the curated JSON (bundled fallback);
  `src/data/catalogStore.ts` subscribes to the live Firestore catalog.
- `src/ranking/` — pure ranking engine + suggester with tests (`rank.test.ts`).
- `src/auth/`, `src/wallet/` — Firebase Auth and the Firestore wallet repository.
- `src/components/`, `src/pages/` — UI surfaces (check, wallet, suggest, settings).
- `docs/` — PRD, implementation plan, and v1 scope sheet.
- `scripts/seed-emulators.mjs` — demo data seeding for local testing.

## Notes and limits (v1)

- Curated data is guidance, not promises: issuers change terms. Issuer pages
  are re-checked weekly and the Firestore catalog updates after human
  verification (see `docs/CARD_DATA_REFRESH.md`). Estimates state their
  assumptions in-app; full issuer terms always win.
- Tracked bank offers are a small illustrative sample, not a live feed.
- Google sign-in is wired for production; local test mode signs in with a
  test Google profile (email sign-in is the primary local path).
- Out of scope for v1 (per `docs/PRD.md`): bank connections, applications,
  purchase history, budgeting, credit scores, real-time feeds, claims,
  offline mode, fee flagging, yearly reviews, expiry monitoring,
  non-Canada markets, native apps.
