import { DEFAULT_MENU_ITEMS, FRUIT_BOWL_PRICE, MAX_LEFT_OUT, PICKLES_ARRIVAL, POOTHAREKULU_PACK, POOTHAREKULU_PRICE, packOptions, pickleProducts } from "./inventory.ts"

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
 * Cleans a phone number as it is typed, pasted or autofilled: keeps digits, drops a leading
 * +91 / 0 once the number runs past 10 digits, and caps the result at 10 digits.
 * "+91 98765 43210" -> "9876543210", "09876543210" -> "9876543210".
 */
export function cleanPhoneInput(raw: string | undefined | null): string {
  const digits = String(raw ?? "").replace(/\D/g, "")
  const local = digits.length > 10 ? digits.replace(/^(?:91|0)/, "") : digits
  return local.slice(0, 10)
}

/**
 * Validates whether a given phone number is a valid 10-digit Indian mobile number.
 * Valid Indian mobile numbers are 10 digits and start with 6, 7, 8, or 9.
 */
export function isValidIndianPhone(raw: string | undefined | null): boolean {
  const clean = normalizePhone(raw)
  return /^[6-9]\d{9}$/.test(clean) && !/^(\d)\1{9}$/.test(clean)
}

// Room delivery fee in ₹ (Kalam, and Asima pickle-only orders); pickup is free. The orders.delivery_fee CHECK constraint must allow it.
export const DELIVERY_FEE = 5
// Asima pickle-only orders are collected from one of these rooms (fruit bowls near the Asima mess)
export const ASIMA_PICKUP = "Room 104 or 210"

/** Kalam always gets room delivery. Asima orders are picked up (fruit bowls near the mess, pickles from ASIMA_PICKUP), unless a pickle-only order asks for room delivery. */
export const fulfilmentFor = (
  hostel: string,
  items: Array<{ kind?: string }>,
  asimaRoomDelivery = false,
): "pickup" | "delivery" =>
  hostel !== "Asima" || (asimaRoomDelivery && !items.some((item) => item.kind === "fruit")) ? "delivery" : "pickup"

// Pickup and delivery times depend on the hostel: Asima in the morning, Kalam in the evening.
// Kalam students pick a half-hour slot; Asima has one pickup window per morning (nothing to pick).
export const HOSTEL_SLOTS: Record<string, string[]> = {
  Kalam: ["6:00–6:30 PM", "6:30–7:00 PM"],
  Asima: ["8:30–9:30 AM"],
}
// Asima runs an hour longer on Saturday and Sunday mornings
export const ASIMA_WEEKEND = ["8:30–10:30 AM"]
export const ALL_SLOTS = [...HOSTEL_SLOTS.Asima, ...ASIMA_WEEKEND, ...HOSTEL_SLOTS.Kalam]
// Kalam rooms are a 3-digit number plus side A or B, saved together like "214A"
export const KALAM_ROOM = /^\d{3}[AB]$/
// Asima room numbers can be anything for now, as long as one is given
export const ASIMA_ROOM = /\S/
export function splitKalamRoom(room: string): { digits: string; side: string } {
  const raw = String(room || "").toUpperCase()
  const digits = raw.replace(/\D/g, "")
  // An older saved room with more digits can't be trusted as a 3-digit one, so it's asked for again
  return { digits: digits.length <= 3 ? digits : "", side: /[AB]$/.test(raw) ? raw.slice(-1) : "" }
}
export const normalizeKalamRoom = (room: string) => {
  const { digits, side } = splitKalamRoom(room)
  return digits + side
}

// Asima's hours are its pickup window; Asima room delivery has no set time yet
export const HOSTEL_HOURS = { Kalam: "6:00–7:00 PM", Asima: "8:30–9:30 AM (weekends till 10:30 AM)" }
// The fruit page splits this on ", " into one line per hostel
export const SERVICE_HOURS = `Kalam room delivery ${HOSTEL_HOURS.Kalam}, Asima pickup ${HOSTEL_HOURS.Asima} near the mess`

