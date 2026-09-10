import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import { CardStatusBadge } from "@/components/ui/cards/CardStatusBadge"
import { listCards } from "@/data/cards"
import { merchantById, merchants } from "@/data/merchants"
import { maskCardNumber } from "@/lib/cards"
import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { CreditCard } from "lucide-react"
import Link from "next/link"
import { CardActions } from "./card-actions"
import { IssueCardDialog } from "./issue-card-dialog"

export default function CardsPage() {
  const cards = listCards()

  const issuable = merchants.map((merchant) => ({
    id: merchant.id,
    name: merchant.name,
    currency: merchant.currency,
  }))

  return (
    <section aria-label="Virtual cards">
      <div className="flex flex-col justify-between gap-3 px-4 py-6 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Virtual cards
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Single-merchant cards for vendor subscriptions, ad spend, and
            contractor tools.
          </p>
        </div>
        <IssueCardDialog merchants={issuable} />
      </div>

      {cards.length === 0 ? (
        <div className="border-t border-gray-200 px-4 py-20 text-center dark:border-gray-800">
          <CreditCard
            className="mx-auto size-8 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium text-gray-900 dark:text-gray-50">
            No cards issued yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            Issue one and it appears here. The number is generated when you
            submit and shown once — copy it before you close the panel.
          </p>
        </div>
      ) : (
        <TableRoot className="border-t border-gray-200 dark:border-gray-800">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nickname</TableHeaderCell>
                <TableHeaderCell>Merchant</TableHeaderCell>
                <TableHeaderCell>Number</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Spend limit
                </TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>
                    <Link
                      href={`/cards/${card.id}`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-500"
                    >
                      {card.nickname}
                    </Link>
                  </TableCell>
                  <TableCell>{merchantById(card.merchantId)?.name}</TableCell>
                  <TableCell className="font-mono text-gray-500">
                    {maskCardNumber(card.last4)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-gray-900 dark:text-gray-50">
                    {formatMoney(card.spendLimit, card.currency)}
                  </TableCell>
                  <TableCell>
                    <CardStatusBadge status={card.status} />
                  </TableCell>
                  <TableCell>{formatDate(card.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <CardActions cardId={card.id} status={card.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
