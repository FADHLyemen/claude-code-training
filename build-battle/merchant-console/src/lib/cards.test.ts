import { describe, expect, it } from "vitest"
import {
  CARD_BIN,
  MAX_SPEND_LIMIT,
  canTransition,
  generateCardNumber,
  isValidLuhn,
  luhnCheckDigit,
  maskCardNumber,
  validateIssueInput,
} from "./cards"
import { CardStatus, Currency } from "@/data/types"

/**
 * These four rules are the ones that make a card record shippable: the test
 * BIN, a valid check digit, a status machine that cannot resurrect a
 * cancelled card, and validation that does not trust the client.
 */

/** mch_01 settles in USD, mch_04 in GBP; anything else is unknown. */
const merchantCurrency = (id: string): Currency | undefined =>
  id === "mch_01" ? "USD" : id === "mch_04" ? "GBP" : undefined

describe("luhnCheckDigit", () => {
  it("computes the digit that completes a known valid number", () => {
    // 4242424242424242 is the canonical test number; its body is 424242424242424.
    expect(luhnCheckDigit("424242424242424")).toBe(2)
  })

  it("returns a single digit", () => {
    for (const partial of ["4242", "424242424242424", "1", "999999999999999"]) {
      const digit = luhnCheckDigit(partial)
      expect(digit).toBeGreaterThanOrEqual(0)
      expect(digit).toBeLessThanOrEqual(9)
    }
  })
})

describe("isValidLuhn", () => {
  it("accepts the canonical test number", () => {
    expect(isValidLuhn("4242424242424242")).toBe(true)
  })

  it("rejects a number one digit off", () => {
    expect(isValidLuhn("4242424242424243")).toBe(false)
  })

  it("rejects anything that is not all digits", () => {
    expect(isValidLuhn("4242-4242-4242-4242")).toBe(false)
    expect(isValidLuhn("")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  it("always starts with the 4242 test BIN", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateCardNumber().startsWith(CARD_BIN)).toBe(true)
    }
  })

  it("always produces a valid Luhn check digit", () => {
    for (let i = 0; i < 500; i++) {
      expect(isValidLuhn(generateCardNumber())).toBe(true)
    }
  })

  it("is always sixteen digits", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCardNumber()).toMatch(/^\d{16}$/)
    }
  })

  it("is deterministic when the randomness is", () => {
    const fixed = () => 0.5
    expect(generateCardNumber(fixed)).toBe(generateCardNumber(fixed))
  })

  it("does not always return the same number", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) seen.add(generateCardNumber())
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe("maskCardNumber", () => {
  it("shows the last four and nothing else", () => {
    expect(maskCardNumber("4242")).toBe("•••• 4242")
  })
})

describe("canTransition", () => {
  it("freezes and unfreezes an active card", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
  })

  it("cancels from either live status", () => {
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal", () => {
    expect(canTransition("cancelled", "active")).toBe(false)
    expect(canTransition("cancelled", "frozen")).toBe(false)
    expect(canTransition("cancelled", "cancelled")).toBe(false)
  })

  it("refuses a transition to the status already held", () => {
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("frozen", "frozen")).toBe(false)
  })

  it("allows exactly five transitions across the whole matrix", () => {
    const statuses: CardStatus[] = ["active", "frozen", "cancelled"]
    const legal = statuses.flatMap((from) =>
      statuses.filter((to) => canTransition(from, to)).map((to) => `${from}->${to}`),
    )
    expect(legal.sort()).toEqual([
      "active->cancelled",
      "active->frozen",
      "frozen->active",
      "frozen->cancelled",
    ])
  })
})

describe("validateIssueInput", () => {
  const valid = {
    nickname: "Ad spend",
    merchantId: "mch_01",
    spendLimit: 25000,
    currency: "USD",
    category: "advertising",
  }

  it("accepts a well-formed request", () => {
    const result = validateIssueInput(valid, merchantCurrency)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.spendLimit).toBe(25000)
  })

  it("defaults the category when none is given", () => {
    const { category: _category, ...withoutCategory } = valid
    const result = validateIssueInput(withoutCategory, merchantCurrency)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.category).toBe("any")
  })

  it("rejects a missing merchant", () => {
    const result = validateIssueInput(
      { ...valid, merchantId: "" },
      merchantCurrency,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain("Merchant is required.")
  })

  it("rejects a merchant that does not exist", () => {
    const result = validateIssueInput(
      { ...valid, merchantId: "mch_nope" },
      merchantCurrency,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain("Unknown merchant.")
  })

  it("rejects a zero or negative limit", () => {
    for (const spendLimit of [0, -1, -25000]) {
      expect(validateIssueInput({ ...valid, spendLimit }, merchantCurrency).ok).toBe(
        false,
      )
    }
  })

  it("rejects a limit above the maximum", () => {
    expect(
      validateIssueInput(
        { ...valid, spendLimit: MAX_SPEND_LIMIT + 1 },
        merchantCurrency,
      ).ok,
    ).toBe(false)
    expect(
      validateIssueInput(
        { ...valid, spendLimit: MAX_SPEND_LIMIT },
        merchantCurrency,
      ).ok,
    ).toBe(true)
  })

  it("rejects a limit that is not an integer number of minor units", () => {
    for (const spendLimit of [250.5, "25000", "$250.00", null]) {
      expect(
        validateIssueInput({ ...valid, spendLimit }, merchantCurrency).ok,
      ).toBe(false)
    }
  })

  it("rejects a currency outside USD, EUR, GBP", () => {
    for (const currency of ["JPY", "usd", "", 1, null]) {
      expect(validateIssueInput({ ...valid, currency }, merchantCurrency).ok).toBe(
        false,
      )
    }
  })

  it("accepts a supported currency that matches the merchant", () => {
    expect(
      validateIssueInput(
        { ...valid, merchantId: "mch_04", currency: "GBP" },
        merchantCurrency,
      ).ok,
    ).toBe(true)
  })

  it("rejects a supported currency that is not the merchant's own", () => {
    // The form defaults to the merchant's currency but stays editable, so
    // this is the only thing standing between ops and a mismatched card.
    const result = validateIssueInput(
      { ...valid, merchantId: "mch_04", currency: "USD" },
      merchantCurrency,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain(
        "Currency must match the merchant's own (GBP).",
      )
    }
  })

  it("does not claim a currency mismatch when the merchant is unknown", () => {
    const result = validateIssueInput(
      { ...valid, merchantId: "mch_nope", currency: "EUR" },
      merchantCurrency,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain("Unknown merchant.")
      expect(result.errors.some((e) => e.includes("must match"))).toBe(false)
    }
  })

  it("rejects a missing nickname", () => {
    expect(
      validateIssueInput({ ...valid, nickname: "   " }, merchantCurrency).ok,
    ).toBe(false)
  })

  it("reports every problem at once rather than the first", () => {
    const result = validateIssueInput(
      { nickname: "", merchantId: "", spendLimit: -1, currency: "JPY" },
      merchantCurrency,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(4)
  })

  it("rejects a body that is not an object at all", () => {
    expect(validateIssueInput(null, merchantCurrency).ok).toBe(false)
    expect(validateIssueInput("nope", merchantCurrency).ok).toBe(false)
  })
})
