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
  kind: "pickle" | "fruit" | "sweet"
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
// Students may leave out at most this many fruits (sold-out fruits don't count towards it)
export const MAX_LEFT_OUT = 2

/** A tap leaves a fruit out, or adds it back; a third fruit can't be left out. */
export function toggleLeftOut(current: string[], name: string): string[] {
  if (current.includes(name)) return current.filter((n) => n !== name)
  return current.length >= MAX_LEFT_OUT ? current : [...current, name]
}

// Sweets & Snacks: Pootharekulu, on preorder until it arrives on SWEETS_ARRIVAL, in packs of 1, 2 or 5 (bigger packs cost less a piece)
export const POOTHAREKULU_NAME = "Premium Atreyapuram Pootharekhulu"
export const POOTHAREKULU_PACKS = [
  { label: "1 pc", pieces: 1, price: 35 },
  { label: "2 pcs", pieces: 2, price: 60 },
  { label: "5 pcs", pieces: 5, price: 150 },
]
export type PootharekuluPack = (typeof POOTHAREKULU_PACKS)[number]
export const SWEETS_ARRIVAL = "3–4 Nov"
/** Pootharekulu is one pack per order, so an order has exactly 1, 2 or 5 pieces. */
export const pootharekuluCartItem = (pack: PootharekuluPack): CartItem => ({
  id: `sweet-pootharekulu-${pack.pieces}`,
  name: POOTHAREKULU_NAME,
  detail: pack.label,
  price: pack.price,
  quantity: 1,
  kind: "sweet",
})
/** The most of one cart line someone can order, so no one places a fake huge order: one Pootharekulu pack, 10 of anything else. */
export const maxQuantity = (item: Pick<CartItem, "kind">) => (item?.kind === "sweet" ? 1 : 10)
/** Puts a Pootharekulu pack in the cart in place of any other one (one pack per order). */
export const withPootharekuluPack = (cart: CartItem[], pack: CartItem) => [...cart.filter((line) => line.kind !== "sweet"), pack]

// Orders placed before Pootharekulu had a price have ₹0 lines: they show "Price soon" (paid in person on arrival)
export const PRICE_SOON = "Price soon"
export const hasUnpricedItem = (items: Array<{ price?: unknown }> | null | undefined) =>
  Array.isArray(items) && items.some((item) => !Number(item?.price))
export const linePrice = (item: { price?: unknown; quantity?: unknown }) =>
  Number(item.price) ? `₹${Number(item.price) * Number(item.quantity)}` : PRICE_SOON

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
// When preordered pickles arrive; shown while the admin's Preorder switch is on (keep api/chat.js in step)
export const PICKLES_ARRIVAL_SHORT = "5–6 Nov"
export const PICKLES_ARRIVAL = `${PICKLES_ARRIVAL_SHORT} (approx)`
export const hasPreorderLine = (items: Array<{ detail?: string }> | null | undefined) =>
  Array.isArray(items) && items.some((item) => String(item?.detail ?? "").includes(PREORDER_TAG))
/** What a placed order's preorder lines are waiting for (an order never mixes preordered pickles and Pootharekulu). */
export const preorderWait = (items: Array<{ detail?: string; kind?: string }> | null | undefined) =>
  !hasPreorderLine(items)
    ? null
    : (items ?? []).some((item) => item?.kind === "sweet")
      ? { what: POOTHAREKULU_NAME, when: SWEETS_ARRIVAL }
      : { what: "pickles", when: PICKLES_ARRIVAL }
// Fruit bowls (and in-stock pickles) go out within a day, preordered pickles on PICKLES_ARRIVAL and Pootharekulu on
// SWEETS_ARRIVAL. An order has one status, so items that arrive on different days are ordered apart.
export const mixesPreorder = (items: Array<{ kind?: string }>, picklesPreorder: boolean) =>
  new Set(items.map((item) => (item.kind === "sweet" ? "sweet" : item.kind === "pickle" && picklesPreorder ? "pickle" : "now"))).size > 1

export function repriceForReorder(items: CartItem[]): CartItem[] {
  const lines = items.flatMap((item) => {
    const quantity = Math.min(Math.max(1, Math.floor(Number(item?.quantity)) || 1), maxQuantity(item))
    if (item?.kind === "fruit") {
      return item.name === FRUIT_BOWL_NAME ? [{ ...item, price: FRUIT_BOWL_PRICE, quantity }] : []
    }
    // Pootharekulu is the only sweet: a past line (even one under its old name or from before it had a price)
    // comes back as today's pack of the same size, at today's price
    if (item?.kind === "sweet") {
      const pack = POOTHAREKULU_PACKS.find((p) => p.label === String(item.detail ?? "").replace(PREORDER_TAG, ""))
      return pack ? [{ ...pootharekuluCartItem(pack), quantity }] : []
    }
    const product = pickleProducts.find((p) => p.name === item?.name)
    // A past preorder line reorders as a plain pack; whether it's a preorder is decided again at checkout
    const pack = packOptions.find((p) => p.label === String(item?.detail ?? "").replace(PREORDER_TAG, ""))
    return product && pack ? [{ ...pickleCartItem(product, pack), quantity }] : []
  })
  // One Pootharekulu pack per order: keep the first
  const firstSweet = lines.findIndex((line) => line.kind === "sweet")
  return lines.filter((line, i) => line.kind !== "sweet" || i === firstSweet)
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
