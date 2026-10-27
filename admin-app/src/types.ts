export type CartItem = {
  id: string
  name: string
  detail: string
  price: number
  quantity: number
  kind: "pickle" | "fruit"
}

export type OrderStatus =
  | "placed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled"

// Must match the orders.payment_status CHECK constraint in supabase_schema.sql
export type PaymentStatus = "pending" | "verified" | "rejected"

export type OrderRecord = {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  hostel: string
  room: string
  fulfilment: "pickup" | "delivery"
  slot: string
  items: CartItem[]
  subtotal: number
  delivery_fee: number
  total: number
  payment_method: string
  status: OrderStatus
  created_at: string
  pickup_code?: string
  payment_status?: PaymentStatus
  rating?: number
  rating_feedback?: string
}

export type SupportMessage = {
  id: string
  phone: string
  customer_name: string
  sender: "customer" | "support" | "bot"
  message: string
  created_at: string
}

export type MenuItemStock = {
  id: string
  name: string
  category: "Pickles" | "Fruits" | "Bowls"
  is_available: boolean
}

export type DashboardTab = "orders" | "inventory" | "support" | "analytics"

// Shape returned by the visit_stats() SQL function (see supabase_schema.sql).
export type VisitStats = {
  today_visits: number
  today_visitors: number
  week_visits: number
  week_visitors: number
  total_visits: number
  total_visitors: number
}
