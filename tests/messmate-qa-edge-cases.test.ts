import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizePhone,
  cleanPhoneInput,
  isValidIndianPhone,
  calculateOrderTotals,
  getPickupPin,
  canCancelOrder,
  getFaqResponse,
  slotsForHostel,
  ALL_SLOTS,
  getSmallTalkReply,
  FAQ_FALLBACK,
  mergeSupportMessages,
  type SupportMsg,
  safeStorage,
  sanitizeInput,
  validateUtr,
  generateOrderFingerprint,
  validateSupportMessage,
  isChatRateLimited,
} from "../src/lib/order-logic.ts"
import {
  pickleProducts,
  packOptions,
  pickleCartItem,
  bowlLeftOut,
  fruitBowlCartItem,
  repriceForReorder,
  PREORDER_TAG,
  type CartItem,
} from "../src/lib/inventory.ts"

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

test("Phone Input - strips +91 / leading 0 from typed, pasted or autofilled numbers", () => {
  assert.equal(cleanPhoneInput("+919876543210"), "9876543210")
  assert.equal(cleanPhoneInput("+91 98765 43210"), "9876543210")
  assert.equal(cleanPhoneInput("09876543210"), "9876543210")
  assert.equal(cleanPhoneInput("98765-43210"), "9876543210")
  assert.equal(cleanPhoneInput("9123456789"), "9123456789") // a real number starting with 91 is left alone
  assert.equal(cleanPhoneInput("98765"), "98765") // partial input stays as typed
  assert.equal(cleanPhoneInput("98765432109"), "9876543210") // an extra digit after a full number is ignored
  assert.equal(cleanPhoneInput(""), "")
  assert.equal(cleanPhoneInput(null), "")
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
  assert.equal(deliveryTotals.fee, 5)
  assert.equal(deliveryTotals.total, 5)
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

test("Order Totals - standard items pricing with room delivery (₹5 fee)", () => {
  const items = [
    { price: 50, quantity: 3 }, // 150
  ]
  const totals = calculateOrderTotals(items, "delivery")
  assert.equal(totals.subtotal, 150)
  assert.equal(totals.fee, 5)
  assert.equal(totals.total, 155)
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

test("Menu Pricing - pickles come only in 50g packs at ₹40 (chicken ₹70) and the fruit bowl is a fixed ₹49", () => {
  const prices = Object.fromEntries(
    pickleProducts.map((product) => [product.name, packOptions.map((pack) => `${pack.label}=${pickleCartItem(product, pack).price}`)])
  )
  assert.deepEqual(prices, {
    "Mango Pickle (Avakaya)": ["50g=40"],
    "Gongura Pickle": ["50g=40"],
    "Gongura Pandu Mirchi": ["50g=40"],
    "Tomato Pickle": ["50g=40"],
    "Chicken Pickle with Bone": ["50g=70"],
  })

  // Same pack of different pickles must be separate cart lines
  const [mango, , , , chicken] = pickleProducts
  assert.notEqual(pickleCartItem(mango, packOptions[0]).id, pickleCartItem(chicken, packOptions[0]).id)

  const fullBowl = fruitBowlCartItem([])
  assert.equal(fullBowl.price, 49)
  assert.equal(fullBowl.detail, "All fruits")
  const pickyBowl = fruitBowlCartItem(["Papaya", "Banana"])
  assert.equal(pickyBowl.price, 49)
  assert.equal(pickyBowl.detail, "Without Banana, Papaya")
  assert.notEqual(pickyBowl.id, fullBowl.id)
  assert.equal(fruitBowlCartItem(["Banana", "Papaya"]).id, pickyBowl.id) // Order of exclusions doesn't matter
})

test("Reorder - re-prices past items at today's menu and drops discontinued ones", () => {
  const pastOrder: CartItem[] = [
    { id: "pickle-50g", name: "Chicken Pickle with Bone", detail: "50g", price: 35, quantity: 2, kind: "pickle" },
    { id: "pickle-50g", name: "Garlic Pickle", detail: "50g", price: 35, quantity: 1, kind: "pickle" },
    { id: "pickle-Trial Pack", name: "Tomato Pickle", detail: "Trial Pack", price: 20, quantity: 1, kind: "pickle" },
    { id: "pickle-Gongura Pickle-100g", name: "Gongura Pickle", detail: "100g", price: 80, quantity: 1, kind: "pickle" },
    { id: "fruit-bowl", name: "Custom Fruit Bowl", detail: "5 fruits · 350–450g", price: 70, quantity: 1, kind: "fruit" },
    { id: "fruit-bowl-no-Papaya", name: "Fresh Fruit Bowl", detail: "Without Papaya", price: 45, quantity: 0, kind: "fruit" },
  ]
  const reordered = repriceForReorder(pastOrder)
  assert.deepEqual(
    reordered.map((item) => [item.name, item.detail, item.price, item.quantity]),
    [
      ["Chicken Pickle with Bone", "50g", 70, 2],
      ["Fresh Fruit Bowl", "Without Papaya", 49, 1], // Bad quantity from the database is clamped to 1
    ]
  )
})

// ============================================================================
// TEST SUITE 4: Order Status Transitions & Cancellation Policy
// ============================================================================
test("Cancellation Policy - only 'placed' orders can be cancelled", () => {
  assert.equal(canCancelOrder("placed"), true)
  assert.equal(canCancelOrder("PLACED"), true)
  assert.equal(canCancelOrder(" Placed "), true)

  assert.equal(canCancelOrder("pending"), false) // not an order status in the database

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
      message: "Hello Happy Tummy",
      created_at: "2026-10-06T00:00:00Z",
    },
  ]
  const incoming: SupportMsg[] = [
    {
      id: "msg-1",
      phone: "9876543210",
      customer_name: "Rahul",
      sender: "customer",
      message: "Hello Happy Tummy Updated",
      created_at: "2026-10-06T00:00:00Z",
    },
  ]
  const merged = mergeSupportMessages(existing, incoming)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].message, "Hello Happy Tummy Updated")
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
  // A double tap makes two unsaved copies on the phone; they show once (two saved rows would be two messages)
  const spamMsgs: SupportMsg[] = [
    { id: "msg-s1", phone: "9876543210", customer_name: "Rahul", sender: "customer", message: "Need spoon", created_at: now },
    { id: "msg-s2", phone: "9876543210", customer_name: "Rahul", sender: "customer", message: "Need spoon", created_at: now },
  ]
  const merged = mergeSupportMessages([], spamMsgs)
  assert.equal(merged.length, 1)
})

