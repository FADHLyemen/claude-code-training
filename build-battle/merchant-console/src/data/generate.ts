import { generateCardNumber } from "@/lib/cards"
import { merchants } from "./merchants"
import {
  Card,
  CardCategory,
  CardEvent,
  CardStatus,
  CardTransaction,
  Currency,
  Dispute,
  Payment,
  PaymentStatus,
  Payout,
  Refund,
} from "./types"

/**
 * Deterministic seed data. Everyone in the room gets identical records,
 * so a bug reproduces the same way on every machine.
 */

const SEED = 20260813
const DAYS = 120
const PAYMENTS_PER_DAY = 14

/** Small, fast, deterministic PRNG. Not for anything that matters. */
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(SEED)
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]
const between = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min

const DESCRIPTIONS = [
  "Online order",
  "In-store purchase",
  "Subscription renewal",
  "Gift card",
  "Wholesale invoice",
  "Repeat order",
  "Marketplace order",
]

const REASON_CODES = [
  "10.4 Other Fraud",
  "12.6 Duplicate Processing",
  "13.1 Merchandise Not Received",
  "13.3 Not as Described",
  "13.7 Cancelled Merchandise",
]

const pad = (n: number, width = 6) => String(n).padStart(width, "0")

/** The anchor date. Fixed, so "the last 30 days" is stable across runs. */
export const GENERATED_AT = new Date("2026-08-13T00:00:00.000Z")

function statusFor(): PaymentStatus {
  const roll = rand()
  if (roll < 0.78) return "captured"
  if (roll < 0.86) return "authorized"
  if (roll < 0.93) return "refunded"
  if (roll < 0.98) return "failed"
  return "disputed"
}

export function generate() {
  const payments: Payment[] = []
  const refunds: Refund[] = []
  const disputes: Dispute[] = []
  let paymentSeq = 0
  let refundSeq = 0
  let disputeSeq = 0

  for (let day = DAYS - 1; day >= 0; day--) {
    const dayStart = new Date(GENERATED_AT)
    dayStart.setUTCDate(dayStart.getUTCDate() - day)

    const count = between(PAYMENTS_PER_DAY - 5, PAYMENTS_PER_DAY + 5)

    for (let i = 0; i < count; i++) {
      const merchant = pick(merchants)
      const createdAt = new Date(dayStart)
      createdAt.setUTCHours(between(0, 23), between(0, 59), between(0, 59), 0)

      const status = statusFor()
      const method =
        rand() < 0.82 ? "card" : rand() < 0.6 ? "wallet" : "bank_transfer"
      const amount = between(450, 480_00)

      const payment: Payment = {
        id: `pay_${pad(++paymentSeq)}`,
        merchantId: merchant.id,
        amount,
        currency: merchant.currency as Currency,
        status,
        method,
        cardBrand:
          method === "card"
            ? pick(["visa", "mastercard", "amex"] as const)
            : null,
        last4: method === "card" ? String(between(1000, 9999)) : null,
        createdAt: createdAt.toISOString(),
        description: pick(DESCRIPTIONS),
      }
      payments.push(payment)

      if (status === "refunded") {
        const full = rand() < 0.7
        refunds.push({
          id: `re_${pad(++refundSeq)}`,
          paymentId: payment.id,
          amount: full ? amount : Math.floor(amount / 2),
          currency: payment.currency,
          reason: pick([
            "requested_by_customer",
            "duplicate",
            "fraudulent",
          ] as const),
          createdAt: new Date(
            createdAt.getTime() + between(1, 6) * 86_400_000,
          ).toISOString(),
        })
      }

      if (status === "disputed") {
        const openedAt = new Date(
          createdAt.getTime() + between(2, 10) * 86_400_000,
        )
        disputes.push({
          id: `dp_${pad(++disputeSeq)}`,
          paymentId: payment.id,
          merchantId: merchant.id,
          amount,
          currency: payment.currency,
          reasonCode: pick(REASON_CODES),
          status: pick([
            "needs_response",
            "needs_response",
            "under_review",
            "won",
            "lost",
          ] as const),
          openedAt: openedAt.toISOString(),
          evidenceDueAt: new Date(
            openedAt.getTime() + 14 * 86_400_000,
          ).toISOString(),
        })
      }
    }
  }

  const payouts = generatePayouts(payments)
  const { cards, cardTransactions } = generateCards()
  return { payments, refunds, disputes, payouts, cards, cardTransactions }
}

