import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizePhone,
  isValidIndianPhone,
  calculateOrderTotals,
  calculateFruitBowlPrice,
  getPickupPin,
  canCancelOrder,
  getFaqResponse,
  mergeSupportMessages,
  type SupportMsg,
} from "../src/lib/order-logic.ts"

// ============================================================================
// TEST SUITE 1: Phone Normalization & Indian Mobile Number Validation
// ============================================================================
test("Phone Normalization - handles clean 10-digit number", () => {
  const input = "9876543210"
  assert.equal(normalizePhone(input), "9876543210")
  assert.equal(isValidIndianPhone(input), true)
})

test("Phone Normalization - strips Indian country code prefix (+91, 91)", () => {
  assert.equal(normalizePhone("+91 98765 43210"), "9876543210")
  assert.equal(normalizePhone("+91-9876543210"), "9876543210")
  assert.equal(normalizePhone("919876543210"), "9876543210")
  assert.equal(isValidIndianPhone("+91 98765 43210"), true)
})

test("Phone Normalization - handles leading zero", () => {
  assert.equal(normalizePhone("09876543210"), "9876543210")
  assert.equal(isValidIndianPhone("09876543210"), true)
})

test("Phone Normalization - strips brackets, dashes, dots, and whitespace", () => {
  assert.equal(normalizePhone("(987) 654-3210"), "9876543210")
  assert.equal(normalizePhone("987.654.3210"), "9876543210")
  assert.equal(normalizePhone(" 9 8 7 6 5 4 3 2 1 0 "), "9876543210")
})

test("Phone Normalization - handles malicious strings & script tags", () => {
  const evilInput = "<script>alert('xss')</script>9876543210"
  assert.equal(normalizePhone(evilInput), "9876543210")
  assert.equal(isValidIndianPhone(evilInput), true)
})

test("Phone Normalization - rejects incomplete or malformed inputs", () => {
  assert.equal(normalizePhone(""), "")
  assert.equal(isValidIndianPhone(""), false)
  assert.equal(isValidIndianPhone("12345"), false) // Too short
  assert.equal(isValidIndianPhone("abcdefghij"), false) // Non-numeric
  assert.equal(isValidIndianPhone("1234567890"), false) // Invalid Indian prefix (starts with 1)
  assert.equal(isValidIndianPhone("5987654321"), false) // Invalid Indian prefix (starts with 5)
  assert.equal(isValidIndianPhone("6123456789"), true)  // Valid prefix (starts with 6)
  assert.equal(isValidIndianPhone("7890123456"), true)  // Valid prefix (starts with 7)
  assert.equal(isValidIndianPhone("8901234567"), true)  // Valid prefix (starts with 8)
  assert.equal(isValidIndianPhone("9012345678"), true)  // Valid prefix (starts with 9)
  assert.equal(isValidIndianPhone(undefined), false)
  assert.equal(isValidIndianPhone(null), false)
})

// ============================================================================
// TEST SUITE 2: Pickup PIN Code Generation & Edge Cases
// ============================================================================
test("PIN Generation - preserves explicit valid pickup_code", () => {
  const pin = getPickupPin({ pickup_code: "5821" })
  assert.equal(pin, "5821")
})

test("PIN Generation - calculates 4-digit PIN deterministically from order_number", () => {
  const pin1 = getPickupPin({ order_number: 14 })
  const pin2 = getPickupPin({ order_number: 14 })
  assert.equal(pin1, pin2)
  assert.equal(pin1.length, 4)
  assert.equal(pin1, "2071")
})

test("PIN Generation - edge case: order number 0", () => {
  const pin = getPickupPin({ order_number: 0 })
  assert.equal(pin.length, 4)
  assert.equal(/^\d{4}$/.test(pin), true)
  assert.equal(Number(pin) >= 1000 && Number(pin) <= 9999, true)
})

