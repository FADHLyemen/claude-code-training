import { issueCard, listCards } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { validateIssueInput } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

/**
 * The issued cards, masked.
 *
 * Card records carry only a last four, so there is no full number in this
 * payload — not because it is stripped here, but because one was never
 * stored.
 */
export function GET() {
  return NextResponse.json({ cards: listCards() })
}

/**
 * Issue a card.
 *
 * Everything in the body is checked against an allowlist before it reaches
 * the store. The response is the only time the full number is ever sent;
 * it is not retrievable afterwards from any route.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "Request body must be JSON." },
      { status: 400 },
    )
  }

  const result = validateIssueInput(body, (id) => Boolean(merchantById(id)))
  if (!result.ok) {
    return NextResponse.json(
      { message: result.errors[0], errors: result.errors },
      { status: 400 },
    )
  }

  const { card, fullNumber } = issueCard(result.value)

  return NextResponse.json(
    {
      card,
      // Shown once on the success screen. No other route returns this.
      fullNumber,
    },
    { status: 201 },
  )
}