/**
 * Seed cards so the list, detail page, and spend bar have something to show on
 * a fresh boot. Same deterministic PRNG as everything else.
 *
 * Spend is never assigned. Each card gets real authorizations and its spend is
 * their sum, exactly as for a card issued through the console — so no seeded
 * number can disagree with the transactions shown. The generated number is
 * discarded here just as the issue route discards it.
 */
function generateCards(): {
  cards: Card[]
  cardTransactions: CardTransaction[]
} {
  const seeds: [
    string,
    number,
    number,
    CardCategory,
    CardStatus,
    number,
    number,
  ][] = [
    ["Google Ads", 0, 500_000, "advertising", "active", 6, 38],
    ["AWS monthly", 1, 250_000, "software", "active", 9, 26],
    ["Contractor — design", 3, 180_000, "contractors", "frozen", 4, 19],
    ["Trade show travel", 4, 320_000, "travel", "active", 2, 11],
    ["Old agency retainer", 6, 120_000, "advertising", "cancelled", 5, 63],
  ]
  const vendors = [
    "Monthly invoice",
    "Usage charge",
    "Subscription",
    "Top-up",
    "Service fee",
  ]
  const cards: Card[] = []
  const cardTransactions: CardTransaction[] = []
  let txSeq = 0

  seeds.forEach(
    ([nickname, mIndex, spendLimit, category, status, charges, daysAgo], i) => {
      const merchant = merchants[mIndex]
      const createdAt = new Date(GENERATED_AT)
      createdAt.setUTCDate(createdAt.getUTCDate() - daysAgo)
      createdAt.setUTCHours(between(9, 17), between(0, 59), 0, 0)
      const issuedAt = createdAt.toISOString()
      const id = `card_${pad(i + 1, 4)}`

      for (let c = 0; c < charges; c++) {
        const at = new Date(createdAt)
        at.setUTCDate(at.getUTCDate() + between(1, Math.max(2, daysAgo - 1)))
        if (at > GENERATED_AT) at.setTime(GENERATED_AT.getTime())
        cardTransactions.push({
          id: `ctx_${pad(++txSeq, 4)}`,
          cardId: id,
          amount: between(
            Math.round(spendLimit * 0.03),
            Math.round(spendLimit / Math.max(2, charges - 1)),
          ),
          description: vendors[between(0, vendors.length - 1)],
          createdAt: at.toISOString(),
        })
      }

      const history: CardEvent[] = [
        { type: "issued", to: "active", at: issuedAt },
      ]
      if (status !== "active") {
        const at = new Date(GENERATED_AT)
        at.setUTCDate(at.getUTCDate() - between(1, 5))
        history.push({
          type: "status_changed",
          from: "active",
          to: status,
          at: at.toISOString(),
        })
      }

      cards.push({
        id,
        nickname,
        merchantId: merchant.id,
        spendLimit,
        currency: merchant.currency,
        status,
        category,
        last4: generateCardNumber(rand).slice(-4),
        reference: `cref_${pad(i + 1, 4)}`,
        createdAt: issuedAt,
        history,
      })
    },
  )

  return { cards, cardTransactions }
}

function generatePayouts(payments: Payment[]): Payout[] {
  const payouts: Payout[] = []
  let seq = 0

  for (const merchant of merchants) {
    for (let week = 0; week < 8; week++) {
      const periodEnd = new Date(GENERATED_AT)
      periodEnd.setUTCDate(periodEnd.getUTCDate() - week * 7)
      const periodStart = new Date(periodEnd)
      periodStart.setUTCDate(periodStart.getUTCDate() - 7)

      const inPeriod = payments.filter(
        (p) =>
          p.merchantId === merchant.id &&
          p.status === "captured" &&
          p.createdAt >= periodStart.toISOString() &&
          p.createdAt < periodEnd.toISOString(),
      )
      if (inPeriod.length === 0) continue

      const gross = inPeriod.reduce((sum, p) => sum + p.amount, 0)
      const fees = Math.round(gross * 0.029) + inPeriod.length * 30

      payouts.push({
        id: `po_${pad(++seq, 4)}`,
        merchantId: merchant.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        gross,
        fees,
        net: gross - fees,
        currency: merchant.currency,
        status: week === 0 ? "pending" : week === 1 ? "in_transit" : "paid",
        paymentIds: inPeriod.map((p) => p.id),
      })
    }
  }

  return payouts
}
