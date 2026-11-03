# PRD: Credit Card Rewards Advisor (working title)

## Goal
Help Canadian shoppers instantly know which credit card they own gives the best return for a specific purchase at a specific store — e.g., groceries at Loblaws, dining at Pizza Hut — by comparing true reward value, not just points, and by factoring in card perks like extended warranty and travel insurance where they matter (e.g., electronics, car rentals, hotel bookings). The app also guides users on redeeming points for maximum value and suggests upgrade cards that would earn more for their spending.

## Target users
- Canadian consumers who own 2+ credit cards and shop across grocery, dining, gas, and everyday retail.
- Users start instantly as guests (anonymous accounts) and optionally sign up; the card wallet is stored online and syncs across devices, with guest wallets merged on upgrade. With no account at all (signed out, or guest entry failed) the app stays fully usable on a device-local wallet, which merges into Firestore on the next sign-in.

## Success criteria (v1)
- A user can get a best-card answer for a store + category in under 30 seconds.
- Every recommendation shows both points earned and estimated dollar value.
- Store-specific cards (e.g., a Walmart Rewards Mastercard) are compared head-to-head against general rewards cards the user owns.
- Where a store loyalty program could stack extra value, the app says so with signup guidance.
- For benefit-sensitive purchases (e.g., electronics, car rentals, hotels), the recommendation factors in card perks such as extended warranty and rental car insurance.
- Spend amount is an optional input that sharpens estimates where caps or tiered rates apply.
- Each recommendation includes best-value redemption guidance for the relevant program.
- The app suggests upgrade cards that would earn more when one would meaningfully beat owned cards for the user's usage, showing total yearly value first and the extra over the user's best second.
- Contextual benefit reminders and bank/statement-credit offers on owned cards are surfaced at check time.

## Core user flows (responsive web app, mobile-first UX)
1. **Sign up & wallet:** user creates an account and adds the credit cards they own (manual entry); the wallet is stored online, synced across devices, and editable anytime.
2. **Best-card check:** user enters store + purchase category (e.g., "Loblaws — grocery"), optionally with a spend amount, and gets a ranked answer: which owned card to use, expected points, and estimated dollar value.
3. **Store-card comparison:** if a dedicated store card exists for that merchant, the comparison includes it and clearly shows whether an owned card beats it or not.
4. **Loyalty nudge:** if a store loyalty program (e.g., PC Optimum at Loblaws-banner stores) can add rewards on top, the app suggests signing up and factors the stacking into guidance.
5. **Perk-aware check:** for purchases where benefits matter more than points — electronics (extended warranty), car rentals (rental car insurance), hotel stays (e.g., Marriott perks or travel coverage) — the answer highlights the best owned card for coverage and calls out key conditions (e.g., must pay in full with the card).
6. **Redemption guidance:** for the recommended card's program, the app shows the best-value ways to redeem (e.g., transfer partners, high-value redemption options).
7. **Upgrade suggestion:** when a card the user doesn't own would beat owned cards for their usage, the app suggests it with total yearly value first and the extra over their best second.
8. **Reminders & offers:** at check time, the app shows contextual benefit reminders (e.g., "pay in full with card X to keep rental coverage") and any bank/statement-credit offers on owned cards that apply.

## Functional requirements
### Accounts
- Sign up and sign in (Firebase Authentication, per decision), plus password reset by email.
- Anonymous guest sessions with no sign-in wall; upgrading links in place for new credentials or union-merges the guest wallet into an existing account. Settings discloses browser-local guest limits. Guest-entry failures show a retryable notice (never a wall) with the app usable underneath; stale guest errors are cleared on success, retry, recovery, and sign-out so they can never pin the login form.
- Card wallet stored online and synced across a user's devices.

### Card wallet
- Add/remove cards the user owns from a curated Canadian card list.
- Store each card's rewards profile: category multipliers, caps, and conditions (curated data, kept current).
- Users remove expired or cancelled cards themselves in v1 (no expiry monitoring).

### Store & category lookup
- Search Canadian merchants and purchase categories (grocery, dining, gas, travel, everyday, etc.).
- Recognize dedicated store cards linked to a merchant.

### Rewards comparison
- Rank owned cards by estimated dollar value of rewards for the given store + category + spend.
- Show points and dollar value side by side; never points alone.
- Accept an optional spend amount; use it to account for caps and tiered earn rates.
- Handle category bonuses, merchant-specific rates, and earn caps in the ranking.
- State key assumptions behind each recommendation (e.g., assumed point value) so the user can trust it. Every card-level assumption links to the official issuer page it came from (no aggregator links, no blanket "confirm on the issuer page" filler).
- Only official issuer/bank pages may source rates, credits, fees, and offers; unverified fields stay flagged until a curator verifies them in a browser.

### Redemption guidance
- Show best-value redemption options for the recommended card's program.
- Present estimated value per redemption path so users can compare earn and burn together.

