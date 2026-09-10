"use client"

import { Button } from "@/components/Button"
import { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

/**
 * Freeze, unfreeze, and cancel from the list or the detail page, without a
 * full page reload.
 *
 * Cancel asks first, because it is the one transition nothing comes back
 * from — the state machine makes `cancelled` terminal on the server, so a
 * misclick here cannot be undone by another click.
 */
export function CardActions({
  cardId,
  nickname,
  status,
}: {
  cardId: string
  /** Used to name the card in labels and the confirm prompt. */
  nickname: string
  status: CardStatus
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cancelled is terminal — there is no action left to offer.
  if (status === "cancelled") {
    return <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
  }

  const move = async (to: CardStatus) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: to }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message ?? "Could not change the status.")
        return
      }
      setConfirming(false)
      startTransition(() => router.refresh())
    } catch {
      setError("Could not reach the server. The card is unchanged.")
    } finally {
      setBusy(false)
    }
  }

  const working = busy || pending
  const freezeTo: CardStatus = status === "active" ? "frozen" : "active"
  const freezeLabel = status === "active" ? "Freeze" : "Unfreeze"

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span
          role="alert"
          className="text-xs text-gray-700 dark:text-gray-300"
        >
          Cancel {nickname} for good?
        </span>
        <Button
          variant="secondary"
          className="py-1 text-xs"
          onClick={() => setConfirming(false)}
          disabled={working}
        >
          Keep it
        </Button>
        <Button
          variant="destructive"
          className="py-1 text-xs"
          onClick={() => move("cancelled")}
          disabled={working}
        >
          {working ? "Cancelling" : "Yes, cancel"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-500">
          {error}
        </span>
      )}
      <Button
        variant="secondary"
        className="py-1 text-xs"
        onClick={() => move(freezeTo)}
        disabled={working}
        aria-label={`${freezeLabel} ${nickname}`}
      >
        {working ? "Working" : freezeLabel}
      </Button>
      <Button
        variant="ghost"
        className="py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-950/40"
        onClick={() => setConfirming(true)}
        disabled={working}
        aria-label={`Cancel ${nickname}`}
      >
        Cancel
      </Button>
    </div>
  )
}
