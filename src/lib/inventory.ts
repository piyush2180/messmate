export type MenuItemStock = {
  id: string
  name: string
  category: "Pickles" | "Fruits" | "Bowls"
  is_available: boolean
}

export type CartItem = {
  id: string
  name: string
  detail: string
  price: number
  quantity: number
  kind: "pickle" | "fruit"
}

// Photos come from our supplier's (Food On Farm Pickles) Shopify CDN; `width=800` keeps them light on mobile data.
export const pickleProducts = [
  {
    name: "Mango Pickle (Avakaya)",
    desc: "Raw mango, mustard & Guntur chilli",
    about:
      "Classic avakaya: farm-fresh raw mango cured with freshly ground mustard, Guntur red chilli, fenugreek and rock salt in cold-pressed groundnut oil. No preservatives. Best with hot rice and ghee, curd rice or dosa.",
    spice: "Hot",
    price: 40, // ₹ per 50g
    image:
      "https://cdn.shopify.com/s/files/1/0722/3872/7323/files/B9438FC5-BEED-45A8-97BC-9BC079F18A9B.png?v=1791534294&width=800",
    diet: "veg" as const,
  },
  {
    name: "Gongura Pickle",
    desc: "Tangy sorrel leaves & red chilli",
    about:
      "Fresh gongura (sorrel) leaves with Guntur red chilli and mustard seeds in groundnut oil. All the sourness comes from the leaves themselves, with no added souring agents. Stir it into hot rice with ghee, curd rice or dal.",
    spice: "Medium",
    price: 40,
    image:
      "https://cdn.shopify.com/s/files/1/0722/3872/7323/files/Gongura-scaled_9c2853eb-9dcc-4be9-a303-300898ead3ec.webp?v=1758989293&width=800",
    diet: "veg" as const,
  },
  {
    name: "Gongura Pandu Mirchi",
    desc: "Gongura with whole red chillies",
    about:
      "Gongura leaves pounded with whole red chillies for a pickle that is tangy and fiery in equal measure. Made in small batches with cold-pressed groundnut oil and no preservatives. Great with rice and ghee, idli, dosa or chapati.",
    spice: "Hot",
    price: 40,
    image:
      "https://cdn.shopify.com/s/files/1/0722/3872/7323/files/1000038256.jpg?v=1758989295&width=800",
    diet: "veg" as const,
  },
  {
    name: "Tomato Pickle",
    desc: "Chunky, tangy tomato pachadi",
    about:
      "Traditional tomato pachadi made from whole fresh tomatoes slow-cooked with spices, not paste, so it stays chunky. Cold-pressed groundnut oil, no preservatives. Goes with rice, dosa, upma or chapati, or spread on toast.",
    spice: "Medium",
    price: 40,
    image:
      "https://cdn.shopify.com/s/files/1/0722/3872/7323/files/tomato-pachadi-scaled_289413d2-56e1-4f8e-a1bc-245bdb0e4c5c.jpg?v=1758989183&width=800",
    diet: "veg" as const,
  },
  {
    name: "Chicken Pickle with Bone",
    desc: "Bone-in chicken, slow-cooked & spicy",
    about:
      "Bone-in chicken pieces slow-cooked with freshly ground spices and curry leaves in cold-pressed groundnut oil, the traditional village way. The bone keeps the masala rich. No preservatives. Best with hot rice and ghee or roti.",
    spice: "Hot",
    price: 70,
    image:
      "https://cdn.shopify.com/s/files/1/0722/3872/7323/files/Chickenpickle_with_bone.webp?v=1778395771&width=800",
    diet: "non_veg" as const,
  },
]

export type PickleProduct = (typeof pickleProducts)[number]

// Every pickle is sold in a single 50g pack. Pack price = product's 50g price × units.
export const packOptions = [{ label: "50g", units: 1, note: "Just enough to start a new habit." }]

export type PackOption = (typeof packOptions)[number]