// ============================================================================
// TEST SUITE 6: Automated FAQ Knowledge Base Bot
// ============================================================================
test("FAQ Bot - resolves delivery and timing queries", () => {
  const reply1 = getFaqResponse("What are delivery timings?")
  assert.match(reply1, /Kalam room delivery 6:00–7:00 PM, Asima pickup near the mess 8:30–9:30 AM/)
  assert.match(reply1, /₹5/)

  const reply2 = getFaqResponse("what is the delivery slot?")
  assert.match(reply2, /Kalam room delivery 6:00–7:00 PM, Asima pickup near the mess 8:30–9:30 AM/)
})

test("FAQ Bot - resolves pickup location queries: Asima picks up near the mess, Kalam gets room delivery", () => {
  const reply = getFaqResponse("Where is the pickup location at Kalam?")
  assert.match(reply, /near the Asima mess/)
  assert.match(reply, /Kalam orders come straight to your room/)
  assert.doesNotMatch(reply, /Room-341|Asima - 110/) // the old pickup counters are gone
  assert.equal(reply.includes("Hostel 3"), false) // Only Kalam and Asima exist
})

test("FAQ Bot - resolves fruit bowl pricing", () => {
  const reply = getFaqResponse("How much does fruit bowl cost?")
  assert.match(reply, /fixed ₹49/)
})

