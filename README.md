# Max Perk

Make every card count. A mobile-first responsive web app: add the credit
cards you own and get a ranked best-card answer for any store + category —
with points and estimated dollar value side by side, store-card comparison,
loyalty stacking nudges, perk-aware ranking, redemption guidance, new-card
suggestions, and tracked offers at check time.

Live site: https://maxperk.app

## Quick start (local, about 5 minutes)

Prerequisites: Node.js 22+, npm, Java 17+ (for the Firestore emulator),
Firebase CLI (`npm install -g firebase-tools`).

```powershell
npm ci
npm run emulators
```

In a second terminal, seed the demo account and wallet, then start the app:

```powershell
npm run seed:emulators
npm run dev
```

Open http://127.0.0.1:5173 in a browser (Vite picks the next free port if
5173 is taken — check the terminal output) and sign in with the seeded
test account:

- email: `tester@example.com`
- password: `tester-1234`

The demo wallet contains Amex Cobalt, Scotia Momentum, Tangerine,
PC Financial, and Triangle. Try “Loblaws” with and without a spend amount
(grocery + a PC Optimum stacking nudge), “Sobeys” (merchant-specific rate),
“Esso” (fuel earn), or pick Electronics as the purchase type to see
coverage-first ranking. Re-run the seed script any time; it reuses the
account and restores the demo wallet.

The emulator UI is available at http://127.0.0.1:4000 while emulators run.
No Firebase project or account is needed: local development runs entirely
against the emulators with the committed `.env.development`.

## Test user and seed data

`npm run seed:emulators` (aka `node scripts/seed-emulators.mjs`) is
idempotent: it creates `tester@example.com` / `tester-1234` in the Auth
emulator if missing and overwrites the wallet with the five demo cards
above. Run it whenever you want a known-good state for end-to-end testing.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server (uses emulators per `.env.development`) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the full unit test suite once |
| `npm run emulators` | Start Auth + Firestore emulators |
| `npm run seed:emulators` | Seed the demo account + wallet (idempotent) |
| `npm run catalog:fetch` | Snapshot official issuer pages (maintainers: needs local dataset) |
| `npm run catalog:diff` | Diff the two latest snapshots for issuer-term changes |
| `npm run catalog:sync:dry` | Validate the sample catalog and preview the Firestore write plan |
| `npm run catalog:sync:emulator` | Sync the sample catalog into the local emulator (needs `npm run emulators`) |
| `npm run catalog:sync -- --confirm` | Publish a catalog to production Firestore (needs credentials, see below) |
| `npm run deploy` | Build and deploy hosting + Firestore rules (needs `firebase login`) |

## Configuration

Environment files (see `.env.example` for every variable):

- `.env.development` — local work against the emulators (committed, no secrets).
- `.env.production` — live Firebase project, emulators off (committed, no secrets).
- `.env.local` — your personal overrides; never committed (`*.local` is gitignored).

Firebase web keys ship in the client bundle by design; they are public
identifiers, not secrets. Real access control lives in `firestore.rules`
(users read/write only their own `users/{uid}` wallet). Two values must
never be committed:

- `FIREBASE_CLIENT_SECRET` — needed only for CLI-login catalog syncs;
  export it in your shell (see `.env.example`).
- `CARDAPI_KEY` — live third-party key for the issuer-fetch trial script;
  lives in `.env.local` only.

## Sample catalog vs full catalog

The repo ships a small sample catalog
(`src/data/seeds/sample-catalog.json`: 6 cards, 6 programs, 6 merchants,
3 loyalty programs, 1 illustrative offer) so a fresh clone builds, tests,
and runs with zero setup. The maintainer's full researched catalog
(issuer snapshots, refresh ritual, 96-card curation) lives in the
gitignored `data/` folder and is never committed. The `catalog:*` scripts
accept `--data=PATH` to operate on a full local curation.

## Project layout

- `src/strings.ts` — every user-visible string in one file; `APP_NAME` renames the app.
- `src/theme/` — light/dark/system modes + accent colours, persisted per browser.
- `src/data/seeds/` — committed sample catalog (`sample-catalog.json`) with typed
  wrappers and the bundled fallback; `src/data/catalogStore.ts` subscribes to
  the live Firestore catalog.
- `src/ranking/` — pure ranking engine + suggester with tests (`rank.test.ts`).
- `src/auth/`, `src/wallet/` — Firebase Auth (guest sessions included) and the
  wallet repository (Firestore when signed in, device-local storage when not).
- `src/components/`, `src/pages/` — UI surfaces (check, wallet, suggest, statements, settings).
- `docs/` — PRD and v1 scope sheet. Working docs live in the gitignored
  `docs-local/` folder on the maintainer's machine.
- `scripts/seed-emulators.mjs` — demo data seeding for local testing.

## Notes and limits (v1)

- Sample data is guidance, not promises: issuers change terms. Estimates state
  their assumptions in-app; full issuer terms always win.
- Tracked bank offers are a small illustrative sample, not a live feed.
- Google sign-in is wired for production; the emulator path uses the seeded
  test account (email sign-in is the primary local path).
- Out of scope for v1 (per `docs/PRD.md`): bank connections, applications,
  purchase history, budgeting, credit scores, real-time feeds, claims,
  offline mode, fee flagging, yearly reviews, expiry monitoring,
  non-Canada markets, native apps.
