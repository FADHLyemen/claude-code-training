import { CardCategory, CardStatus, Currency } from "@/data/types"

/**
 * Virtual card rules: number generation, the status state machine, and the
 * validation the issue route enforces.
 *
 * Everything here is pure so it can be tested without a request or a DOM.
 * Nothing in this file ever stores a full number — generateCardNumber returns
 * one to its caller, which hands it to the issue response and keeps only the
 * last four.
 */

/** Test BIN. Every generated number starts with it, so none can resemble a real PAN. */
export const CARD_BIN = "4242"

const CARD_NUMBER_LENGTH = 16

/** A limit above this is refused. 5,000,000 minor units — $50,000.00. */
export const MAX_SPEND_LIMIT = 5_000_000

export const CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

export const CARD_CATEGORIES: readonly CardCategory[] = [
  "any",
  "advertising",
  "software",
  "travel",
  "supplies",
  "contractors",
]

/**
 * The Luhn check digit for a partial number.
 *
 * Doubling starts from the rightmost digit of the partial, because the check
 * digit itself will occupy the position to its right.
 */
export function luhnCheckDigit(partial: string): number {
  let sum = 0
  let double = true

  for (let i = partial.length - 1; i >= 0; i--) {
    let digit = partial.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }

  return (10 - (sum % 10)) % 10
}

/** Whether a complete number satisfies Luhn. */
export function isValidLuhn(cardNumber: string): boolean {
  if (!/^\d+$/.test(cardNumber)) return false
  const body = cardNumber.slice(0, -1)
  const check = cardNumber.charCodeAt(cardNumber.length - 1) - 48
  return luhnCheckDigit(body) === check
}

/**
 * Generate a 16-digit number on the test BIN with a valid check digit.
 *
 * Server-side only — a number produced in the browser is a bug. `random` is
 * injectable so tests can pin a sequence.
 */
export function generateCardNumber(random: () => number = Math.random): string {
  const middleLength = CARD_NUMBER_LENGTH - CARD_BIN.length - 1
  let middle = ""
  for (let i = 0; i < middleLength; i++) {
    middle += Math.floor(random() * 10)
  }
  const partial = CARD_BIN + middle
  return partial + luhnCheckDigit(partial)
}

/** `•••• 4242`. The only rendering of a card number outside the issue response. */
export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`
}

/**
 * Legal status transitions.
 *
 * `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal.
 * A transition to the status a card already holds is not a transition.
 */
const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function isCardStatus(value: unknown): value is CardStatus {
  return value === "active" || value === "frozen" || value === "cancelled"
}

export function isCardCategory(value: unknown): value is CardCategory {
  return (
    typeof value === "string" &&
    (CARD_CATEGORIES as readonly string[]).includes(value)
  )
}

export function isCardCurrency(value: unknown): value is Currency {
  return (
    typeof value === "string" &&
    (CARD_CURRENCIES as readonly string[]).includes(value)
  )
}

export interface IssueCardInput {
  nickname: string
  merchantId: string
  spendLimit: number
  currency: Currency
  category: CardCategory
}

/**
 * Validate an issue request from the client.
 *
 * Returns the accepted input or a list of field errors. The client's own
 * checks are convenience; this is the enforcement.
 */
export function validateIssueInput(
  body: unknown,
  merchantExists: (id: string) => boolean,
): { ok: true; value: IssueCardInput } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const input = (body ?? {}) as Record<string, unknown>

  const nickname = typeof input.nickname === "string" ? input.nickname.trim() : ""
  if (!nickname) errors.push("Nickname is required.")
  if (nickname.length > 60) errors.push("Nickname must be 60 characters or fewer.")

  const merchantId =
    typeof input.merchantId === "string" ? input.merchantId.trim() : ""
  if (!merchantId) errors.push("Merchant is required.")
  else if (!merchantExists(merchantId)) errors.push("Unknown merchant.")

  // Minor units only: a float or a string with a symbol is refused rather
  // than coerced, so nothing rounds on its way in.
  const spendLimit = input.spendLimit
  if (typeof spendLimit !== "number" || !Number.isInteger(spendLimit)) {
    errors.push("Spend limit must be an integer number of minor units.")
  } else if (spendLimit <= 0) {
    errors.push("Spend limit must be greater than zero.")
  } else if (spendLimit > MAX_SPEND_LIMIT) {
    errors.push(
      `Spend limit must be ${MAX_SPEND_LIMIT} minor units or less.`,
    )
  }

  if (!isCardCurrency(input.currency)) {
    errors.push("Currency must be one of USD, EUR, GBP.")
  }

  const category = input.category ?? "any"
  if (!isCardCategory(category)) errors.push("Unknown category.")

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      nickname,
      merchantId,
      spendLimit: spendLimit as number,
      currency: input.currency as Currency,
      category: category as CardCategory,
    },
  }
}