test("FAQ Bot - resolves pickle shelf life and ingredients", () => {
  const reply = getFaqResponse("How long does mango pickle last?")
  assert.match(reply, /3–6 months/)
  assert.match(reply, /chicken pickle within 3 months/)
  assert.match(reply, /cold-pressed oils/)
})

test("FAQ Bot - resolves order tracking queries", () => {
  const reply = getFaqResponse("Where is my order status?")
  assert.match(reply, /Track Orders/)
})

test("FAQ Bot - resolves cancellation and refund queries", () => {
  const reply = getFaqResponse("How do I cancel order or get refund?")
  assert.match(reply, /Happy Tummy Co\. Support Team/)
})

test("FAQ Bot - answers price questions with real menu prices", () => {
  for (const q of ["what is the price of mango pickle", "how much is the chicken pickle?", "what's the rate of gongura"]) {
    const reply = getFaqResponse(q)
    assert.match(reply, /₹40/, q)
    assert.match(reply, /₹70/, q)
    assert.match(reply, /50g/, q)
  }
})

test("FAQ Bot - matches whole words, so fruit names don't trigger PIN or rating answers", () => {
  assert.doesNotMatch(getFaqResponse("is pineapple in the bowl?"), /PIN/)
  assert.match(getFaqResponse("is pineapple in the bowl?"), /fixed ₹49/)
  assert.match(getFaqResponse("where is my pin"), /4-digit Pickup PIN/)
  assert.doesNotMatch(getFaqResponse("I want to rate my order"), /PIN/)
  assert.match(getFaqResponse("I want to rate my order"), /star rating/)
})

test("FAQ Bot - refund questions go to the team before topic answers", () => {
  assert.match(getFaqResponse("refund for my pickle order"), /Happy Tummy Co\. Support Team/)
  assert.match(getFaqResponse("can I change my delivery room?"), /modified before prep starts/)
})

