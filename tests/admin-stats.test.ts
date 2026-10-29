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

test("Admin money handles no-shows, refunds and counter sales added by hand", () => {
  const orders = [
    order({ id: "no-show-counter", status: "no_show", total: 50 }), // never paid, never collected
    order({ id: "no-show-upi", upi: true, pay: "verified", status: "no_show", total: 80 }), // paid: kept unless refunded
    order({ id: "cancelled-upi", upi: true, pay: "verified", status: "cancelled", total: 60 }), // money to give back
    order({ id: "refunded", upi: true, pay: "refunded", status: "cancelled", total: 90 }), // already given back
  ]
  const sale = (amount: number, at: string): any => ({ id: `sale-${amount}`, amount, note: null, created_at: at })
  const sales = [sale(40, today(18)), sale(25, today(19)), sale(100, yesterday)]
  const s = computeStats(orders, [], [], now, sales)

  assert.equal(s.todayUpiRevenue, 80)
  assert.equal(s.todayCashRevenue, 65) // the two counter sales typed in today
  assert.equal(s.todayUpiRevenue + s.todayCashRevenue, s.revenue)
  assert.equal(s.revenue, 145)
  assert.equal(s.allTimeRevenue, 245) // plus yesterday's ₹100 sale
  assert.equal(s.toCollectToday, 0) // no-shows and cancelled orders aren't money still to come
  assert.equal(s.refundsDue, 60)
  assert.equal(s.refundsDueCount, 1)
  assert.equal(s.todayCounterSales, 2)
  assert.equal(s.active, 0)
})

test("Spent adds up expenses for today and all time, kept apart from money collected", () => {
  const expense = (amount: number, at: string): any => ({ id: `expense-${amount}`, amount, note: null, created_at: at })
  const orders = [order({ id: "counter-done", status: "delivered", total: 70 })]
  const s = computeStats(orders, [], [], now, [], [expense(300, today(9)), expense(45.5, today(12)), expense(200, yesterday)])

  assert.equal(s.spentToday, 345.5)
  assert.equal(s.spentAllTime, 545.5) // plus yesterday's ₹200
  assert.equal(s.todayExpenseCount, 2)
  assert.equal(s.allTimeExpenseCount, 3)
  assert.equal(s.revenue, 70) // spending doesn't change what was collected
  assert.equal(computeStats(orders, [], [], now).spentToday, 0) // no expenses passed in
})
