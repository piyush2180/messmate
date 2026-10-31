import { useMemo, useState, useEffect, useRef, type ReactNode } from "react"

import { supabase } from "./lib/supabase"
import {
  DEFAULT_MENU_ITEMS,
  FRUIT_BOWL_NAME,
  FRUIT_BOWL_PRICE,
  MAX_LEFT_OUT,
  POOTHAREKULU_PACK,
  POOTHAREKULU_PRICE,
  PICKLES_ARRIVAL,
  PICKLES_ARRIVAL_SHORT,
  PREORDER_TAG,
  bowlLeftOut,
  fruitBowlCartItem,
  getPickupPin,
  hasPreorderLine,
  mixesPreorder,
  packOptions,
  pickleCartItem,
  pickleProducts,
  repriceForReorder,
  toggleLeftOut,
  type CartItem,
} from "./lib/inventory"
import phonepeQrUrl from "./assets/phonepe-qr.png"
import logoUrl from "./assets/happy-tummy-logo.webp"
// Pootharekulu photo the owner supplied
import pootharekuluImage from "./assets/pootharekulu.webp"
import {
  ALL_SLOTS,
  ASIMA_PICKUP,
  ASIMA_ROOM,
  ASIMA_WEEKEND,
  DELIVERY_FEE,
  fulfilmentFor,
  hostelsOpen,
  isHostelOpen,
  type HostelOpen,
  HOSTEL_HOURS,
  HOSTEL_SLOTS,
  KALAM_ROOM,
  normalizeRoom,
  splitRoom,
  SERVICE_HOURS,
  slotsForHostel,
  calculateOrderTotals,
  cleanPhoneInput,
  FAQ_FALLBACK,
  getFaqResponse,
  getSmallTalkReply,
  isValidIndianPhone,
  mergeSupportMessages,
  type SupportMsg,
  normalizePhone,
  safeStorage,
  sanitizeInput,
  generateOrderFingerprint,
} from "./lib/order-logic"

// A real plate of cut fruit; free to use under the Unsplash License.
const fruitImage = "https://images.unsplash.com/photo-1641642400143-6be68f1a0918?auto=format&fit=crop&w=800&h=800&q=80"

type Screen =
  | "home"
  | "pickles"
  | "pickle-detail"
  | "fruit-builder"
  | "cart"
  | "checkout"
  | "fulfilment"
  | "payment"
  | "confirmation"
  | "orders"
  | "sweets"

type CustomerDetails = {
  name: string
  phone: string
  hostel: string
  room: string
}

type OrderRecord = {
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
  status: "placed" | "preparing" | "ready" | "delivered" | "cancelled" | "no_show"
  created_at: string
  pickup_code?: string
  payment_status?: "pending" | "verified" | "rejected" | "refunded"
  rating?: number
  rating_feedback?: string
}

type IconName =
  | "arrow-left"
  | "arrow-right"
  | "bag"
  | "check"
  | "chili-mild"
  | "chili-medium"
  | "chili-hot"
  | "clock"
  | "close"
  | "drumstick"
  | "edit"
  | "heart"
  | "leaf"
  | "location"
  | "minus"
  | "plus"
  | "shield"
  | "sparkle"
  | "receipt"
  | "refresh"
  | "chat"
  | "send"
  | "user"
  | "star"
  | "phone"
  | "key"
  | "bell"
  | "zap"
  | "whatsapp"

// Our supplier's (Food On Farm Pickles) mango pickle photo.
const pickleImage =
  "https://cdn.shopify.com/s/files/1/0722/3872/7323/files/mango-pickle-scaled_f383ec5b-be63-4988-81c1-f2f381d76f8e.webp?width=1000"

const BRAND = "Happy Tummy Co."

// Call/WhatsApp number; shown only on the order confirmation and in the support chat header.
const CONTACT_PHONE = "+91 83091 22630"
const contactDigits = CONTACT_PHONE.replace(/\D/g, "")
// The Asima team handles Asima orders; their numbers show on Asima order confirmations
const ASIMA_CONTACTS = ["+91 82527 48806", "+91 99081 81705"]

// Our only hostels. Kalam gets room delivery. In Asima, fruit bowl orders are collected near the mess, and
// pickle-only orders from Room 104 or 210 unless they choose room delivery (see fulfilmentFor)
const MESS_PICKUP = "Near Asima Mess"
const ROOMS_PICKUP = `Asima, ${ASIMA_PICKUP}`
const pickupPointFor = (items: Array<{ kind?: string }> | null | undefined) =>
  Array.isArray(items) && items.some((item) => item.kind === "fruit") ? MESS_PICKUP : ROOMS_PICKUP
// Each hostel remembers its own room, so a saved Kalam room never fills in the Asima box
const roomKey = (hostel: string) => (hostel === "Asima" ? "messmate_room_asima" : "messmate_room")
const savedRoom = (hostel: string) => normalizeRoom(safeStorage.getItem(roomKey(hostel), "") || "")
// The times on offer: Kalam's evening slots, or Asima's morning window for fruit bowls; Asima pickle orders have no set time yet
const slotsFor = (hostel: string, items: CartItem[]) =>
  hostel !== "Asima" ? slotsForHostel(hostel) : items.some((item) => item.kind === "fruit") ? slotsForHostel("Asima") : []

// Support messages are stored under this name. Older names stay recognised so past chats still read as support.
const SUPPORT_NAME = `${BRAND} Support Team`
const SUPPORT_NAMES = [SUPPORT_NAME, "MessMate Support Team", "MessMate Support", "Campus Support Team"]
// What students see while the admin has the store switched to Closed
const CLOSED_MESSAGE = "Unavailable at the moment"

// Admin stock names for each fruit (older menus used longer names)
const fruitSoldOut = (name: string, soldOut: Set<string>) =>
  soldOut.has(name) ||
  soldOut.has(`Fresh ${name}`) ||
  soldOut.has(`Sweet ${name}`) ||
  soldOut.has(`Robusta ${name}`) ||
  (name === "Pomegranate" && soldOut.has("Pomegranate Pearls")) ||
  (name === "Orange" && soldOut.has("Nagpur Orange")) ||
  (name === "Guava" && soldOut.has("Pink Guava"))

// Menu names of the rows marked sold out (matched by id, so a renamed item keeps its flag)
const soldOutNames = (rows: Array<{ id: string; name: string; is_available: boolean }>) =>
  new Set(rows.filter((r) => !r.is_available).map((r) => DEFAULT_MENU_ITEMS.find((i) => i.id === r.id)?.name ?? r.name))

// Supplier (Shopify) photo at a given width
const sized = (url: string, width: number) => url.replace(/width=\d+/, `width=${width}`)

// A pickle line's text while pickles are on Preorder (the placed order gets PREORDER_TAG instead)
const preorderDetail = (item: CartItem, preorder: boolean) =>
  preorder && item.kind === "pickle" ? (
    <>
      {item.detail} · Preorder, delivered on <strong>{PICKLES_ARRIVAL}</strong>
    </>
  ) : (
    item.detail
  )

// Why a cart line can't be ordered right now, or null when it can
function soldOutNote(item: CartItem, soldOut: Set<string>): string | null {
  if (soldOut.has(item.name)) return "Sold out. Remove it to continue."
  if (item.kind !== "fruit") return null
  const leftOut = bowlLeftOut(item.id)
  const gone = fruits.map((f) => f.name).filter((name) => !leftOut.includes(name) && fruitSoldOut(name, soldOut))
  return gone.length ? `${gone.join(", ")} just sold out. Remove this bowl and add it again.` : null
}

// Chat history only loads for numbers this phone has used in the support chat, so typing someone
// else's number (at checkout or in the form) never shows their conversation
const CHAT_PHONES_KEY = "ht_chat_phones"
const isMyChatPhone = (p: string) => safeStorage.getJson<string[]>(CHAT_PHONES_KEY, []).includes(p)
const rememberChatPhone = (p: string) =>
  safeStorage.setJson(CHAT_PHONES_KEY, [...safeStorage.getJson<string[]>(CHAT_PHONES_KEY, []).filter((x) => x !== p), p].slice(-5))
// When this phone last had the chat open, to count replies that came in while away
const markChatSeen = (p: string) => safeStorage.setItem(`ht_chat_seen_${p}`, String(Date.now()))

// Messages saved before the rename still mention the old name in their text
const rebrand = (text: string) => text.replace(/MessMate Support Team/g, SUPPORT_NAME).replace(/MessMate/g, BRAND)

const fruits = [
  { name: "Apple", color: "#D9644A", emoji: "A" },

  { name: "Banana", color: "#D9A441", emoji: "B" },

  { name: "Papaya", color: "#F4A261", emoji: "P" },

  { name: "Pomegranate", color: "#B94A42", emoji: "P" },

  { name: "Orange", color: "#E99645", emoji: "O" },

  { name: "Guava", color: "#7A9A55", emoji: "G" },
]

function Icon({
  name,
  size = 20,
  fill = "none",
}: {
  name: IconName
  size?: number
  fill?: string
}) {
  const paths: Record<IconName, ReactNode> = {
    "arrow-left": (
      <>
        <path d="m15 18-6-6 6-6" />
      </>
    ),

    "arrow-right": (
      <>
        <path d="m9 18 6-6-6-6" />
      </>
    ),

    bag: (
      <>
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),

    check: <path d="m5 12 4 4L19 6" />,

    "chili-mild": (
      <g fill="currentColor" stroke="none">
        <path d="M16 10V22C16 22 8 20 8 11V10C8 9.27 8.4 8.63 9 8.28L10.25 9L12 8L13.75 9L15 8.28C15.6 8.63 16 9.27 16 10M12 6.5L13.75 7.5L15.27 6.63C14.72 5.66 13.91 4.94 12.97 4.65C12.79 3.16 11.54 2 10 2V4C10.44 4 10.8 4.29 10.94 4.69C10.03 5 9.26 5.7 8.73 6.63L10.25 7.5L12 6.5Z" />
      </g>
    ),

    "chili-medium": (
      <g fill="currentColor" stroke="none">
        <path d="M8.43 7.32L6.86 6.42C7.38 5.6 8.11 5 8.94 4.7C8.81 4.3 8.45 4 8 4V2C8.77 2 9.47 2.29 10 2.77V4C10.45 4 10.81 4.3 10.94 4.7C9.83 5.08 8.93 6.05 8.43 7.32M8 11C8 10.23 8.23 9.5 8.6 8.91L7.26 8.15C6.5 8.44 6 9.16 6 10V11C6 18.05 10.9 20.8 13.03 21.66C10.41 19.62 8 16.2 8 11M17 8.28L15.75 9L14 8L12.25 9L11 8.28C10.4 8.63 10 9.27 10 10V11C10 20 18 22 18 22V10C18 9.27 17.6 8.63 17 8.28M10.73 6.63L12.25 7.5L14 6.5L15.75 7.5L17.27 6.63C16.72 5.66 15.91 4.94 14.97 4.65C14.79 3.16 13.54 2 12 2V4C12.44 4 12.8 4.29 12.94 4.69C12.03 5 11.26 5.7 10.73 6.63Z" />
      </g>
    ),

    "chili-hot": (
      <g fill="currentColor" stroke="none">
        <path d="M10.43 7.32L8.86 6.42C9.38 5.6 10.11 5 10.94 4.7C10.81 4.3 10.45 4 10 4V2C10.77 2 11.47 2.29 12 2.77V4C12.45 4 12.81 4.3 12.94 4.7C11.83 5.08 10.93 6.05 10.43 7.32M10 11C10 10.23 10.23 9.5 10.6 8.91L9.26 8.15C8.5 8.44 8 9.16 8 10V11C8 18.05 12.9 20.8 15.03 21.66C12.41 19.62 10 16.2 10 11M6.43 7.32L4.86 6.42C5.38 5.6 6.11 5 6.94 4.7C6.81 4.3 6.45 4 6 4V2C6.77 2 7.47 2.29 8 2.77V4C8.45 4 8.81 4 8.94 4.7C7.83 5.08 6.93 6.05 6.43 7.32M6 11C6 10.23 6.23 9.5 6.6 8.91L5.26 8.15C4.5 8.44 4 9.16 4 10V11C4 18.05 8.9 20.8 11.03 21.66C8.41 19.62 6 16.2 6 11M19 8.28L17.75 9L16 8L14.25 9L13 8.28C12.4 8.63 12 9.27 12 10V11C12 20 20 22 20 22V10C20 9.27 19.6 8.63 19 8.28M12.73 6.63L14.25 7.5L16 6.5L17.75 7.5L19.27 6.63C18.72 5.66 17.91 4.94 16.97 4.65C16.79 3.16 15.54 2 14 2V4C14.44 4 14.8 4.29 14.94 4.69C14.03 5 13.26 5.7 12.73 6.63Z" />
      </g>
    ),

    drumstick: (
      <g fill="currentColor" stroke="none">
        <path d="M20.16 12.73C22.93 9.96 22.57 5.26 19.09 3C17.08 1.67 14.39 1.66 12.36 2.97C10.6 4.1 9.63 5.86 9.46 7.68C9.33 9 8.83 10.23 7.91 11.15L7.88 11.18C6.72 12.34 6.72 14.11 7.81 15.19L8.8 16.18C9.89 17.27 11.66 17.27 12.75 16.18C13.72 15.21 15 14.68 16.39 14.53C17.76 14.38 19.1 13.78 20.16 12.73M6.26 19.86C6.53 20.42 6.44 21.1 5.97 21.56C5.39 22.15 4.44 22.15 3.85 21.56C3.58 21.29 3.44 20.94 3.42 20.58C3.06 20.56 2.71 20.42 2.44 20.15C1.85 19.56 1.85 18.61 2.44 18.03C2.9 17.57 3.59 17.47 4.14 17.74L6.62 15.31C6.76 15.5 6.92 15.72 7.1 15.9L8.09 16.89C8.3 17.09 8.5 17.26 8.76 17.41L6.26 19.86Z" />
      </g>
    ),

    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),

    close: (
      <>
        <path d="m7 7 10 10M17 7 7 17" />
      </>
    ),

    edit: (
      <>
        <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" />
        <path d="m13.5 7 3.5 3.5" />
      </>
    ),

    heart: (
      <path d="M20.8 8.3c0 5-8.8 10.2-8.8 10.2S3.2 13.3 3.2 8.3A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8.8 1.3Z" />
    ),

    leaf: (
      <>
        <path d="M20 4C11 4 5 8 5 15c0 2 1 4 3 5 7-1 11-6 12-16Z" />
        <path d="M4 21c3-6 7-9 13-12" />
      </>
    ),

    location: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),

    minus: <path d="M5 12h14" />,

    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),

    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),

    sparkle: (
      <>
        <path d="M12 3c.5 4 2.5 6 6 7-3.5 1-5.5 3-6 7-.5-4-2.5-6-6-7 3.5-1 5.5-3 6-7Z" />
      </>
    ),

    receipt: (
      <>
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
        <path d="M16 8h-8M16 12h-8M11 16h-3" />
      </>
    ),

    refresh: (
      <>
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 21h5v-5" />
      </>
    ),

    chat: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </>
    ),

    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),

    user: (
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),

    star: (
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    ),

    phone: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    ),

    key: (
      <>
        <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
        <path d="m21 2-9.6 9.6" />
        <circle cx="7.5" cy="15.5" r="5.5" />
      </>
    ),

    bell: (
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>
    ),

    zap: (
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    ),

    // WhatsApp glyph (Simple Icons, CC0): a filled shape, unlike the stroked icons above.
    whatsapp: (
      <path
        fill="currentColor"
        stroke="none"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      />
    ),
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button
      className="brand"
      onClick={
        onClick || (() => window.scrollTo({ top: 0, behavior: "smooth" }))
      }
      aria-label={`${BRAND} home`}
    >
      <img className="brand-logo" src={logoUrl} alt={BRAND} />
    </button>
  )
}

