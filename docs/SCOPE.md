# v1 Scope Sheet (resolves the PRD open questions)

Decided defaults for implementation. Each item records the v1 default and
where it lives in code or data.

## 1. Canonical v1 store + category list

Sample catalog: 6 merchants across grocery, dining, gas, drugstore, and
transit, plus benefit-sensitive contexts (electronics, car rentals,
hotels). See `src/data/seeds/sample-catalog.json`. (The maintainer's full
researched catalog is local-only; see README.) Earn buckets:
grocery, dining, gas, travel, drugstore, transit, recurring, foreign, other.
Merchant-to-category mapping is approximate by design and stated in-app.

## 2. Point valuation source and estimate-vs-range

Single typical estimate per program (cents-per-point), documented per
program in `src/data/seeds/programs.ts` with a methodology note shown
in-app. Sources: issuer pages and reputable Canadian roundups, researched
2026-10-27 (source URLs stored per card).

## 3. Benefit data depth for v1

Five perks per card: extended warranty, purchase protection, rental car
insurance, travel medical insurance, hotel perks — each with a one-line
plain-language condition and an offered/not-offered flag. Fields that could
not be verified are listed in each card's `uncertain` array. Full issuer
terms are always referenced from the app.

## 4. New-card recommender pool and threshold

Eligible pool: all catalog cards the user does not own. A card is suggested
only when its estimated annual value beats the best owned card by at least
$50/year under the default monthly spend profile
(grocery $600, dining $200, gas $150, travel $100, recurring $150, other
$300). See `suggestNewCards` in `src/ranking/rank.ts`. Suggestion only —
no applications.

## 5. Reminder triggers and channels

Reminders are contextual and in-app only in v1: at check time, for
benefit-sensitive purchases, the app shows the winning card's coverage
conditions (e.g. pay in full for rental coverage). No push, email, or
trip-tracking in v1.

## 6. Bank offers tracked in v1 and sourcing

One illustrative sample offer (`src/data/seeds/sample-catalog.json`).
It has a minimum spend and a
card scope; applicable offers are added to card values with a stated
assumption. Presented as a curated sample, never as a live feed.

## 7. Annual fees in v1

Excluded from ranking math; always shown alongside the card so users can
weigh fees themselves.

## 8. Signup-guidance depth

In-app summary (what it is, how earn stacks, how to join in one or two
steps) plus a link-out to the program's signup page. Users toggle
“I already use this” to stop repeat nudges (synced in Firestore).

## Refresh cadence

The bundled sample carries a `dataAsOf` date, shown in Settings along
with the live/bundled catalog source. The app falls back to its bundled
copy offline. Full-catalog refresh (maintainers only) is documented in
the README.
Welcome bonuses are excluded as rotating.