/**
 * The slots a hostel offers for its next service. Asima's next morning is today until that
 * morning's window closes (9:30, or 10:30 at weekends), then tomorrow; weekend mornings get the longer window.
 */
export function slotsForHostel(hostel: string, now: Date = new Date()): string[] {
  if (hostel === "Kalam") return HOSTEL_SLOTS.Kalam
  if (hostel !== "Asima") return ALL_SLOTS
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
  const morning = new Date(now)
  if (now.getTime() >= new Date(now).setHours(isWeekend(now) ? 10 : 9, 30, 0, 0)) morning.setDate(morning.getDate() + 1)
  return isWeekend(morning) ? ASIMA_WEEKEND : HOSTEL_SLOTS.Asima
}

/**
 * Calculates subtotal, delivery fee, and final total for an order.
 * Room delivery adds DELIVERY_FEE; campus pickup is free.
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

  const fee = fulfilment === "delivery" ? DELIVERY_FEE : 0
  const total = subtotal + fee

  // Guard against float precision issues (e.g. 0.1 + 0.2)
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    fee,
    total: Math.round(total * 100) / 100,
  }
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
 * Orders can only be cancelled while 'placed' (before the kitchen starts preparing).
 */
export function canCancelOrder(status: string | undefined | null): boolean {
  if (!status) return false
  const s = String(status).toLowerCase().trim()
  return s === "placed"
}

// Matches SUPPORT_NAME in App.tsx (the name support replies are stored under)
const SUPPORT_TEAM = "Happy Tummy Co. Support Team"
// Friendly built-in replies for greetings and small talk, used when the AI helper can't answer
// (out of its daily allowance, offline, or not set up). Null when it isn't small talk.
export function getSmallTalkReply(query: string): string | null {
  const q = (query || "").toLowerCase().trim()
  if (/^(hi+|hey+|hello+|helo+|hiya|yo|namaste|namaskar|good (morning|afternoon|evening))\b/.test(q)) {
    return "Hi! 👋 I'm the Happy Tummy bot. Ask me about our pickles, fruit bowls, prices, pickup or delivery."
  }
  if (/\b(thanks|thank you|thank u|thx|ty|shukriya|dhanyavaad)\b/.test(q)) return "You're welcome! Enjoy your food 😊"
  if (/^(bye+|good ?night|see (you|ya)|tata|cya)\b/.test(q)) return "Bye! Come back hungry 😄"
  if (/^(ok+|okay|k|cool|nice|great|hmm+|lol|ha(ha)+|he(he)+)[!. ]*$/.test(q)) {
    return "😊 Anything else I can help with? Ask me about the menu, prices, pickup or delivery."
  }
  return null
}

// The reply when no instant answer matches; the chat then asks the AI helper instead
export const FAQ_FALLBACK = `Thanks for asking! For order-specific requests or anything else, tap 'Talk to our Support Team' below to speak directly with the ${SUPPORT_TEAM}.`
const BOWL_FRUIT_NAMES = DEFAULT_MENU_ITEMS.filter((item) => item.category === "Fruits").map((item) => item.name.toLowerCase())
const BOWL_FRUIT_COUNT = BOWL_FRUIT_NAMES.length
const BOWL_FRUITS = `${BOWL_FRUIT_NAMES.slice(0, -1).join(", ")} and ${BOWL_FRUIT_NAMES.at(-1)}`

/**
 * Instant answers in the support chat. Checked in order: the first matching topic wins,
 * so specific topics (refunds, PINs, prices) come before broad ones (delivery, pickles).
 * picklesSoon: the admin has pickles on Preorder ("Arriving soon"); students can still order them.
 */
