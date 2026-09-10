# SPEC · NWP-201 — Issue virtual cards from the console

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Fadhl Alakwaa
**Status:** building

## Problem

Ops issues virtual cards by messaging the platform team in Slack, who create them by hand. It takes hours, happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit because the request lived in a thread. Marcus wants ops to issue a card themselves, see what they have issued, and open one to check it.

## Current state

Every claim here was read from the code, not assumed.

- `src/data/types.ts` — defines `Merchant`, `Payment`, `Refund`, `Dispute`, `Payout`. **No card type exists.** `Currency` is already the `USD | EUR | GBP` union the ticket asks us to validate against.
- `src/data/store.ts` — in-memory store held on `globalThis` so dev-server module reloading does not hand each request a fresh copy. Adding a `cards` array follows the existing shape.
- `src/data/generate.ts` — deterministic seed data from a `mulberry32` PRNG, `SEED = 20260813`. Everyone gets identical records.
- `src/data/queries.ts` — the one payment query builder. **Cards are a different entity**; they get their own module rather than being forced through this one.
- `src/lib/money.ts` — `formatMoney(minorUnits, currency)` already exists and is the only place a decimal point appears. No second formatter.
- `src/lib/` — `money`, `dates`, `csv` each have a `.test.ts` beside them. Vitest, node env, no DOM. A `cards.test.ts` belongs in the same place.
- `src/app/payments/[id]/page.tsx` — the detail-page pattern to match: back link, heading, `Divider`, a `<dl>` of `Field` components, a timeline.
- `src/components/ui/payments/StatusBadge.tsx` — badge with a status dot. Its `AnyStatus` union covers payment, dispute, and payout statuses; **card statuses are not in it** and adding them there would couple cards to the payments component.
- `src/components/` — `Drawer` (Radix `react-dialog`), `Button`, `Input`, `Select`, `Badge`, `Table`, `Divider`. **There is no `Dialog.tsx` and no `Checkbox.tsx`** despite `components.md` naming a Dialog.
- `src/app/siteConfig.ts` + `AppSidebar.tsx` — nav is driven by `siteConfig.baseLinks`; a `/cards` entry goes in both.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units | `CLAUDE.md`, `ORG-STANDARDS` 1 | A `$250.00` limit stored as `250` under-limits the card by 100× |
| Format once, at the edge | `ORG-STANDARDS` 2 | A formatted string re-entering arithmetic |
| Card numbers masked everywhere but creation | `ORG-STANDARDS` 8, `.claude/rules/cards.md` | A full PAN in a list payload is the worst bug on this board |
| `4242` test BIN + valid Luhn | ticket rule 4, `cards.md` | A generated number could resemble a real PAN |
| Generate on the server | `.claude/rules/cards.md` | A number produced in the browser is a bug |
| `active ⇄ frozen`, either → `cancelled`, terminal | ticket rule 3 | A cancelled card comes back to life |
| Validate on the server against an allowlist | `ORG-STANDARDS` 7 | The client is trusted |
| Store and compare in UTC | `ORG-STANDARDS` 4 | Created dates bucket wrong |

## Approach

Server first, UI second. A `src/lib/cards.ts` holds the pure logic — Luhn check digit, number generation on the `4242` BIN, the status transition table, and the masking helper — so all four correctness rules are unit-testable without a DOM or a request. `src/data/cards.ts` owns the store access and the issue/transition operations. Three route handlers (`POST/GET /api/cards`, `GET/PATCH /api/cards/[id]`) do validation and nothing else.

The full card number is returned by exactly one function, `issueCard`, in its return value — never written to the `Card` record. The record carries `last4` and an opaque `reference`. There is no code path that can re-read a full number, because it is never stored.

**Considered and rejected:** deriving card spend from the existing `payments` array by adding a `cardId` link. It reads better, but nothing in the seed data connects a payment to a card, so it would mean regenerating payments — a large diff in shared code for a display-only number, on a 45-minute clock. Instead `spent` is a field on the card, seeded deterministically for the seed cards and `0` for a newly issued one, which is honest: a card issued one second ago has spent nothing.