export const FRUIT_BOWL_NAME = "Fresh Fruit Bowl"
export const FRUIT_BOWL_PRICE = 49

export function pickleCartItem(product: PickleProduct, pack: PackOption): CartItem {
  return {
    id: `pickle-${product.name}-${pack.label}`,
    name: product.name,
    detail: pack.label,
    price: product.price * pack.units,
    quantity: 1,
    kind: "pickle",
  }
}

/** One fixed-price bowl; each distinct set of left-out fruits is its own cart line. */
export function fruitBowlCartItem(leftOut: string[]): CartItem {
  const skipped = [...leftOut].sort()
  return {
    id: ["fruit-bowl", ...skipped].join("-no-"),
    name: FRUIT_BOWL_NAME,
    detail: skipped.length ? `Without ${skipped.join(", ")}` : "All fruits",
    price: FRUIT_BOWL_PRICE,
    quantity: 1,
    kind: "fruit",
  }
}

/**
 * Rebuilds a past order's items at today's prices so a reorder never reuses old prices.
 * Items no longer on the menu are dropped. Past orders come from the database, so nothing in them is trusted.
 */
/** The fruits a bowl line leaves out, read back from the id fruitBowlCartItem gives it. */
export function bowlLeftOut(id: string): string[] {
  return id.startsWith("fruit-bowl") ? id.split("-no-").slice(1) : []
}

// Pickle lines ordered while pickles are on Preorder carry this after the pack size, so the kitchen sees it
export const PREORDER_TAG = " · Preorder"

export function repriceForReorder(items: CartItem[]): CartItem[] {
  return items.flatMap((item) => {
    const quantity = Math.max(1, Math.floor(Number(item?.quantity)) || 1)
    if (item?.kind === "fruit") {
      return item.name === FRUIT_BOWL_NAME ? [{ ...item, price: FRUIT_BOWL_PRICE, quantity }] : []
    }
    const product = pickleProducts.find((p) => p.name === item?.name)
    // A past preorder line reorders as a plain pack; whether it's a preorder is decided again at checkout
    const pack = packOptions.find((p) => p.label === String(item?.detail ?? "").replace(PREORDER_TAG, ""))
    return product && pack ? [{ ...pickleCartItem(product, pack), quantity }] : []
  })
}

export const DEFAULT_MENU_ITEMS: MenuItemStock[] = [
  { id: "mango", name: "Mango Pickle (Avakaya)", category: "Pickles", is_available: true },
  { id: "gongura", name: "Gongura Pickle", category: "Pickles", is_available: true },
  { id: "gongura-pandu-mirchi", name: "Gongura Pandu Mirchi", category: "Pickles", is_available: true },
  { id: "tomato", name: "Tomato Pickle", category: "Pickles", is_available: true },
  { id: "chicken", name: "Chicken Pickle with Bone", category: "Pickles", is_available: true },
  { id: "fruit-bowl", name: FRUIT_BOWL_NAME, category: "Bowls", is_available: true },
  { id: "fruit-apple", name: "Apple", category: "Fruits", is_available: true },
  { id: "fruit-banana", name: "Banana", category: "Fruits", is_available: true },
  { id: "fruit-papaya", name: "Papaya", category: "Fruits", is_available: true },
  { id: "fruit-pomegranate", name: "Pomegranate", category: "Fruits", is_available: true },
  { id: "fruit-orange", name: "Orange", category: "Fruits", is_available: true },
  { id: "fruit-guava", name: "Guava", category: "Fruits", is_available: true },
]

export function getPickupPin(order: { pickup_code?: string; order_number?: number | string }): string {
  if (order.pickup_code && String(order.pickup_code).length >= 4) {
    return String(order.pickup_code)
  }
  const parsed = Number(order.order_number)
  const rawNum = isNaN(parsed) ? 1048 : Math.floor(Math.abs(parsed))
  return String(1000 + ((rawNum * 73 + 49) % 9000))
}
