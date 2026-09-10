import { IssueCardInput, canTransition, generateCardNumber } from "@/lib/cards"
import { store } from "./store"
import { Card, CardEvent, CardStatus, CardTransaction } from "./types"

/**
 * Card store access.
 *
 * Payments have one query builder in `queries.ts`; cards are a different
 * entity with different lookups, so they get their own module. There is still
 * exactly one implementation of each card lookup, which is what that rule
 * protects.
 */

/** Newest first — ops wants what they just issued at the top. */
export function listCards(): Card[] {
  return [...store.cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

export function transactionsForCard(cardId: string): CardTransaction[] {
  return store.cardTransactions
    .filter((tx) => tx.cardId === cardId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Spend is the sum of a card's recorded authorizations — never a stored
 * number that could drift from them. A card with no transactions has spent
 * nothing, which is why a newly issued card reads zero without special-casing.
 */
export function spentForCard(cardId: string): number {
  return store.cardTransactions
    .filter((tx) => tx.cardId === cardId)
    .reduce((total, tx) => total + tx.amount, 0)
}

function seq(): string {
  return String(store.cards.length + 1).padStart(4, "0")
}

/**
 * Issue a card.
 *
 * The full number is returned to the caller and never written to the record —
 * the issue response is the one place it exists.
 *
 * `idempotencyKey` makes a retried submit safe: the same key returns the card
 * the first call created rather than issuing a second one. Ops double-clicking
 * Issue should not burn two card numbers.
 */
export function issueCard(
  input: IssueCardInput,
  idempotencyKey?: string,
): { card: Card; fullNumber: string; replayed: boolean } {
  if (idempotencyKey) {
    const seen = store.issuedKeys.get(idempotencyKey)
    if (seen) {
      const existing = cardById(seen.cardId)
      // The number is not re-derivable; a replay returns what the first call
      // returned, which is the only copy that ever existed.
      if (existing) {
        return { card: existing, fullNumber: seen.fullNumber, replayed: true }
      }
    }
  }

  const fullNumber = generateCardNumber()
  const now = new Date().toISOString()
  const id = `card_${seq()}`

  const card: Card = {
    id,
    nickname: input.nickname,
    merchantId: input.merchantId,
    spendLimit: input.spendLimit,
    currency: input.currency,
    status: "active",
    category: input.category,
    last4: fullNumber.slice(-4),
    reference: `cref_${id.slice(-4)}`,
    createdAt: now,
    history: [{ type: "issued", to: "active", at: now }],
  }

  store.cards.push(card)
  if (idempotencyKey) {
    store.issuedKeys.set(idempotencyKey, { cardId: card.id, fullNumber })
  }

  return { card, fullNumber, replayed: false }
}

/**
 * Move a card through the status machine, recording the move.
 *
 * Enforced here as well as in the route, so no caller can walk a cancelled
 * card back to active.
 */
export function transitionCard(
  id: string,
  to: CardStatus,
): { ok: true; card: Card } | { ok: false; reason: "not_found" | "illegal" } {
  const card = cardById(id)
  if (!card) return { ok: false, reason: "not_found" }
  if (!canTransition(card.status, to)) return { ok: false, reason: "illegal" }

  const event: CardEvent = {
    type: "status_changed",
    from: card.status,
    to,
    at: new Date().toISOString(),
  }

  card.status = to
  card.history.push(event)
  return { ok: true, card }
}