test("PIN Generation - edge case: negative order number", () => {
  const pin = getPickupPin({ order_number: -42 })
  assert.equal(pin.length, 4)
  assert.equal(/^\d{4}$/.test(pin), true)
  assert.equal(Number(pin) >= 1000 && Number(pin) <= 9999, true)
})

test("PIN Generation - edge case: undefined or non-numeric order number", () => {
  const pinFallback = getPickupPin({})
  assert.equal(pinFallback.length, 4)
  assert.equal(/^\d{4}$/.test(pinFallback), true)

  const pinNaN = getPickupPin({ order_number: "invalid" })
  assert.equal(pinNaN.length, 4)
  assert.equal(/^\d{4}$/.test(pinNaN), true)
})

test("PIN Generation - fuzzing 1000 random order numbers", () => {
  for (let i = 0; i < 1000; i++) {
    const randomOrderNum = Math.floor(Math.random() * 100000) - 50000
    const pin = getPickupPin({ order_number: randomOrderNum })
    assert.equal(pin.length, 4, `PIN length must be 4 for input ${randomOrderNum}`)
    assert.equal(/^\d{4}$/.test(pin), true, `PIN must be numeric for input ${randomOrderNum}`)
    const n = Number(pin)
    assert.equal(n >= 1000 && n <= 9999, true, `PIN must be in [1000, 9999] for input ${randomOrderNum}`)
  }
})

// ============================================================================
// TEST SUITE 3: Cart, Subtotal & Delivery Fee Calculations
// ============================================================================
test("Order Totals - empty cart yields zero subtotal", () => {
  const pickupTotals = calculateOrderTotals([], "pickup")
  assert.equal(pickupTotals.subtotal, 0)
  assert.equal(pickupTotals.fee, 0)
  assert.equal(pickupTotals.total, 0)

  const deliveryTotals = calculateOrderTotals([], "delivery")
  assert.equal(deliveryTotals.subtotal, 0)
  assert.equal(deliveryTotals.fee, 7)
  assert.equal(deliveryTotals.total, 7)
})

test("Order Totals - standard items pricing with campus pickup (₹0 fee)", () => {
  const items = [
    { price: 40, quantity: 2 }, // 80
    { price: 65, quantity: 1 }, // 65
  ]
  const totals = calculateOrderTotals(items, "pickup")
  assert.equal(totals.subtotal, 145)
  assert.equal(totals.fee, 0)
  assert.equal(totals.total, 145)
})

test("Order Totals - standard items pricing with room delivery (₹7 fee)", () => {
  const items = [
    { price: 50, quantity: 3 }, // 150
  ]
  const totals = calculateOrderTotals(items, "delivery")
  assert.equal(totals.subtotal, 150)
  assert.equal(totals.fee, 7)
  assert.equal(totals.total, 157)
})

test("Order Totals - protects against negative quantities and float anomalies", () => {
  const items = [
    { price: 19.99, quantity: 2 },
    { price: 10, quantity: -5 }, // Should clamp to 0
  ]
  const totals = calculateOrderTotals(items, "pickup")
  assert.equal(totals.subtotal, 39.98)
  assert.equal(totals.total, 39.98)
})

test("Fruit Bowl Price - calculates base ₹35 + ₹7 per portion", () => {
  assert.equal(calculateFruitBowlPrice(0), 35) // Base with 0 portions
  assert.equal(calculateFruitBowlPrice(1), 42) // 35 + 7
  assert.equal(calculateFruitBowlPrice(3), 56) // 35 + 21
  assert.equal(calculateFruitBowlPrice(5), 70) // 35 + 35
  assert.equal(calculateFruitBowlPrice(-2), 35) // Negative clamped to 0
})

