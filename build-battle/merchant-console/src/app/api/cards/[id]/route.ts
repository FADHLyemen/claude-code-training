import { cardById, transitionCard } from "@/data/cards"
import { isCardStatus } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

/** One card, masked. There is no full number to return. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const card = cardById(id)

  if (!card) {
    return NextResponse.json({ message: "Card not found." }, { status: 404 })
  }

  return NextResponse.json({ card })
}

/**
 * Move a card through the status machine: `active ⇄ frozen`, either to
 * `cancelled`, and `cancelled` is terminal.
 *
 * The requested status is checked against the allowlist, then the transition
 * itself is checked. An illegal move is a 409, not a silent no-op, so the UI
 * can say what happened.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "Request body must be JSON." },
      { status: 400 },
    )
  }

  const status = (body as { status?: unknown } | null)?.status
  if (!isCardStatus(status)) {
    return NextResponse.json(
      { message: "Status must be one of active, frozen, cancelled." },
      { status: 400 },
    )
  }

  const result = transitionCard(id, status)

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ message: "Card not found." }, { status: 404 })
    }
    const current = cardById(id)
    return NextResponse.json(
      {
        message:
          current?.status === "cancelled"
            ? "A cancelled card cannot change status."
            : `A card cannot move from ${current?.status} to ${status}.`,
      },
      { status: 409 },
    )
  }

  return NextResponse.json({ card: result.card })
}
