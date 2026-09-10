import {
  IssueCardInput,
  canTransition,
  generateCardNumber,
} from "@/lib/cards"
import { store } from "./store"
import { Card, CardStatus } from "./types"

/**
 * Card store access.
 *
 * Payments have one query builder in `queries.ts`; cards are a different
 * entity with a different shape, so they get their own module rather than
 * being bent through that one. There is still exactly one implementation of
 * each card lookup, which is what the rule is protecting.
 */

/** Newest first — ops wants what they just issued at the top. */
export function listCards(): Card[] {
  return [...store.cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

function nextCardId(): string {
  return `card_${String(store.cards.length + 1).padStart(4, "0")}`
}

function nextReference(): string {
  return `cref_${String(store.cards.length + 1).padStart(6, "0")}`
}

/**
 * Issue a card.
 *
 * The full number is returned to the caller and never written to the record —
 * the issue response is the one and only place it exists. Everything stored
 * is the last four and an opaque reference.
 */
export function issueCard(input: IssueCardInput): {
  card: Card
  /** Show once, then discard. Not retrievable afterwards. */
  fullNumber: string
} {
  const fullNumber = generateCardNumber()

  const card: Card = {
    id: nextCardId(),
    nickname: input.nickname,
    merchantId: input.merchantId,
    spendLimit: input.spendLimit,
    spent: 0,
    currency: input.currency,
    status: "active",
    category: input.category,
    last4: fullNumber.slice(-4),
    reference: nextReference(),
    createdAt: new Date().toISOString(),
  }

  store.cards.push(card)
  return { card, fullNumber }
}

/**
 * Move a card to a new status, or refuse.
 *
 * The state machine is enforced here as well as in the route, so no caller
 * can walk a cancelled card back to active.
 */
export function transitionCard(
  id: string,
  to: CardStatus,
): { ok: true; card: Card } | { ok: false; reason: "not_found" | "illegal" } {
  const card = cardById(id)
  if (!card) return { ok: false, reason: "not_found" }
  if (!canTransition(card.status, to)) return { ok: false, reason: "illegal" }

  card.status = to
  return { ok: true, card }
}