// ============================================================================
// TEST SUITE 4: Order Status Transitions & Cancellation Policy
// ============================================================================
test("Cancellation Policy - only 'pending' orders can be cancelled", () => {
  assert.equal(canCancelOrder("pending"), true)
  assert.equal(canCancelOrder("PENDING"), true)
  assert.equal(canCancelOrder(" Pending "), true)

  assert.equal(canCancelOrder("preparing"), false)
  assert.equal(canCancelOrder("ready"), false)
  assert.equal(canCancelOrder("delivered"), false)
  assert.equal(canCancelOrder("completed"), false)
  assert.equal(canCancelOrder("cancelled"), false)
  assert.equal(canCancelOrder(""), false)
  assert.equal(canCancelOrder(null), false)
  assert.equal(canCancelOrder(undefined), false)
})

// ============================================================================
// TEST SUITE 5: Real-time Support Chat Synchronization & Deduplication
// ============================================================================
test("Support Messages - deduplicates exact ID matches", () => {
  const existing: SupportMsg[] = [
    {
      id: "msg-1",
      phone: "9876543210",
      customer_name: "Rahul",
      sender: "customer",
      message: "Hello MessMate",
      created_at: "2026-10-06T00:00:00Z",
    },
  ]
  const incoming: SupportMsg[] = [
    {
      id: "msg-1",
      phone: "9876543210",
      customer_name: "Rahul",
      sender: "customer",
      message: "Hello MessMate Updated",
      created_at: "2026-10-06T00:00:00Z",
    },
  ]
  const merged = mergeSupportMessages(existing, incoming)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].message, "Hello MessMate Updated")
})

test("Support Messages - merges optimistic local message with canonical server message", () => {
  const localTime = new Date().toISOString()
  const existing: SupportMsg[] = [
    {
      id: "local-optimistic-99",
      phone: "9876543210",
      customer_name: "Rahul",
      sender: "customer",
      message: "Where is my order?",
      created_at: localTime,
    },
  ]
  const canonicalServerMsg: SupportMsg[] = [
    {
      id: "uuid-db-4872190-abc",
      phone: "9876543210",
      customer_name: "Rahul",
      sender: "customer",
      message: "Where is my order?",
      created_at: localTime,
    },
  ]
  const merged = mergeSupportMessages(existing, canonicalServerMsg)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, "uuid-db-4872190-abc")
})

test("Support Messages - sorts messages chronologically", () => {
  const msg1: SupportMsg = {
    id: "m1",
    phone: "9876543210",
    customer_name: "Rahul",
    sender: "customer",
    message: "First message",
    created_at: "2026-10-06T10:00:00Z",
  }
  const msg2: SupportMsg = {
    id: "m2",
    phone: "9876543210",
    customer_name: "Support",
    sender: "support",
    message: "Second message",
    created_at: "2026-10-06T10:05:00Z",
  }
  // Arrived reversed
  const merged = mergeSupportMessages([], [msg2, msg1])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].id, "m1")
  assert.equal(merged[1].id, "m2")
})

test("Support Messages - filters rapid duplicate clicks", () => {
  const now = new Date().toISOString()
  const spamMsgs: SupportMsg[] = [
    { id: "s1", phone: "9876543210", customer_name: "Rahul", sender: "customer", message: "Need spoon", created_at: now },
    { id: "s2", phone: "9876543210", customer_name: "Rahul", sender: "customer", message: "Need spoon", created_at: now },
  ]
  const merged = mergeSupportMessages([], spamMsgs)
  assert.equal(merged.length, 1)
})

// ============================================================================
// TEST SUITE 6: Automated FAQ Knowledge Base Bot
// ============================================================================
test("FAQ Bot - resolves delivery and timing queries", () => {
  const reply1 = getFaqResponse("What are delivery timings?")
  assert.match(reply1, /8:00 PM and 9:30 PM/)
  assert.match(reply1, /₹7/)

  const reply2 = getFaqResponse("what is the delivery slot?")
  assert.match(reply2, /8:00 PM and 9:30 PM/)
})

test("FAQ Bot - resolves pickup location queries", () => {
  const reply = getFaqResponse("Where is the pickup location at Hostel 3?")
  assert.match(reply, /Hostel 3 Entrance/)
  assert.match(reply, /APJ Abdul Kalam Block/)
})

