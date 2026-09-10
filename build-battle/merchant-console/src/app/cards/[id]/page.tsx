import { Divider } from "@/components/Divider"
import { CardStatusBadge } from "@/components/ui/cards/CardStatusBadge"
import { cardById, spentForCard, transactionsForCard } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { CardCategory } from "@/data/types"
import { maskCardNumber } from "@/lib/cards"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CardActions } from "../card-actions"

const CATEGORY_LABELS: Record<CardCategory, string> = {
  any: "Any category",
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  supplies: "Supplies",
  contractors: "Contractors",
}

const STATUS_VERBS: Record<string, string> = {
  active: "Unfrozen",
  frozen: "Frozen",
  cancelled: "Cancelled",
}

/** Amber past 80% of the limit, so ops sees a card running out before it does. */
const AMBER_AT = 0.8

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)!
  const transactions = transactionsForCard(card.id)
  // Spend is the sum of the authorizations below, never a stored number that
  // could disagree with them.
  const spent = spentForCard(card.id)

  // Both sides are minor units; the ratio is the only float here and it is
  // display-only.
  const ratio = card.spendLimit > 0 ? spent / card.spendLimit : 0
  const pct = Math.min(100, Math.round(ratio * 100))
  const overAmber = ratio >= AMBER_AT
  const remaining = Math.max(0, card.spendLimit - spent)

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            {card.nickname}
          </h1>
          <CardStatusBadge status={card.status} />
        </div>
        <CardActions
          cardId={card.id}
          nickname={card.nickname}
          status={card.status}
        />
      </div>
      <p className="mt-1 font-mono text-sm text-gray-500">
        {maskCardNumber(card.last4)} · {card.id}
      </p>

      {card.status === "cancelled" && (
        <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
          This card is cancelled. Cancelled is terminal — it cannot be
          reactivated, and a replacement has to be issued fresh.
        </p>
      )}

      <Divider />

      <section aria-labelledby="spend-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="spend-heading"
            className="text-sm font-semibold text-gray-900 dark:text-gray-50"
          >
            Spend against limit
          </h2>
          <p className="text-sm tabular-nums text-gray-500">
            {formatMoney(spent, card.currency)} of{" "}
            {formatMoney(card.spendLimit, card.currency)}
          </p>
        </div>

        <div
          className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-labelledby="spend-heading"
          aria-valuetext={`${pct}% of limit spent`}
        >
          <div
            className={cx(
              "h-full rounded-full transition-all",
              overAmber
                ? "bg-amber-500 dark:bg-amber-500"
                : "bg-blue-500 dark:bg-blue-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p
          className={cx(
            "mt-1.5 text-sm tabular-nums",
            overAmber ? "text-amber-700 dark:text-amber-500" : "text-gray-500",
          )}
        >
          {pct}% used · {formatMoney(remaining, card.currency)} remaining
          {overAmber && " · past 80% of the limit"}
        </p>
      </section>

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["Merchant", `${merchant.name} · ${merchant.country}`],
            ["Number", maskCardNumber(card.last4)],
            ["Category lock", CATEGORY_LABELS[card.category]],
            [
              "Spend limit",
              `${formatMoney(card.spendLimit, card.currency)} ${card.currency}`,
            ],
            ["Reference", card.reference],
            ["Created (UTC)", card.createdAt],
            [
              `Created (${merchant.timezone})`,
              formatInZone(card.createdAt, merchant.timezone),
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-gray-500">{label}</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-50">
              {value}
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-sm text-gray-500">Status</dt>
          <dd className="mt-1">
            <CardStatusBadge status={card.status} />
          </dd>
        </div>
      </dl>

      <Divider />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="activity-heading">
          <h2
            id="activity-heading"
            className="text-sm font-semibold text-gray-900 dark:text-gray-50"
          >
            Authorizations
          </h2>
          {transactions.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              Nothing charged to this card yet. Spend appears here as
              authorizations land, and the bar above is their sum.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-800">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-900 dark:text-gray-50">
                      {tx.description}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatInZone(tx.createdAt, merchant.timezone)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
                    {formatMoney(tx.amount, card.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="history-heading">
          <h2
            id="history-heading"
            className="text-sm font-semibold text-gray-900 dark:text-gray-50"
          >
            History
          </h2>
          <ol className="mt-3 space-y-3">
            {card.history.map((event, index) => (
              <li key={index} className="flex gap-3">
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm text-gray-900 dark:text-gray-50">
                    {event.type === "issued"
                      ? "Card issued"
                      : `${STATUS_VERBS[event.to!]} — ${event.from} to ${event.to}`}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatInZone(event.at, merchant.timezone)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Divider />

      <p className="text-sm text-gray-500">
        The full number was shown once when this card was issued and is not
        stored. Only the last four and the reference above are kept.
      </p>
    </div>
  )
}