function Header({
  title,
  onBack,
  cartCount = 0,
  onCart,
  onOrders,
  hasOrders = false,
  activeScreen,
  go,
}: {
  title?: string
  onBack?: () => void
  cartCount?: number
  onCart?: () => void
  onOrders?: () => void
  hasOrders?: boolean
  activeScreen?: Screen
  go?: (screen: Screen) => void
}) {
  return (
    <header className="header">
      <div className="header-mobile-left">
        {onBack ? (
          <button className="icon-button" onClick={onBack} aria-label="Go back">
            <Icon name="arrow-left" />
          </button>
        ) : (
          <Brand onClick={go ? () => go("home") : undefined} />
        )}
      </div>

      <div className="header-desktop-brand">
        <Brand onClick={go ? () => go("home") : undefined} />
        {onBack && (
          <button className="desktop-back-btn" onClick={onBack}>
            <Icon name="arrow-left" size={15} />
            <span>Back</span>
          </button>
        )}
      </div>

      {title && (
        <div className="header-heading">
          <span>HAPPY TUMMY CO.</span>
          <div className="header-title">{title}</div>
        </div>
      )}

      {go && (
        <nav className="desktop-nav-menu" aria-label="Main Navigation">
          <button
            className={`desktop-nav-link ${activeScreen === "home" ? "active" : ""}`}
            onClick={() => go("home")}
          >
            Home
          </button>
          <button
            className={`desktop-nav-link ${
              activeScreen === "pickles" || activeScreen === "pickle-detail"
                ? "active"
                : ""
            }`}
            onClick={() => go("pickles")}
          >
            Homemade Pickles
          </button>
          <button
            className={`desktop-nav-link ${
              activeScreen === "fruit-builder" ? "active" : ""
            }`}
            onClick={() => go("fruit-builder")}
          >
            Fresh Fruit Bowls
          </button>
          <button
            className={`desktop-nav-link ${
              activeScreen === "orders" ? "active" : ""
            }`}
            onClick={() => go("orders")}
          >
            Track Orders
          </button>
        </nav>
      )}

      <div className="header-actions">
        {onOrders && (
          <>
            <button
              className={`orders-button mobile-only-inline-flex ${
                activeScreen === "orders" ? "active" : ""
              }`}
              onClick={onOrders}
              aria-label="My Orders & Tracking"
              title="My Orders & Tracking"
            >
              <Icon name="receipt" />
              {hasOrders && <span className="orders-dot" />}
            </button>
            <button
              className={`desktop-track-btn desktop-only-inline-flex ${
                activeScreen === "orders" ? "active" : ""
              }`}
              onClick={onOrders}
            >
              <Icon name="receipt" size={15} />
              <span>Track Orders</span>
            </button>
          </>
        )}
        {onCart && (
          <>
            <button
              className="bag-button mobile-only-inline-flex"
              onClick={onCart}
              aria-label={`Cart with ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
            >
              <Icon name="bag" />
              {cartCount > 0 && <span>{cartCount}</span>}
            </button>
            <button
              className="desktop-cart-pill desktop-only-inline-flex"
              onClick={onCart}
              aria-label={`Cart with ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
            >
              <Icon name="bag" size={15} />
              <span>Cart {cartCount > 0 ? `(${cartCount})` : ""}</span>
            </button>
          </>
        )}
      </div>
    </header>
  )
}

function PrimaryButton({
  children,
  onClick,
  tone = "olive",
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  tone?: "olive" | "pickle" | "fruit"
  disabled?: boolean
}) {
  return (
    <button
      className={`primary-button ${tone}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      <Icon name="arrow-right" size={18} />
    </button>
  )
}

function Quantity({
  value,
  onChange,
  small = false,
  label,
}: {
  value: number
  onChange: (value: number) => void
  small?: boolean
  label?: string
}) {
  const of = label ? ` of ${label}` : ""
  return (
    <div className={`quantity ${small ? "small" : ""}`}>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label={`Decrease quantity${of}`}
      >
        <Icon name="minus" size={16} />
      </button>
      <span>{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        aria-label={`Increase quantity${of}`}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  )
}

function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="bottom-dock">
      <div className="bottom-inner">{children}</div>
    </div>
  )
}

const CATEGORY_LOOK = {
  pickle: { number: "01", eyebrow: "Mess meal upgrade", alt: "Homemade pickle in a bowl" },
  fruit: { number: "02", eyebrow: "Made fresh for you", alt: "Fresh mixed fruit bowl" },
  sweet: { number: "03", eyebrow: "Something sweet", alt: "Pootharekulu rolls" },
}

function CategoryCard({
  type,
  title,
  punchline,
  line,
  image,
  labels,
  cta,
  onClick,
  soon,
}: {
  type: keyof typeof CATEGORY_LOOK
  title: string
  punchline: string
  line: string
  image: string
  labels: string[]
  cta: string
  onClick: () => void
  soon?: string
}) {
  const look = CATEGORY_LOOK[type]
  return (
    <article className={`category-card ${type}`} onClick={onClick} style={{ cursor: "pointer" }}>
      <div className="category-image">
        <img src={image} alt={look.alt} />
        <span className="category-number">{look.number}</span>
        {soon && <span className="arriving-soon-chip">{soon}</span>}
      </div>
      <div className="category-content">
        <div className="eyebrow">{look.eyebrow}</div>
        <h2>{title}</h2>
        <p className="punchline">{punchline}</p>
        <p className="muted">{line}</p>
        <div className="tag-row">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <button type="button" className="text-cta">
          {cta}
          <span>
            <Icon name="arrow-right" size={16} />
          </span>
        </button>
      </div>
    </article>
  )
}

function Home({
  go,
  cartCount,
  cartTotal,
  picklesSoon = false,
}: {
  go: (screen: Screen) => void
  cartCount: number
  cartTotal: number
  picklesSoon?: boolean
}) {
  return (
    <>
      <Header
        cartCount={cartCount}
        onCart={() => go("cart")}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="home"
      />
      <main className="home-main">
        <section className="hero">
          <div className="hero-left">
            <div className="hero-kicker">
              <span></span>Freshness. Flavour. Happiness.
            </div>
            <h1>
              Good food.
              <br />
              <em>Made for hostel life.</em>
            </h1>
            <p>
              A little homemade goodness for boring mess meals. A fresh option for
              days when you want something better.
            </p>
            <div className="hero-desktop-actions">
              <button
                className="primary-button hero-cta-btn"
                onClick={() => go("pickles")}
              >
                <span>{picklesSoon ? "Preorder Homemade Pickles" : "Order Homemade Pickles"}</span>
                <Icon name="arrow-right" size={18} />
              </button>
              <button
                className="hero-secondary-btn"
                onClick={() => go("fruit-builder")}
              >
                <span>Order Fresh Fruit Bowl</span>
                <Icon name="leaf" size={18} />
              </button>
            </div>
            <div className="trust-line">
              <Icon name="shield" size={17} /> Freshly made in small batches,
              right on campus.
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-feature-card">
              <div className="feature-card-img-wrap">
                <img src={pickleImage} alt="Campus favourite pickles" />
                <span className="feature-card-tag">Campus Favourite</span>
              </div>
              <div className="feature-card-body">
                <div className="feature-badge">Hostel Delivery & Pickup</div>
                <h3>Homemade Pickles & Fresh Cut Bowls</h3>
                <p>
                  Instant upgrade for bland mess food. Delivered to your room, or
                  ready for pickup in Asima.
                </p>
                <div className="feature-stats">
                  <div className="stat-item">
                    <strong>Fresh</strong>
                    <small>Small batch</small>
                  </div>
                  <div className="stat-item">
                    <strong>₹{DELIVERY_FEE}</strong>
                    <small>Room Drop</small>
                  </div>
                  <div className="stat-item">
                    <strong>Quick</strong>
                    <small>Easy Order</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="category-list">
          <CategoryCard
            type="pickle"
            title="Authentic Homemade Pickles"
            punchline="Boring mess? Not anymore."
            line="One spoon. Instant upgrade."
            image={pickleImage}
            labels={["Homemade", "South Indian", "Small-batch"]}
            cta={picklesSoon ? "Preorder pickles" : "Explore pickles"}
            onClick={() => go("pickles")}
            soon={picklesSoon ? `Arriving ${PICKLES_ARRIVAL}` : undefined}
          />
          <CategoryCard
            type="fruit"
            title="Fresh Fruit Bowls"
            punchline="Skip the junk, not the meal."
            line={`${fruits.length} fresh-cut fruits, one fixed price.`}
            image={fruitImage}
            labels={["Fresh", `₹${FRUIT_BOWL_PRICE} fixed`, "Made to order"]}
            cta="Order a bowl"
            onClick={() => go("fruit-builder")}
          />
          <CategoryCard
            type="sweet"
            title="Sweets & Snacks"
            punchline="A sweet finish to mess dinner."
            line="Starting with Pootharekulu: paper-thin, layered and melt-in-the-mouth."
            image={pootharekuluImage}
            labels={["Traditional", "Paper-thin", `${POOTHAREKULU_PACK} · ₹${POOTHAREKULU_PRICE}`]}
            cta="Coming soon"
            onClick={() => go("sweets")}
            soon="Arriving soon"
          />
        </section>
        <section className="coming-soon">
          <span>
            <Icon name="sparkle" size={18} />
          </span>
          <div>
            <strong>More campus favourites</strong>
            <p>Good things are coming to your hostel soon.</p>
          </div>
        </section>
      </main>
      {cartCount > 0 && (
        <CartFloat
          count={cartCount}
          total={cartTotal}
          onClick={() => go("cart")}
        />
      )}
    </>
  )
}

// Sweets & Snacks: only Pootharekulu for now, shown as Arriving soon (price and ordering come later)
function SweetsPage({ go, cartCount }: { go: (screen: Screen) => void; cartCount: number }) {
  return (
    <>
      <Header
        title="Sweets & Snacks"
        onBack={() => go("home")}
        cartCount={cartCount}
        onCart={() => go("cart")}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="sweets"
      />
      <main className="screen-content pickles-page">
        <section className="screen-intro pickle-intro">
          <div className="eyebrow">New on the menu soon</div>
          <h1>
            Sweets &
            <br />
            <em>snacks.</em>
          </h1>
          <p>Traditional sweets for after mess dinner, starting with Pootharekulu.</p>
        </section>
        <div className="product-grid">
          <article className="product-card sweet-card">
            <div className="product-image-wrap">
              <img src={pootharekuluImage} alt="Pootharekulu rolls" />
              <span className="arriving-soon-chip">Arriving soon</span>
            </div>
            <div className="product-info">
              <h3>Pootharekulu</h3>
              <p>Paper-thin layered rolls that melt in your mouth.</p>
              <div className="product-bottom">
                <div>
                  <small>{POOTHAREKULU_PACK} pack</small>
                  <strong>₹{POOTHAREKULU_PRICE}</strong>
                </div>
                <button type="button" className="coming-soon-btn" disabled>
                  Coming soon
                </button>
              </div>
            </div>
          </article>
        </div>
      </main>
    </>
  )
}

function PickleList({
  go,
  selectProduct,
  cartCount,
  soldOutItems,
  preorder = false,
}: {
  go: (screen: Screen) => void
  selectProduct: (name: string) => void
  cartCount: number
  soldOutItems?: Set<string>
  preorder?: boolean
}) {
  return (
    <>
      <Header
        title="Homemade Pickles"
        onBack={() => go("home")}
        cartCount={cartCount}
        onCart={() => go("cart")}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="pickles"
      />
      <main className="screen-content pickles-page">
        <section className="screen-intro pickle-intro">
          <div className="eyebrow">Your mess meal's new best friend</div>
          <h1>
            Small-batch.
            <br />
            <em>Big on flavour.</em>
          </h1>
          <p>Authentic South Indian flavours, homemade with care.</p>
        </section>
        <div className="product-grid">
          {pickleProducts.map((product) => {
            const isSoldOut = soldOutItems?.has(product.name)
            return (
              <article
                className={`product-card ${isSoldOut ? "sold-out" : ""}`}
                key={product.name}
                onClick={() => {
                  if (!isSoldOut) selectProduct(product.name)
                }}
              >
                <div className="product-image-wrap">
                  <img src={sized(product.image, 480)} alt={product.name} />
                  {isSoldOut && <span className="sold-out-chip">SOLD OUT</span>}
                  {/* A phone-width card has no room for "(approx)"; the pickle's own page and the cart show it */}
                  {!isSoldOut && preorder && <span className="arriving-soon-chip">Arriving {PICKLES_ARRIVAL_SHORT}</span>}
                </div>
                <div className="product-info">
                  <div className="product-meta-row">
                    <span className="spice-pill">
                      <Icon name={product.spice === "Hot" ? "chili-hot" : product.spice === "Medium" ? "chili-medium" : "chili-mild"} size={18} />
                      {product.spice}
                    </span>
                    <span className={`diet-tag ${product.diet === "veg" ? "veg" : "non-veg"}`}>
                      <Icon name={product.diet === "veg" ? "leaf" : "drumstick"} size={18} />
                      {product.diet === "veg" ? "VEG" : "NON-VEG"}
                    </span>
                  </div>
                  <h3>{product.name}</h3>
                  <p>{product.desc}</p>
                  <div className="product-bottom">
                    <div>
                      <small>{isSoldOut ? "Status" : `${packOptions[0].label} pack`}</small>
                      <strong style={isSoldOut ? { color: "#d90429", fontSize: "11px" } : {}}>
                        {isSoldOut ? "Sold Out" : `₹${product.price}`}
                      </strong>
                    </div>
                    <button disabled={isSoldOut} aria-label={`View ${product.name}`}>
                      {isSoldOut ? <Icon name="close" size={14} /> : <Icon name="arrow-right" size={17} />}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </main>
    </>
  )
}

function PickleDetail({
  go,
  productName,
  add,
  cartCount = 0,
  isSoldOut = false,
  preorder = false,
}: {
  go: (screen: Screen) => void
  productName: string
  add: (item: CartItem) => void
  cartCount?: number
  isSoldOut?: boolean
  preorder?: boolean
}) {
  const product = pickleProducts.find((p) => p.name === productName) ?? pickleProducts[0]
  const addLabel = isSoldOut ? "Currently Sold Out" : preorder ? "Preorder" : "Add to cart"
  const pack = packOptions[0]
  const item = pickleCartItem(product, pack)

  const handleAdd = () => {
    if (isSoldOut) return
    add(item)
  }

  return (
    <>
      <Header
        title="Pickle details"
        onBack={() => go("pickles")}
        cartCount={cartCount}
        onCart={() => go("cart")}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="pickle-detail"
      />
      <main className="detail-page">
        <div className="detail-layout">
          <div className="detail-left-col">
            <div className="detail-image">
              <img src={sized(product.image, 1200)} alt={product.name} />
            </div>
            <aside className="love-note desktop-love-note">
              <span>
                <Icon name="sparkle" />
              </span>
              <div>
                <small>WHY STUDENTS LOVE IT</small>
                <strong>“One spoon can fix a boring mess meal.”</strong>
              </div>
            </aside>
          </div>
          <section className="detail-copy">
            {preorder && !isSoldOut && <span className="arriving-soon-chip inline">Arriving {PICKLES_ARRIVAL}</span>}
            <div className="eyebrow">Homemade · Small-batch</div>
            <h1>{product.name}</h1>
            <p>{product.about}</p>
            <div className="highlights">
              {[
                "Homemade with care",
                "Authentic South Indian taste",
                "Perfect with rice, dal & roti",
              ].map((text) => (
                <div key={text}>
                  <span>
                    <Icon name="check" size={14} />
                  </span>
                  {text}
                </div>
              ))}
            </div>
            <aside className="love-note mobile-love-note">
              <span>
                <Icon name="sparkle" />
              </span>
              <div>
                <small>WHY STUDENTS LOVE IT</small>
                <strong>“One spoon can fix a boring mess meal.”</strong>
              </div>
            </aside>
            <div className="section-heading">
              <div>
                <h2>Pack size</h2>
                <p>Every pickle comes in one {pack.label} pack.</p>
              </div>
            </div>
            <div className="option-list">
              <div className="pack-option selected">
                <span className="pack-copy">
                  <strong>{pack.label}</strong>
                  <small>{pack.note}</small>
                </span>
                <strong>₹{item.price}</strong>
              </div>
            </div>
            <div className="desktop-pack-cta">
              <div className="desktop-pack-price-row">
                <div>
                  <small>{pack.label} pack</small>
                  <strong>₹{item.price}</strong>
                </div>
                <div
                  className="desktop-pack-tag"
                  style={isSoldOut ? { color: "#d90429", background: "#fee2e2" } : {}}
                >
                  {isSoldOut ? "Temporarily Sold Out" : preorder ? `Arriving ${PICKLES_ARRIVAL} · preorder now` : "In stock today"}
                </div>
              </div>
              <PrimaryButton tone="pickle" onClick={handleAdd} disabled={isSoldOut}>
                {addLabel}
              </PrimaryButton>
            </div>
          </section>
        </div>
      </main>
      <BottomBar>
        <div className="dock-price">
          <small>{pack.label} pack</small>
          <strong>₹{item.price}</strong>
        </div>
        <PrimaryButton tone="pickle" onClick={handleAdd} disabled={isSoldOut}>
          {addLabel}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

function FruitBuilder({
  go,
  add,
  cartCount,
  soldOutItems,
}: {
  go: (screen: Screen) => void
  add: (item: CartItem) => void
  cartCount: number
  soldOutItems?: Set<string>
}) {
  const [leftOut, setLeftOut] = useState<string[]>([])

  const isFruitSoldOut = (name: string) => fruitSoldOut(name, soldOutItems ?? new Set())

  // Sold-out fruits count as left out, so the order tells the kitchen exactly what goes in.
  const skipped = fruits
    .map((fruit) => fruit.name)
    .filter((name) => leftOut.includes(name) || isFruitSoldOut(name))
  const includedCount = fruits.length - skipped.length
  const bowlSoldOut = Boolean(soldOutItems?.has(FRUIT_BOWL_NAME))
  const canAdd = includedCount > 0 && !bowlSoldOut

  const toggle = (name: string) => setLeftOut((current) => toggleLeftOut(current, name))
  const limitReached = leftOut.length >= MAX_LEFT_OUT

  const handleAdd = () => {
    if (canAdd) add(fruitBowlCartItem(skipped))
  }

  return (
    <>
      <Header
        title="Fresh Fruit Bowl"
        onBack={() => go("home")}
        cartCount={cartCount}
        onCart={cartCount ? () => go("cart") : undefined}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="fruit-builder"
      />
      <main className="screen-content builder-page">
        <div className="builder-layout">
          <div className="builder-left-col">
            <section className="builder-hero">
              <div>
                <div className="eyebrow">Freshly cut · Fixed price</div>
                <h1>
                  One fresh bowl.
                  <br />
                  <em>₹{FRUIT_BOWL_PRICE}, every time.</em>
                </h1>
                <p>{fruits.length} fruits in every bowl. Tap up to {MAX_LEFT_OUT} you'd rather skip.</p>
              </div>
              <div className="bowl-thumb">
                <img src={fruitImage} alt="Fresh mixed fruit bowl" />
              </div>
            </section>
            <div className="builder-note">
              <Icon name="clock" size={18} />
              <span>
                Delivery & pickup: {SERVICE_HOURS}. Pickup is free, room delivery ₹{DELIVERY_FEE}.
              </span>
            </div>
            <div className="fruit-grid">
              {fruits.map((fruit) => {
                const isSoldOut = isFruitSoldOut(fruit.name)
                const included = !skipped.includes(fruit.name)
                // Two already left out: the rest stay in (tap a left-out one to swap)
                const locked = included && !isSoldOut && limitReached

                return (
                  <button
                    type="button"
                    className={`fruit-card ${isSoldOut ? "sold-out" : ""} ${included ? "selected" : "left-out"}`}
                    key={fruit.name}
                    aria-pressed={included}
                    aria-disabled={locked || undefined}
                    disabled={isSoldOut}
                    onClick={() => toggle(fruit.name)}
                  >
                    <div
                      className="fruit-orb"
                      style={{ backgroundColor: fruit.color }}
                      aria-hidden="true"
                    >
                      {fruit.emoji}
                    </div>
                    <div className="fruit-meta">
                      <strong>{fruit.name}</strong>
                      <small className={isSoldOut ? "sold-out-text" : ""}>
                        {isSoldOut
                          ? "Sold out today"
                          : locked
                            ? "In your bowl"
                            : included
                              ? "In your bowl · tap to leave out"
                              : "Left out · tap to add back"}
                      </small>
                    </div>
                    <span className="fruit-check" aria-hidden="true">
                      <Icon name={included ? "check" : "plus"} size={14} />
                    </span>
                  </button>
                )
              })}
            </div>
            {limitReached && (
              <p className="leave-out-limit" role="status">
                You can leave out up to {MAX_LEFT_OUT} fruits. Tap a left-out fruit to add it back and pick a different one.
              </p>
            )}
            <div className="builder-note builder-topup-note">
              <Icon name="check" size={18} />
              <span>
                Don't want a fruit? Leave out up to {MAX_LEFT_OUT} and we'll add more of the others, so your bowl stays just as full.
              </span>
            </div>
          </div>
          <div className="builder-right-col">
            <div className="bowl-summary">
              <div className="summary-top">
                <div>
                  <small>YOUR BOWL</small>
                  <strong>
                    {includedCount} of {fruits.length} fruits
                  </strong>
                </div>
                {includedCount > 0 && (
                  <span>
                    <Icon name="check" size={16} />
                  </span>
                )}
              </div>
              {includedCount === 0 && !bowlSoldOut && (
                <div className="summary-row">
                  <strong>Pick at least one fruit to add the bowl.</strong>
                </div>
              )}
              <div className="summary-row">
                <span>Leaving out</span>
                <strong>{skipped.length ? skipped.join(", ") : "Nothing"}</strong>
              </div>
              <div className="summary-row">
                <span>Delivery & pickup</span>
                <strong className="summary-hours">
                  {SERVICE_HOURS.split(", ").map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </strong>
              </div>
              <div className="summary-row" style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.2)", fontSize: 13 }}>
                <span>Fixed price</span>
                <strong>₹{FRUIT_BOWL_PRICE}</strong>
              </div>
              <div className="desktop-builder-cta">
                <PrimaryButton
                  tone="fruit"
                  disabled={!canAdd}
                  onClick={handleAdd}
                >
                  {bowlSoldOut ? "Sold out today" : `Add bowl to cart (₹${FRUIT_BOWL_PRICE})`}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </main>
      <BottomBar>
        <div className="dock-price">
          <small>
            {includedCount === 0 ? "Pick a fruit" : `${includedCount} ${includedCount === 1 ? "fruit" : "fruits"}`}
          </small>
          <strong>₹{FRUIT_BOWL_PRICE}</strong>
        </div>
        <PrimaryButton
          tone="fruit"
          disabled={!canAdd}
          onClick={handleAdd}
        >
          {bowlSoldOut ? "Sold out today" : "Add bowl to cart"}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

function CartFloat({
  count,
  total,
  onClick,
}: {
  count: number
  total: number
  onClick: () => void
}) {
  return (
    <button className="cart-float" onClick={onClick}>
      <span className="float-icon">
        <Icon name="bag" />
      </span>
      <span>
        <small>Your cart</small>
        <strong>
          {count} item{count > 1 ? "s" : ""}
          {total ? ` · ₹${total}` : ""}
        </strong>
      </span>
      <span className="float-link">
        View cart <Icon name="arrow-right" size={16} />
      </span>
    </button>
  )
}

function Cart({
  items,
  updateQuantity,
  remove,
  go,
  soldOutItems,
  storeOpen,
  preorder = false,
}: {
  items: CartItem[]
  updateQuantity: (id: string, quantity: number) => void
  remove: (id: string) => void
  go: (screen: Screen) => void
  soldOutItems: Set<string>
  storeOpen: boolean
  preorder?: boolean
}) {
  const separate = mixesPreorder(items, preorder)
  const blocked = !storeOpen || separate || items.some((item) => soldOutNote(item, soldOutItems))
  const ctaLabel = !storeOpen
    ? CLOSED_MESSAGE
    : separate
      ? "Order them separately"
      : blocked
        ? "Remove the sold-out item above"
        : "Go to checkout"
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <>
      <Header
        title="Your Cart"
        onBack={() => go("home")}
        onOrders={() => go("orders")}
        cartCount={cartCount}
        onCart={() => go("cart")}
        go={go}
        activeScreen="cart"
      />
      <main className="screen-content cart-page">
        <section className="screen-intro compact">
          <div className="eyebrow">{items.length ? "Almost there" : "Your cart"}</div>
          {items.length ? (
            <h1>
              Your order is
              <br />
              <em>looking good.</em>
            </h1>
          ) : (
            <h1>
              Nothing here <em>yet.</em>
            </h1>
          )}
        </section>
        {items.length ? (
          <div className="cart-layout">
            <div className="cart-left-col">
              <div className="cart-list">
                {items.map((item) => (
                  <article className="cart-card" key={item.id}>
                    <img
                      src={
                        item.kind === "pickle"
                          ? sized(pickleProducts.find((p) => p.name === item.name)?.image ?? pickleImage, 480)
                          : fruitImage
                      }
                      alt=""
                    />
                    <div className="cart-item-copy">
                      <span className={`item-kind ${item.kind}`}>
                        {item.kind === "pickle"
                          ? "Homemade pickle"
                          : "Fresh bowl"}
                      </span>
                      <h3>{item.name}</h3>
                      <p>{preorderDetail(item, preorder)}</p>
                      {soldOutNote(item, soldOutItems) && (
                        <p className="cart-sold-out">{soldOutNote(item, soldOutItems)}</p>
                      )}
                      <div className="cart-controls">
                        <Quantity
                          value={item.quantity}
                          onChange={(quantity) =>
                            updateQuantity(item.id, quantity)
                          }
                          small
                          label={`${item.name}, ${item.detail}`}
                        />
                        <strong>₹{item.price * item.quantity}</strong>
                      </div>
                    </div>
                    <button
                      className="remove"
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${item.name}, ${item.detail}`}
                    >
                      <Icon name="close" size={17} />
                    </button>
                  </article>
                ))}
              </div>
              {separate && (
                <div className="preorder-date-note">
                  <Icon name="clock" size={16} />
                  <span>
                    Preordered pickles arrive on <strong>{PICKLES_ARRIVAL}</strong>, so please order them separately from fruit
                    bowls.
                  </span>
                </div>
              )}
              <div className="add-more">
                <button onClick={() => go("home")}>
                  <Icon name="plus" size={17} /> Add something else
                </button>
              </div>
            </div>
            <div className="cart-right-col">
              <div className="price-card">
                <div>
                  <span>Subtotal</span>
                  <strong>₹{subtotal}</strong>
                </div>
                <div>
                  <span>Delivery</span>
                  <small>Calculated at checkout</small>
                </div>
                <div className="price-total">
                  <span>Total</span>
                  <strong>₹{subtotal}</strong>
                </div>
                <div className="desktop-cart-cta">
                  <PrimaryButton disabled={blocked} onClick={() => go("checkout")}>
                    {ctaLabel}
                  </PrimaryButton>
                </div>
              </div>
              <div className="reassurance">
                <Icon name="shield" size={18} /> Secure checkout · No account needed
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <span>
              <Icon name="bag" size={32} />
            </span>
            <h2>Your cart is empty</h2>
            <p>Good food is just a few taps away.</p>
            <PrimaryButton onClick={() => go("home")}>
              Browse the menu
            </PrimaryButton>
          </div>
        )}
      </main>
      {items.length > 0 && (
        <BottomBar>
          <div className="dock-price">
            <small>Total</small>
            <strong>₹{subtotal}</strong>
          </div>
          <PrimaryButton disabled={blocked} onClick={() => go("checkout")}>
            {ctaLabel}
          </PrimaryButton>
        </BottomBar>
      )}
    </>
  )
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  inputMode,
  maxLength,
  hint,
  options,
  autoComplete,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: "numeric"
  maxLength?: number
  hint?: string
  options?: string[]
  autoComplete?: string
}) {
  return (
    <label className="field">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 500 }}>{hint}</span>}
      </div>
      {options ? (
        <select required value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
        />
      )}
    </label>
  )
}

