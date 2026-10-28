import test from "node:test"
import assert from "node:assert/strict"
import { computeStats } from "../admin-app/src/lib/stats.ts"

// Local times, so "today" is the kitchen's day wherever the test runs
const now = new Date("2026-10-28T20:00:00")
const today = (hour: number) => new Date(`2026-10-28T${String(hour).padStart(2, "0")}:00:00`).toISOString()
const yesterday = new Date("2026-10-27T20:30:00").toISOString()

type Spec = { id: string; upi?: boolean; pay?: string; status: string; total: number; fee?: number; delivery?: boolean; at?: string; rating?: number }
const order = (o: Spec): any => ({
  id: o.id,
  order_number: 1,
  customer_name: "Test",
  customer_phone: "9000000001",
  hostel: "Kalam",
  room: "101",
  fulfilment: o.delivery ? "delivery" : "pickup",
  slot: "8:00–8:30 PM",
  items: [],
  subtotal: o.total - (o.fee ?? 0),
  delivery_fee: o.fee ?? 0,
  total: o.total,
  payment_method: o.upi ? "PhonePe UPI" : "Pay at Counter",
  status: o.status,
  payment_status: o.pay ?? "pending",
  created_at: o.at ?? today(19),
  rating: o.rating,
})

test("Admin revenue counts only money actually collected, and the parts add up", () => {
  const orders = [
    order({ id: "verified-upi", upi: true, pay: "verified", status: "delivered", total: 105, fee: 5, delivery: true }),
    order({ id: "unpaid-claim", upi: true, status: "placed", total: 60 }), // tapped "I've Paid", not verified yet
    order({ id: "flagged", upi: true, pay: "rejected", status: "placed", total: 40 }), // staff flagged it unpaid
    order({ id: "counter-done", status: "delivered", total: 70 }), // paid at the counter on handover
    order({ id: "counter-waiting", status: "ready", total: 45 }), // not handed over yet
    order({ id: "cancelled", status: "cancelled", total: 200 }),
    order({ id: "yesterday", upi: true, pay: "verified", status: "delivered", total: 30, at: yesterday }),
  ]
  const s = computeStats(orders, [], [], now)

  assert.equal(s.todayUpiRevenue, 105)
  assert.equal(s.todayCashRevenue, 70)
  assert.equal(s.revenue, 175)
  assert.equal(s.todayUpiRevenue + s.todayCashRevenue, s.revenue) // UPI + counter = total collected
  assert.equal(s.todayDeliveryFees, 5) // part of the total, not extra
  assert.equal(s.toCollectToday, 105) // 60 unverified UPI + 45 not handed over; flagged and cancelled excluded
  assert.equal(s.allTimeRevenue, 205) // today's 175 + yesterday's 30
  assert.equal(s.allTimeTotalOrders, 3)
  assert.equal(s.pendingUtrs, 1) // only the unverified claim; the flagged one is decided
  assert.equal(s.avgRating, "—") // no fake 5.0 when nobody has rated
})

test("Admin rating averages real reviews only", () => {
  const orders = [
    order({ id: "r1", status: "delivered", total: 40, rating: 4 }),
    order({ id: "r2", status: "delivered", total: 40, rating: 5 }),
  ]
  const s = computeStats(orders, [], [], now)
  assert.equal(s.avgRating, "4.5")
  assert.equal(s.ratedCount, 2)
})

test("Admin support badge counts only chats still waiting for a reply", () => {
  const msg = (id: string, phone: string, sender: string, minute: number): any => ({
    id,
    phone,
    sender,
    customer_name: "Test",
    message: "hi",
    created_at: new Date(`2026-10-28T19:${String(minute).padStart(2, "0")}:00`).toISOString(),
  })
  const messages = [
    msg("1", "9876543210", "customer", 1),
    msg("2", "+91 98765 43210", "support", 2), // answered; same student, phone typed differently
    msg("3", "9123456780", "customer", 3),
    msg("ack-4", "9123456780", "support", 4), // the student screen's own auto-note isn't a reply
  ]
  assert.equal(computeStats([], messages, [], now).pendingCallbacks, 1)
})
