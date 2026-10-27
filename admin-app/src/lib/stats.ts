import type { MenuItemStock, OrderRecord, SupportMessage } from "../types"

/** Dashboard numbers. Revenue counts only money actually collected; see isCollected. */
export function computeStats(
  orders: OrderRecord[],
  supportMessages: SupportMessage[],
  inventory: MenuItemStock[],
  now: Date = new Date(),
) {
  // "Today" starts at local midnight (the kitchen's day), not when the UTC date changes.
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  const todayOrders = orders.filter((o) => new Date(o.created_at).getTime() >= startOfToday)
  const nonCancelledToday = todayOrders.filter((o) => o.status !== "cancelled")
  const nonCancelledAllTime = orders.filter((o) => o.status !== "cancelled")

  const isUpi = (o: OrderRecord) => Boolean(o.payment_method?.includes("PhonePe") || o.payment_method?.toLowerCase().includes("upi"))
  const isVerified = (o: OrderRecord) => o.payment_status === "verified" || Boolean(o.payment_method?.includes("[VERIFIED]"))
  const isFlagged = (o: OrderRecord) => o.payment_status === "rejected" || Boolean(o.payment_method?.includes("[FAILED]"))
  // Money counts only once it is actually in: UPI after staff verify it, counter payments once the order is handed over.
  const isCollected = (o: OrderRecord) => (isUpi(o) ? isVerified(o) : o.status === "delivered")
  const sumTotal = (list: OrderRecord[]) => list.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
  const sumFees = (list: OrderRecord[]) => list.reduce((sum, o) => sum + (Number(o.delivery_fee) || 0), 0)
  // Expected but not in yet (orders flagged unpaid are left out)
  const toCollect = (list: OrderRecord[]) => sumTotal(list.filter((o) => !isCollected(o) && !isFlagged(o)))

  const collectedToday = nonCancelledToday.filter(isCollected)
  const collectedAllTime = nonCancelledAllTime.filter(isCollected)
  const todayUpiOrders = collectedToday.filter(isUpi)
  const todayCashOrders = collectedToday.filter((o) => !isUpi(o))
  const allTimeUpiOrders = collectedAllTime.filter(isUpi)
  const allTimeCashOrders = collectedAllTime.filter((o) => !isUpi(o))

  const active = orders.filter((o) => ["placed", "preparing", "ready"].includes(o.status)).length
  const deliveries = nonCancelledToday.filter((o) => o.fulfilment === "delivery").length
  const pickups = nonCancelledToday.filter((o) => o.fulfilment === "pickup").length
  const pendingCallbacks = new Set(
    supportMessages.filter((m) => m.sender === "customer").map((m) => m.phone)
  ).size

  const pendingUtrs = nonCancelledAllTime.filter((o) => isUpi(o) && !isVerified(o) && !isFlagged(o)).length

  // Ratings ("—" until there is a real review)
  const ratedOrders = orders.filter((o) => typeof o.rating === "number" && o.rating > 0)
  const avgRating =
    ratedOrders.length > 0
      ? (ratedOrders.reduce((acc, o) => acc + (o.rating || 0), 0) / ratedOrders.length).toFixed(1)
      : "—"

  const soldOutCount = inventory.filter((i) => !i.is_available).length

  return {
    revenue: sumTotal(collectedToday),
    allTimeRevenue: sumTotal(collectedAllTime),
    toCollectToday: toCollect(nonCancelledToday),
    toCollectAllTime: toCollect(nonCancelledAllTime),
    active,
    deliveries,
    pickups,
    pendingCallbacks,
    todayUpiRevenue: sumTotal(todayUpiOrders),
    todayUpiCount: todayUpiOrders.length,
    todayCashRevenue: sumTotal(todayCashOrders),
    todayCashCount: todayCashOrders.length,
    todayDeliveryFees: sumFees(collectedToday),
    todayPaidDeliveries: collectedToday.filter((o) => o.fulfilment === "delivery").length,
    allTimeUpiRevenue: sumTotal(allTimeUpiOrders),
    allTimeUpiCount: allTimeUpiOrders.length,
    allTimeCashRevenue: sumTotal(allTimeCashOrders),
    allTimeCashCount: allTimeCashOrders.length,
    allTimeDeliveryFees: sumFees(collectedAllTime),
    allTimePaidDeliveries: collectedAllTime.filter((o) => o.fulfilment === "delivery").length,
    allTimeTotalOrders: collectedAllTime.length,
    pendingUtrs,
    ratedCount: ratedOrders.length,
    avgRating,
    soldOutCount,
  }
}
