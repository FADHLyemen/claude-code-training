"use client"

import { Button } from "@/components/Button"
import { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

/**
 * Freeze and unfreeze from the list, without a full page reload.
 *
 * The status shown updates as soon as the server confirms; router.refresh()
 * then re-renders the server component in the background so everything else
 * on the page agrees.
 */
export function CardActions({
  cardId,
  status,
}: {
  cardId: string
  status: CardStatus
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A cancelled card is terminal — no action, and nothing to offer.
  if (status === "cancelled") {
    return <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
  }

  const next: CardStatus = status === "active" ? "frozen" : "active"
  const label = status === "active" ? "Freeze" : "Unfreeze"

  const move = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message ?? "Could not change the status.")
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-500">
          {error}
        </span>
      )}
      <Button
        variant="secondary"
        className="py-1 text-xs"
        onClick={move}
        disabled={busy || pending}
        aria-label={`${label} card ending ${cardId}`}
      >
        {busy || pending ? "Working" : label}
      </Button>
    </div>
  )
}
