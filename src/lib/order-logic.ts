export type SupportMsg = {
  id: string
  phone: string
  customer_name: string
  sender: "customer" | "support" | "bot"
  message: string
  created_at: string
}

export type OrderItemLike = {
  price: number
  quantity: number
}

/**
 * Normalizes phone numbers by stripping all non-digits and keeping the last 10 digits.
 * Handles inputs like "+91 98765 43210", "98765-43210", "09876543210".
 */
export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return ""
  return String(raw).replace(/\D/g, "").slice(-10)
}

/**
 * Validates whether a given phone number is a valid 10-digit Indian mobile number.
 * Valid Indian mobile numbers are 10 digits and start with 6, 7, 8, or 9.
 */
export function isValidIndianPhone(raw: string | undefined | null): boolean {
  const clean = normalizePhone(raw)
  return /^[6-9]\d{9}$/.test(clean)
}

/**
 * Calculates subtotal, delivery fee, and final total for an order.
 * delivery fee is ₹7 for room delivery, and ₹0 for campus pickup.
 */
export function calculateOrderTotals(
  items: OrderItemLike[],
  fulfilment: "pickup" | "delivery"
): { subtotal: number; fee: number; total: number } {
  const subtotal = items.reduce((sum, item) => {
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0))
    const price = Math.max(0, Number(item.price) || 0)
    return sum + price * qty
  }, 0)

  const fee = fulfilment === "delivery" ? 7 : 0
  const total = subtotal + fee

  // Guard against float precision issues (e.g. 0.1 + 0.2)
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    fee,
    total: Math.round(total * 100) / 100,
  }
}

/**
 * Calculates custom fruit bowl price.
 * Base bowl is ₹35, plus ₹7 per portion of fruit selected.
 */
export function calculateFruitBowlPrice(portionsCount: number): number {
  const validPortions = Math.max(0, Math.floor(Number(portionsCount) || 0))
  const BASE_PRICE = 35
  const PORTION_PRICE = 7
  return BASE_PRICE + validPortions * PORTION_PRICE
}

/**
 * Returns a 4-digit pickup PIN for an order.
 * If pickup_code is already present and at least 4 chars, returns it.
 * Otherwise deterministically calculates a 4-digit numeric string (1000-9999).
 */
export function getPickupPin(order: { pickup_code?: string; order_number?: number | string }): string {
  if (order.pickup_code && String(order.pickup_code).length >= 4) {
    return String(order.pickup_code)
  }
  const parsed = Number(order.order_number)
  const rawNum = isNaN(parsed) ? 1048 : Math.floor(Math.abs(parsed))
  return String(1000 + ((rawNum * 73 + 49) % 9000))
}

/**
 * Determines whether a student can cancel an order based on its current kitchen status.
 * Orders can only be cancelled while in 'pending' status (before kitchen begins preparation).
 */
export function canCancelOrder(status: string | undefined | null): boolean {
  if (!status) return false
  const s = String(status).toLowerCase().trim()
  return s === "pending"
}

/**
 * Automated FAQ bot query resolver for instant student support responses.
 */
