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
}

export type SupportMessage = {
  id: string
  phone: string
  customer_name: string
  sender: "customer" | "support" | "bot"
  message: string
  created_at: string
}

export type DashboardTab = "orders" | "support" | "analytics"