**Also rejected:** adding card statuses to `StatusBadge`'s `AnyStatus` union. Cards get their own `CardStatusBadge` so a change to card status handling cannot break the payments table.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | `Card`, `CardStatus`, `CardCategory` |
| `src/lib/cards.ts` | **add** | Luhn, generation, transitions, masking — the pure core |
| `src/lib/cards.test.ts` | **add** | Unit tests for the above |
| `src/data/cards.ts` | **add** | Store access: list, by id, issue, transition |
| `src/data/generate.ts` | change | Seed a few cards so the list and the progress bar have something to show |
| `src/data/store.ts` | change | Hold `cards` |
| `src/app/api/cards/route.ts` | **add** | `POST` issue (validated), `GET` list |
| `src/app/api/cards/[id]/route.ts` | **add** | `GET` detail, `PATCH` status transition |
| `src/app/cards/page.tsx` | **add** | The list |
| `src/app/cards/[id]/page.tsx` | **add** | The detail + spend progress |
| `src/app/cards/issue-card-dialog.tsx` | **add** | The issue form + one-time reveal |
| `src/app/cards/card-actions.tsx` | **add** | Freeze/unfreeze without a reload |
| `src/components/ui/cards/CardStatusBadge.tsx` | **add** | Card-specific status badge |
| `src/app/siteConfig.ts`, `AppSidebar.tsx` | change | `/cards` nav entry |

## Plan

1. **Types + pure lib + tests** — done when: `npm test` passes with new cases proving the BIN prefix, Luhn validity over many generated numbers, and every legal and illegal status transition.
2. **Store + seed** — done when: `GET /api/cards` returns seeded cards with `last4` and no full number anywhere in the payload.
3. **Validated routes** — done when: `curl` gets `400` for a missing merchant, a zero limit, a negative limit, a limit over 5,000,000, and a bad currency; and `201` with a full number for a good request.
4. **Read the diff** before any UI exists — minor units held, validation server-side, no second query builder, no full number stored.
5. **List + detail + nav** — done when: `/cards` and `/cards/[id]` render at 200 with masked numbers.
6. **Issue dialog with one-time reveal** — done when: the number appears on the success screen and the list shows only `•••• 4242`.
7. **Stretch: freeze/unfreeze, spend bar, category lock, empty + error states.**

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card | `curl -X POST /api/cards` returns 201; the card is in the next `GET /api/cards` |
| Card list | `/cards` returns 200 and lists nickname, merchant, `•••• NNNN`, limit, status, created date |
| Card detail | `/cards/<id>` returns 200 showing the record and spend against limit |
| Generated numbers | Unit test: 500 generated numbers all start `4242` and pass Luhn |
| Reveal once, mask forever | The POST response contains a 16-digit number; `GET /api/cards` and `GET /api/cards/<id>` payloads contain no 16-digit run — asserted by grepping the responses |
| Server-side validation | Five `curl` cases each return 400 with a message |
| Status transitions | Unit test over the full matrix; `PATCH` to an illegal transition returns 409 |

## Risks

- **Full number leaking into a payload.** Mitigated by never storing it: `Card` has no field to hold one. Verified by grepping list and detail responses for a 16-digit run.
- **Clock.** Core criteria before every stretch goal; stretch goals in the order the ticket lists them.
- **Seeded cards hide the empty state.** The empty state is still written; noted in the PR as rendered only when the store is empty.

## Out of scope

- Persistence, auth, real network calls, editing a limit after issue (NWP-202) — per the ticket.
- Linking payments to cards for real spend (would mean regenerating seed payments).

## Open questions

- Should a cancelled card stay in the default list view, or be filtered out? Building it visible with its status shown, since ops asking "what happened to that card last Tuesday" is the stated use case.