export function getFaqResponse(query: string): string {
  const q = (query || "").toLowerCase().trim()
  if (!q) {
    return "Thanks for asking! For order-specific requests or anything else, click 'Talk to Team' below to speak directly with the MessMate Support Team."
  }

  // 1. PIN & pickup code queries
  if (q.includes("pin") || q.includes("pickup code") || q.includes("verification code")) {
    return "Your unique 4-digit Pickup PIN is on your Order Confirmation screen and in 'Track Orders'. Show it to the counter staff to collect your order!"
  }

  // 2. Order status & live tracking queries (prioritized over generic location queries)
  if (
    q.includes("track") ||
    q.includes("status") ||
    q.includes("where is my order") ||
    q.includes("where is my food") ||
    q.includes("where is my delivery") ||
    q.includes("where is order") ||
    q.includes("order progress")
  ) {
    return "Go to 'Track Orders' in the menu and enter your phone number to track live order progress from kitchen to delivery!"
  }

  // 3. Payment, UPI, UTR verification
  if (
    q.includes("utr") ||
    q.includes("verify") ||
    q.includes("verification") ||
    q.includes("phonepe") ||
    q.includes("upi")
  ) {
    return "After paying via PhonePe QR, submit your 12-digit UTR number. The kitchen staff verifies it on their merchant soundbox and marks it 'Verified'!"
  }

  // 4. Cancellation & refund
  if (q.includes("cancel") || q.includes("refund") || q.includes("change order")) {
    return "Orders can be modified before prep starts. Please click 'Talk to Team' below so our MessMate Support Team can update your order right away!"
  }

  // 5. Delivery slot and timings
  if (
    q.includes("delivery timing") ||
    q.includes("delivery slot") ||
    q.includes("timing") ||
    q.includes("time") ||
    q.includes("when") ||
    q.includes("slot")
  ) {
    return "Deliveries & pickups happen every evening between 8:00 PM and 9:30 PM. Room delivery is ₹7, and campus pickup is free!"
  }

  // 6. Pickup station / location queries (precise matching, avoiding naked 'where')
  if (
    q.includes("pickup point") ||
    q.includes("pickup location") ||
    q.includes("where to collect") ||
    q.includes("where to pick") ||
    q.includes("where is pickup") ||
    q.includes("pickup station") ||
    q.includes("hostel 3") ||
    q.includes("apj block") ||
    q.includes("asima") ||
    (q.includes("pickup") && !q.includes("pin"))
  ) {
    return "Pickups are available at Hostel 3 Entrance, APJ Abdul Kalam Block (Room 341), and Asima Hostel. Select your preferred station during checkout!"
  }

  // 7. Custom fruit bowl
  if (
    q.includes("fruit") ||
    q.includes("bowl") ||
    q.includes("portion")
  ) {
    return "Custom fruit bowls are ₹35 base + ₹7 per portion. Choose from 10 fresh fruits including Apple, Banana, Papaya, Watermelon, and Pomegranate."
  }

  // 8. Homemade South Indian Pickles
  if (
    q.includes("pickle") ||
    q.includes("shelf") ||
    q.includes("mango") ||
    q.includes("gongura") ||
    q.includes("garlic") ||
    q.includes("lemon") ||
    q.includes("expiry")
  ) {
    return "Our South Indian homemade pickles last 3–6 months at room temperature. Made small-batch with cold-pressed oils."
  }

  // 9. Reorder
  if (q.includes("reorder") || q.includes("again") || q.includes("repeat") || q.includes("previous")) {
    return "In 'Track Orders', click the 'Reorder This Meal' button on any past order to refill your cart instantly!"
  }

  // 10. Rating
  if (q.includes("rate") || q.includes("rating") || q.includes("review") || q.includes("feedback") || q.includes("stars")) {
    return "After your order is marked Delivered, you can leave a 1 to 5 star rating and feedback note directly in 'Track Orders'!"
  }

  // 11. Sold out
  if (q.includes("sold out") || q.includes("stock") || q.includes("unavailable") || q.includes("out of stock")) {
    return "Items that run out in the kitchen are marked 'Sold Out' in real-time. Fresh batches are prepared every morning for dinner delivery!"
  }

  // Fallback
  return "Thanks for asking! For order-specific requests or anything else, click 'Talk to Team' below to speak directly with the MessMate Support Team."
}

/**
 * Merges real-time support messages with local state:
 * - Replaces optimistic messages (starting with msg-, local-, admin-) when canonical server message arrives
 * - Deduplicates by ID or fuzzy sender+phone+content within a 90-second window
 * - Ensures strictly chronological ascending ordering by created_at
 */