export function getFaqResponse(query: string, picklesSoon = false): string {
  const q = (query || "").toLowerCase().trim()
  // Whole words only, so "pineapple" isn't "pin", "nutritious" isn't "utr" and "frustrating" isn't "rating"
  const word = (w: string) => new RegExp(`\\b${w}\\b`).test(q)
  const aboutPaying = /\b(pay|paid|paying|payment|upi|phonepe|gpay|paytm|money|cash|cod)\b/.test(q)
  if (q.includes("refund") || (aboutPaying && /\b(fail|failed|deducted|debited|stuck|problem|issue|wrong|not received)\b/.test(q))) {
    return `Sorry about that! Please tap 'Talk to our Support Team' below (with your UTR number if you paid by UPI) so the ${SUPPORT_TEAM} can sort it out right away.`
  }
  if (q.includes("cancel") || q.includes("change")) {
    return `Orders can be modified before prep starts. Please tap 'Talk to our Support Team' below so the ${SUPPORT_TEAM} can update your order right away!`
  }
  if (/\b(late|delay|delayed|not (come|came|arrived|received)|hasn'?t (come|arrived)|still waiting)\b/.test(q)) {
    return `Sorry for the wait! You can see live progress in 'Track Orders', or tap 'Talk to our Support Team' below and the ${SUPPORT_TEAM} will check right away.`
  }
  if (word("pin") || q.includes("pickup code") || q.includes("verification code")) {
    return "Your unique 4-digit Pickup PIN is on your Order Confirmation screen and in 'Track Orders'. Show it when you collect your order!"
  }
  if (word("utr") || q.includes("verify") || q.includes("verification") || q.includes("fraud")) {
    return "After paying via PhonePe QR, submit your 12-digit UTR number. The kitchen staff verifies it on their merchant soundbox and marks it 'Verified'!"
  }
  if (aboutPaying) {
    return "You can pay online with PhonePe/UPI (scan the QR, then enter the 12-digit UTR), or pay in person: at pickup, or to the runner on room delivery."
  }
  if (q.includes("reorder") || word("again") || q.includes("repeat") || q.includes("previous")) {
    return "In 'Track Orders', click the 'Reorder This Meal' button on any past order to refill your cart instantly!"
  }
  // Sweets & Snacks isn't on sale yet, so this comes before the price answer
  if (/\b(sweets?|snacks?|mithai|pootharekulu|poothareku|putharekulu|pootarekulu)\b/.test(q)) {
    return `Sweets & Snacks are coming soon, starting with Pootharekulu: ${POOTHAREKULU_PACK} for ₹${POOTHAREKULU_PRICE}. You'll be able to order it once it's on the menu!`
  }
  const ratingTalk = /\b(rating|ratings|review|reviews|feedback|stars?)\b/.test(q) || /\brate (my|the|this|our|your)\b/.test(q)
  if (q.includes("price") || q.includes("cost") || q.includes("how much") || /\b(kitna|kitne|kitni|rates?)\b/.test(q)) {
    if (!ratingTalk) {
      const chicken = pickleProducts.find((p) => p.diet === "non_veg")
      const veg = pickleProducts.find((p) => p.diet === "veg")
      const pickles = `Pickles come in ${packOptions[0].label} packs: ₹${veg?.price} each${chicken ? ` (${chicken.name} ₹${chicken.price})` : ""}${picklesSoon ? `, on preorder for ${PICKLES_ARRIVAL}` : ""}.`
      return `${pickles} Fruit bowls are a fixed ₹${FRUIT_BOWL_PRICE}. Room delivery is ₹${DELIVERY_FEE}; Asima pickup is free.`
    }
  }
  if (ratingTalk) {
    return "After your order is marked Delivered, you can leave a 1 to 5 star rating and feedback note directly in 'Track Orders'!"
  }
  if (picklesSoon && /\b(pickles?|achaa?r|mango|gongura|tomato|chicken)\b/.test(q)) {
    return `Our homemade pickles arrive on ${PICKLES_ARRIVAL}, so preorder them now on the Pickles page and we'll deliver them then!`
  }
  if (q.includes("sold out") || q.includes("stock") || q.includes("unavailable") || q.includes("out of stock")) {
    return "Items that run out in the kitchen are marked 'Sold Out' in real-time. Fresh batches are prepared before every delivery slot!"
  }
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
  if (
    q.includes("delivery") ||
    q.includes("timing") ||
    q.includes("time") ||
    q.includes("when") ||
    q.includes("slot")
  ) {
    return `Times depend on your hostel: ${SERVICE_HOURS} (that's for fruit bowls; Asima pickle orders don't have a set time yet). Room delivery is ₹${DELIVERY_FEE}, and Asima pickup is free!`
  }
  if (
    q.includes("pickup point") ||
    q.includes("pickup location") ||
    q.includes("where to collect") ||
    q.includes("where to pick") ||
    q.includes("where is pickup") ||
    q.includes("pickup station") ||
    q.includes("kalam") ||
    q.includes("apj block") ||
    q.includes("asima") ||
    (q.includes("pickup") && !q.includes("pin"))
  ) {
    return `At Asima, fruit bowls are picked up near the Asima mess (free). Pickle-only orders are picked up from ${ASIMA_PICKUP} (free) or come to your room (₹${DELIVERY_FEE}). Kalam orders come straight to your room (₹${DELIVERY_FEE}). Choose at checkout!`
  }
  if (
    q.includes("fruit") ||
    q.includes("bowl") ||
    q.includes("portion")
  ) {
    return `Fruit bowls are a fixed ₹${FRUIT_BOWL_PRICE} with ${BOWL_FRUIT_COUNT} fresh-cut fruits: ${BOWL_FRUITS}. Leave out up to ${MAX_LEFT_OUT} fruits you don't want and we'll add more of the others.`
  }
  if (
    q.includes("pickle") ||
    q.includes("achar") ||
    q.includes("mango") ||
    q.includes("gongura") ||
    q.includes("tomato") ||
    q.includes("chicken") ||
    q.includes("shelf") ||
    q.includes("expiry")
  ) {
    if (/\b(shelf|expiry|expire|expires|last|lasts|how long|fridge|store|keep)\b/.test(q)) {
      return "Our South Indian homemade veg pickles last 3–6 months; finish the chicken pickle within 3 months. Keep them cool and dry, refrigerate after opening and always use a dry spoon. Made small-batch with cold-pressed oils."
    }
    const veg = pickleProducts.filter((p) => p.diet === "veg")
    const chicken = pickleProducts.find((p) => p.diet === "non_veg")
    return `Our pickles (${packOptions[0].label} packs): ${veg.map((p) => p.name).join(", ")} at ₹${veg[0]?.price} each${chicken ? `, and ${chicken.name} at ₹${chicken.price}` : ""}.`
  }
  return FAQ_FALLBACK
}

/**
 * Merges real-time support messages with local state:
 * - Replaces optimistic messages (starting with msg-, local-, admin-) when canonical server message arrives
 * - Deduplicates by ID or fuzzy sender+phone+content within a 90-second window
 * - Ensures strictly chronological ascending ordering by created_at
 */
// Ids the apps give a message before the database assigns its own
const isLocalMsgId = (id: string) => /^(msg|local|admin|ack)-/.test(id)

function isValidSupportMsg(m: unknown): m is SupportMsg {
  const v = m as Partial<Record<keyof SupportMsg, unknown>> | null
  return Boolean(
    v &&
      typeof v.id === "string" &&
      v.id !== "" &&
      typeof v.phone === "string" &&
      typeof v.message === "string" &&
      v.message !== "" &&
      typeof v.sender === "string" &&
      typeof v.created_at === "string" &&
      (v.customer_name == null || typeof v.customer_name === "string"),
  )
}

export function mergeSupportMessages(
  existing: SupportMsg[],
  incomingList: SupportMsg[]
): SupportMsg[] {
  let result = [...existing]

  for (const incoming of incomingList) {
    // Saved chats and live broadcasts can hold anything; a malformed one must not crash the chat
    if (!isValidSupportMsg(incoming)) continue

    // 1. Direct ID match
    const exactIndex = result.findIndex((m) => m.id === incoming.id)
    if (exactIndex !== -1) {
      result[exactIndex] = { ...result[exactIndex], ...incoming }
      continue
    }

    // 2. Fuzzy match for optimistic local messages vs canonical server messages
    const fuzzyIndex = result.findIndex((m) => {
      if (!isLocalMsgId(m.id) && !isLocalMsgId(incoming.id)) return false // two saved "ok"s are two messages
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
      if (!isLocalMsgId(d.id) && !isLocalMsgId(msg.id)) return false
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