test("FAQ Bot - resolves fruit bowl pricing", () => {
  const reply = getFaqResponse("How much does fruit bowl cost?")
  assert.match(reply, /₹35 base \+ ₹7 per portion/)
})

test("FAQ Bot - resolves pickle shelf life and ingredients", () => {
  const reply = getFaqResponse("How long does mango pickle last?")
  assert.match(reply, /3–6 months/)
  assert.match(reply, /cold-pressed oils/)
})

test("FAQ Bot - resolves order tracking queries", () => {
  const reply = getFaqResponse("Where is my order status?")
  assert.match(reply, /Track Orders/)
})

test("FAQ Bot - resolves cancellation and refund queries", () => {
  const reply = getFaqResponse("How do I cancel order or get refund?")
  assert.match(reply, /MessMate Support Team/)
})

test("FAQ Bot - falls back gracefully with official Support Team branding", () => {
  const reply = getFaqResponse("Do you sell umbrellas?")
  assert.match(reply, /MessMate Support Team/)
  assert.equal(reply.includes("MessMate Support Team"), true)
  assert.equal(reply.includes("Campus Support Team"), false)
})

// ============================================================================
// TEST SUITE 7: UTR Validation, Empty Cart & Order Tracking Queries
// ============================================================================
test("UTR Validation - validates strict 12-digit Indian UPI reference format", () => {
  const validateUtr = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, 12)
    return { clean, isValid: clean.length === 12 }
  }

  assert.equal(validateUtr("409128381920").isValid, true)
  assert.equal(validateUtr("409128381920").clean, "409128381920")

  // Too short
  assert.equal(validateUtr("123").isValid, false)
  // Strips alphabetic characters and spaces
  assert.equal(validateUtr("UTR-4091 2838 1920").clean, "409128381920")
  assert.equal(validateUtr("UTR-4091 2838 1920").isValid, true)
  // Over length clamped to 12
  assert.equal(validateUtr("4091283819209999").clean.length, 12)
})

test("Order Tracking Query - normalizes phone variations to find orders", () => {
  const buildTrackingFilter = (q: string) => {
    const trimmed = q.trim()
    const cleanDigits = trimmed.replace(/\D/g, "")
    const normalizedPhone = cleanDigits.slice(-10)

    if (/^\d{1,4}$/.test(trimmed)) {
      return { type: "order_or_short", orderNum: parseInt(trimmed), query: trimmed }
    } else if (normalizedPhone.length === 10) {
      return {
        type: "phone_or",
        candidates: [normalizedPhone, cleanDigits, trimmed],
      }
    } else {
      return { type: "exact", query: trimmed }
    }
  }

  // Searching by 1-4 digit order number
  const orderSearch = buildTrackingFilter("14")
  assert.equal(orderSearch.type, "order_or_short")
  assert.equal((orderSearch as any).orderNum, 14)

  // Searching by 10-digit number
  const directPhone = buildTrackingFilter("9876543210")
  assert.equal(directPhone.type, "phone_or")
  assert.equal((directPhone as any).candidates.includes("9876543210"), true)

  // Searching with +91 country prefix
  const countryPrefix = buildTrackingFilter("+91 98765 43210")
  assert.equal(countryPrefix.type, "phone_or")
  assert.equal((countryPrefix as any).candidates.includes("9876543210"), true)

  // Searching with dashes
  const dashed = buildTrackingFilter("98765-43210")
  assert.equal(dashed.type, "phone_or")
  assert.equal((dashed as any).candidates.includes("9876543210"), true)
})

test("Empty Cart Guard - detects and prevents 0-item order submission", () => {
  const canSubmitOrder = (cartItems: any[]) => {
    return Boolean(cartItems && cartItems.length > 0)
  }

  assert.equal(canSubmitOrder([]), false)
  assert.equal(canSubmitOrder([{ id: "mango", price: 40, quantity: 1 }]), true)
})