function Checkout({
  go,
  details,
  setDetails,
  fulfilment,
  pickupPoint,
  items,
  setAsimaDelivery,
  hostelOpen,
}: {
  go: (screen: Screen) => void
  details: CustomerDetails
  setDetails: (value: CustomerDetails) => void
  fulfilment: "pickup" | "delivery"
  pickupPoint: string
  items: CartItem[]
  setAsimaDelivery: (value: boolean) => void
  hostelOpen: HostelOpen
}) {
  const set = (key: keyof CustomerDetails, value: string) => {
    setDetails({ ...details, [key]: value })
    try {
      if (key === "name") localStorage.setItem("messmate_customer_name", value)
      if (key === "phone" && isValidIndianPhone(value)) localStorage.setItem("messmate_phone", value)
      if (key === "room") localStorage.setItem(roomKey(details.hostel), value)
    } catch {}
  }
  // Switching hostel brings back that hostel's own saved room
  const choose = (hostel: string, roomDelivery = false) => {
    setDetails({ ...details, hostel, room: hostel === details.hostel ? details.room : savedRoom(hostel) })
    safeStorage.setItem("messmate_hostel", hostel)
    setAsimaDelivery(roomDelivery)
  }

  const cleanPhone = details.phone.replace(/\D/g, "")
  const isPhoneValid = isValidIndianPhone(cleanPhone)
  // The room only matters for room delivery: Kalam is 3 digits + side A or B, Asima a floor room (001–510) + block A–D
  const room = splitRoom(details.room)
  const asima = details.hostel === "Asima"
  // Fruit bowls at Asima are only ever picked up, so room delivery is offered for pickle-only orders
  const hasFruit = items.some((item) => item.kind === "fruit")
  const asimaPickup = asima && fulfilment === "pickup"
  // The admin can close one hostel while the other keeps taking orders
  const closed = !isHostelOpen(hostelOpen, details.hostel)
  const isComplete = Boolean(
    !closed &&
    details.name.trim() &&
    isPhoneValid &&
    (fulfilment === "pickup" || (asima ? ASIMA_ROOM : KALAM_ROOM).test(details.room))
  )
  const missing = closed
    ? `${details.hostel} is closed right now. Please check back later.`
    : !details.name.trim()
    ? "Please enter your name to continue"
    : !isPhoneValid
      ? "Please enter a valid 10-digit mobile number"
      : asima
        ? "Please enter your Asima room number and choose a block"
        : "Please enter your 3-digit Kalam room number and choose A or B"

  return (
    <>
      <Header
        title="Checkout"
        onBack={() => go("cart")}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="checkout"
      />
      <main className="screen-content checkout-page">
        <section className="screen-intro compact">
          <div className="eyebrow">Step 1 of 3</div>
          <h1>Almost there!</h1>
          <p>Just a few details and we'll take care of the rest.</p>
        </section>
        <div className="checkout-layout">
          <div className="checkout-left-col">
            <div className="checkout-card-box">
              <h2 className="box-title">Your Details</h2>
              <div className="form-grid">
                <Field
                  label="Your name"
                  placeholder="e.g. Ananya"
                  autoComplete="name"
                  maxLength={60}
                  value={details.name}
                  onChange={(v) => set("name", v)}
                />
                <Field
                  label="Phone number"
                  placeholder="e.g. 9876543210"
                  type="tel"
                  autoComplete="tel"
                  hint={
                    !details.phone
                      ? "10 digits required"
                      : cleanPhone.length === 10 && !isPhoneValid
                        ? "Not a valid mobile number"
                        : `${cleanPhone.length}/10 digits`
                  }
                  value={details.phone}
                  onChange={(v) => set("phone", cleanPhoneInput(v))}
                />
              </div>
              <div className="privacy-note">
                <Icon name="shield" size={17} /> We'll only use your 10-digit phone number for
                order updates.
              </div>
            </div>

            <section className="receive-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Choose your hostel</div>
                  <h2>How would you like it?</h2>
                </div>
              </div>
              <button
                className={`fulfilment-card ${!asima ? "selected" : ""} ${hostelOpen.Kalam ? "" : "closed"}`}
                aria-pressed={!asima}
                disabled={!hostelOpen.Kalam}
                onClick={() => choose("Kalam")}
              >
                <span className="fulfilment-icon">
                  <Icon name="bag" />
                </span>
                <span>
                  <strong>Kalam · Room delivery</strong>
                  <small>Right to your room in Kalam.</small>
                  <em>{hostelOpen.Kalam ? `+₹${DELIVERY_FEE} · ${HOSTEL_HOURS.Kalam}` : "Closed right now"}</em>
                </span>
                <span className="radio">{!asima && <span />}</span>
              </button>
              <button
                className={`fulfilment-card ${asimaPickup ? "selected" : ""} ${hostelOpen.Asima ? "" : "closed"}`}
                aria-pressed={asimaPickup}
                disabled={!hostelOpen.Asima}
                onClick={() => choose("Asima")}
              >
                <span className="fulfilment-icon">
                  <Icon name="location" />
                </span>
                {/* Fruit bowls are collected near the mess in the morning window; pickle orders from Room 104 or 210, with no set time yet */}
                {hasFruit ? (
                  <span>
                    <strong>Asima · {MESS_PICKUP}</strong>
                    {/* Just the coming morning's window (weekdays and weekends differ) */}
                    <em>{hostelOpen.Asima ? `FREE · ${slotsForHostel("Asima")[0]}` : "Closed right now"}</em>
                  </span>
                ) : (
                  <span>
                    <strong>Asima · Pickup from {ASIMA_PICKUP}</strong>
                    <small>Collect it from {ASIMA_PICKUP}.</small>
                    <em>{hostelOpen.Asima ? "FREE" : "Closed right now"}</em>
                  </span>
                )}
                <span className="radio">{asimaPickup && <span />}</span>
              </button>
              {!hasFruit && (
                <button
                  className={`fulfilment-card ${asima && !asimaPickup ? "selected" : ""} ${hostelOpen.Asima ? "" : "closed"}`}
                  aria-pressed={asima && !asimaPickup}
                  disabled={!hostelOpen.Asima}
                  onClick={() => choose("Asima", true)}
                >
                  <span className="fulfilment-icon">
                    <Icon name="bag" />
                  </span>
                  <span>
                    <strong>Asima · Room delivery</strong>
                    <small>Right to your room in Asima.</small>
                    <em>{hostelOpen.Asima ? `+₹${DELIVERY_FEE}` : "Closed right now"}</em>
                  </span>
                  <span className="radio">{asima && !asimaPickup && <span />}</span>
                </button>
              )}
              {fulfilment === "delivery" && (
                <div className="form-grid delivery-fields">
                  <Field
                    label={`Room number in ${details.hostel}`}
                    placeholder={asima ? "e.g. 104" : "e.g. 214"}
                    inputMode="numeric"
                    maxLength={3}
                    value={room.digits}
                    onChange={(v) => set("room", v.replace(/\D/g, "").slice(0, 3) + room.side)}
                  />
                  <Field
                    label={asima ? "Block" : "A or B"}
                    placeholder={asima ? "Choose your block" : "Choose A or B"}
                    options={asima ? ["A", "B", "C", "D"] : ["A", "B"]}
                    value={room.side}
                    onChange={(v) => set("room", room.digits + v)}
                  />
                </div>
              )}
            </section>
            {!isComplete && (closed || details.name || details.phone) && (
              <div className="validation-hint mobile-validation-hint">{missing}</div>
            )}
          </div>
          <div className="checkout-right-col">
            <div className="desktop-step-summary-card">
              <h3>Fulfilment Preference</h3>
              <div className="selected-delivery-preview">
                <strong>
                  {fulfilment === "pickup"
                    ? "Asima Pickup (Free)"
                    : `${details.hostel} Room Delivery (+₹${DELIVERY_FEE})`}
                </strong>
                <p>
                  {fulfilment === "pickup"
                    ? pickupPoint
                    : details.room
                      ? `${details.hostel}, Room ${details.room}`
                      : `Direct to your room door in ${details.hostel}`}
                </p>
              </div>
              <div className="desktop-checkout-cta">
                <PrimaryButton
                  disabled={!isComplete}
                  onClick={() => go("fulfilment")}
                >
                  Continue to Fulfilment
                </PrimaryButton>
              </div>
              {!isComplete && <div className="validation-hint">{missing}</div>}
            </div>
          </div>
        </div>
      </main>
      <BottomBar>
        <PrimaryButton
          disabled={!isComplete}
          onClick={() => go("fulfilment")}
        >
          Continue
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

function Fulfilment({
  go,
  fulfilment,
  details,
  slot,
  slots,
  setSlot,
  pickupPoint,
}: {
  go: (screen: Screen) => void
  fulfilment: "pickup" | "delivery"
  details: CustomerDetails
  slot: string
  slots: string[]
  setSlot: (value: string) => void
  pickupPoint: string
}) {
  const slotPicker = (heading: string) => (
    <div className="time-section">
      <h2>{heading}</h2>
      <div className="slot-list">
        {slots.map((item) => (
          <button
            key={item}
            className={slot === item ? "selected" : ""}
            aria-pressed={slot === item}
            onClick={() => setSlot(item)}
          >
            <Icon name="clock" size={18} />
            {item}
            <span className="radio">{slot === item && <span />}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const atMess = pickupPoint === MESS_PICKUP

  return (
    <>
      <Header
        title={fulfilment === "pickup" ? "Pickup details" : "Delivery details"}
        onBack={() => go("checkout")}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="fulfilment"
      />
      <main className="screen-content fulfilment-page">
        <section className="screen-intro compact">
          <div className="eyebrow">Step 2 of 3</div>
          <h1>
            {fulfilment === "pickup"
              ? atMess
                ? "See you near the mess."
                : `See you at ${ASIMA_PICKUP}.`
              : "Coming to your door."}
          </h1>
          <p>
            {fulfilment === "pickup"
              ? atMess
                ? "Collect it near the Asima mess during pickup hours."
                : `Collect it from ${ASIMA_PICKUP} in Asima.`
              : `Fresh food, straight to your room in ${details.hostel}.${slots.length ? " Pick a time that suits you." : ""}`}
          </p>
        </section>
        <div className="fulfilment-layout">
          <div className="fulfilment-left-col">
            {fulfilment === "pickup" ? (
              <>
                <div className="map-card">
                  <div className="map-pattern">
                    <span className="map-pin">
                      <Icon name="location" />
                    </span>
                    <i></i>
                    <i></i>
                    <i></i>
                  </div>
                  <div className="map-copy">
                    <span>
                      <Icon name="location" size={19} />
                    </span>
                    <div>
                      <small>PICKUP POINT</small>
                      <strong>{pickupPoint}</strong>
                    </div>
                  </div>
                </div>
                {/* Asima has one fruit bowl pickup window per morning, so the hours are shown, not picked; pickle orders have none yet */}
                {slots.length > 0 && (
                  <div className="time-section">
                    <h2>Pickup time</h2>
                    <div className="pickup-hours">
                      <Icon name="clock" size={18} />
                      <div>
                        <strong>Weekdays {HOSTEL_SLOTS.Asima[0]}</strong>
                        <strong>Weekends {ASIMA_WEEKEND[0]}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="delivery-card" style={{ marginBottom: "24px" }}>
                  <span className="big-icon">
                    <Icon name="bag" size={30} />
                  </span>
                  <div className="eyebrow">Room delivery · ₹{DELIVERY_FEE}</div>
                  <h2>
                    {details.hostel}, Room {details.room}
                  </h2>
                  <p>We'll call you when your order is outside your room.</p>
                  <button onClick={() => go("checkout")}>
                    <Icon name="edit" size={16} /> Edit room details
                  </button>
                </div>
                {slots.length > 0 && slotPicker("Choose a delivery time")}
              </>
            )}
          </div>
          <div className="fulfilment-right-col">
            <div className="desktop-step-summary-card">
              <h3>Fulfilment Schedule</h3>
              <div className="selected-delivery-preview">
                <strong>
                  {!slot
                    ? fulfilment === "pickup"
                      ? `Pickup from ${ASIMA_PICKUP}`
                      : "Room Delivery"
                    : fulfilment === "pickup"
                      ? `Pickup Window: ${slot}`
                      : `Room Delivery: ${slot}`}
                </strong>
                <p>Contact: {details.name} ({details.phone})</p>
              </div>
              <div className="desktop-fulfilment-cta">
                <PrimaryButton onClick={() => go("payment")}>
                  Review & Pay
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </main>
      <BottomBar>
        <PrimaryButton onClick={() => go("payment")}>
          Review & Pay
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

function Payment({
  go,
  items,
  fulfilment,
  onPay,
  isSubmitting,
  soldOutItems,
  storeOpen,
  preorder = false,
}: {
  go: (screen: Screen) => void
  items: CartItem[]
  fulfilment: "pickup" | "delivery"
  onPay: (method: "upi" | "counter", utr?: string) => void
  isSubmitting: boolean
  soldOutItems: Set<string>
  storeOpen: boolean
  preorder?: boolean
}) {
  const blocked = !storeOpen || items.some((item) => soldOutNote(item, soldOutItems))
  // Same calculation handlePay uses, so the amount shown is the amount saved.
  const { subtotal, fee, total } = calculateOrderTotals(items, fulfilment)

  const [chosenMethod, setMethodState] = useState<"upi" | "counter">(() =>
    safeStorage.getItem("ht_pay_method", "") === "counter" ? "counter" : "upi",
  )
  // Asima fruit orders are paid in person when collected near the mess, never online
  const payAtPickupOnly = fulfilment === "pickup" && items.some((item) => item.kind === "fruit")
  const method = payAtPickupOnly ? "counter" : chosenMethod
  const [utr, setUtrState] = useState(() => (safeStorage.getItem("ht_pay_utr", "") || "").replace(/\D/g, "").slice(0, 12))
  const setMethod = (m: "upi" | "counter") => {
    setMethodState(m)
    safeStorage.setItem("ht_pay_method", m)
  }
  const setUtr = (value: string) => {
    setUtrState(value)
    safeStorage.setItem("ht_pay_utr", value)
  }
  const [copiedUpi, setCopiedUpi] = useState(false)

  const merchantUpiId = "Q477490796@ybl"
  const merchantName = BRAND
  const upiIntentUri = `upi://pay?pa=${merchantUpiId}&pn=${encodeURIComponent(BRAND)}&am=${total}&cu=INR&tn=${encodeURIComponent(`${BRAND} order`)}`

  const handleCopyUpi = () => {
    const copySuccessful = () => {
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 2200)
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(merchantUpiId)
        .then(copySuccessful)
        .catch(() => fallbackCopy())
    } else {
      fallbackCopy()
    }

    function fallbackCopy() {
      try {
        const textArea = document.createElement("textarea")
        textArea.value = merchantUpiId
        textArea.style.position = "fixed"
        textArea.style.left = "-9999px"
        textArea.style.top = "-9999px"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        const ok = document.execCommand("copy")
        document.body.removeChild(textArea)
        if (ok) copySuccessful()
      } catch (err) {
        console.warn("Clipboard copy fallback warning:", err)
      }
    }
  }

  const handleSubmit = () => {
    if (isSubmitting || items.length === 0 || blocked) return
    onPay(method, utr)
  }

  return (
    <>
      <Header
        title="Review & Pay"
        onBack={() => go("fulfilment")}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="payment"
      />
      <main className="screen-content payment-page">
        <section className="screen-intro compact">
          <div className="eyebrow">Step 3 of 3</div>
          <h1>Complete your payment</h1>
          <p>
            {payAtPickupOnly
              ? "Pay when you collect your order near the Asima mess."
              : fulfilment === "delivery"
                ? "Scan & pay via PhonePe QR, or pay when it reaches your room."
                : "Scan & pay via PhonePe QR, or pay at the counter."}
          </p>
        </section>
        <div className="payment-layout">
          <div className="payment-left-col">
            <section className="payment-methods">
              <h2>{payAtPickupOnly ? "Payment" : "Select payment method"}</h2>
              {payAtPickupOnly ? (
                <p className="pay-at-pickup-note">Asima fruit bowl orders are paid when you collect them near the mess, by cash or scan.</p>
              ) : (
                <button
                  type="button"
                  className={method === "upi" ? "selected" : ""}
                  aria-pressed={method === "upi"}
                  onClick={() => setMethod("upi")}
                >
                  <span className="upi-mark phonepe-pill">
                    <span className="pe-symbol">पे</span>
                  </span>
                  <span>
                    <strong>Pay via PhonePe / UPI QR</strong>
                    <small>GPay, PhonePe, Paytm, CRED & more</small>
                  </span>
                  <span className="radio">{method === "upi" && <span />}</span>
                </button>
              )}
              <button
                type="button"
                className={method === "counter" ? "selected" : ""}
                aria-pressed={method === "counter"}
                onClick={() => setMethod("counter")}
              >
                <span className="card-mark">
                  <Icon name="receipt" size={18} />
                </span>
                <span>
                  <strong>{fulfilment === "delivery" ? "Pay on delivery" : "Pay at Counter"}</strong>
                  <small>
                    {fulfilment === "delivery" ? "Cash or scan when your order arrives" : "Cash or soundbox scan upon pickup"}
                  </small>
                </span>
                <span className="radio">{method === "counter" && <span />}</span>
              </button>
            </section>

            {!storeOpen ? (
              <div className="counter-payment-card">
                <div>
                  <strong>{CLOSED_MESSAGE}</strong>
                </div>
              </div>
            ) : method === "upi" ? (
              <div className="phonepe-payment-card">
                <div className="merchant-header-badge">
                  <div className="merchant-logo-pill">
                    <span className="pe-symbol-small">पे</span>
                    <span>PhonePe Merchant</span>
                  </div>
                </div>

                <div className="merchant-meta-row">
                  <div>
                    <span className="meta-label">Payee Name</span>
                    <strong className="merchant-name">{merchantName}</strong>
                    <div className="terminal-code">Terminal 1-Q477490796</div>
                  </div>
                  <div className="amount-highlight-box">
                    <span className="meta-label">Amount Payable</span>
                    <strong className="amount-val">₹{total}</strong>
                  </div>
                </div>

                {/* The Official PhonePe QR Image */}
                <div className="qr-container">
                  <img
                    src={phonepeQrUrl}
                    alt={`PhonePe QR code for ${BRAND}`}
                    width={472}
                    height={610}
                    className="phonepe-qr-img"
                  />
                  <div className="qr-scan-instruction">
                    <span>Scan with <strong>any UPI app</strong>: PhonePe, GPay, Paytm, CRED</span>
                  </div>
                </div>

                {/* UPI ID Pill with Copy */}
                <div className="upi-id-pill">
                  <div className="upi-id-text">
                    <span className="upi-id-label">UPI ID:</span>
                    <code>{merchantUpiId}</code>
                  </div>
                  <button
                    type="button"
                    className="copy-upi-btn"
                    onClick={handleCopyUpi}
                  >
                    {copiedUpi ? "Copied" : "Copy"}
                  </button>
                </div>

                {/* Mobile 1-Tap UPI Intent Button */}
                <a
                  href={upiIntentUri}
                  className="mobile-upi-pay-link"
                >
                  <span className="mobile-upi-title">
                    <Icon name="zap" size={16} /> Pay ₹{total} via UPI App
                  </span>
                  <span className="mobile-upi-sub">Tap to open PhonePe / GPay / Paytm directly</span>
                </a>

                {/* UTR Input Section */}
                <div className="utr-section">
                  <label htmlFor="utr-field" className="utr-label">
                    <span>12-Digit UPI Reference / UTR Number</span>
                    <span className="optional-badge">
                      {utr.length === 12
                        ? "✓ 12/12 digits"
                        : utr.length > 0
                        ? `${utr.length}/12 digits`
                        : "Recommended"}
                    </span>
                  </label>
                  <input
                    id="utr-field"
                    type="tel"
                    inputMode="numeric"
                    className="utr-input"
                    maxLength={12}
                    placeholder="e.g. 409128381920"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  />
                  <p className="utr-hint">
                    Found under payment details in PhonePe/GPay to speed up kitchen verification.
                  </p>
                </div>
              </div>
            ) : (
              <div className="counter-payment-card">
                <div className="counter-icon">
                  <Icon name="receipt" size={24} />
                </div>
                <div>
                  <strong>{fulfilment === "delivery" ? `Pay ₹${total} on delivery` : `Pay ₹${total} at the Counter`}</strong>
                  <p>
                    {fulfilment === "delivery"
                      ? "Pay the runner by cash or scan when your order reaches your room."
                      : "You can pay via cash or scan our soundbox QR at the pickup point."}
                  </p>
                </div>
              </div>
            )}

            <div className="reassurance">
              <Icon name="shield" size={18} /> Payments are directly verified with our campus kitchen
            </div>
          </div>
          <div className="payment-right-col">
            <section className="order-card">
              <div className="section-title">
                <h2>Your order</h2>
                <button onClick={() => go("cart")}>Edit</button>
              </div>
              {items.map((item) => (
                <div className="order-line" key={item.id}>
                  <span className="order-qty">{item.quantity}×</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{preorderDetail(item, preorder)}</small>
                    {soldOutNote(item, soldOutItems) && (
                      <small className="cart-sold-out">{soldOutNote(item, soldOutItems)}</small>
                    )}
                  </span>
                  <strong>₹{item.price * item.quantity}</strong>
                </div>
              ))}
              <div className="totals">
                <div>
                  <span>Subtotal</span>
                  <strong>₹{subtotal}</strong>
                </div>
                <div>
                  <span>{fee ? "Delivery" : "Pickup"}</span>
                  <strong>{fee ? `₹${fee}` : "Free"}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>₹{total}</strong>
                </div>
              </div>
              <div className="desktop-payment-cta">
                <PrimaryButton disabled={isSubmitting || items.length === 0 || blocked} onClick={handleSubmit}>
                  {!storeOpen
                    ? CLOSED_MESSAGE
                    : blocked
                    ? "An item sold out: edit your cart"
                    : isSubmitting
                    ? "Placing order..."
                    : method === "upi"
                    ? `I've Paid ₹${total} — Place Order`
                    : `Place Order (Pay ₹${total} ${fulfilment === "delivery" ? "on delivery" : "at Counter"})`}
                </PrimaryButton>
              </div>
            </section>
          </div>
        </div>
      </main>
      <BottomBar>
        <div className="dock-price">
          <small>Total</small>
          <strong>₹{total}</strong>
        </div>
        <PrimaryButton disabled={isSubmitting || items.length === 0 || blocked} onClick={handleSubmit}>
          {!storeOpen
            ? CLOSED_MESSAGE
            : blocked
            ? "An item sold out: edit your cart"
            : isSubmitting
            ? "Placing order..."
            : method === "upi"
            ? `I've Paid ₹${total} — Place Order`
            : `Place Order (Pay ₹${total} ${fulfilment === "delivery" ? "on delivery" : "at Counter"})`}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}


function Confirmation({
  go,
  fulfilment,
  details,
  slot,
  items,
  orderNumber,
  paymentMethod,
  pickupPoint,
  pickupPin,
  isCancelled,
}: {
  go: (screen: Screen) => void
  fulfilment: "pickup" | "delivery"
  details: CustomerDetails
  slot: string
  items: CartItem[]
  orderNumber: number | string
  paymentMethod?: string
  pickupPoint: string
  pickupPin?: string
  isCancelled?: boolean
}) {
  const displayPin = pickupPin || getPickupPin({ order_number: orderNumber })
  // Latch: dismissing the top alert must not turn a cancelled order back into "You're all set!"
  const [cancelled, setCancelled] = useState(Boolean(isCancelled))
  if (isCancelled && !cancelled) setCancelled(true)
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <main className="confirmation">
      <div className="confirmation-inner">
        <Brand onClick={() => go("home")} />
        <div className="success-visual">
          <div className="success-ring one"></div>
          <div className="success-ring two"></div>
          <span>
            <Icon name="check" size={38} />
          </span>
        </div>
        <div className="eyebrow">
          {cancelled ? "Order cancelled" : "Order confirmed"} · #{orderNumber}
        </div>

        {cancelled && (
          <div className="confirmation-cancelled-banner">
            <Icon name="close" size={18} />
            <div>
              <strong>Order #{orderNumber} has been Cancelled</strong>
              <p>The kitchen cancelled this order. If you paid via UPI, please reach out to the {SUPPORT_NAME}.</p>
            </div>
          </div>
        )}

        <h1>{cancelled ? "This order was cancelled" : "You're all set!"}</h1>
        {!cancelled && <p>Good food is on the way. We'll take it from here.</p>}
        <section className="confirmation-card">
          <div className="confirm-head">
            <span>
              <Icon name={fulfilment === "pickup" ? "location" : "bag"} />
            </span>
            <div>
              <small>
                {fulfilment === "pickup" ? "PICKUP" : "ROOM DELIVERY"}
              </small>
              <strong>
                {fulfilment === "pickup"
                  ? pickupPoint
                  : `${details.hostel}, Room ${details.room}`}
              </strong>
            </div>
          </div>
          <div className="confirm-info">
            {/* Asima room delivery has no set time yet */}
            {slot && (
              <div>
                <Icon name="clock" size={18} />
                <span>
                  <small>
                    {fulfilment === "pickup" ? "Pickup time" : "Estimated arrival"}
                  </small>
                  <strong>{slot}</strong>
                </span>
              </div>
            )}
            <div>
              <Icon name="bag" size={18} />
              <span>
                <small>Your order</small>
                <strong>
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </strong>
              </span>
            </div>
          </div>
          <div className="confirm-payment-tag">
            <span className="pay-mode-icon">
              <Icon name="zap" size={16} />
            </span>
            <span>
              <small>PAYMENT METHOD</small>
              <strong>{paymentMethod || "PhonePe UPI Verified"}</strong>
            </span>
          </div>

          {/* Prominent Counter Pickup PIN Code */}
          <div className="pickup-pin-confirmation-card">
            <div className="pin-card-icon">
              <Icon name="key" size={20} />
            </div>
            <div className="pin-card-copy">
              <small>{fulfilment === "pickup" ? "YOUR 4-DIGIT PICKUP PIN" : "YOUR 4-DIGIT ORDER PIN"}</small>
              <strong className="pin-digit-display">{displayPin}</strong>
              <span>
                {fulfilment === "pickup"
                  ? "Show this PIN at your pickup point to collect your order."
                  : "Share this PIN with your delivery runner upon room handover."}
              </span>
            </div>
          </div>
          {hasPreorderLine(items) && (
            <div className="preorder-date-note">
              <Icon name="clock" size={16} />
              <span>
                Your pickles will be {fulfilment === "pickup" ? `ready at ${ASIMA_PICKUP}` : "delivered"} on{" "}
                <strong>{PICKLES_ARRIVAL}</strong>.
              </span>
            </div>
          )}
        </section>
        {/* Asima orders get the Asima team's numbers below instead of the tracking hint */}
        {details.hostel !== "Asima" && (
          <div className="sms-note">
            <Icon name="shield" size={18} />
            <span>
              Follow live updates in Track your order with{" "}
              <strong>{details.phone.replace(/\D/g, "").slice(-10)}</strong>.
            </span>
          </div>
        )}
        {(details.hostel === "Asima" ? ASIMA_CONTACTS : [CONTACT_PHONE]).map((phone, i) => {
          const digits = phone.replace(/\D/g, "")
          return (
            <div className="contact-card" key={phone}>
              <span>
                <small>{i === 0 ? "Questions about your order?" : "Or contact"}</small>
                <strong>{phone}</strong>
              </span>
              <a
                href={`https://wa.me/${digits}?text=${encodeURIComponent(`Hi ${BRAND}, I have a question about order #${orderNumber}.`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="whatsapp" size={15} /> WhatsApp
              </a>
              <a href={`tel:+${digits}`}>
                <Icon name="phone" size={15} /> Call
              </a>
            </div>
          )
        })}
        <div className="confirm-actions">
          <PrimaryButton onClick={() => go("home")}>Back to home</PrimaryButton>
          <button className="secondary-button" onClick={() => go("orders")}>
            Track your order
          </button>
        </div>
        <p className="thank-you">
          Made fresh on campus. Thanks for supporting small.
        </p>
      </div>
    </main>
  )
}

function OrderRatingWidget({
  orderId,
  initialRating,
  initialFeedback,
}: {
  orderId: string
  initialRating?: number
  initialFeedback?: string
}) {
  const [rating, setRating] = useState(() => {
    if (initialRating) return initialRating
    try {
      const saved = localStorage.getItem(`messmate_order_rating_${orderId}`)
      if (saved) return JSON.parse(saved).rating || 0
    } catch {}
    return 0
  })
  const [hovered, setHovered] = useState(0)
  const [feedback, setFeedback] = useState(() => {
    if (initialFeedback) return initialFeedback
    try {
      const saved = localStorage.getItem(`messmate_order_rating_${orderId}`)
      if (saved) return JSON.parse(saved).feedback || ""
    } catch {}
    return ""
  })
  const [submitted, setSubmitted] = useState(() => {
    if (initialRating) return true
    try {
      const saved = localStorage.getItem(`messmate_order_rating_${orderId}`)
      if (saved && JSON.parse(saved).rating) return true
    } catch {}
    return false
  })
  const [isSending, setIsSending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rating) return
    if (!supabase) {
      alert("Ratings can't be saved right now. Please try again later.")
      return
    }
    setIsSending(true)
    const trimmed = feedback.trim()

    const { error } = await supabase
      .from("orders")
      .update({ rating, rating_feedback: trimmed })
      .eq("id", orderId)
    if (error) {
      console.warn("Rating not saved:", error.message)
      setIsSending(false)
      alert("Couldn't save your rating. Please try again.")
      return
    }

    // Saved: remember it on this device (the kitchen dashboard sees the saved rating live)
    safeStorage.setJson(`messmate_order_rating_${orderId}`, { rating, feedback: trimmed })

    setIsSending(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="order-rating-widget">
        <div className="rating-done-badge" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Icon
                key={s}
                name="star"
                size={14}
                fill={s <= rating ? "#f59e0b" : "none"}
              />
            ))}
          </div>
          <span>{rating}/5.0 · Thank you for your review!</span>
        </div>
        {feedback && (
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px", fontStyle: "italic" }}>
            "{feedback}"
          </div>
        )}
      </div>
    )
  }

  return (
    <form className="order-rating-widget" onSubmit={handleSubmit}>
      <div className="rating-widget-title">
        <span>How was your food?</span>
        <small style={{ color: "var(--muted)", fontSize: "10px" }}>Rate your experience</small>
      </div>
      <div className="stars-selector">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = (hovered || rating) >= star
          return (
            <button
              key={star}
              type="button"
              className="star-btn"
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(star)}
              title={`${star} Star${star > 1 ? "s" : ""}`}
              style={{ color: isFilled ? "#f59e0b" : "#8a8172", background: "none", border: "none", cursor: "pointer", padding: "6px" }}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
            >
              <Icon
                name="star"
                size={26}
                fill={isFilled ? "#f59e0b" : "none"}
              />
            </button>
          )
        })}
      </div>
      {rating > 0 && (
        <>
          <input
            type="text"
            placeholder="Anything to add? (optional)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="rating-feedback-input"
          />
          <button type="submit" className="submit-rating-btn" disabled={isSending}>
            {isSending ? "Submitting..." : "Submit Review"}
          </button>
        </>
      )}
    </form>
  )
}

function OrdersPage({
  go,
  phone,
  cartCount,
  onReorder,
  picklesSoon = false,
}: {
  go: (screen: Screen) => void
  phone: string
  cartCount: number
  onReorder: (items: CartItem[]) => void
  picklesSoon?: boolean
}) {
  const [searchInput, setSearchInput] = useState(() => {
    return phone || safeStorage.getItem("messmate_phone", "") || ""
  })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [searchedFor, setSearchedFor] = useState<string | null>(null)
  // Phone whose orders are on screen; live inserts for any other phone are ignored
  const activePhoneRef = useRef("")

  const loadOrders = async (targetPhone?: string) => {
    const q = (targetPhone !== undefined ? targetPhone : searchInput).trim()
    if (!supabase) {
      if (q) setMessage("Order tracking isn't available right now. Please try again in a little while.")
      return
    }
    setIsLoading(true)
    setMessage(null)
    try {
      if (!q) {
        setOrders([])
        setSearchedFor(null)
        return
      }
      const cleanDigits = q.replace(/\D/g, "")
      const normalizedPhone = normalizePhone(q)
      // Only a full phone number finds orders. Order numbers count up one by one, so looking them
      // up would show other students' PINs, phones and rooms.
      if (normalizedPhone.length !== 10) {
        setOrders([])
        setSearchedFor(null)
        activePhoneRef.current = ""
        return
      }

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .or(`customer_phone.eq.${normalizedPhone},customer_phone.eq.${cleanDigits}`)
        .order("order_number", { ascending: false })

      if (error) {
        console.warn("Order lookup failed:", error.message)
        setOrders([])
        setMessage("Couldn't load your orders right now. Please try again.")
      } else {
        setOrders(data as OrderRecord[])
        setSearchedFor(q)
        // A lookup never changes the phone saved for checkout, alerts and chat (it may be a friend's)
        activePhoneRef.current = normalizedPhone
      }
    } catch {
      setOrders([])
      setMessage("Couldn't load your orders right now. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()

    if (!supabase) return
    const channel = supabase
      .channel("public:orders_tracker")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === payload.new.id ? { ...o, ...payload.new } : o
              )
            )
          } else if (payload.eventType === "INSERT") {
            // The stream carries every student's orders; only show this phone's
            const row = payload.new as OrderRecord
            if (activePhoneRef.current && normalizePhone(row.customer_phone) === activePhoneRef.current) {
              setOrders((prev) => (prev.some((o) => o.id === row.id) ? prev : [row, ...prev]))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase?.removeChannel(channel)
    }
  }, [])

  const getStepProgress = (status: OrderRecord["status"]) => {
    switch (status) {
      case "placed":
        return 0
      case "preparing":
        return 1
      case "ready":
        return 2
      case "delivered":
        return 3
      default:
        return 0
    }
  }

  return (
    <>
      <Header
        title="My Orders & Tracking"
        onBack={() => go("home")}
        cartCount={cartCount}
        onCart={() => go("cart")}
        onOrders={() => go("orders")}
        go={go}
        activeScreen="orders"
      />
      <main className="screen-content orders-page">
        <section className="screen-intro compact">
          <div className="eyebrow">Live order tracking</div>
          <h1>
            Your orders.
            <br />
            <em>Track live status.</em>
          </h1>
          <p>
            Real-time status of your homemade pickles and freshly made bowls.
          </p>
        </section>

        <section className="orders-search-card">
          <div className="eyebrow">Look up by phone</div>
          <div className="orders-search-row">
            <input
              type="tel"
              value={searchInput}
              onChange={(e) => setSearchInput(cleanPhoneInput(e.target.value))}
              placeholder="e.g. 9876543210"
              onKeyDown={(e) => {
                if (e.key === "Enter") loadOrders(searchInput)
              }}
            />
            <button onClick={() => loadOrders(searchInput)}>
              <Icon name="refresh" size={16} /> Find
            </button>
          </div>
          {phone && (
            <div className="orders-quick-filters">
              <button
                type="button"
                className={`filter-chip ${searchInput === phone.replace(/\D/g, "").slice(-10) ? "active" : ""}`}
                onClick={() => {
                  const clean = phone.replace(/\D/g, "").slice(-10)
                  setSearchInput(clean)
                  loadOrders(clean)
                }}
              >
                <Icon name="receipt" size={13} /> My Phone ({phone.replace(/\D/g, "").slice(-10)})
              </button>
            </div>
          )}
          <div className="orders-search-note">
            <Icon name="shield" size={14} />
            <span>
              Enter your 10-digit phone number to view your active delivery and past orders
            </span>
          </div>
        </section>

        {isLoading ? (
          <div className="empty-state" style={{ marginTop: 24 }}>
            <span>
              <Icon name="clock" size={28} />
            </span>
            <h2>Checking orders...</h2>
            <p>Connecting to campus database in real time.</p>
          </div>
        ) : message ? (
          <div className="empty-state" style={{ marginTop: 24 }}>
            <span>
              <Icon name="receipt" size={28} />
            </span>
            <h2>Couldn't load orders</h2>
            <p>{message}</p>
            <PrimaryButton onClick={() => go("home")}>Browse the menu</PrimaryButton>
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 24 }}>
            <span>
              <Icon name="receipt" size={28} />
            </span>
            <h2>{searchedFor ? "No orders found" : "Look up your orders"}</h2>
            <p>
              {searchedFor
                ? `No orders found for "${searchedFor}". Please check the number and try again.`
                : "Enter your 10-digit phone number above to see active deliveries and past orders."}
            </p>
            <PrimaryButton onClick={() => go("home")}>Browse the menu</PrimaryButton>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => {
              const currentStep = getStepProgress(order.status)
              const steps = [
                { label: "Placed", desc: "Kitchen received" },
                { label: "Prepping", desc: "Fresh batch prep" },
                {
                  label:
                    order.fulfilment === "delivery"
                      ? "Out for Delivery"
                      : "Ready for Pickup",
                  desc:
                    order.fulfilment === "delivery"
                      ? "Coming to room"
                      : "At pickup point",
                },
                { label: "Delivered", desc: "Enjoy your food" },
              ]

              return (
                <article className="order-ticket" key={order.id}>
                  <div className="order-ticket-top">
                    <div className="order-ticket-id">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <small>Order #{order.order_number}</small>
                        <span className="order-ticket-pin-pill">PIN: {getPickupPin(order)}</span>
                      </div>
                      <strong>₹{order.total}</strong>
                      <span
                        style={{
                          fontSize: "9px",
                          color: "var(--muted)",
                          marginTop: "2px",
                        }}
                      >
                        {new Date(order.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ·{" "}
                        {new Date(order.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <span className={`order-status-badge ${order.status}`}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "currentColor",
                        }}
                      />
                      {order.status === "placed" && "Order Placed"}
                      {order.status === "preparing" && "Kitchen Preparing"}
                      {order.status === "ready" &&
                        (order.fulfilment === "delivery"
                          ? "Out for Delivery"
                          : "Ready for Pickup")}
                      {order.status === "delivered" && "Delivered"}
                      {order.status === "cancelled" && "Order Cancelled"}
                      {order.status === "no_show" && "Not Collected"}
                    </span>
                  </div>

                  {order.status === "cancelled" || order.status === "no_show" ? (
                    <div className="order-cancelled-notice-card">
                      <div className="cancelled-card-top">
                        <span className="cancelled-card-icon">
                          <Icon name="close" size={16} />
                        </span>
                        <div>
                          <strong>{order.status === "no_show" ? "Not Collected" : "Order Cancelled by Kitchen"}</strong>
                          <p>
                            {order.status === "no_show"
                              ? order.fulfilment === "delivery"
                                ? "We couldn't hand this order over at your room."
                                : "This order was ready but wasn't picked up."
                              : "This order has been cancelled and will not be prepared or delivered."}
                          </p>
                        </div>
                      </div>
                      <div className="cancelled-card-refund">
                        <span>
                          {order.payment_status === "refunded" ? (
                            <>Your UPI payment of ₹{order.total} has been refunded.</>
                          ) : order.status === "no_show" ? (
                            <>Questions about this order? Chat with the <strong>{SUPPORT_NAME}</strong>.</>
                          ) : order.payment_method?.includes("PhonePe") || order.payment_method?.toLowerCase().includes("upi") ? (
                            <>
                              If you paid by UPI, your refund will be processed. Questions? Chat with the <strong>{SUPPORT_NAME}</strong>.
                            </>
                          ) : (
                            <>
                              Nothing is due for this order. Questions? Chat with the <strong>{SUPPORT_NAME}</strong>.
                            </>
                          )}
                        </span>
                        <button
                          type="button"
                          className="cancelled-card-support-btn"
                          onClick={() => {
                            const fab = document.querySelector(".support-fab") as HTMLButtonElement | null
                            if (fab) fab.click()
                          }}
                        >
                          <Icon name="chat" size={13} />
                          Chat with Support
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Live Tracker Stepper */
                    <div className="tracker-timeline">
                      <div className="tracker-steps">
                        {steps.map((step, idx) => {
                          const isDone = idx < currentStep || order.status === "delivered"
                          const isActive = !isDone && idx === currentStep
                          return (
                            <div
                              key={step.label}
                              className={`tracker-step-item ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
                            >
                              <div className="tracker-step-node">
                                {isDone ? (
                                  <Icon name="check" size={16} />
                                ) : (
                                  idx + 1
                                )}
                              </div>
                              <span className="tracker-step-title">
                                {step.label}
                              </span>
                              <span className="tracker-step-time">
                                {step.desc}
                              </span>
                            </div>
                          )
                        })}
                      </div>

                      <div className="tracker-banner">
                        <div className="tracker-banner-icon">
                          <Icon
                            name={
                              order.fulfilment === "pickup" ? "location" : "bag"
                            }
                            size={16}
                          />
                        </div>
                        <div>
                          <strong>
                            {/* Fruit bowl orders are collected near the mess, pickle orders (older ones too) from Room 104 or 210 */}
                            {order.fulfilment === "pickup"
                              ? pickupPointFor(order.items)
                              : `${order.hostel}, Room ${order.room}`}
                          </strong>
                          <div
                            style={{
                              color: "var(--muted)",
                              fontSize: "10px",
                              marginTop: "2px",
                            }}
                          >
                            {/* The morning window is for fruit bowls, so older Asima pickle orders don't show it */}
                            {order.slot &&
                              (order.hostel === "Kalam" || order.items?.some((item) => item.kind === "fruit")) &&
                              `Slot: ${order.slot} · `}
                            Contact: {order.customer_name} (
                            {order.customer_phone?.replace(/\D/g, "").slice(-10) || order.customer_phone})
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Order items */}
                  <div className="order-ticket-details">
                    <div className="order-ticket-section-title">
                      Items Ordered
                    </div>
                    {Array.isArray(order.items) &&
                      order.items.map((item, idx) => (
                        <div className="order-line" key={idx}>
                          <span className="order-qty">{item.quantity}×</span>
                          <span>
                            <strong>{item.name}</strong>
                            <small>{item.detail}</small>
                          </span>
                          <strong>₹{item.price * item.quantity}</strong>
                        </div>
                      ))}
                    {picklesSoon && hasPreorderLine(order.items) && !["delivered", "cancelled", "no_show"].includes(order.status) && (
                      <div className="preorder-date-note">
                        <Icon name="clock" size={16} />
                        <span>
                          Pickles in this order will be {order.fulfilment === "pickup" ? `ready at ${ASIMA_PICKUP}` : "delivered"} on{" "}
                          <strong>{PICKLES_ARRIVAL}</strong>.
                        </span>
                      </div>
                    )}
                    <div className="totals">
                      <div>
                        <span>Subtotal</span>
                        <strong>₹{order.subtotal}</strong>
                      </div>
                      <div>
                        <span>{order.fulfilment === "pickup" ? "Pickup" : "Delivery"}</span>
                        <strong>
                          {order.delivery_fee ? `₹${order.delivery_fee}` : "Free"}
                        </strong>
                      </div>
                      <div>
                        <span>Payment</span>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
                          <strong style={{ textTransform: "uppercase" }}>
                            {order.payment_method}
                          </strong>
                          {order.payment_status === "refunded" ? (
                            <span className="pay-verify-badge neutral">Refunded</span>
                          ) : order.payment_status === "verified" || order.payment_method?.includes("[VERIFIED]") ? (
                            <span className="pay-verify-badge success">Payment Verified</span>
                          ) : order.payment_status === "rejected" || order.payment_method?.includes("[FAILED]") ? (
                            <span className="pay-verify-badge danger">Verification Issue</span>
                          ) : order.payment_method?.includes("PhonePe") || order.payment_method?.toLowerCase().includes("upi") ? (
                            <span className="pay-verify-badge pending">UTR Under Verification</span>
                          ) : (
                            <span className="pay-verify-badge neutral">
                              {order.fulfilment === "delivery" ? "Pay on Delivery" : "Pay at Counter"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span>Total</span>
                        <strong>₹{order.total}</strong>
                      </div>
                    </div>

                    {/* 1-Click Reorder Button */}
                    {Array.isArray(order.items) && order.items.length > 0 && (
                      <button
                        type="button"
                        className="reorder-button"
                        onClick={() => onReorder(order.items)}
                      >
                        <Icon name="refresh" size={14} />
                        <span>Reorder This Meal (1-Click)</span>
                      </button>
                    )}

                    {/* Order Rating & Feedback (for Delivered Orders) */}
                    {order.status === "delivered" && (
                      <OrderRatingWidget
                        orderId={order.id}
                        initialRating={order.rating}
                        initialFeedback={order.rating_feedback}
                      />
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}

type ChatView = "faq" | "request" | "live"


const FAQ_ITEMS = [
  {
    id: "pickup_pin",
    label: "Where is my 4-digit PIN?",
    question: "Where do I find my 4-digit Pickup PIN?",
    answer:
      "Your unique 4-digit Pickup PIN is displayed on your Order Confirmation screen and in the 'Track Orders' tab. Show this PIN when you collect your order or when it reaches your room!",
  },
  {
    id: "payment_verify",
    label: "How is UPI / UTR verified?",
    question: "How does UPI and UTR verification work?",
    answer:
      "When you pay via PhonePe / UPI QR, simply copy and paste the 12-digit UTR from your UPI app. The kitchen team verifies this on their merchant terminal and marks your order 'Verified' in real-time.",
  },
  {
    id: "reorder",
    label: "1-Click Reorder",
    question: "How do I reorder a past meal?",
    answer:
      "Open 'Track Orders' from the top menu, find your previous order, and tap 'Reorder This Meal'. Your cart will immediately be filled with the exact same items ready for checkout!",
  },
  {
    id: "rating",
    label: "Rate & review food",
    question: "How do I rate or review my delivered food?",
    answer:
      "Once your order is delivered, go to 'Track Orders' and tap the 5-star rating widget to submit your review. Your ratings help our campus kitchen maintain top-notch freshness!",
  },
  {
    id: "delivery",
    label: "Delivery & pickup slots",
    question: "When are delivery and pickup timings?",
    answer:
      `Times depend on your hostel: ${SERVICE_HOURS} (that's for fruit bowls; Asima pickle orders don't have a set time yet). Asima pickup is free, and room delivery is ₹${DELIVERY_FEE}.`,
  },
  {
    id: "pickup",
    label: "Where is pickup point?",
    question: "Where is the pickup point located?",
    answer:
      `At Asima, fruit bowls are picked up near the Asima mess (free). Pickle-only orders are picked up from ${ASIMA_PICKUP} (free) or come to your room (₹${DELIVERY_FEE}). Kalam orders come straight to your room (₹${DELIVERY_FEE}). Choose at checkout!`,
  },
  {
    id: "sold_out",
    label: "Sold out items",
    question: "What if an item is marked Sold Out?",
    answer:
      "To ensure maximum freshness, our kitchen marks items 'Sold Out' as soon as daily batches run out. They are restocked before the next delivery slot!",
  },
  {
    id: "fruit",
    label: "Fruit bowl price & fruits",
    question: "How does the fruit bowl work?",
    answer:
      `Every bowl is a fixed ₹${FRUIT_BOWL_PRICE} with ${fruits.length} fresh-cut fruits: ${fruits.map((f) => f.name.toLowerCase()).join(", ")}, cut fresh right before your slot. Don't want a fruit? Leave out up to ${MAX_LEFT_OUT} and we'll add more of the others.`,
  },
  {
    id: "pickle",
    label: "Pickle shelf life & storage",
    question: "How long do the pickles stay fresh?",
    answer:
      "Our homemade pickles are crafted in small batches with cold-pressed oil and authentic spices. Veg pickles stay fresh for 3–6 months; finish the chicken pickle within 3 months. Keep them cool and dry, refrigerate after opening and always use a dry spoon.",
  },
]



// AI reply (server function in api/chat.js) for messages the instant answers don't cover; null if unavailable
async function askAi(
  message: string,
  history: Array<{ sender: "user" | "bot"; text: string }>,
  hostelOpen: HostelOpen,
  picklesSoon: boolean,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: history.slice(-6).map((m) => ({ role: m.sender === "user" ? "user" : "assistant", content: m.text })),
        visitorId: safeStorage.getItem("ht_visitor_id", "") || undefined,
        storeOpen: hostelOpen.Kalam || hostelOpen.Asima,
        kalamOpen: hostelOpen.Kalam,
        asimaOpen: hostelOpen.Asima,
        picklesSoon,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.reply === "string" && data.reply.trim() ? data.reply.trim() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function SupportChatWidget({
  customerPhone = "",
  customerName = "",
  hostelOpen = { Kalam: true, Asima: true },
  picklesSoon = false,
}: {
  customerPhone?: string
  customerName?: string
  hostelOpen?: HostelOpen
  picklesSoon?: boolean
}) {
  // The chat shows "away" only when both hostels are closed
  const storeOpen = hostelOpen.Kalam || hostelOpen.Asima
  // 1. Initial saved messages from localStorage
  const savedCleanPhone = (customerPhone || safeStorage.getItem("messmate_phone", "") || "")
    .replace(/\D/g, "")
    .slice(-10)

  const initialLocalMessages = useMemo(() => {
    try {
      if (savedCleanPhone) {
        const saved = safeStorage.getItem(`messmate_chat_${savedCleanPhone}`)
        if (saved) {
          const parsed = JSON.parse(saved)
          const sanitized = Array.isArray(parsed)
            ? parsed.map((m: any) => ({
                ...m,
                customer_name:
                  SUPPORT_NAMES.includes(m.customer_name) || m.sender === "support"
                    ? SUPPORT_NAME
                    : m.customer_name,
              }))
            : []
          return mergeSupportMessages([], sanitized)
        }
      }
    } catch {}
    return []
  }, [savedCleanPhone])

  const [liveMessages, setLiveMessages] = useState<SupportMsg[]>(initialLocalMessages)

  // 2. Open state persisted across refreshes so user does not lose their place
  const [isOpen, setIsOpenState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("messmate_support_open") === "true"
    } catch {
      return false
    }
  })

  const [unreadCount, setUnreadCount] = useState<number>(0)
  const fabRef = useRef<HTMLButtonElement>(null)

  const setIsOpen = (open: boolean) => {
    setIsOpenState(open)
    try {
      localStorage.setItem("messmate_support_open", open ? "true" : "false")
    } catch {}
    if (open) {
      setUnreadCount(0)
      // A history step for the open chat, so the phone's Back closes it instead of changing the page
      if (!window.history.state?.chat) window.history.pushState({ ...window.history.state, chat: true }, "")
    } else {
      if (window.history.state?.chat) window.history.back()
      fabRef.current?.focus() // back to the Support button for keyboard and screen-reader users
    }
  }

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (e.state?.chat || !isOpenRef.current) return
      setIsOpenState(false)
      try {
        localStorage.setItem("messmate_support_open", "false")
      } catch {}
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // 3. View state: if there is an active live chat with messages or saved as 'live', stay on live!
  const [view, setViewState] = useState<ChatView>(() => {
    try {
      const savedView = localStorage.getItem("messmate_support_view") as ChatView | null
      if (savedView === "live" || initialLocalMessages.length > 0) {
        return "live"
      }
    } catch {}
    return "faq"
  })

  const setView = (v: ChatView) => {
    setViewState(v)
    try {
      localStorage.setItem("messmate_support_view", v)
    } catch {}
  }

  // Request form state - restored from customer prop or localStorage
  const [name, setName] = useState(
    customerName || safeStorage.getItem("messmate_customer_name", "") || ""
  )
  const [phone, setPhone] = useState(
    customerPhone || safeStorage.getItem("messmate_phone", "") || ""
  )
  const typedPhone = phone.replace(/\D/g, "").slice(-10)
  const chatPhone = typedPhone.length === 10 && isMyChatPhone(typedPhone) ? typedPhone : ""
  const [issue, setIssue] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // FAQ chat history
  const [faqHistory, setFaqHistory] = useState<
    Array<{ id: string; sender: "user" | "bot"; text: string; showEscalate?: boolean }>
  >([
    {
      id: "init-1",
      sender: "bot",
      text: `Hello! How can we help you today with your ${BRAND} order?`,
    },
  ])
  const [faqInput, setFaqInput] = useState("")
  const [liveInput, setLiveInput] = useState("")

  const chatBottomRef = useRef<HTMLDivElement>(null)
  const liveMessagesRef = useRef<SupportMsg[]>(liveMessages)
  liveMessagesRef.current = liveMessages
  const isOpenRef = useRef<boolean>(isOpen)
  isOpenRef.current = isOpen

  const saveChatToLocal = (cleanP: string, msgs: SupportMsg[]) => {
    try {
      localStorage.setItem(`messmate_chat_${cleanP}`, JSON.stringify(msgs))
    } catch {}
  }

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "auto" })
  }, [faqHistory, liveMessages, view, isOpen])

  useEffect(() => {
    if (isOpen && chatPhone) markChatSeen(chatPhone)
  }, [isOpen, chatPhone, liveMessages])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen])

  // Follow the latest checkout details, unless a live chat is already running on a number.
  useEffect(() => {
    if (liveMessagesRef.current.length > 0) return
    if (customerPhone.length === 10) setPhone(customerPhone)
    if (customerName.trim()) setName(customerName)
  }, [customerPhone, customerName])

  // Staff replies arrive from the database below, never from the open broadcast channel, so they can't be faked
  // Database fetch & Postgres changes when student phone is available
  useEffect(() => {
    const clean = chatPhone
    const client = supabase
    if (!clean || !client) return

    // Also re-read when the student comes back to the tab: a sleeping phone can miss live replies
    const loadHistory = () =>
      client
      .from("support_messages")
      .select("*")
      .eq("phone", clean)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        // Messages from before a "New" request stay hidden on this phone
        const since = Number(safeStorage.getItem(`ht_chat_since_${clean}`, "0")) || 0
        const fresh = !error && data ? (data as SupportMsg[]).filter((m) => new Date(m.created_at).getTime() > since) : []
        if (fresh.length > 0) {
          setLiveMessages((prev) => {
            const next = mergeSupportMessages(prev, fresh)
            saveChatToLocal(clean, next)
            return next
          })
          setView("live")
          if (!isOpenRef.current) {
            const seen = Number(safeStorage.getItem(`ht_chat_seen_${clean}`, "0")) || 0
            const unseen = fresh.filter(
              (m) => m.sender === "support" && new Date(m.created_at).getTime() > seen,
            ).length
            if (unseen > 0) setUnreadCount(unseen)
          }
        }
      })
    loadHistory()
    const onBack = () => {
      if (document.visibilityState === "visible") loadHistory()
    }
    document.addEventListener("visibilitychange", onBack)
    window.addEventListener("online", onBack)

    const pgChannel = client
      .channel(`support_pg_${clean}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `phone=eq.${clean}`,
        },
        (payload) => {
          const newMsg = payload.new as SupportMsg
          if (newMsg.phone === clean) {
            const isNew = mergeSupportMessages(liveMessagesRef.current, [newMsg]).length > liveMessagesRef.current.length
            setLiveMessages((prev) => {
              const next = mergeSupportMessages(prev, [newMsg])
              saveChatToLocal(clean, next)
              return next
            })
            if (newMsg.sender === "support") {
              setView("live")
              if (!isOpenRef.current && isNew) {
                setUnreadCount((c) => c + 1)
              }
            }
          }
        }
      )
      .subscribe()

    return () => {
      document.removeEventListener("visibilitychange", onBack)
      window.removeEventListener("online", onBack)
      client.removeChannel(pgChannel)
    }
  }, [chatPhone])

  const handleSelectFaq = (faq: (typeof FAQ_ITEMS)[0]) => {
    const userMsg = {
      id: `faq-u-${Date.now()}`,
      sender: "user" as const,
      text: faq.question,
    }
    const botMsg = {
      id: `faq-b-${Date.now() + 1}`,
      sender: "bot" as const,
      text: faq.answer,
      showEscalate: true,
    }
    setFaqHistory((prev) => [...prev, userMsg, botMsg])
  }

  const handleSendFaqQuestion = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!faqInput.trim()) return
    const query = faqInput.trim()
    setFaqInput("")
    const answer = getFaqResponse(query, picklesSoon, hostelOpen)
    const known = answer !== FAQ_FALLBACK
    const botId = `faq-b-${Date.now() + 1}`

    setFaqHistory((prev) => [
      ...prev,
      { id: `faq-u-${Date.now()}`, sender: "user", text: query },
      { id: botId, sender: "bot", text: known ? answer : "Typing…", showEscalate: known },
    ])
    if (known) return
    // No instant answer (a greeting, small talk…): the AI helper replies; if it can't, a built-in
    // small-talk reply, and otherwise a pointer to the team
    const reply = (await askAi(query, faqHistory, hostelOpen, picklesSoon)) ?? getSmallTalkReply(query) ?? FAQ_FALLBACK
    setFaqHistory((prev) => prev.map((m) => (m.id === botId ? { ...m, text: reply, showEscalate: true } : m)))
  }

  // "New": a fresh request. Earlier messages stay with the team but no longer show on this phone.
  const handleResetChat = () => {
    const clean = (phone || "").replace(/\D/g, "").slice(-10)
    if (clean) {
      safeStorage.setItem(`ht_chat_since_${clean}`, String(Date.now()))
      safeStorage.removeItem(`messmate_chat_${clean}`)
    }
    setLiveMessages([])
    setIssue("")
    setFormError(null)
    setView("request")
  }

  const handleStartLiveChat = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError("Please enter your name.")
      return
    }
    const cleanPhone = cleanPhoneInput(phone)
    if (cleanPhone.length !== 10) {
      setFormError("Please enter a valid 10-digit mobile number.")
      return
    }
    // Without a connection nothing would reach the team, so don't promise a callback
    if (!supabase) {
      setFormError("Live support isn't available right now. Please use the WhatsApp or Call buttons at the top of this chat.")
      return
    }

    setIsSubmitting(true)
    const activePhone = cleanPhone
    safeStorage.setItem("messmate_phone", activePhone)
    safeStorage.setItem("messmate_customer_name", name.trim())

    const issueText = issue.trim() || `Requested ${SUPPORT_NAME} callback.`

    const { data: saved, error } = await supabase
      .from("support_messages")
      .insert({
        phone: activePhone,
        customer_name: name.trim(),
        sender: "customer",
        message: issueText,
      })
      .select()
      .single()
    if (error || !saved) {
      console.warn("Support request not saved:", error?.message)
      setFormError("Couldn't send your request. Please check your connection and try again.")
      setIsSubmitting(false)
      return
    }

    rememberChatPhone(activePhone)
    markChatSeen(activePhone)
    const savedMsg = saved as SupportMsg
    const acknowledgmentMsg: SupportMsg = {
      id: `ack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phone: activePhone,
      customer_name: SUPPORT_NAME,
      sender: "support",
      message: storeOpen
        ? `Thanks ${name.trim()}! We have received your details. We will contact you shortly on ${activePhone}.`
        : `Thanks ${name.trim()}! We're unavailable at the moment, but we have your details and will reply on ${activePhone} when we're back.`,
      // Just after the saved message, so it always shows below it
      created_at: new Date(new Date(savedMsg.created_at).getTime() + 1).toISOString(),
    }

    const nextMsgs = mergeSupportMessages([], [savedMsg, acknowledgmentMsg])
    setLiveMessages(nextMsgs)
    saveChatToLocal(activePhone, nextMsgs)
    setView("live")
    setIsSubmitting(false)
  }

  const handleSendLiveMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!liveInput.trim()) return
    if (!supabase) {
      alert("Live chat isn't available right now. Please use the WhatsApp or Call buttons at the top of this chat.")
      return
    }
    const cleanPhone = (phone || safeStorage.getItem("messmate_phone", "") || "").replace(/\D/g, "").slice(-10)
    // Messages need a full phone number or they can't be saved or answered
    if (cleanPhone.length !== 10) {
      setFormError("Please enter your name and 10-digit mobile number first.")
      setView("request")
      return
    }
    const text = liveInput.trim()
    setLiveInput("")

    const optimistic: SupportMsg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phone: cleanPhone,
      customer_name: name || "Student",
      sender: "customer",
      message: text,
      created_at: new Date().toISOString(),
    }
    setLiveMessages((prev) => {
      const next = mergeSupportMessages(prev, [optimistic])
      saveChatToLocal(cleanPhone, next)
      return next
    })

    const { error } = await supabase.from("support_messages").insert({
      phone: cleanPhone,
      customer_name: name || "Student",
      sender: "customer",
      message: text,
    })
    if (error) {
      console.warn("Support message not saved:", error.message)
      setLiveMessages((prev) => {
        const next = prev.filter((m) => m.id !== optimistic.id)
        saveChatToLocal(cleanPhone, next)
        return next
      })
      setLiveInput(text)
      alert("Message not sent. Please check your connection and try again.")
      return
    }
    rememberChatPhone(cleanPhone)
  }

  return (
    <>
      <button
        ref={fabRef}
        className={`support-fab ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open support chat"
        title={SUPPORT_NAME}
      >
        <span className={`support-fab-dot ${storeOpen ? "" : "away"}`} />
        <Icon name={isOpen ? "close" : "chat"} size={19} />
        <span className="support-fab-label">{isOpen ? "Close" : "Support Team"}</span>
        {!isOpen && unreadCount > 0 && (
          <span className="support-fab-badge">{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <aside className="support-chat-card" role="dialog" aria-label="Support Chat">
          <div className="support-header">
            <div className="support-header-info">
              <div className="support-avatar">
                <Icon name="chat" size={17} />
              </div>
              <div className="support-header-text">
                <strong>{BRAND} Support</strong>
                <small>
                  <span className={`support-header-dot ${storeOpen ? "" : "away"}`} /> {storeOpen ? CONTACT_PHONE : CLOSED_MESSAGE}
                </small>
              </div>
            </div>
            <div className="support-header-actions">
              <a
                className="support-header-btn"
                href={`https://wa.me/${contactDigits}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`WhatsApp ${CONTACT_PHONE}`}
                title={`WhatsApp ${CONTACT_PHONE}`}
              >
                <Icon name="whatsapp" size={16} />
              </a>
              <a
                className="support-header-btn"
                href={`tel:+${contactDigits}`}
                aria-label={`Call ${CONTACT_PHONE}`}
                title={`Call ${CONTACT_PHONE}`}
              >
                <Icon name="phone" size={16} />
              </a>
              <button
                className="support-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close support chat"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </div>

          <div className="support-subnav">
            <button
              type="button"
              className={`support-subnav-btn ${view === "faq" ? "active" : ""}`}
              onClick={() => setView("faq")}
            >
              <Icon name="sparkle" size={13} /> Instant Answers
            </button>
            <button
              type="button"
              className={`support-subnav-btn ${
                view === "request" || view === "live" ? "active" : ""
              }`}
              onClick={() => {
                if (liveMessages.length > 0) {
                  setView("live")
                } else {
                  setView("request")
                }
              }}
            >
              <Icon name="user" size={13} />
              {liveMessages.length > 0 ? "Live Chat Active" : "Talk to Team"}
            </button>
          </div>

          {view === "faq" && (
            <>
              <div className="support-body" aria-live="polite">
                {faqHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`chat-bubble ${item.sender}`}
                  >
                    <span className="chat-bubble-sender">
                      {item.sender === "bot" ? "Happy Tummy Bot" : "You"}
                    </span>
                    <div>{item.text}</div>
                    {item.showEscalate && (
                      <div className="support-escalate-card">
                        <p>Need more details or direct assistance?</p>
                        <button
                          type="button"
                          className="support-escalate-btn"
                          onClick={() => {
                            if (liveMessages.length > 0) {
                              setView("live")
                            } else {
                              setView("request")
                            }
                          }}
                        >
                          <Icon name="chat" size={13} />
                          {liveMessages.length > 0 ? "Resume Live Chat" : "Talk to our Support Team"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                <div className="support-chips-header">Quick topics</div>
                <div className="support-chips-grid">
                  {FAQ_ITEMS.map((faq) => (
                    <button
                      key={faq.id}
                      type="button"
                      className="support-faq-chip"
                      onClick={() => handleSelectFaq(faq)}
                    >
                      {faq.label}
                    </button>
                  ))}
                </div>
                <div ref={chatBottomRef} />
              </div>

              <form className="support-input-bar" onSubmit={handleSendFaqQuestion}>
                <input
                  type="text"
                  placeholder="Ask a question (e.g. delivery time)..."
                  maxLength={500}
                  value={faqInput}
                  onChange={(e) => setFaqInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="support-send-btn"
                  disabled={!faqInput.trim()}
                  aria-label="Send question"
                >
                  <Icon name="send" size={14} />
                </button>
              </form>
            </>
          )}

          {view === "request" && (
            <div className="support-body" aria-live="polite">
              <form
                className="support-request-form"
                onSubmit={handleStartLiveChat}
              >
                <div className="support-request-intro">
                  <h4>Talk to our Support Team</h4>
                  <p>
                    {storeOpen
                      ? "Submit your name and phone number. Our support team will contact you shortly!"
                      : "We're unavailable at the moment. Leave your details and we'll reply when we're back."}
                  </p>
                </div>

                {formError && (
                  <div className="validation-hint" style={{ textAlign: "left" }}>
                    {formError}
                  </div>
                )}

                <div className="support-field">
                  <label htmlFor="support-name">Your name</label>
                  <input
                    id="support-name"
                    type="text"
                    maxLength={60}
                    autoComplete="name"
                    placeholder="e.g. Ananya"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="support-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <label htmlFor="support-phone">Phone number</label>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {phone.replace(/\D/g, "").length}/10 digits
                    </span>
                  </div>
                  <input
                    id="support-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(cleanPhoneInput(e.target.value))}
                    required
                  />
                </div>

                <div className="support-field">
                  <label htmlFor="support-issue">Your issue or question (optional)</label>
                  <textarea
                    id="support-issue"
                    placeholder="What do you need help with? (e.g. delivery query, change room number...)"
                    maxLength={2000}
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                  />
                </div>

                <div className="support-form-actions">
                  <button
                    type="button"
                    className="support-back-text-btn"
                    onClick={() => setView("faq")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="support-back-text-btn"
                    style={{ textDecoration: "underline", color: "var(--olive)" }}
                    onClick={() => setView("live")}
                  >
                    Open Chat
                  </button>
                  <button
                    type="submit"
                    className="primary-button olive"
                    disabled={isSubmitting || !name.trim() || phone.replace(/\D/g, "").length !== 10}
                    style={{ flex: 1, minHeight: 44, fontSize: 13 }}
                  >
                    {isSubmitting ? "Submitting..." : storeOpen ? "Submit & Contact Me" : "Send message"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {view === "live" && (
            <>
              {liveMessages.some((m) => m.sender === "customer") && (
              <div className="support-status-banner">
                <div className="support-status-badge">
                  <Icon name="check" size={14} />
                </div>
                <div className="support-status-copy">
                  <strong>{storeOpen ? "We will contact you shortly!" : "We'll reply when we're back"}</strong>
                  <span>{SUPPORT_NAME} reaching out to <strong>{phone.replace(/\D/g, "").slice(-10)}</strong></span>
                </div>
                <button
                  type="button"
                  className="support-status-reset"
                  onClick={handleResetChat}
                  title="Submit a new inquiry"
                >
                  New
                </button>
              </div>
              )}

              <div className="support-body" aria-live="polite">
                {liveMessages.length === 0 ? (
                  <div className="empty-state" style={{ padding: 20 }}>
                    <Icon name="chat" size={24} />
                    <p>No messages yet. Send a message below to start chatting with the {SUPPORT_NAME}.</p>
                  </div>
                ) : (
                  liveMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`chat-bubble ${
                        msg.sender === "customer"
                          ? "user"
                          : msg.sender === "bot"
                            ? "bot"
                            : "support-agent"
                      }`}
                    >
                      <span className="chat-bubble-sender">
                        {msg.sender === "customer" && !SUPPORT_NAMES.includes(msg.customer_name)
                          ? msg.customer_name || "You"
                          : msg.sender === "bot"
                            ? "Happy Tummy Bot"
                            : SUPPORT_NAME}
                      </span>
                      <div>{rebrand(msg.message)}</div>
                      <span className="chat-bubble-time">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))
                )}
                <div ref={chatBottomRef} />
              </div>

              <form
                className="support-input-bar"
                onSubmit={handleSendLiveMessage}
              >
                <input
                  type="text"
                  placeholder="Type a message..."
                  maxLength={2000}
                  value={liveInput}
                  onChange={(e) => setLiveInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="support-send-btn"
                  disabled={!liveInput.trim()}
                  aria-label="Send message"
                >
                  <Icon name="send" size={14} />
                </button>
              </form>
            </>
          )}
        </aside>
      )}
    </>
  )
}

const SCREENS: Screen[] = ["home", "pickles", "pickle-detail", "fruit-builder", "cart", "checkout", "fulfilment", "payment", "confirmation", "orders", "sweets"]
// Steps that only make sense with something in the cart
const NEEDS_CART: Screen[] = ["cart", "checkout", "fulfilment", "payment"]
type StoreStatusRow = { is_open?: unknown; kalam_open?: unknown; asima_open?: unknown; pickles_coming_soon?: unknown }

const SESSION_KEY = "ht_session"
const SESSION_MAX_AGE = 6 * 60 * 60 * 1000 // an old cart from yesterday shouldn't come back

type SavedSession = {
  screen: Screen
  cart: CartItem[]
  selectedProduct: string
  hostel: string
  asimaDelivery?: boolean
  fulfilment?: "pickup" | "delivery"
  slot: string
  savedAt: number
}

// Cart and checkout step from before a reload (phones often reload the tab after paying in a UPI app)
function restoreSession() {
  const saved = safeStorage.getJson<Partial<SavedSession> | null>(SESSION_KEY, null)
  const fresh = saved && typeof saved.savedAt === "number" && Date.now() - saved.savedAt < SESSION_MAX_AGE ? saved : {}
  const cart = repriceForReorder(Array.isArray(fresh.cart) ? fresh.cart : [])
  let screen: Screen = fresh.screen && SCREENS.includes(fresh.screen) ? fresh.screen : "home"
  if (screen === "confirmation" || (NEEDS_CART.includes(screen) && cart.length === 0)) screen = "home"
  return {
    screen,
    cart,
    selectedProduct: pickleProducts.find((p) => p.name === fresh.selectedProduct)?.name ?? pickleProducts[0].name,
    // Sessions saved before Asima had room delivery only kept fulfilment, and delivery meant Kalam
    hostel: fresh.hostel === "Kalam" || fresh.fulfilment === "delivery" ? "Kalam" : "Asima",
    asimaDelivery: fresh.asimaDelivery === true,
    // An old or unknown slot becomes the hostel's first slot (see orderSlot)
    slot: fresh.slot && ALL_SLOTS.includes(fresh.slot) ? fresh.slot : "",
  }
}

// Back-in-service notice, shown once per visit
const RESUME_NOTICE_KEY = "ht_resume_notice"

function ResumeNotice() {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(RESUME_NOTICE_KEY) !== "seen"
    } catch {
      return true
    }
  })
  const close = () => {
    setOpen(false)
    try {
      sessionStorage.setItem(RESUME_NOTICE_KEY, "seen")
    } catch {}
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  if (!open) return null

  return (
    <div className="notice-backdrop" onClick={close}>
      <div
        className="notice-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-notice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="notice-close" onClick={close} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
        <h2 id="resume-notice-title">Hey everyone! 👋</h2>
        <p>
          We're happy to announce that we're back! Thank you for your patience and support. We look forward to serving you
          again! ❤️
        </p>
        <ul className="notice-hostels">
          <li>
            <strong>Kalam</strong>
            <span>Find us near the mess area in the morning, or preorder and get it delivered 6–7 PM</span>
          </li>
          <li>
            <strong>Asima</strong>
            <span>Available 9–11 AM at the counter near the mess</span>
          </li>
        </ul>
        <PrimaryButton onClick={close}>Got it</PrimaryButton>
      </div>
    </div>
  )
}

export default function App() {
  const [restored] = useState(restoreSession)
  const [screen, setScreen] = useState<Screen>(restored.screen)

  const [selectedProduct, setSelectedProduct] = useState(restored.selectedProduct)

  const [cart, setCart] = useState<CartItem[]>(restored.cart)

  const [details, setDetails] = useState<CustomerDetails>(() => ({
    name: safeStorage.getItem("messmate_customer_name", "") || "",
    phone: normalizePhone(safeStorage.getItem("messmate_phone", "")),
    hostel: restored.hostel,
    room: savedRoom(restored.hostel),
  }))

  // An Asima student's pick between pickup and room delivery (fruit bowl orders are always picked up)
  const [asimaDelivery, setAsimaDelivery] = useState(restored.asimaDelivery)
  const fulfilment = fulfilmentFor(details.hostel, cart, asimaDelivery)
  const pickupPoint = pickupPointFor(cart)

  const [slot, setSlot] = useState(restored.slot)

  useEffect(() => {
    safeStorage.setJson(SESSION_KEY, {
      screen,
      cart,
      selectedProduct,
      hostel: details.hostel,
      asimaDelivery,
      slot,
      savedAt: Date.now(),
    })
  }, [screen, cart, selectedProduct, details.hostel, asimaDelivery, slot])

  // The phone's Back button steps back through the screens instead of leaving the site.
  // nav mirrors the browser history (one screen per step) so the on-screen back arrows can use it too.
  const cartRef = useRef(cart)
  const screenRef = useRef(screen)
  const navRef = useRef<{ depth: number; stack: Screen[] }>({ depth: 0, stack: [] })
  useEffect(() => {
    cartRef.current = cart
    screenRef.current = screen
  }, [cart, screen])
  useEffect(() => {
    const depth = typeof window.history.state?.depth === "number" ? window.history.state.depth : 0
    navRef.current = { depth, stack: Object.assign([], { [depth]: restored.screen }) }
    window.history.replaceState({ screen: restored.screen, depth }, "")
    const onPop = (e: PopStateEvent) => {
      const state = e.state ?? {}
      let target: Screen = SCREENS.includes(state.screen) ? state.screen : "home"
      const stepDepth = typeof state.depth === "number" ? state.depth : 0
      // After an order the cart is empty, so Back lands on Home instead of the payment page again
      if (target === "confirmation" || (NEEDS_CART.includes(target) && cartRef.current.length === 0)) {
        target = "home"
        window.history.replaceState({ ...state, screen: target, depth: stepDepth }, "")
      }
      navRef.current.depth = stepDepth
      navRef.current.stack[stepDepth] = target
      // Closing the chat also steps back; the page itself stays where it was
      if (target === screenRef.current) return
      setScreen(target)
      window.scrollTo({ top: 0, behavior: "instant" })
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const [orderNumber, setOrderNumber] = useState<number | string>(1048)
  const [orderPin, setOrderPin] = useState<string>("1048")

  const [paymentMethodName, setPaymentMethodName] = useState("PhonePe UPI")

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Real-time Sold Out items state
  const [soldOutItems, setSoldOutItems] = useState<Set<string>>(() => new Set())

  // Live Ready & Cancelled Alert state
  const [activeReadyOrder, setActiveReadyOrder] = useState<any>(null)
  const [dismissedReadyIds, setDismissedReadyIds] = useState<Set<string>>(
    () => new Set(safeStorage.getJson<string[]>("ht_dismissed_ready", [])),
  )
  const [activeCancelledOrder, setActiveCancelledOrder] = useState<any>(null)
  const [dismissedCancelledIds, setDismissedCancelledIds] = useState<Set<string>>(
    () => new Set(safeStorage.getJson<string[]>("ht_dismissed_cancelled", [])),
  )
  // Dismissed banners stay dismissed after a reload
  useEffect(() => {
    safeStorage.setJson("ht_dismissed_ready", [...dismissedReadyIds])
    safeStorage.setJson("ht_dismissed_cancelled", [...dismissedCancelledIds])
  }, [dismissedReadyIds, dismissedCancelledIds])
  // Each hostel's Open / Closed switch from the admin. Stays open if it can't be read, so ordering never breaks by accident.
  const [hostelOpen, setHostelOpen] = useState<HostelOpen>({ Kalam: true, Asima: true })
  const storeOpen = hostelOpen.Kalam || hostelOpen.Asima
  // The admin's Preorder switch for pickles ("Arriving soon"); plain add-to-cart if it can't be read
  const [picklesSoon, setPicklesSoon] = useState(false)
  const applyStoreStatus = (row: StoreStatusRow | null) => {
    if (row) setHostelOpen(hostelsOpen(row))
    if (typeof row?.pickles_coming_soon === "boolean") setPicklesSoon(row.pickles_coming_soon)
  }
  const refreshStoreStatus = () =>
    supabase
      ?.from("store_status")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error) applyStoreStatus(data)
      })
  // The chosen time, or the hostel's first slot when it belongs to the other hostel
  const slotOptions = slotsFor(details.hostel, cart)
  const orderSlot = slotOptions.includes(slot) ? slot : (slotOptions[0] ?? "")
  useEffect(() => {
    const client = supabase
    if (!client) return
    refreshStoreStatus()
    const channel = client
      .channel("store_status_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_status" }, (payload) => {
        applyStoreStatus(payload.new as StoreStatusRow)
      })
      .subscribe()
    return () => {
      client.removeChannel(channel)
    }
  }, [])

  // Live updates can be missed while the page sits in the background (e.g. paying in a UPI app)
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== "visible") return
      refreshStock()
      refreshStoreStatus()
    }
    document.addEventListener("visibilitychange", onBack)
    window.addEventListener("online", onBack)
    return () => {
      document.removeEventListener("visibilitychange", onBack)
      window.removeEventListener("online", onBack)
    }
  }, [])

  // What the confirmation screen shows; the cart itself is emptied once the order is placed
  const [orderedItems, setOrderedItems] = useState<CartItem[]>([])
  // How the placed order is handed over, for the confirmation (fulfilment follows the cart, which is emptied)
  const [placed, setPlaced] = useState<{ fulfilment: "pickup" | "delivery"; slot: string; pickupPoint: string }>({
    fulfilment: "delivery",
    slot: "",
    pickupPoint: "",
  })

  // Count one anonymous visit per browser session for the admin's Store Visitors card (random id, no personal data).
  useEffect(() => {
    if (!supabase) return
    try {
      if (sessionStorage.getItem("ht_visit_logged")) return
      sessionStorage.setItem("ht_visit_logged", "1")
    } catch {
      return
    }
    let visitorId = safeStorage.getItem("ht_visitor_id")
    if (!visitorId) {
      // randomUUID only exists on https/localhost; plain-http testing would otherwise crash the page
      visitorId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
      safeStorage.setItem("ht_visitor_id", visitorId)
    }
    supabase
      .from("site_visits")
      .insert({ visitor_id: visitorId })
      .then(({ error }) => {
        if (!error) return
        console.warn("Visit not logged:", error.message)
        try {
          sessionStorage.removeItem("ht_visit_logged") // try again on the next load
        } catch {}
      })
  }, [])

  const refreshStock = () =>
    supabase
      ?.from("menu_inventory")
      .select("id, name, is_available")
      .then(({ data, error }) => {
        if (!error && data) setSoldOutItems(soldOutNames(data))
      })

  // Sync inventory with Supabase realtime & broadcast
  useEffect(() => {
    if (!supabase) return

    // 1. Current stock from the table
    refreshStock()

    // 2. Live updates: the admin's broadcast, plus the table itself in case a broadcast is missed
    const applyStock = (row?: { id?: string; is_available?: boolean }) => {
      const match = row?.id ? DEFAULT_MENU_ITEMS.find((i) => i.id === row.id) : undefined
      if (!match || typeof row?.is_available !== "boolean") return
      setSoldOutItems((prev) => {
        const next = new Set(prev)
        if (row.is_available) {
          next.delete(match.name)
        } else {
          next.add(match.name)
        }
        return next
      })
    }
    // Straight from the table (an open broadcast channel could carry fake "sold out" messages)
    const stockTableChannel = supabase
      .channel("menu_inventory_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_inventory" }, (payload) =>
        applyStock(payload.new as { id?: string; is_available?: boolean }),
      )
      .subscribe()

    return () => {
      supabase?.removeChannel(stockTableChannel)
    }
  }, [])

  // Live listener for Ready & Cancelled alerts
  useEffect(() => {
    const client = supabase
    if (!client) return
    const phone = normalizePhone(details.phone || safeStorage.getItem("messmate_phone", ""))
    // Wait for a full number; partial input would query and resubscribe on every keystroke
    if (phone.length !== 10) return

    const checkOrderAlerts = async () => {
      // 1. Ready orders
      const { data: readyData } = await client
        .from("orders")
        .select("*")
        .eq("customer_phone", phone)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)

      if (readyData && readyData.length > 0) {
        const order = readyData[0]
        if (!dismissedReadyIds.has(order.id)) {
          setActiveReadyOrder(order)
        }
      } else {
        setActiveReadyOrder(null)
      }

      // 2. Cancelled orders in last 3 hours
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
      const { data: cancelledData } = await client
        .from("orders")
        .select("*")
        .eq("customer_phone", phone)
        .eq("status", "cancelled")
        .gte("created_at", threeHoursAgo)
        .order("created_at", { ascending: false })
        .limit(1)

      if (cancelledData && cancelledData.length > 0) {
        const order = cancelledData[0]
        if (!dismissedCancelledIds.has(order.id)) {
          setActiveCancelledOrder(order)
        }
      } else {
        setActiveCancelledOrder(null)
      }
    }

    checkOrderAlerts()

    const ordersChannel = client
      .channel("student_order_alerts")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `customer_phone=eq.${phone}` },
        (payload) => {
          const updated = payload.new as any
          if (updated.customer_phone === phone) {
            if (updated.status === "ready" && !dismissedReadyIds.has(updated.id)) {
              setActiveCancelledOrder(null)
              setActiveReadyOrder(updated)
            } else if (updated.status === "cancelled") {
              setActiveReadyOrder(null)
              if (!dismissedCancelledIds.has(updated.id)) {
                setActiveCancelledOrder(updated)
              }
            } else {
              setActiveReadyOrder((current: any) => (current?.id === updated.id ? null : current))
            }
          }
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(ordersChannel)
    }
  }, [details.phone, dismissedReadyIds, dismissedCancelledIds])

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  )

  const go = (next: Screen) => {
    if (next === "home" && screen === "confirmation") setCart([])

    // Going to the screen we just came from (an on-screen back arrow) is the same as the phone's Back
    const nav = navRef.current
    if (next !== screen && nav.depth > 0 && nav.stack[nav.depth - 1] === next && !window.history.state?.chat) {
      window.history.back()
      return
    }
    if (next !== screen) {
      nav.depth += 1
      nav.stack[nav.depth] = next
      nav.stack.length = nav.depth + 1
      window.history.pushState({ screen: next, depth: nav.depth }, "")
    }
    setScreen(next)

    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const add = (item: CartItem) => {
    setCart((current) => {
      const exists = current.find((entry) => entry.id === item.id)

      return exists
        ? current.map((entry) =>
            entry.id === item.id
              ? { ...entry, quantity: entry.quantity + 1 }
              : entry,
          )
        : [...current, item]
    })

    go("cart")
  }

  const updateQuantity = (id: string, quantity: number) =>
    setCart((current) =>
      quantity === 0
        ? current.filter((item) => item.id !== id)
        : current.map((item) =>
            item.id === id ? { ...item, quantity } : item,
          ),
    )

  // 1-Click Reorder Handler
  const handleReorder = (items: CartItem[]) => {
    if (!Array.isArray(items) || items.length === 0) return
    const current = repriceForReorder(items).filter((item) => !soldOutItems.has(item.name))
    if (current.length < items.length) {
      alert(
        current.length
          ? "Some items from this order are sold out or no longer on the menu, so they were skipped."
          : "None of the items from this order are available right now.",
      )
    }
    if (current.length === 0) return
    // Like "Buy it again" in most shops: add to the cart instead of replacing what's there
    setCart((existing) => {
      const merged = [...existing]
      for (const item of current) {
        const i = merged.findIndex((m) => m.id === item.id)
        if (i === -1) merged.push(item)
        else merged[i] = { ...merged[i], quantity: merged[i].quantity + item.quantity }
      }
      return merged
    })
    go("cart")
  }

  const handlePay = async (method: "upi" | "counter", utr?: string) => {
    if (isSubmitting) return
    if (!cart || cart.length === 0) {
      alert("Your cart is empty! Please add items before checking out.")
      go("home")
      return
    }
    if (!supabase) {
      alert("Ordering isn't available right now, so your order was not placed. If you already paid, please tap Support to reach us.")
      return
    }
    if (cart.some((item) => soldOutNote(item, soldOutItems))) {
      alert("Something in your cart just sold out, so the order wasn't placed. Please remove it and try again.")
      go("cart")
      return
    }
    setIsSubmitting(true)

    try {
      // The kitchen may have closed, sold something out, or put pickles on Preorder while this page was open
      const [{ data: status }, { data: stock }] = await Promise.all([
        supabase.from("store_status").select("*").eq("id", 1).maybeSingle(),
        supabase.from("menu_inventory").select("id, name, is_available"),
      ])
      const freshOpen = hostelsOpen(status)
      if (!isHostelOpen(freshOpen, details.hostel)) {
        setHostelOpen(freshOpen)
        alert(`${details.hostel} is closed right now, so your order wasn't placed. If you already paid, please message us in Support.`)
        return
      }
      if (stock) {
        const latest = soldOutNames(stock)
        setSoldOutItems(latest)
        if (cart.some((item) => soldOutNote(item, latest))) {
          alert("Something in your cart just sold out, so the order wasn't placed. Please remove it and try again.")
          go("cart")
          return
        }
      }
      const preorder = typeof status?.pickles_coming_soon === "boolean" ? status.pickles_coming_soon : picklesSoon
      setPicklesSoon(preorder)
      if (mixesPreorder(cart, preorder)) {
        alert("Fruit bowls and preordered pickles need separate orders, so the order wasn't placed.")
        go("cart")
        return
      }
      // Pickles ordered on Preorder say so on the order, so the kitchen sends them once they arrive
      const orderItems = preorder
        ? cart.map((item) => (item.kind === "pickle" ? { ...item, detail: `${item.detail}${PREORDER_TAG}` } : item))
        : cart

      const { subtotal, fee, total } = calculateOrderTotals(cart, fulfilment)
      const orderTotal = total

      const typedUtr = utr ? sanitizeInput(utr, 12).replace(/\D/g, "") : ""
      const cleanUtr = typedUtr.length === 12 ? typedUtr : ""
      const paymentLabel =
        method === "upi"
          ? cleanUtr
            ? `PhonePe UPI (UTR: ${cleanUtr})`
            : "PhonePe UPI"
          : fulfilment === "delivery"
            ? "Pay on Delivery"
            : "Pay at Counter"

      setPaymentMethodName(paymentLabel)

      // Generate a 4-digit pickup PIN for this order
      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
      setOrderPin(generatedPin)

      const cleanPhone = normalizePhone(details.phone) || "0000000000"
      const cleanName = sanitizeInput(details.name, 100) || "Student"
      const cleanHostel = fulfilment === "pickup" ? pickupPoint : sanitizeInput(details.hostel, 100)
      const cleanRoom = fulfilment === "pickup" ? "" : (sanitizeInput(details.room, 50) || "Room")

      if (supabase) {
        const payload: any = {
          customer_name: cleanName,
          customer_phone: cleanPhone,
          hostel: cleanHostel,
          room: cleanRoom,
          fulfilment,
          slot: orderSlot,
          items: orderItems,
          subtotal,
          delivery_fee: fee,
          total: orderTotal,
          payment_method: paymentLabel,
          status: "placed",
          pickup_code: generatedPin,
          payment_status: "pending",
        }

        let { data, error } = await supabase
          .from("orders")
          .insert(payload)
          .select("order_number")
          .single()

        // Fallback: If DB columns pickup_code or payment_status not yet added in Supabase (PGRST204, 42703, or schema cache notice)
        if (
          error &&
          (error.code === "PGRST204" ||
            error.code === "42703" ||
            error.message?.includes("schema cache") ||
            error.message?.includes("column"))
        ) {
          console.warn("Retrying order insert with core schema columns:", error.message)
          delete payload.pickup_code
          delete payload.payment_status
          const retry = await supabase
            .from("orders")
            .insert(payload)
            .select("order_number")
            .single()
          data = retry.data
          error = retry.error
          // The random PIN wasn't saved, so show the one tracking and the kitchen will work out
          if (data?.order_number) setOrderPin(getPickupPin({ order_number: data.order_number }))
        }

        if (error) {
          console.error("Supabase insert error:", error)
          alert("Could not place order: " + (error.message || "Please check connection and retry."))
          return
        }

        if (data?.order_number) {
          setOrderNumber(data.order_number)
          // Safe storage persistence (never throws on quota exceeded or security restriction)
          if (cleanPhone && cleanPhone !== "0000000000") {
            safeStorage.setItem("messmate_phone", cleanPhone)
          }
          if (cleanName && cleanName !== "Student") {
            safeStorage.setItem("messmate_customer_name", cleanName)
          }
          if (details.hostel) {
            safeStorage.setItem("messmate_hostel", details.hostel.trim())
          }
          if (details.room) {
            safeStorage.setItem(roomKey(details.hostel), details.room.trim())
          }
          // Clear cart so subsequent orders start fresh
          safeStorage.removeItem("ht_pay_method")
          safeStorage.removeItem("ht_pay_utr")
          setOrderedItems(orderItems)
          setPlaced({ fulfilment, slot: orderSlot, pickupPoint })
          setCart([])
          go("confirmation")
        }
      }
    } catch (err) {
      console.error("Failed to place order:", err)
      alert("Failed to place order. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <ResumeNotice />
        {/* Live Floating Alert Banner for Ready Orders */}
        {activeReadyOrder && (
          <div className="ready-order-alert-banner">
            <div className="alert-banner-content">
              <span className="alert-bell">
                <Icon name="bell" size={16} />
              </span>
              <div>
                {activeReadyOrder.fulfilment === "delivery" ? (
                  <>
                    <strong>Order #{activeReadyOrder.order_number} is on its way to your room!</strong>
                    <p>
                      Arriving at <u>{activeReadyOrder.hostel}, Room {activeReadyOrder.room}</u> · PIN: <b>{getPickupPin(activeReadyOrder)}</b>
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Order #{activeReadyOrder.order_number} is READY for Pickup!</strong>
                    {/* Fruit bowls near the mess, pickle orders (older ones too) at Room 104 or 210 */}
                    <p>
                      {pickupPointFor(activeReadyOrder.items) === MESS_PICKUP ? <u>{MESS_PICKUP}</u> : <>At <u>{ASIMA_PICKUP}</u></>} · PIN:{" "}
                      <b>{getPickupPin(activeReadyOrder)}</b>
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="alert-banner-actions">
              <button
                type="button"
                className="alert-track-btn"
                onClick={() => go("orders")}
              >
                Track
              </button>
              <button
                type="button"
                className="alert-dismiss-btn"
                onClick={() => {
                  setDismissedReadyIds((prev) => new Set([...prev, activeReadyOrder.id]))
                  setActiveReadyOrder(null)
                }}
                aria-label="Dismiss alert"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Live Floating Alert Banner for Cancelled Orders */}
        {activeCancelledOrder && (
          <div className="cancelled-order-alert-banner">
            <div className="alert-banner-content">
              <span className="alert-bell cancelled-bell" aria-hidden="true">
                !
              </span>
              <div>
                <strong>Order #{activeCancelledOrder.order_number} has been CANCELLED</strong>
                <p>
                  Kitchen cancelled this order · Tap Track to check details or talk to support
                </p>
              </div>
            </div>
            <div className="alert-banner-actions">
              <button
                type="button"
                className="alert-track-btn cancelled-track-btn"
                onClick={() => {
                  setDismissedCancelledIds((prev) => new Set([...prev, activeCancelledOrder.id]))
                  setActiveCancelledOrder(null)
                  go("orders")
                }}
              >
                Track
              </button>
              <button
                type="button"
                className="alert-dismiss-btn"
                onClick={() => {
                  setDismissedCancelledIds((prev) => new Set([...prev, activeCancelledOrder.id]))
                  setActiveCancelledOrder(null)
                }}
                aria-label="Dismiss alert"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        )}

        {screen === "home" && (
          <Home go={go} cartCount={cartCount} cartTotal={total} picklesSoon={picklesSoon} />
        )}
        {screen === "pickles" && (
          <PickleList
            go={go}
            cartCount={cartCount}
            soldOutItems={soldOutItems}
            preorder={picklesSoon}
            selectProduct={(name) => {
              setSelectedProduct(name)
              go("pickle-detail")
            }}
          />
        )}
        {screen === "pickle-detail" && (
          <PickleDetail
            go={go}
            productName={selectedProduct}
            add={add}
            cartCount={cartCount}
            isSoldOut={soldOutItems.has(selectedProduct)}
            preorder={picklesSoon}
          />
        )}
        {screen === "sweets" && <SweetsPage go={go} cartCount={cartCount} />}
        {screen === "fruit-builder" && (
          <FruitBuilder
            go={go}
            add={add}
            cartCount={cartCount}
            soldOutItems={soldOutItems}
          />
        )}
        {screen === "cart" && (
          <Cart
            items={cart}
            updateQuantity={updateQuantity}
            remove={(id) =>
              setCart((current) => current.filter((item) => item.id !== id))
            }
            go={go}
            soldOutItems={soldOutItems}
            storeOpen={storeOpen}
            preorder={picklesSoon}
          />
        )}
        {screen === "checkout" && (
          <Checkout
            go={go}
            details={details}
            setDetails={setDetails}
            fulfilment={fulfilment}
            pickupPoint={pickupPoint}
            items={cart}
            setAsimaDelivery={setAsimaDelivery}
            hostelOpen={hostelOpen}
          />
        )}
        {screen === "fulfilment" && (
          <Fulfilment
            go={go}
            fulfilment={fulfilment}
            details={details}
            slot={orderSlot}
            slots={slotOptions}
            setSlot={setSlot}
            pickupPoint={pickupPoint}
          />
        )}
        {screen === "payment" && (
          <Payment
            go={go}
            items={cart}
            fulfilment={fulfilment}
            onPay={handlePay}
            isSubmitting={isSubmitting}
            soldOutItems={soldOutItems}
            storeOpen={isHostelOpen(hostelOpen, details.hostel)}
            preorder={picklesSoon}
          />
        )}
        {screen === "confirmation" && (
          <Confirmation
            go={go}
            fulfilment={placed.fulfilment}
            details={details}
            slot={placed.slot}
            items={orderedItems}
            orderNumber={orderNumber}
            paymentMethod={paymentMethodName}
            pickupPoint={placed.pickupPoint}
            pickupPin={orderPin}
            isCancelled={activeCancelledOrder?.order_number === orderNumber}
          />
        )}
        {screen === "orders" && (
          <OrdersPage
            go={go}
            phone={details.phone}
            cartCount={cartCount}
            onReorder={handleReorder}
            picklesSoon={picklesSoon}
          />
        )}
        {cartCount > 0 &&
          ![
            "home",
            "cart",
            "pickle-detail",
            "fruit-builder",
            "checkout",
            "fulfilment",
            "payment",
            "confirmation",
            "orders",
          ].includes(screen) && (
            <CartFloat
              count={cartCount}
              total={total}
              onClick={() => go("cart")}
            />
          )}

        <SupportChatWidget
          customerPhone={details.phone}
          customerName={details.name}
          hostelOpen={hostelOpen}
          picklesSoon={picklesSoon}
        />
      </div>
    </div>
  )
}

