export type MenuItemStock = {
  id: string
  name: string
  category: "Pickles" | "Fruits" | "Bowls"
  is_available: boolean
}

export const DEFAULT_MENU_ITEMS: MenuItemStock[] = [
  { id: "mango", name: "Andhra Mango Pickle", category: "Pickles", is_available: true },
  { id: "gongura", name: "Gongura Pickle", category: "Pickles", is_available: true },
  { id: "lemon", name: "Lemon Pickle", category: "Pickles", is_available: true },
  { id: "garlic", name: "Garlic Pickle", category: "Pickles", is_available: true },
  { id: "fruit-bowl", name: "Custom Fresh Fruit Bowl", category: "Bowls", is_available: true },
  { id: "fruit-apple", name: "Fresh Apple", category: "Fruits", is_available: true },
  { id: "fruit-banana", name: "Robusta Banana", category: "Fruits", is_available: true },
  { id: "fruit-papaya", name: "Sweet Papaya", category: "Fruits", is_available: true },
  { id: "fruit-watermelon", name: "Crisp Watermelon", category: "Fruits", is_available: true },
  { id: "fruit-pomegranate", name: "Pomegranate Pearls", category: "Fruits", is_available: true },
  { id: "fruit-orange", name: "Nagpur Orange", category: "Fruits", is_available: true },
  { id: "fruit-guava", name: "Pink Guava", category: "Fruits", is_available: true },
  { id: "fruit-grapes", name: "Black Grapes", category: "Fruits", is_available: true },
  { id: "fruit-pineapple", name: "Queen Pineapple", category: "Fruits", is_available: true },
  { id: "fruit-seasonal", name: "Seasonal Special", category: "Fruits", is_available: true },
]

export function getPickupPin(order: { pickup_code?: string; order_number?: number | string }): string {
  if (order.pickup_code && String(order.pickup_code).length >= 4) {
    return String(order.pickup_code)
  }
  const parsed = Number(order.order_number)
  const rawNum = isNaN(parsed) ? 1048 : Math.floor(Math.abs(parsed))
  return String(1000 + ((rawNum * 73 + 49) % 9000))
}
