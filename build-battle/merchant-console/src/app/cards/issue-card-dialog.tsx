"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { Card, CardCategory, Currency } from "@/data/types"
import { CARD_CATEGORIES, MAX_SPEND_LIMIT, maskCardNumber } from "@/lib/cards"
import { formatMoney, parseAmountToMinorUnits } from "@/lib/money"
import { Check, Copy, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

const CATEGORY_LABELS: Record<CardCategory, string> = {
  any: "Any category",
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  supplies: "Supplies",
  contractors: "Contractors",
}

type Issued = { card: Card; fullNumber: string }

export function IssueCardDialog({
  merchants,
}: {
  merchants: { id: string; name: string; currency: Currency }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [category, setCategory] = useState<CardCategory>("any")

  // One key per form session. A retried submit reuses it, so a double-click
  // or a flaky connection cannot issue two cards.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setNickname("")
    setMerchantId("")
    setLimit("")
    setCurrency("USD")
    setCategory("any")
    setErrors([])
    setIssued(null)
    setCopied(false)
    setIdempotencyKey(crypto.randomUUID())
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    // Closing the success screen discards the number for good — it is not
    // stored, so there is nothing to come back to.
    if (!next) {
      reset()
      router.refresh()
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrors([])

    // Convert at the boundary, once. Minor units from here on.
    const spendLimit = parseAmountToMinorUnits(limit)
    if (spendLimit === null) {
      setErrors(["Spend limit must be an amount like 250 or 250.00."])
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          nickname,
          merchantId,
          spendLimit,
          currency,
          category,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setErrors(data.errors ?? [data.message ?? "Could not issue the card."])
        return
      }
      setIssued(data as Issued)
    } catch {
      setErrors(["Could not reach the server. Check your connection and retry."])
    } finally {
      setSubmitting(false)
    }
  }

  const copy = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.fullNumber)
      setCopied(true)
    } catch {
      // Clipboard can be blocked; the number is on screen to read either way.
      setCopied(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DrawerTrigger>

      <DrawerContent className="sm:max-w-md">
        {issued ? (
          <>
            <DrawerHeader>
              <DrawerTitle>Card issued</DrawerTitle>
              <DrawerDescription className="mt-1">
                Copy the number now. This is the only time it is shown.
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/30">
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-500">
                  Full number — shown once
                </p>
                <p className="mt-2 font-mono text-lg tabular-nums text-gray-900 dark:text-gray-50">
                  {issued.fullNumber.replace(/(.{4})/g, "$1 ").trim()}
                </p>
                <Button
                  variant="secondary"
                  className="mt-3 gap-2 py-1"
                  onClick={copy}
                  type="button"
                >
                  {copied ? (
                    <Check className="size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4 shrink-0" aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy number"}
                </Button>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Row label="Nickname">{issued.card.nickname}</Row>
                <Row label="Stored as">
                  <span className="font-mono">
                    {maskCardNumber(issued.card.last4)}
                  </span>
                </Row>
                <Row label="Spend limit">
                  {formatMoney(issued.card.spendLimit, issued.card.currency)}
                </Row>
                <Row label="Reference">
                  <span className="font-mono">{issued.card.reference}</span>
                </Row>
              </dl>
            </DrawerBody>

            <DrawerFooter>
              <Button onClick={() => onOpenChange(false)} className="py-1.5">
                Done
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader>
              <DrawerTitle>Issue a virtual card</DrawerTitle>
              <DrawerDescription className="mt-1">
                The number is generated when you submit, and shown once.
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              {errors.length > 0 && (
                <div
                  role="alert"
                  className="rounded-md border border-red-500/40 bg-red-50 p-3 dark:bg-red-950/30"
                >
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    {errors.length === 1
                      ? "Could not issue the card"
                      : `${errors.length} things need fixing`}
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm text-red-700 dark:text-red-400">
                    {errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label
                  htmlFor="card-nickname"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Nickname
                </label>
                <Input
                  id="card-nickname"
                  name="nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Google Ads"
                  className="mt-1.5"
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-gray-500">
                  What ops will recognize it by in the list.
                </p>
              </div>

              <div>
                <label
                  htmlFor="card-merchant"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Merchant
                </label>
                <Select
                  value={merchantId}
                  onValueChange={(value) => {
                    setMerchantId(value)
                    // Default the currency to the merchant's own; still editable.
                    const merchant = merchants.find((m) => m.id === value)
                    if (merchant) setCurrency(merchant.currency)
                  }}
                >
                  <SelectTrigger id="card-merchant" className="mt-1.5 w-full py-1.5">
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="card-limit"
                    className="text-sm font-medium text-gray-900 dark:text-gray-50"
                  >
                    Spend limit
                  </label>
                  <Input
                    id="card-limit"
                    name="spendLimit"
                    inputMode="decimal"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    placeholder="2500.00"
                    className="mt-1.5"
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Up to {formatMoney(MAX_SPEND_LIMIT, currency)}.
                  </p>
                </div>

                <div className="w-28">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                    Currency
                  </span>
                  {/* A card settles in its merchant's currency, so this is
                      shown rather than chosen. The server rejects a mismatch
                      whatever the client sends. */}
                  <p
                    className="mt-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm tabular-nums text-gray-900 dark:border-gray-800 dark:text-gray-50"
                    aria-label={`Currency ${currency}, set by the merchant`}
                  >
                    {currency}
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="card-category"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Category lock
                </label>
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as CardCategory)}
                >
                  <SelectTrigger id="card-category" className="mt-1.5 w-full py-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {CATEGORY_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-gray-500">
                  Fixed at issue. Changing it later is NWP-202.
                </p>
              </div>
            </DrawerBody>

            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="secondary" className="py-1.5" type="button">
                  Cancel
                </Button>
              </DrawerClose>
              <Button type="submit" className="py-1.5" isLoading={submitting}>
                {submitting ? "Issuing" : "Issue card"}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-900 dark:text-gray-50">{children}</dd>
    </div>
  )
}