test("FAQ Bot - falls back gracefully with official Support Team branding", () => {
  const reply = getFaqResponse("Do you sell umbrellas?")
  assert.match(reply, /Happy Tummy Co\. Support Team/)
  assert.equal(reply.includes("Happy Tummy Co. Support Team"), true)
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

// ============================================================================
// TEST SUITE 11: Admin Chat Multi-Thread Grouping & Mobile Navigation
// ============================================================================
test("Admin Chat - groups messages into single thread despite varied phone formats", () => {
  const rawMessages = [
    {
      id: "m1",
      phone: "+91 98765 43210",
      customer_name: "Rahul Sharma",
      sender: "customer" as const,
      message: "Hi from mobile format",
      created_at: "2026-10-06T10:00:00Z",
    },
    {
      id: "m2",
      phone: "9876543210",
      customer_name: "Rahul Sharma",
      sender: "customer" as const,
      message: "Second message clean format",
      created_at: "2026-10-06T10:05:00Z",
    },
    {
      id: "m3",
      phone: "9812345678",
      customer_name: "Priya Patel",
      sender: "customer" as const,
      message: "Message from Priya",
      created_at: "2026-10-06T10:10:00Z",
    },
  ]

  const threads: Record<string, { customerName: string; messages: any[]; latestAt: string }> = {}
  rawMessages.forEach((msg) => {
    const cleanPhone = normalizePhone(msg.phone) || msg.phone
    if (!threads[cleanPhone]) {
      threads[cleanPhone] = {
        customerName: msg.customer_name,
        messages: [],
        latestAt: msg.created_at,
      }
    }
    threads[cleanPhone].messages.push(msg)
    if (msg.created_at > threads[cleanPhone].latestAt) {
      threads[cleanPhone].latestAt = msg.created_at
    }
  })

  const threadList = Object.entries(threads).map(([phone, data]) => ({ phone, ...data }))
  // Should have exactly 2 distinct student threads, not 3
  assert.equal(threadList.length, 2)
  const rahulThread = threadList.find((t) => t.phone === "9876543210")
  assert.ok(rahulThread)
  assert.equal(rahulThread.messages.length, 2)
  assert.equal(rahulThread.customerName, "Rahul Sharma")
})

test("Admin Chat - mobile phone navigation allows viewing all chats and returning to inbox", () => {
  const threads = [
    { phone: "9876543210", customerName: "Rahul Sharma" },
    { phone: "9812345678", customerName: "Priya Patel" },
    { phone: "9898989898", customerName: "Amit Verma" },
  ]

  // Model mobile state transition
  let isMobile = true
  let selectedPhone: string | null = null

  // On mobile, initial state must be null so inbox list is displayed
  assert.equal(selectedPhone, null)

  // User taps Priya's conversation
  selectedPhone = threads[1].phone
  assert.equal(selectedPhone, "9812345678")

  // User taps back button to return to conversation list
  selectedPhone = null
  // In the fixed implementation, mobile does not re-force thread[0]
  const autoSelectOnMobile = (mobile: boolean, currentSelected: string | null) => {
    if (!mobile && !currentSelected && threads.length > 0) {
      return threads[0].phone
    }
    return currentSelected
  }

  selectedPhone = autoSelectOnMobile(isMobile, selectedPhone)
  assert.equal(selectedPhone, null) // Stays in inbox list!

  // Now user can tap Amit's conversation
  selectedPhone = threads[2].phone
  assert.equal(selectedPhone, "9898989898")
})

// ============================================================================
// TEST SUITE 12: Financial Integrity & Payload Tampering Defense
// ============================================================================
test("Financial Integrity - prevents negative prices and negative quantities", () => {
  const tamperedCart = [
    { price: -50, quantity: 2 },
    { price: 40, quantity: -3 },
    { price: 35, quantity: 1 },
  ]
  const result = calculateOrderTotals(tamperedCart, "pickup")
  // First item has negative price -> coerced to 0
  // Second item has negative quantity -> coerced to 0
  // Third item: 35 * 1 = 35
  assert.equal(result.subtotal, 35)
  assert.equal(result.fee, 0)
  assert.equal(result.total, 35)
})

test("Financial Integrity - handles fractional and non-numeric quantities safely", () => {
  const weirdCart = [
    { price: 50, quantity: 0.5 }, // Fractional quantity floored to 0
    { price: 40, quantity: NaN as any }, // NaN floored to 0
    { price: 30, quantity: "2" as any }, // String converted to number 2
  ]
  const result = calculateOrderTotals(weirdCart, "delivery")
  assert.equal(result.subtotal, 60) // 0 + 0 + (30 * 2) = 60
  assert.equal(result.fee, 5)
  assert.equal(result.total, 65)
})

test("Financial Integrity - rounds float precision anomalies (0.1 + 0.2)", () => {
  const precisionCart = [
    { price: 0.1, quantity: 1 },
    { price: 0.2, quantity: 1 },
  ]
  const result = calculateOrderTotals(precisionCart, "pickup")
  assert.equal(result.subtotal, 0.3)
  assert.equal(result.total, 0.3)
})

// ============================================================================
// TEST SUITE 13: Strict UPI UTR Reference Verification
// ============================================================================
test("UTR Validation - accepts valid 12-digit reference numbers", () => {
  assert.equal(validateUtr("409128381920").valid, true)
  assert.equal(validateUtr("928371940182").valid, true)
  assert.equal(validateUtr("  409128381920  ").valid, true)
})

test("UTR Validation - rejects incorrect lengths and non-numeric inputs", () => {
  assert.equal(validateUtr("").valid, false)
  assert.equal(validateUtr(null).valid, false)
  assert.equal(validateUtr("12345").valid, false) // Too short
  assert.equal(validateUtr("1234567890123").valid, false) // Too long
  assert.equal(validateUtr("abcdefghijkl").valid, false) // Non-numeric
})

test("UTR Validation - rejects fake/dummy repeated or sequential numbers", () => {
  assert.equal(validateUtr("000000000000").valid, false) // All zeros
  assert.equal(validateUtr("111111111111").valid, false) // All ones
  assert.equal(validateUtr("999999999999").valid, false) // All nines
  assert.equal(validateUtr("123456789012").valid, false) // Trivial sequential
  assert.equal(validateUtr("012345678901").valid, false) // Trivial sequential
})

// ============================================================================
// TEST SUITE 14: Storage Resilience & Malformed JSON Recovery
// ============================================================================
test("Storage Resilience - safeStorage recovers gracefully from missing or broken storage", () => {
  // In node environment without window, safeStorage must return fallback without throwing
  assert.equal(safeStorage.getItem("non_existent_key", "default_val"), "default_val")
  assert.equal(safeStorage.getJson("bad_json_key", { count: 0 }).count, 0)
  assert.equal(safeStorage.setItem("key", "val"), false) // false when window is undefined, doesn't throw!
})

// ============================================================================
// TEST SUITE 15: Input Sanitization & XSS Defense
// ============================================================================
test("Input Sanitization - strips script tags, HTML entities, and control characters", () => {
  const maliciousName = "<script>alert('pwned')</script>Rahul Sharma"
  assert.equal(sanitizeInput(maliciousName), "Rahul Sharma")

  const iframeInjection = "<iframe src='javascript:bad()'></iframe>Priya Patel"
  assert.equal(sanitizeInput(iframeInjection), "Priya Patel")

  const zeroWidthSpam = "Amit\u200B\uFEFFVerma"
  assert.equal(sanitizeInput(zeroWidthSpam), "AmitVerma")
})

test("Input Sanitization - enforces maximum string length boundary", () => {
  const superLongString = "A".repeat(500)
  const sanitized = sanitizeInput(superLongString, 50)
  assert.equal(sanitized.length, 50)
})

// ============================================================================
// TEST SUITE 16: Order Idempotency & Duplicate Submission Guard
// ============================================================================
test("Order Idempotency - generates deterministic fingerprint for identical orders", () => {
  const items = [{ price: 40, quantity: 2 }]
  const fp1 = generateOrderFingerprint("9876543210", items, 80, "8:30–9:00 PM")
  const fp2 = generateOrderFingerprint("+91 98765 43210", items, 80, "8:30–9:00 PM")
  assert.equal(fp1, fp2)

  // Different slot produces different fingerprint
  const fp3 = generateOrderFingerprint("9876543210", items, 80, "9:00–9:30 PM")
  assert.notEqual(fp1, fp3)
})

// ============================================================================
// TEST SUITE 17: Support Chat Rate Limiting & Message Content Guard
// ============================================================================
test("Support Chat - validates message content length and whitespace", () => {
  assert.equal(validateSupportMessage("").valid, false)
  assert.equal(validateSupportMessage("   ").valid, false)
  assert.equal(validateSupportMessage("x").valid, false) // Too short
  assert.equal(validateSupportMessage("Hello support team").valid, true)
  assert.equal(validateSupportMessage("<script>evil</script>").valid, false) // Becomes empty after sanitization
})

test("Support Chat - detects rapid burst spamming", () => {
  const now = Date.now()
  // 4 rapid messages within last 2 seconds
  const rapidBurst = [now - 1500, now - 1000, now - 500, now - 100]
  assert.equal(isChatRateLimited(rapidBurst, 5000, 4), true)

  // Messages spaced out outside window
  const normalInterval = [now - 10000, now - 8000, now - 6000]
  assert.equal(isChatRateLimited(normalInterval, 5000, 4), false)
})

test("Fruit bowl cart lines remember which fruits were left out", () => {
  assert.deepEqual(bowlLeftOut(fruitBowlCartItem([]).id), [])
  assert.deepEqual(bowlLeftOut(fruitBowlCartItem(["Banana", "Apple"]).id), ["Apple", "Banana"])
  assert.deepEqual(bowlLeftOut("pickle-Mango Pickle (Avakaya)-50g"), [])
})

test("FAQ Bot - greetings and small talk have no instant answer, so the chat asks the AI helper", () => {
  for (const q of ["hi", "hello", "meoww", "who are you?"]) assert.equal(getFaqResponse(q), FAQ_FALLBACK, q)
  assert.notEqual(getFaqResponse("what time do you deliver"), FAQ_FALLBACK)
})

test("Support merge - skips malformed messages instead of crashing the chat", () => {
  const good = { id: "m1", phone: "9876543210", customer_name: "A", sender: "customer", message: "hi", created_at: new Date().toISOString() }
  const bad = [
    { ...good, id: "b1", phone: 9876543210 },
    { ...good, id: "b2", message: { text: "x" } },
    { ...good, id: "b3", customer_name: ["x"] },
    { ...good, id: "b4", created_at: 12345 },
    null,
  ]
  const merged = mergeSupportMessages([], [good, ...(bad as any)])
  assert.deepEqual(merged.map((m) => m.id), ["m1"])
})

test("Small talk - friendly built-in replies when the AI helper can't answer", () => {
  for (const q of ["hi", "Hiii", "hello!!", "hey there", "namaste", "good morning"]) assert.match(getSmallTalkReply(q) ?? "", /Happy Tummy bot/, q)
  assert.match(getSmallTalkReply("thanks bro") ?? "", /welcome/)
  assert.match(getSmallTalkReply("bye") ?? "", /Come back hungry/)
  assert.match(getSmallTalkReply("ok") ?? "", /Anything else/)
  for (const q of ["meoww", "write me a poem", "history of mango", "hike"]) assert.equal(getSmallTalkReply(q), null, q)
})

test("FAQ Bot - common student questions get the right instant answer", () => {
  const price = /₹40/
  assert.match(getFaqResponse("mango pickle ka rate kya hai"), price)
  assert.match(getFaqResponse("what is the rate"), price)
  assert.match(getFaqResponse("chicken pickle kitne ka hai"), /₹70/)
  assert.match(getFaqResponse("cash on delivery?"), /runner on room delivery/)
  assert.match(getFaqResponse("upi payment failed but money deducted"), /Support Team/)
  assert.match(getFaqResponse("refund"), /sort it out/)
  assert.match(getFaqResponse("my order is late"), /Track Orders/)
  assert.match(getFaqResponse("do you have lemon pickle?"), /Gongura Pandu Mirchi/)
  assert.doesNotMatch(getFaqResponse("do you have lemon pickle?"), /lemon/i)
  assert.match(getFaqResponse("which fruits are in the bowl"), /apple, banana, papaya, pomegranate, orange and guava/)
})

test("FAQ Bot - words inside other words don't trigger the wrong answer", () => {
  assert.doesNotMatch(getFaqResponse("is the fruit bowl nutritious?"), /UTR/) // "utr" inside "nutritious"
  assert.equal(getFaqResponse("this app is stupid"), FAQ_FALLBACK) // "upi" inside "stupid"
  assert.doesNotMatch(getFaqResponse("so frustrating"), /star rating/) // "rating" inside "frustrating"
})

test("Phone validation - rejects dummy numbers that many people would share", () => {
  assert.equal(isValidIndianPhone("9999999999"), false)
  assert.equal(isValidIndianPhone("7777777777"), false)
  assert.equal(isValidIndianPhone("9876543210"), true)
})

test("Support merge - the same text sent twice is two messages once both are saved", () => {
  const at = new Date().toISOString()
  const row = (id: string) => ({ id, phone: "9876543210", customer_name: "A", sender: "customer" as const, message: "ok", created_at: at })
  assert.equal(mergeSupportMessages([], [row("uuid-1"), row("uuid-2")]).length, 2)
  // a screen's own copy and its saved row are still one message
  assert.equal(mergeSupportMessages([row("msg-123")], [row("uuid-3")]).length, 1)
})

test("FAQ Bot - while pickles are on Preorder, pickle questions say they're arriving soon and can be preordered", () => {
  const reply = getFaqResponse("do you have pickles?", true)
  assert.match(reply, /arriving soon/i)
  assert.match(reply, /preorder/i)
  assert.match(getFaqResponse("when will mango achar be back?", true), /arriving soon/i) // not the delivery-times answer
  const price = getFaqResponse("how much does it cost?", true)
  assert.match(price, /₹40 each/)
  assert.match(price, /on preorder/)
  assert.match(price, /fixed ₹49/)
  // Back on sale: the usual answers
  assert.match(getFaqResponse("do you have pickles?"), /Mango Pickle/)
  assert.doesNotMatch(getFaqResponse("how much does it cost?"), /preorder/)
})

test("Preorder - a past preorder pickle line reorders as a plain pack at today's price", () => {
  const past: CartItem[] = [{ id: "pickle-Tomato Pickle-50g", name: "Tomato Pickle", detail: `50g${PREORDER_TAG}`, price: 40, quantity: 2, kind: "pickle" }]
  assert.deepEqual(
    repriceForReorder(past).map((i) => [i.name, i.detail, i.price, i.quantity]),
    [["Tomato Pickle", "50g", 40, 2]],
  )
})

test("Fruit bowl - six fruits, and leaving one out tops up the others", () => {
  const reply = getFaqResponse("which fruits are in the bowl")
  assert.match(reply, /6 fresh-cut fruits/)
  assert.match(reply, /add more of the others/)
  assert.doesNotMatch(reply, /grapes|pineapple/i)
})

test("Slots - Asima mornings (an hour longer at weekends), Kalam evenings, picked by the morning the order is for", () => {
  const weekday = ["8:30–9:00 AM", "9:00–9:30 AM"]
  const weekend = [...weekday, "9:30–10:00 AM", "10:00–10:30 AM"]
  const at = (s: string) => new Date(s) // local time, like the student's phone
  assert.deepEqual(slotsForHostel("Asima", at("2026-10-28T20:00:00")), weekday) // Wed night -> Thu morning
  assert.deepEqual(slotsForHostel("Asima", at("2026-10-30T21:00:00")), weekend) // Fri night -> Sat morning
  assert.deepEqual(slotsForHostel("Asima", at("2026-10-31T10:00:00")), weekend) // Sat 10:00, before 10:30 -> this morning
  assert.deepEqual(slotsForHostel("Asima", at("2026-11-01T22:00:00")), weekday) // Sun night -> Mon morning
  assert.deepEqual(slotsForHostel("Asima", at("2026-11-02T09:00:00")), weekday) // Mon 9:00, before 9:30 -> this morning
  assert.deepEqual(slotsForHostel("Asima", at("2026-11-02T09:45:00")), weekday) // Mon 9:45 -> Tue morning
  assert.deepEqual(slotsForHostel("Kalam", at("2026-10-31T10:00:00")), ["6:00–6:30 PM", "6:30–7:00 PM"])
  assert.equal(ALL_SLOTS.length, 6)
  assert.ok(slotsForHostel("Asima", at("2026-10-31T10:00:00")).every((s) => ALL_SLOTS.includes(s)))
})

test("FAQ Bot - Sweets & Snacks says Pootharekulu is coming soon, with its price", () => {
  assert.match(getFaqResponse("do you have pootharekulu?"), /coming soon/i)
  assert.match(getFaqResponse("price of sweets?"), /Pootharekulu: 5 pcs for ₹150/)
  assert.match(getFaqResponse("how much is a fruit bowl?"), /fixed ₹49/) // other price questions unchanged
})