export function mergeSupportMessages(
  existing: SupportMsg[],
  incomingList: SupportMsg[]
): SupportMsg[] {
  let result = [...existing]

  for (const incoming of incomingList) {
    if (!incoming || !incoming.message) continue

    // 1. Direct ID match
    const exactIndex = result.findIndex((m) => m.id === incoming.id)
    if (exactIndex !== -1) {
      result[exactIndex] = { ...result[exactIndex], ...incoming }
      continue
    }

    // 2. Fuzzy match for optimistic local messages vs canonical server messages
    const fuzzyIndex = result.findIndex((m) => {
      const sameSender = m.sender === incoming.sender
      const p1 = (m.phone || "").replace(/\D/g, "").slice(-10)
      const p2 = (incoming.phone || "").replace(/\D/g, "").slice(-10)
      const samePhone = !p1 || !p2 || p1 === p2
      const sameText = m.message.trim() === incoming.message.trim()
      const t1 = new Date(m.created_at).getTime()
      const t2 = new Date(incoming.created_at).getTime()
      const sameTimeWindow = isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 90000

      return sameSender && samePhone && sameText && sameTimeWindow
    })

    if (fuzzyIndex !== -1) {
      const existingMsg = result[fuzzyIndex]
      const incomingIsCanonical =
        !incoming.id.startsWith("msg-") &&
        !incoming.id.startsWith("local-") &&
        !incoming.id.startsWith("admin-")
      result[fuzzyIndex] = incomingIsCanonical ? incoming : existingMsg
    } else {
      result.push(incoming)
    }
  }

  // Deduplicate any repeated messages with identical content in close proximity
  const deduped: SupportMsg[] = []
  for (const msg of result) {
    const isDup = deduped.some((d) => {
      if (d.id === msg.id) return true
      const sameSender = d.sender === msg.sender
      const p1 = (d.phone || "").replace(/\D/g, "").slice(-10)
      const p2 = (msg.phone || "").replace(/\D/g, "").slice(-10)
      const samePhone = !p1 || !p2 || p1 === p2
      const sameText = d.message.trim() === msg.message.trim()
      const t1 = new Date(d.created_at).getTime()
      const t2 = new Date(msg.created_at).getTime()
      const sameTime = isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 90000
      return sameSender && samePhone && sameText && sameTime
    })
    if (!isDup) deduped.push(msg)
  }

  return deduped.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

/**
 * Safe localStorage access wrappers that never throw even if storage is full,
 * quota is exceeded, disabled by browser privacy policy, or contains malformed JSON.
 */
export const safeStorage = {
  getItem(key: string, fallback: string | null = null): string | null {
    try {
      if (typeof window === "undefined" || !window.localStorage) return fallback
      return window.localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  },

  setItem(key: string, value: string): boolean {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false
      window.localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  },

  removeItem(key: string): boolean {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false
      window.localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  },

  getJson<T>(key: string, fallback: T): T {
    try {
      const raw = this.getItem(key)
      if (!raw) return fallback
      const parsed = JSON.parse(raw)
      return parsed ?? fallback
    } catch {
      return fallback
    }
  },

  setJson<T>(key: string, value: T): boolean {
    try {
      return this.setItem(key, JSON.stringify(value))
    } catch {
      return false
    }
  },
}

/**
 * Sanitizes user-entered text strings:
 * - Strips HTML/script tags
 * - Strips zero-width and non-printable ASCII control characters
 * - Enforces max length boundary
 */
export function sanitizeInput(raw: unknown, maxLength: number = 255): string {
  if (raw === null || raw === undefined) return ""
  const str = String(raw)
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Strip <script>...</script> with contents
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Strip <style>...</style> with contents
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "") // Strip <iframe>...</iframe> with contents
    .replace(/<[^>]*>?/gm, "") // Strip any remaining tags
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "") // Strip control/zero-width chars
    .trim()
    .slice(0, maxLength)
}

/**
 * Validates 12-digit UPI reference number (UTR).
 * Returns { valid: boolean; reason?: string }
 */
export function validateUtr(raw: unknown): { valid: boolean; reason?: string } {
  if (!raw) return { valid: false, reason: "UTR number is required" }
  const clean = String(raw).replace(/\D/g, "")
  if (clean.length !== 12) {
    return { valid: false, reason: "UTR must be exactly 12 digits" }
  }
  // Check for dummy/fake repetitive sequences (e.g. 000000000000, 111111111111)
  if (/^(\d)\1{11}$/.test(clean)) {
    return { valid: false, reason: "Dummy/repetitive UTR sequence is not allowed" }
  }
  // Check for trivial incremental sequences (e.g. 123456789012)
  if (clean === "123456789012" || clean === "012345678901") {
    return { valid: false, reason: "Sequential test UTR is not valid" }
  }
  return { valid: true }
}

/**
 * Generates an order idempotency fingerprint to block accidental double-submissions.
 */
export function generateOrderFingerprint(
  phone: string,
  items: OrderItemLike[],
  total: number,
  slot: string
): string {
  const cleanPhone = normalizePhone(phone)
  const itemsSummary = items
    .map((i) => `${Math.max(0, Math.floor(Number(i.quantity) || 0))}x${Math.round(Number(i.price) * 100)}`)
    .sort()
    .join(";")
  return `${cleanPhone}:${itemsSummary}:${Math.round(total * 100)}:${slot.trim()}`
}

/**
 * Validates chat message length and content:
 * Must be between 1 and 1000 characters and free of script tags.
 */
export function validateSupportMessage(text: unknown): { valid: boolean; cleanText: string; error?: string } {
  const sanitized = sanitizeInput(text, 1000)
  if (!sanitized) {
    return { valid: false, cleanText: "", error: "Message cannot be empty" }
  }
  if (sanitized.length < 2) {
    return { valid: false, cleanText: sanitized, error: "Message is too short" }
  }
  return { valid: true, cleanText: sanitized }
}

/**
 * Rate-limiting check for support chat messages:
 * Returns true if the user sent more than `maxAllowed` messages within `windowMs`.
 */
export function isChatRateLimited(
  timestamps: number[],
  windowMs: number = 5000,
  maxAllowed: number = 4
): boolean {
  const now = Date.now()
  const recent = timestamps.filter((t) => now - t < windowMs)
  return recent.length >= maxAllowed
}

