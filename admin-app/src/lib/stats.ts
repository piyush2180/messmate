import type { CounterSale, MenuItemStock, OrderRecord, SupportMessage } from "../types"

/** Dashboard numbers. Revenue counts only money actually collected; see isCollected. */
export function computeStats(
  orders: OrderRecord[],
  supportMessages: SupportMessage[],
  inventory: MenuItemStock[],
  now: Date = new Date(),
  counterSales: CounterSale[] = [],
) {
  // "Today" starts at local midnight (the kitchen's day), not when the UTC date changes.
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  const todayOrders = orders.filter((o) => new Date(o.created_at).getTime() >= startOfToday)
  const nonCancelledToday = todayOrders.filter((o) => o.status !== "cancelled")
  const nonCancelledAllTime = orders.filter((o) => o.status !== "cancelled")

  const isUpi = (o: OrderRecord) => Boolean(o.payment_method?.includes("PhonePe") || o.payment_method?.toLowerCase().includes("upi"))
  const isVerified = (o: OrderRecord) => o.payment_status === "verified" || Boolean(o.payment_method?.includes("[VERIFIED]"))
  const isFlagged = (o: OrderRecord) => o.payment_status === "rejected" || Boolean(o.payment_method?.includes("[FAILED]"))
  const isRefunded = (o: OrderRecord) => o.payment_status === "refunded"
  // Money counts only once it is actually in: UPI after staff verify it, counter payments once the order is handed over.
  // A verified no-show keeps its money unless it gets refunded; a cancelled order never counts.
  const isCollected = (o: OrderRecord) =>
    o.status !== "cancelled" && !isRefunded(o) && (isUpi(o) ? isVerified(o) : o.status === "delivered")
  const sumTotal = (list: OrderRecord[]) => list.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
  const sumFees = (list: OrderRecord[]) => list.reduce((sum, o) => sum + (Number(o.delivery_fee) || 0), 0)
  // Expected but not in yet (orders flagged unpaid, no-shows and refunds are left out)
  const toCollect = (list: OrderRecord[]) =>
    sumTotal(list.filter((o) => o.status !== "no_show" && !isRefunded(o) && !isCollected(o) && !isFlagged(o)))
  // Paid by UPI, then cancelled: that money goes back to the student
  const refundDue = orders.filter((o) => o.status === "cancelled" && isUpi(o) && isVerified(o) && !isRefunded(o))
  // Sales staff typed in at the counter; they count as counter money
  const salesToday = counterSales.filter((s) => new Date(s.created_at).getTime() >= startOfToday)
  const sumSales = (list: CounterSale[]) => list.reduce((sum, s) => sum + (Number(s.amount) || 0), 0)

  const collectedToday = nonCancelledToday.filter(isCollected)
  const collectedAllTime = nonCancelledAllTime.filter(isCollected)
  const todayUpiOrders = collectedToday.filter(isUpi)
  const todayCashOrders = collectedToday.filter((o) => !isUpi(o))
  const allTimeUpiOrders = collectedAllTime.filter(isUpi)
  const allTimeCashOrders = collectedAllTime.filter((o) => !isUpi(o))

  const active = orders.filter((o) => ["placed", "preparing", "ready"].includes(o.status)).length
  // Chats waiting on staff: the latest message in the thread (per 10-digit phone) is the student's
  const latestByPhone = new Map<string, SupportMessage>()
  for (const m of supportMessages) {
    const phone = String(m.phone || "").replace(/\D/g, "").slice(-10)
    // "ack-" is the student screen's automatic note, not a staff reply
    if (!phone || String(m.id).startsWith("ack-")) continue
    const latest = latestByPhone.get(phone)
    if (!latest || new Date(m.created_at).getTime() >= new Date(latest.created_at).getTime()) latestByPhone.set(phone, m)
  }
  const pendingCallbacks = [...latestByPhone.values()].filter((m) => m.sender === "customer").length

  const pendingUtrs = nonCancelledAllTime.filter((o) => isUpi(o) && !isVerified(o) && !isFlagged(o) && !isRefunded(o)).length

  // Ratings ("—" until there is a real review)
  const ratedOrders = orders.filter((o) => typeof o.rating === "number" && o.rating > 0)
  const avgRating =
    ratedOrders.length > 0
      ? (ratedOrders.reduce((acc, o) => acc + (o.rating || 0), 0) / ratedOrders.length).toFixed(1)
      : "—"

  const soldOutCount = inventory.filter((i) => !i.is_available).length

  return {
    revenue: sumTotal(collectedToday) + sumSales(salesToday),
    allTimeRevenue: sumTotal(collectedAllTime) + sumSales(counterSales),
    toCollectToday: toCollect(nonCancelledToday),
    toCollectAllTime: toCollect(nonCancelledAllTime),
    active,
    pendingCallbacks,
    todayUpiRevenue: sumTotal(todayUpiOrders),
    todayUpiCount: todayUpiOrders.length,
    todayCashRevenue: sumTotal(todayCashOrders) + sumSales(salesToday),
    todayCashCount: todayCashOrders.length,
    todayDeliveryFees: sumFees(collectedToday),
    todayPaidDeliveries: collectedToday.filter((o) => o.fulfilment === "delivery").length,
    allTimeUpiRevenue: sumTotal(allTimeUpiOrders),
    allTimeUpiCount: allTimeUpiOrders.length,
    allTimeCashRevenue: sumTotal(allTimeCashOrders) + sumSales(counterSales),
    allTimeCashCount: allTimeCashOrders.length,
    allTimeDeliveryFees: sumFees(collectedAllTime),
    allTimePaidDeliveries: collectedAllTime.filter((o) => o.fulfilment === "delivery").length,
    allTimeTotalOrders: collectedAllTime.length,
    pendingUtrs,
    refundsDue: sumTotal(refundDue),
    refundsDueCount: refundDue.length,
    todayCounterSales: salesToday.length,
    allTimeCounterSales: counterSales.length,
    ratedCount: ratedOrders.length,
    avgRating,
    soldOutCount,
  }
}