### Card benefits & perks
- Maintain a benefit profile per card: extended warranty, purchase protection, rental car insurance, travel/medical insurance, hotel perks.
- For benefit-sensitive categories (electronics, car rentals, hotels, travel), rank owned cards by coverage first, with rewards as a secondary factor.
- Surface key benefit conditions in plain language (e.g., pay in full with the card, rental day limits, coverage exclusions) with a pointer to full issuer terms.

### Upgrade recommender
- Compare owned cards against notable unowned Canadian cards for the user's categories and spend ("Upgrades" tab, titled "Cards that could earn you more").
- Suggest a card only when it would meaningfully beat owned cards (currently $50/year over the best owned card); each pick shows Total value/year first and Extra vs your best/year second.
- The monthly spend panel shows a compact total by default with an Edit button that expands the per-category fields; Save changes writes once and Reset to defaults clears to catalog defaults. Fee-adjusted value (earn minus annual fee) shows as display-only small text since fees are sometimes waived; the best owned card is highlighted as the competition. The real-spending statement banner sits at the bottom of the page.
- Users can upload bank statements (PDF/CSV, up to 24 files) for comparison against their real categorized spending; files never leave the browser and results are session-only.
- Signed-in users can send feedback (feature request, bug, card-data correction) from Settings; the account email is attached automatically and the form warns against personal details. Any card's Details popup has a flag-icon Report button (confirmation first) that files the card into cardReports for curator review. Anti-spam: auth required, honeypot field, 5/day + 30s client limits, required email shape in rules. Submit failures show a send-specific error (never a sign-in message).
- No in-app applications (out of scope); suggestion only.

### Reminders & bank offers
- Show contextual benefit reminders tied to the purchase (e.g., rental coverage conditions, warranty activation).
- Surface card usage tips (e.g., unused annual dining/travel credits, roaming credits) prominently on the card for relevant categories. Tips never affect ranking math.
- Track merchant/statement-credit offers available on owned cards and factor applicable ones into the recommendation. An offer stays on a card only while an official issuer page confirms it; v1 samples are labelled illustrative.

### Loyalty suggestions
- Flag store loyalty programs relevant to the merchant as a prominent tip directly above the ranked answer (never below the fold), with signup guidance.
- Explain the extra earn or stacking opportunity and how to sign up.
- Mark whether the user already uses it (user-toggled) to avoid repeat nudges.
- Loyalty programs are tracked for the stack-and-save nudge only: no earn math, no redemption modelling.

## Out of scope (v1)
- Automatic card import via bank connections; card applications or approvals.
- Purchase history tracking, budgeting, or credit-score features (statement upload is local-only analysis, never stored or synced).
- Real-time merchant offer feeds (v1 tracks a defined set of card-linked bank offers instead).
- Warranty/insurance claim filing or tracking; the app recommends cards, it does not manage claims.
- Offline mode; v1 assumes connectivity.
- Foreign-transaction-fee flagging and yearly card reviews (deferred past v1).
- Expiry/cancellation monitoring; users manage their wallet contents.
- Markets outside Canada; native mobile apps (v1 is a responsive web app; full native may follow later).

## Assumptions
- v1 is a responsive web app: a desktop layout with a sidebar and multi-column content on large screens, collapsing to a mobile layout with a bottom tab bar, and installable as a home-screen shortcut.
- Appearance: light/dark/system mode for users (no accent picker); all theme parameters live in one admin-edited token file (`src/index.css`). UI uses shadcn-style components with Tailwind CSS.
- Rewards data is curated and refreshed on a defined cadence (cadence to be set in the tech plan).
- Point valuations use published, reviewable estimates; methodology is visible to the user.
- Benefit guidance is based on summarized issuer terms; the app points users to full terms for confirmation.
- v1 assumes an internet connection at check time.
- Removing expired or cancelled cards is the user's responsibility in v1.
- Store and category examples in this PRD are illustrative and will be validated during finalization.

## Open questions
- Canonical v1 store + category list: which merchants and categories must be covered at launch?
- Point valuation source and refresh cadence: single estimate per program or a range?
- Benefit data depth for v1: which perks (extended warranty, rental insurance, hotel/travel coverage) and how much of the fine print must the app summarize?
- New-card recommender: which cards are eligible, and what "meaningfully beats" threshold triggers a suggestion? (Decided: unowned credit cards in owned segments; $50/year over the best owned card.)
- Reminders: how are they triggered (user-entered trip/purchase vs. automatic), and through which channels?
- Bank offers: which offers are tracked in v1 and how is that data sourced and refreshed?
- Should annual fees factor into recommendations (e.g., net-value view) in v1 or later? (Decided: display-only fee-adjusted line; ranking math unchanged since fees are sometimes waived.)
- Signup guidance depth: link-out only, or in-app steps for major loyalty programs?

## Review & acceptance
- This PRD is final when the open questions above are resolved and the requirements are approved.
- Next step after approval: technical implementation plan in a separate doc.
