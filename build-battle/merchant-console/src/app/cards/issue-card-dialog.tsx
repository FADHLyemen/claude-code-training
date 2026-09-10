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
type Merchant = { id: string; name: string; currency: Currency }

/** Label + control + hint, so each field costs three lines instead of ten. */
function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="text-sm font-medium text-gray-900 dark:text-gray-50"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function IssueCardDialog({ merchants }: { merchants: Merchant[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [category, setCategory] = useState<CardCategory>("any")
  // One key per form session, so a double-click or a retry cannot issue two
  // cards. Reset only when the drawer closes.
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) return
    // Closing discards the number for good — it was never stored.
    setNickname("")
    setMerchantId("")
    setLimit("")
    setCurrency("USD")
    setCategory("any")
    setErrors([])
    setIssued(null)
    setCopied(false)
    setKey(crypto.randomUUID())
    router.refresh()
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
        headers: { "content-type": "application/json", "idempotency-key": key },
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
      setErrors([
        "Could not reach the server. Check your connection and retry.",
      ])
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
                  type="button"
                  className="mt-3 gap-2 py-1"
                  onClick={copy}
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
                {[
                  ["Nickname", issued.card.nickname],
                  ["Stored as", maskCardNumber(issued.card.last4)],
                  [
                    "Spend limit",
                    formatMoney(issued.card.spendLimit, issued.card.currency),
                  ],
                  ["Reference", issued.card.reference],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="mt-0.5 text-gray-900 dark:text-gray-50">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </DrawerBody>

            <DrawerFooter>
              <Button className="py-1.5" onClick={() => onOpenChange(false)}>
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

              <Field
                id="card-nickname"
                label="Nickname"
                hint="What ops will recognize it by in the list."
              >
                <Input
                  id="card-nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Google Ads"
                  className="mt-1.5"
                  autoComplete="off"
                />
              </Field>

              <Field id="card-merchant" label="Merchant">
                <Select
                  value={merchantId}
                  onValueChange={(value) => {
                    setMerchantId(value)
                    // A card settles in its merchant's currency; the server
                    // rejects a mismatch, so follow the merchant here.
                    const m = merchants.find((x) => x.id === value)
                    if (m) setCurrency(m.currency)
                  }}
                >
                  <SelectTrigger
                    id="card-merchant"
                    className="mt-1.5 w-full py-1.5"
                  >
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="flex gap-3">
                <Field
                  id="card-limit"
                  label="Spend limit"
                  hint={`Up to ${formatMoney(MAX_SPEND_LIMIT, currency)}.`}
                  className="flex-1"
                >
                  <Input
                    id="card-limit"
                    inputMode="decimal"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="2500.00"
                    className="mt-1.5"
                    autoComplete="off"
                  />
                </Field>

                <Field
                  id="card-currency"
                  label="Currency"
                  hint="Set by the merchant."
                  className="w-28"
                >
                  <p
                    id="card-currency"
                    className="mt-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm tabular-nums text-gray-900 dark:border-gray-800 dark:text-gray-50"
                  >
                    {currency}
                  </p>
                </Field>
              </div>

              <Field
                id="card-category"
                label="Category lock"
                hint="Fixed at issue. Changing it later is NWP-202."
              >
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as CardCategory)}
                >
                  <SelectTrigger
                    id="card-category"
                    className="mt-1.5 w-full py-1.5"
                  >
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
              </Field>
            </DrawerBody>

            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="secondary" type="button" className="py-1.5">
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
