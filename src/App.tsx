import { useMemo, useState, useEffect, useRef, type ReactNode } from "react"

import { supabase } from "./lib/supabase"
import { DEFAULT_MENU_ITEMS, getPickupPin } from "./lib/inventory"
import { PHONEPE_QR_BASE64 } from "./assets/phonepeQrData"

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

type CartItem = {
  id: string
  name: string
  detail: string
  price: number
  quantity: number
  kind: "pickle" | "fruit"
}

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
  status: "placed" | "preparing" | "ready" | "delivered" | "cancelled"
  created_at: string
  pickup_code?: string
  payment_status?: "pending" | "verified" | "failed"
  rating?: number
  rating_feedback?: string
}

type IconName =
  | "arrow-left"
  | "arrow-right"
  | "bag"
  | "check"
  | "clock"
  | "close"
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

const pickleImage =
  "https://images.unsplash.com/photo-1601702538934-efffab67ab65?auto=format&fit=crop&w=1200&q=88"

const fruitImage =
  "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1200&q=88"

const lemonImage =
  "https://images.unsplash.com/photo-1576920803950-3f066b308938?auto=format&fit=crop&w=800&q=86"

const garlicImage =
  "https://images.unsplash.com/photo-1593329344473-6a9dfc15dc3d?auto=format&fit=crop&w=800&q=86"

const pickleProducts = [
  {
    name: "Andhra Mango Pickle",
    desc: "Bold, spicy & tangy",
    spice: "Hot",
    price: 10,
    image: pickleImage,
  },

  {
    name: "Gongura Pickle",
    desc: "Authentic South Indian tang",
    spice: "Medium",
    price: 15,
    image: garlicImage,
  },

  {
    name: "Lemon Pickle",
    desc: "Zesty, spicy & homemade",
    spice: "Medium",
    price: 10,
    image: lemonImage,
  },

  {
    name: "Garlic Pickle",
    desc: "Rich, bold & flavourful",
    spice: "Mild",
    price: 15,
    image: garlicImage,
  },
]

const packOptions = [
  {
    label: "Trial Pack",
    note: "Try it. You might never look back.",
    price: 20,
  },

  { label: "50g", note: "Just enough to start a new habit.", price: 35 },

  { label: "100g", note: "The everyday favourite.", price: 60 },

  { label: "200g", note: "For serious pickle lovers.", price: 110 },
]

const fruits = [
  { name: "Apple", color: "#D9644A", emoji: "A" },

  { name: "Banana", color: "#D9A441", emoji: "B" },

  { name: "Papaya", color: "#F4A261", emoji: "P" },

  { name: "Watermelon", color: "#E76F51", emoji: "W" },

  { name: "Pomegranate", color: "#B94A42", emoji: "P" },

  { name: "Orange", color: "#E99645", emoji: "O" },

  { name: "Guava", color: "#7A9A55", emoji: "G" },

  { name: "Grapes", color: "#76608A", emoji: "G" },

  { name: "Pineapple", color: "#D9A441", emoji: "P" },

  { name: "Seasonal", color: "#4F8A5B", emoji: "S" },
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
      aria-label="MessMate home"
    >
      <span className="brand-mark">
        <Icon name="leaf" size={18} />
      </span>
      <span>MESSMATE</span>
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
          <span>MESSMATE</span>
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
              aria-label={`Cart with ${cartCount} items`}
            >
              <Icon name="bag" />
              {cartCount > 0 && <span>{cartCount}</span>}
            </button>
            <button
              className="desktop-cart-pill desktop-only-inline-flex"
              onClick={onCart}
              aria-label={`Cart with ${cartCount} items`}
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
}: {
  value: number
  onChange: (value: number) => void
  small?: boolean
}) {
  return (
    <div className={`quantity ${small ? "small" : ""}`}>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Decrease quantity"
      >
        <Icon name="minus" size={16} />
      </button>
      <span>{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
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

function CategoryCard({
  type,
  title,
  punchline,
  line,
  image,
  labels,
  cta,
  onClick,
}: {
  type: "pickle" | "fruit"
  title: string
  punchline: string
  line: string
  image: string
  labels: string[]
  cta: string
  onClick: () => void
}) {
  return (
    <article className={`category-card ${type}`} onClick={onClick} style={{ cursor: "pointer" }}>
      <div className="category-image">
        <img
          src={image}
          alt={
            type === "pickle"
              ? "Homemade pickle in a bowl"
              : "Fresh mixed fruit bowl"
          }
        />
        <span className="category-number">
          {type === "pickle" ? "01" : "02"}
        </span>
      </div>
      <div className="category-content">
        <div className="eyebrow">
          {type === "pickle" ? "Mess meal upgrade" : "Made fresh for you"}
        </div>
        <h2>{title}</h2>
        <p className="punchline">{punchline}</p>
        <p className="muted">{line}</p>
        <div className="tag-row">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <span className="text-cta">
          {cta}
          <span>
            <Icon name="arrow-right" size={16} />
          </span>
        </span>
      </div>
    </article>
  )
}

function Home({
  go,
  cartCount,
  cartTotal,
}: {
  go: (screen: Screen) => void
  cartCount: number
  cartTotal: number
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
              <span></span>Made for campus life
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
                <span>Order Homemade Pickles</span>
                <Icon name="arrow-right" size={18} />
              </button>
              <button
                className="hero-secondary-btn"
                onClick={() => go("fruit-builder")}
              >
                <span>Build Fresh Fruit Bowl</span>
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
                  Instant upgrade for bland mess food. Delivered directly to your
                  room or ready at the hostel entrance.
                </p>
                <div className="feature-stats">
                  <div className="stat-item">
                    <strong>Fresh</strong>
                    <small>Small batch</small>
                  </div>
                  <div className="stat-item">
                    <strong>₹7</strong>
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
            cta="Explore pickles"
            onClick={() => go("pickles")}
          />
          <CategoryCard
            type="fruit"
            title="Fresh Fruit Bowls"
            punchline="Skip the junk, not the meal."
            line="Fresh, customizable & made your way."
            image={fruitImage}
            labels={["Fresh", "Customizable", "Made to order"]}
            cta="Build your bowl"
            onClick={() => go("fruit-builder")}
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

function PickleList({
  go,
  selectProduct,
  cartCount,
  soldOutItems,
}: {
  go: (screen: Screen) => void
  selectProduct: (name: string) => void
  cartCount: number
  soldOutItems?: Set<string>
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
                  <img src={product.image} alt={product.name} />
                  {isSoldOut && <span className="sold-out-chip">SOLD OUT</span>}
                </div>
                <div className="product-info">
                  <div className="spice">
                    <span></span>
                    {product.spice} spice
                  </div>
                  <h3>{product.name}</h3>
                  <p>{product.desc}</p>
                  <div className="product-bottom">
                    <div>
                      <small>{isSoldOut ? "Status" : "Starts at"}</small>
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
}: {
  go: (screen: Screen) => void
  productName: string
  add: (item: CartItem) => void
  cartCount?: number
  isSoldOut?: boolean
}) {
  const [selected, setSelected] = useState(0)

  const pack = packOptions[selected]

  const handleAdd = () => {
    if (isSoldOut) return
    add({
      id: `pickle-${pack.label}`,
      name: productName,
      detail: pack.label,
      price: pack.price,
      quantity: 1,
      kind: "pickle",
    })
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
              <img src={pickleImage} alt={productName} />
              <span className="image-badge">
                <Icon name="heart" size={16} /> Student favourite
              </span>
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
            <div className="eyebrow">Homemade · Andhra style</div>
            <h1>
              {productName === "Andhra Mango Pickle"
                ? "Authentic Andhra Mango Pickle"
                : productName}
            </h1>
            <p>
              Homemade in small batches. Bold South Indian flavour, made to rescue
              even the most boring mess meal.
            </p>
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
                <h2>Choose your pack</h2>
                <p>Start small. Come back for more.</p>
              </div>
            </div>
            <div className="option-list">
              {packOptions.map((option, index) => (
                <button
                  className={`pack-option ${
                    selected === index ? "selected" : ""
                  }`}
                  onClick={() => setSelected(index)}
                  key={option.label}
                >
                  <span className="radio">{selected === index && <span />}</span>
                  <span className="pack-copy">
                    <strong>{option.label}</strong>
                    <small>{option.note}</small>
                  </span>
                  <strong>₹{option.price}</strong>
                </button>
              ))}
            </div>
            <div className="desktop-pack-cta">
              <div className="desktop-pack-price-row">
                <div>
                  <small>Selected pack</small>
                  <strong>{pack.label} (₹{pack.price})</strong>
                </div>
                <div
                  className="desktop-pack-tag"
                  style={isSoldOut ? { color: "#d90429", background: "#fee2e2" } : {}}
                >
                  {isSoldOut ? "Temporarily Sold Out" : "In stock today"}
                </div>
              </div>
              <PrimaryButton tone="pickle" onClick={handleAdd} disabled={isSoldOut}>
                {isSoldOut ? "Currently Sold Out" : "Add to cart"}
              </PrimaryButton>
            </div>
          </section>
        </div>
      </main>
      <BottomBar>
        <div className="dock-price">
          <small>Selected pack</small>
          <strong>₹{pack.price}</strong>
        </div>
        <PrimaryButton tone="pickle" onClick={handleAdd} disabled={isSoldOut}>
          {isSoldOut ? "Currently Sold Out" : "Add to cart"}
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
  const [counts, setCounts] = useState<Record<string, number>>({
    Apple: 1,
    Banana: 1,
    Papaya: 1,
    Watermelon: 1,
    Pomegranate: 1,
  })

  const selectedCount = Object.values(counts).filter(Boolean).length

  const totalPortions = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  )

  const price = 35 + totalPortions * 7

  const update = (name: string, value: number) =>
    setCounts((current) => ({ ...current, [name]: value }))

  const handleAdd = () => {
    add({
      id: "fruit-bowl",
      name: "Custom Fruit Bowl",
      detail: `${selectedCount} fruits · ${
        totalPortions > 6 ? "450–550g" : "350–450g"
      }`,
      price,
      quantity: 1,
      kind: "fruit",
    })
  }

  return (
    <>
      <Header
        title="Build Your Bowl"
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
                <div className="eyebrow">Freshly cut · Made to order</div>
                <h1>
                  Pick your fruits.
                  <br />
                  <em>Build your bowl.</em>
                </h1>
                <p>Your bowl, your fruits, your choice.</p>
              </div>
              <div className="bowl-thumb">
                <img src={fruitImage} alt="Fresh mixed fruit bowl" />
              </div>
            </section>
            <div className="builder-note">
              <Icon name="leaf" size={18} />
              <span>We've started you with our favourite mix. Make it yours.</span>
            </div>
            <div className="fruit-grid">
              {fruits.map((fruit) => {
                const count = counts[fruit.name] || 0
                const isSoldOut =
                  soldOutItems?.has(fruit.name) ||
                  soldOutItems?.has(`Fresh ${fruit.name}`) ||
                  soldOutItems?.has(`Sweet ${fruit.name}`) ||
                  soldOutItems?.has(`Crisp ${fruit.name}`) ||
                  soldOutItems?.has(`Robusta ${fruit.name}`) ||
                  (fruit.name === "Pomegranate" && soldOutItems?.has("Pomegranate Pearls")) ||
                  (fruit.name === "Orange" && soldOutItems?.has("Nagpur Orange")) ||
                  (fruit.name === "Guava" && soldOutItems?.has("Pink Guava")) ||
                  (fruit.name === "Grapes" && soldOutItems?.has("Black Grapes")) ||
                  (fruit.name === "Pineapple" && soldOutItems?.has("Queen Pineapple")) ||
                  (fruit.name === "Seasonal" && soldOutItems?.has("Seasonal Special"))

                return (
                  <article
                    className={`fruit-card ${isSoldOut ? "sold-out" : ""} ${count ? "selected" : ""}`}
                    key={fruit.name}
                  >
                    <div
                      className="fruit-orb"
                      style={{ backgroundColor: fruit.color }}
                    >
                      {fruit.emoji}
                    </div>
                    <div className="fruit-meta">
                      <strong>{fruit.name}</strong>
                      <small className={isSoldOut ? "sold-out-text" : ""}>
                        {isSoldOut
                          ? "Sold out"
                          : count
                            ? `${count} portion${count > 1 ? "s" : ""}`
                            : "Tap + to add"}
                      </small>
                    </div>
                    {!isSoldOut ? (
                      <Quantity
                        value={count}
                        onChange={(value) => update(fruit.name, value)}
                        small
                      />
                    ) : (
                      <span style={{ fontSize: "10px", color: "#d90429", fontWeight: 700 }}>Out of Stock</span>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
          <div className="builder-right-col">
            <div className="bowl-summary">
              <div className="summary-top">
                <div>
                  <small>YOUR BOWL</small>
                  <strong>{selectedCount} fruits selected</strong>
                </div>
                <span>
                  <Icon name="check" size={16} />
                </span>
              </div>
              <div className="summary-row">
                <span>Total Portions</span>
                <strong>{totalPortions} portions</strong>
              </div>
              <div className="summary-row">
                <span>Approx. weight</span>
                <strong>{totalPortions > 6 ? "450–550g" : "350–450g"}</strong>
              </div>
              <div className="summary-row">
                <span>Base bowl</span>
                <strong>₹35</strong>
              </div>
              <div className="summary-row">
                <span>Portions ({totalPortions} × ₹7)</span>
                <strong>₹{totalPortions * 7}</strong>
              </div>
              <div className="summary-row" style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.2)", fontSize: 13 }}>
                <span>Estimated total</span>
                <strong>₹{price}</strong>
              </div>
              <div className="desktop-builder-cta">
                <PrimaryButton
                  tone="fruit"
                  disabled={!selectedCount}
                  onClick={handleAdd}
                >
                  Add bowl to cart (₹{price})
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </main>
      <BottomBar>
        <div className="dock-price">
          <small>{selectedCount} fruits</small>
          <strong>₹{price}</strong>
        </div>
        <PrimaryButton
          tone="fruit"
          disabled={!selectedCount}
          onClick={handleAdd}
        >
          Add bowl to cart
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
}: {
  items: CartItem[]
  updateQuantity: (id: string, quantity: number) => void
  remove: (id: string) => void
  go: (screen: Screen) => void
}) {
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
          <div className="eyebrow">Almost there</div>
          <h1>
            Your order is
            <br />
            <em>looking good.</em>
          </h1>
        </section>
        {items.length ? (
          <div className="cart-layout">
            <div className="cart-left-col">
              <div className="cart-list">
                {items.map((item) => (
                  <article className="cart-card" key={item.id}>
                    <img
                      src={item.kind === "pickle" ? pickleImage : fruitImage}
                      alt=""
                    />
                    <div className="cart-item-copy">
                      <span className={`item-kind ${item.kind}`}>
                        {item.kind === "pickle"
                          ? "Homemade pickle"
                          : "Fresh bowl"}
                      </span>
                      <h3>{item.name}</h3>
                      <p>{item.detail}</p>
                      <div className="cart-controls">
                        <Quantity
                          value={item.quantity}
                          onChange={(quantity) =>
                            updateQuantity(item.id, quantity)
                          }
                          small
                        />
                        <strong>₹{item.price * item.quantity}</strong>
                      </div>
                    </div>
                    <button
                      className="remove"
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Icon name="close" size={17} />
                    </button>
                  </article>
                ))}
              </div>
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
                  <PrimaryButton onClick={() => go("checkout")}>
                    Go to checkout
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
          <PrimaryButton onClick={() => go("checkout")}>
            Go to checkout
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
  maxLength,
  hint,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  type?: string
  maxLength?: number
  hint?: string
}) {
  return (
    <label className="field">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 500 }}>{hint}</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    </label>
  )
}

function Checkout({
  go,
  details,
  setDetails,
  fulfilment,
  setFulfilment,
  pickupPoint,
}: {
  go: (screen: Screen) => void
  details: CustomerDetails
  setDetails: (value: CustomerDetails) => void
  fulfilment: "pickup" | "delivery"
  setFulfilment: (value: "pickup" | "delivery") => void
  pickupPoint: string
}) {
  const set = (key: keyof CustomerDetails, value: string) =>
    setDetails({ ...details, [key]: value })

  const cleanPhone = details.phone.replace(/\D/g, "")
  const isPhoneValid = cleanPhone.length === 10
  const isComplete = Boolean(
    details.name.trim() &&
    isPhoneValid &&
    details.hostel.trim() &&
    details.room.trim()
  )

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
                  value={details.name}
                  onChange={(v) => set("name", v)}
                />
                <Field
                  label="Phone number"
                  placeholder="10-digit mobile number"
                  type="tel"
                  maxLength={10}
                  hint={details.phone ? `${cleanPhone.length}/10 digits` : "10 digits required"}
                  value={details.phone}
                  onChange={(v) => {
                    const digits = v.replace(/\D/g, "").slice(0, 10)
                    set("phone", digits)
                  }}
                />
                <Field
                  label="Hostel"
                  placeholder="e.g. Hostel 3"
                  value={details.hostel}
                  onChange={(v) => set("hostel", v)}
                />
                <Field
                  label="Room number"
                  placeholder="e.g. 214"
                  value={details.room}
                  onChange={(v) => set("room", v)}
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
                  <div className="eyebrow">Choose one</div>
                  <h2>How would you like it?</h2>
                </div>
              </div>
              <button
                className={`fulfilment-card ${
                  fulfilment === "pickup" ? "selected" : ""
                }`}
                onClick={() => setFulfilment("pickup")}
              >
                <span className="fulfilment-icon">
                  <Icon name="location" />
                </span>
                <span>
                  <strong>Campus pickup</strong>
                  <small>Pick it up, nice and easy.</small>
                  <em>FREE · 8:30–9:00 PM</em>
                </span>
                <span className="radio">{fulfilment === "pickup" && <span />}</span>
              </button>
              <button
                className={`fulfilment-card ${
                  fulfilment === "delivery" ? "selected" : ""
                }`}
                onClick={() => setFulfilment("delivery")}
              >
                <span className="fulfilment-icon">
                  <Icon name="bag" />
                </span>
                <span>
                  <strong>Room delivery</strong>
                  <small>Right to your hostel room.</small>
                  <em>+₹7 delivery fee</em>
                </span>
                <span className="radio">
                  {fulfilment === "delivery" && <span />}
                </span>
              </button>
            </section>
          </div>
          <div className="checkout-right-col">
            <div className="desktop-step-summary-card">
              <h3>Fulfilment Preference</h3>
              <div className="selected-delivery-preview">
                <strong>
                  {fulfilment === "pickup"
                    ? "Hostel Pickup (Free)"
                    : "Room Delivery (+₹7)"}
                </strong>
                <p>
                  {fulfilment === "pickup"
                    ? pickupPoint
                    : details.hostel && details.room
                      ? `${details.hostel}, Room ${details.room}`
                      : "Direct to your hostel room door"}
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
              {!isComplete && (
                <div className="validation-hint">
                  {!isPhoneValid && details.phone
                    ? "Please enter a valid 10-digit mobile number"
                    : "Please fill in all contact fields to continue"}
                </div>
              )}
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
  setSlot,
  pickupPoint,
  setPickupPoint,
}: {
  go: (screen: Screen) => void
  fulfilment: "pickup" | "delivery"
  details: CustomerDetails
  slot: string
  setSlot: (value: string) => void
  pickupPoint: string
  setPickupPoint: (value: string) => void
}) {
  const slots = ["8:00–8:30 PM", "8:30–9:00 PM", "9:00–9:30 PM"]

  const pickupPoints = [
    { name: "Hostel 3 Entrance", desc: "Next to the main security desk" },
    { name: "Kalam Room-341", desc: "Inside APJ Abdul Kalam Block" },
    { name: "Asima - 110", desc: "Asima Hostel Ground Floor" }
  ]
  const selectedPoint = pickupPoints.find(p => p.name === pickupPoint) || pickupPoints[0]

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
              ? "Meet you on campus."
              : "Coming to your door."}
          </h1>
          <p>
            {fulfilment === "pickup"
              ? "Choose a pickup point and time that works for you."
              : "Fresh food, straight to your room."}
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
                      <strong>{selectedPoint.name}</strong>
                      <p>{selectedPoint.desc}</p>
                    </div>
                  </div>
                </div>
                <div className="availability">
                  <span></span>Pickup available today
                </div>
                <div className="time-section" style={{ marginBottom: "24px" }}>
                  <h2>Choose a pickup point</h2>
                  <div className="slot-list">
                    {pickupPoints.map((pt) => (
                      <button
                        key={pt.name}
                        className={pickupPoint === pt.name ? "selected" : ""}
                        onClick={() => setPickupPoint(pt.name)}
                      >
                        <Icon name="location" size={18} />
                        {pt.name}
                        <span className="radio">{pickupPoint === pt.name && <span />}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="time-section">
                  <h2>Choose a pickup time</h2>
                  <div className="slot-list">
                    {slots.map((item) => (
                      <button
                        key={item}
                        className={slot === item ? "selected" : ""}
                        onClick={() => setSlot(item)}
                      >
                        <Icon name="clock" size={18} />
                        {item}
                        <span className="radio">{slot === item && <span />}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="delivery-card">
                <span className="big-icon">
                  <Icon name="bag" size={30} />
                </span>
                <div className="eyebrow">Room delivery · ₹7</div>
                <h2>
                  {details.hostel}, Room {details.room}
                </h2>
                <p>
                  We'll call you when your order is outside. Estimated arrival:
                  8:30–9:00 PM.
                </p>
                <button onClick={() => go("checkout")}>
                  <Icon name="edit" size={16} /> Edit room details
                </button>
              </div>
            )}
          </div>
          <div className="fulfilment-right-col">
            <div className="desktop-step-summary-card">
              <h3>Fulfilment Schedule</h3>
              <div className="selected-delivery-preview">
                <strong>
                  {fulfilment === "pickup"
                    ? `Pickup Window: ${slot}`
                    : "Room Delivery (8:30–9:00 PM)"}
                </strong>
                <p>Contact: {details.name} ({details.phone})</p>
              </div>
              <div className="desktop-fulfilment-cta">
                <PrimaryButton onClick={() => go("payment")}>
                  Review & pay
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </main>
      <BottomBar>
        <PrimaryButton onClick={() => go("payment")}>
          Review & pay
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
}: {
  go: (screen: Screen) => void
  items: CartItem[]
  fulfilment: "pickup" | "delivery"
  onPay: (method: "upi" | "counter", utr?: string) => void
  isSubmitting: boolean
}) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )

  const fee = fulfilment === "delivery" ? 7 : 0
  const total = subtotal + fee

  const [method, setMethod] = useState<"upi" | "counter">("upi")
  const [utr, setUtr] = useState("")
  const [copiedUpi, setCopiedUpi] = useState(false)

  const merchantUpiId = "Q477490796@ybl"
  const merchantName = "MessMate"
  const upiIntentUri = `upi://pay?pa=${merchantUpiId}&pn=MessMate&am=${total}&cu=INR&tn=MessMate%20Food%20Order`

  const handleCopyUpi = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(merchantUpiId)
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 2200)
    }
  }

  const handleSubmit = () => {
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
          <h1>Complete Your Payment</h1>
          <p>Scan & pay via merchant PhonePe QR or pay at counter.</p>
        </section>
        <div className="payment-layout">
          <div className="payment-left-col">
            <section className="payment-methods">
              <h2>Select Payment Method</h2>
              <button
                type="button"
                className={method === "upi" ? "selected" : ""}
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
              <button
                type="button"
                className={method === "counter" ? "selected" : ""}
                onClick={() => setMethod("counter")}
              >
                <span className="card-mark">
                  <Icon name="receipt" size={18} />
                </span>
                <span>
                  <strong>Pay at Counter</strong>
                  <small>Cash or soundbox scan upon pickup</small>
                </span>
                <span className="radio">{method === "counter" && <span />}</span>
              </button>
            </section>

            {method === "upi" ? (
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
                    src={PHONEPE_QR_BASE64}
                    alt="PhonePe QR Code - MessMate"
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
                    <span className="optional-badge">Recommended</span>
                  </label>
                  <input
                    id="utr-field"
                    type="text"
                    className="utr-input"
                    maxLength={16}
                    placeholder="e.g. 409128381920 (from PhonePe receipt)"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value.replace(/[^0-9a-zA-Z]/g, ""))}
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
                  <strong>Pay ₹{total} at the Counter</strong>
                  <p>You can pay via cash or scan our countertop soundbox QR at the pickup table.</p>
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
                    <small>{item.detail}</small>
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
                  <span>Delivery</span>
                  <strong>{fee ? `₹${fee}` : "Free"}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>₹{total}</strong>
                </div>
              </div>
              <div className="desktop-payment-cta">
                <PrimaryButton disabled={isSubmitting} onClick={handleSubmit}>
                  {isSubmitting
                    ? "Placing order..."
                    : method === "upi"
                    ? `I've Paid ₹${total} — Place Order`
                    : `Place Order (Pay ₹${total} at Counter)`}
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
        <PrimaryButton disabled={isSubmitting} onClick={handleSubmit}>
          {isSubmitting
            ? "Placing order..."
            : method === "upi"
            ? `I've Paid ₹${total} — Place Order`
            : `Place Order (Pay ₹${total})`}
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
}) {
  const displayPin = pickupPin || getPickupPin({ order_number: orderNumber })

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
        <div className="eyebrow">Order confirmed · #{orderNumber}</div>
        <h1>You're all set!</h1>
        <p>Good food is on the way. We'll take it from here.</p>
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
            <div>
              <Icon name="clock" size={18} />
              <span>
                <small>
                  {fulfilment === "pickup" ? "Pickup time" : "Estimated arrival"}
                </small>
                <strong>{slot}</strong>
              </span>
            </div>
            <div>
              <Icon name="bag" size={18} />
              <span>
                <small>Your order</small>
                <strong>
                  {items.reduce((sum, item) => sum + item.quantity, 0)} items
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
              <small>YOUR 4-DIGIT PICKUP PIN</small>
              <strong className="pin-digit-display">{displayPin}</strong>
              <span>
                {fulfilment === "pickup"
                  ? "Recite this PIN at the campus pickup table to collect your meal securely."
                  : "Share this PIN with your delivery runner upon room handover."}
              </span>
            </div>
          </div>
        </section>
        <div className="sms-note">
          <Icon name="shield" size={18} />
          <span>
            We'll send order details and live updates to{" "}
            <strong>{details.phone.replace(/\D/g, "").slice(-10)}</strong>.
          </span>
        </div>
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
    setIsSending(true)
    const trimmed = feedback.trim()

    // 1. Cache rating locally
    try {
      localStorage.setItem(
        `messmate_order_rating_${orderId}`,
        JSON.stringify({ rating, feedback: trimmed })
      )
    } catch {}

    // 2. Broadcast across Realtime channel so Admin receives it instantly
    if (supabase) {
      try {
        const bc = supabase.channel("messmate_support_broadcast")
        bc.send({
          type: "broadcast",
          event: "order_rating",
          payload: { orderId, rating, feedback: trimmed },
        })
      } catch (err) {
        console.warn("Rating broadcast notice:", err)
      }

      // 3. Save to Supabase DB table if column exists
      try {
        await supabase
          .from("orders")
          .update({ rating, rating_feedback: trimmed })
          .eq("id", orderId)
      } catch (err) {
        console.warn("Rating save notice (run SQL migration to persist in database):", err)
      }
    }

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
              style={{ color: isFilled ? "#f59e0b" : "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: "2px" }}
            >
              <Icon
                name="star"
                size={20}
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
            placeholder="Optional: How was the taste, packaging, or delivery?"
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
  setPhone,
  cartCount,
  onReorder,
}: {
  go: (screen: Screen) => void
  phone: string
  setPhone: (phone: string) => void
  cartCount: number
  onReorder: (items: CartItem[]) => void
}) {
  const [searchInput, setSearchInput] = useState(() => {
    return phone || localStorage.getItem("messmate_phone") || ""
  })
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const loadOrders = async (targetPhone?: string) => {
    if (!supabase) return
    setIsLoading(true)
    setMessage(null)
    try {
      const q = (targetPhone !== undefined ? targetPhone : searchInput).trim()
      if (!q) {
        setOrders([])
        setIsLoading(false)
        return
      }
      let query = supabase.from("orders").select("*")

      if (/^\d{1,4}$/.test(q)) {
        query = query.or(`order_number.eq.${parseInt(q)},customer_phone.eq.${q}`)
      } else {
        query = query.eq("customer_phone", q)
      }

      const { data, error } = await query.order("order_number", {
        ascending: false,
      })

      if (error) {
        setMessage(error.message)
      } else {
        setOrders(data as OrderRecord[])
        localStorage.setItem("messmate_phone", q)
        setPhone(q)
      }
    } catch {
      setMessage("Could not retrieve orders at this time.")
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
            setOrders((prev) => [payload.new as OrderRecord, ...prev])
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
              maxLength={10}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
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
        ) : orders.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 24 }}>
            <span>
              <Icon name="receipt" size={28} />
            </span>
            <h2>No orders found</h2>
            <p>
              {searchInput
                ? `No orders found for "${searchInput}". Please check the phone number and try again.`
                : "Enter your phone number above to see active deliveries and past orders."}
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
                    </span>
                  </div>

                  {/* Live Tracker Stepper */}
                  <div className="tracker-timeline">
                    <div className="tracker-steps">
                      {steps.map((step, idx) => {
                        const isDone = idx < currentStep
                        const isActive = idx === currentStep
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
                          {order.fulfilment === "pickup"
                            ? `${order.hostel} Pickup Point`
                            : `${order.hostel}, Room ${order.room}`}
                        </strong>
                        <div
                          style={{
                            color: "var(--muted)",
                            fontSize: "8px",
                            marginTop: "2px",
                          }}
                        >
                          Slot: {order.slot} · Contact: {order.customer_name} (
                          {order.customer_phone?.replace(/\D/g, "").slice(-10) || order.customer_phone})
                        </div>
                      </div>
                    </div>
                  </div>

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
                    <div className="totals">
                      <div>
                        <span>Subtotal</span>
                        <strong>₹{order.subtotal}</strong>
                      </div>
                      <div>
                        <span>Delivery</span>
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
                          {order.payment_status === "verified" || order.payment_method?.includes("[VERIFIED]") ? (
                            <span className="pay-verify-badge success">Payment Verified</span>
                          ) : order.payment_status === "failed" || order.payment_method?.includes("[FAILED]") ? (
                            <span className="pay-verify-badge danger">Verification Issue</span>
                          ) : order.payment_method?.includes("PhonePe") || order.payment_method?.toLowerCase().includes("upi") ? (
                            <span className="pay-verify-badge pending">UTR Under Verification</span>
                          ) : (
                            <span className="pay-verify-badge neutral">Pay at Counter</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span>Total Paid</span>
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

type SupportMsg = {
  id: string
  phone: string
  customer_name: string
  sender: "customer" | "support" | "bot"
  message: string
  created_at: string
}

const FAQ_ITEMS = [
  {
    id: "pickup_pin",
    label: "Where is my 4-digit PIN?",
    question: "Where do I find my 4-digit Pickup PIN?",
    answer:
      "Your unique 4-digit Pickup PIN is displayed on your Order Confirmation screen and in the 'Track Orders' tab. Recite this PIN at the campus pickup counter to verify and collect your food!",
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
      "Deliveries & pickups happen every evening between 8:00 PM and 9:30 PM. Campus pickup at Hostel 3 Entrance (or your selected counter) is free, and room delivery is ₹7.",
  },
  {
    id: "pickup",
    label: "Where is pickup point?",
    question: "Where is the pickup point located?",
    answer:
      "Our primary campus pickup point is at Hostel 3 Entrance beside the security desk. We also offer pickup at APJ Abdul Kalam Block (Room 341) and Asima Hostel Ground Floor!",
  },
  {
    id: "sold_out",
    label: "Sold out items",
    question: "What if an item is marked Sold Out?",
    answer:
      "To ensure maximum freshness, our kitchen marks items 'Sold Out' as soon as daily batches run out. They are replenished every morning for the next evening dinner slot!",
  },
  {
    id: "fruit",
    label: "Fruit bowl customization",
    question: "How does the fruit bowl builder work?",
    answer:
      "Start with a fresh base bowl for ₹35, then choose any combination from 10 fruits for ₹7 per portion! Generous, fresh-cut fruit bowls made right before evening pickup.",
  },
  {
    id: "pickle",
    label: "Pickle shelf life & storage",
    question: "How long do the pickles stay fresh?",
    answer:
      "Our homemade Andhra pickles are crafted in small batches with cold-pressed oil and authentic spices. They stay fresh for 3–6 months in a dry, room-temperature spot.",
  },
]

function getAutomatedAnswer(query: string): string {
  const q = query.toLowerCase()
  if (q.includes("pin") || q.includes("code") || q.includes("pickup code") || q.includes("verification code")) {
    return "Your unique 4-digit Pickup PIN is on your Order Confirmation screen and in 'Track Orders'. Show it to the counter staff to collect your order!"
  }
  if (q.includes("utr") || q.includes("verify") || q.includes("verification") || q.includes("fraud") || q.includes("phonepe") || q.includes("upi")) {
    return "After paying via PhonePe QR, submit your 12-digit UTR number. The kitchen staff verifies it on their merchant soundbox and marks it 'Verified'!"
  }
  if (q.includes("reorder") || q.includes("again") || q.includes("repeat") || q.includes("previous")) {
    return "In 'Track Orders', click the 'Reorder This Meal' button on any past order to refill your cart instantly!"
  }
  if (q.includes("rate") || q.includes("rating") || q.includes("review") || q.includes("feedback") || q.includes("stars")) {
    return "After your order is marked Delivered, you can leave a 1 to 5 star rating and feedback note directly in 'Track Orders'!"
  }
  if (q.includes("sold out") || q.includes("stock") || q.includes("unavailable") || q.includes("out of stock")) {
    return "Items that run out in the kitchen are marked 'Sold Out' in real-time. Fresh batches are prepared every morning for dinner delivery!"
  }
  if (
    q.includes("delivery") ||
    q.includes("timing") ||
    q.includes("time") ||
    q.includes("when") ||
    q.includes("slot")
  ) {
    return "Deliveries & pickups happen every evening between 8:00 PM and 9:30 PM. Room delivery is ₹7, and campus pickup is free!"
  }
  if (
    q.includes("pickup") ||
    q.includes("where") ||
    q.includes("hostel 3") ||
    q.includes("point") ||
    q.includes("location")
  ) {
    return "Pickups are available at Hostel 3 Entrance, APJ Abdul Kalam Block (Room 341), and Asima Hostel. Select your preferred station during checkout!"
  }
  if (
    q.includes("fruit") ||
    q.includes("bowl") ||
    q.includes("price") ||
    q.includes("cost") ||
    q.includes("portion")
  ) {
    return "Custom fruit bowls are ₹35 base + ₹7 per portion. Choose from 10 fresh fruits including Apple, Banana, Papaya, Watermelon, and Pomegranate."
  }
  if (
    q.includes("pickle") ||
    q.includes("shelf") ||
    q.includes("mango") ||
    q.includes("gongura") ||
    q.includes("garlic") ||
    q.includes("lemon") ||
    q.includes("expiry")
  ) {
    return "Our South Indian homemade pickles last 3–6 months at room temperature. Made small-batch with cold-pressed oils."
  }
  if (q.includes("track") || q.includes("status") || q.includes("where is")) {
    return "Go to 'Track Orders' in the menu and enter your phone number to track live order progress from kitchen to delivery!"
  }
  if (q.includes("cancel") || q.includes("refund") || q.includes("change")) {
    return "Orders can be modified before prep starts. Please click 'Request Live Chat Support' below so our team can update your order right away!"
  }
  return "Thanks for asking! For order-specific requests or anything else, click 'Request Live Chat Support' below to speak directly with our team."
}

function mergeSupportMessages(
  existing: SupportMsg[],
  incomingList: SupportMsg[]
): SupportMsg[] {
  let result = [...existing]

  for (const incoming of incomingList) {
    if (!incoming || !incoming.message) continue

    // 1. Direct ID match
    const exactIndex = result.findIndex((m) => m.id === incoming.id)
    if (exactIndex !== -1) {
      result[exactIndex] = { ...result[exactIndex], ...incoming }
      continue
    }

    // 2. Fuzzy match for optimistic local messages vs canonical server messages
    const fuzzyIndex = result.findIndex((m) => {
      const sameSender = m.sender === incoming.sender
      const p1 = (m.phone || "").replace(/\D/g, "").slice(-10)
      const p2 = (incoming.phone || "").replace(/\D/g, "").slice(-10)
      const samePhone = !p1 || !p2 || p1 === p2
      const sameText = m.message.trim() === incoming.message.trim()
      const t1 = new Date(m.created_at).getTime()
      const t2 = new Date(incoming.created_at).getTime()
      const sameTimeWindow = isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 90000

      return sameSender && samePhone && sameText && sameTimeWindow
    })

    if (fuzzyIndex !== -1) {
      const existingMsg = result[fuzzyIndex]
      const incomingIsCanonical =
        !incoming.id.startsWith("msg-") &&
        !incoming.id.startsWith("local-") &&
        !incoming.id.startsWith("admin-")
      result[fuzzyIndex] = incomingIsCanonical ? incoming : existingMsg
    } else {
      result.push(incoming)
    }
  }

  // Deduplicate any repeated messages with identical content in close proximity
  const deduped: SupportMsg[] = []
  for (const msg of result) {
    const isDup = deduped.some((d) => {
      if (d.id === msg.id) return true
      const sameSender = d.sender === msg.sender
      const p1 = (d.phone || "").replace(/\D/g, "").slice(-10)
      const p2 = (msg.phone || "").replace(/\D/g, "").slice(-10)
      const samePhone = !p1 || !p2 || p1 === p2
      const sameText = d.message.trim() === msg.message.trim()
      const t1 = new Date(d.created_at).getTime()
      const t2 = new Date(msg.created_at).getTime()
      const sameTime = isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 90000
      return sameSender && samePhone && sameText && sameTime
    })
    if (!isDup) deduped.push(msg)
  }

  return deduped.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

function SupportChatWidget({
  customerPhone = "",
  customerName = "",
}: {
  customerPhone?: string
  customerName?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<ChatView>("faq")

  // Request form state
  const [name, setName] = useState(customerName || "")
  const [phone, setPhone] = useState(
    customerPhone || localStorage.getItem("messmate_phone") || ""
  )
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
      text: "Hello! How can we help you today with your MessMate order?",
    },
  ])
  const [faqInput, setFaqInput] = useState("")

  // Live chat messages
  const [liveMessages, setLiveMessages] = useState<SupportMsg[]>(() => {
    try {
      const p = customerPhone || localStorage.getItem("messmate_phone")
      if (p) {
        const clean = p.replace(/\D/g, "").slice(-10)
        const saved = localStorage.getItem(`messmate_chat_${clean}`)
        if (saved) return mergeSupportMessages([], JSON.parse(saved))
      }
    } catch {}
    return []
  })
  const [liveInput, setLiveInput] = useState("")

  const chatBottomRef = useRef<HTMLDivElement>(null)
  const liveMessagesRef = useRef<SupportMsg[]>(liveMessages)
  liveMessagesRef.current = liveMessages
  const phoneRef = useRef<string>(phone)
  phoneRef.current = phone

  const saveChatToLocal = (cleanP: string, msgs: SupportMsg[]) => {
    try {
      localStorage.setItem(`messmate_chat_${cleanP}`, JSON.stringify(msgs))
    } catch {}
  }

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [faqHistory, liveMessages, view])

  useEffect(() => {
    if (customerPhone && !phone) setPhone(customerPhone)
    if (customerName && !name) setName(customerName)
  }, [customerPhone, customerName])

  // Realtime Broadcast Channel & History Sync
  useEffect(() => {
    if (!supabase) return

    const broadcastChannel = supabase.channel("messmate_support_broadcast", {
      config: { broadcast: { self: false } },
    })

    broadcastChannel
      .on("broadcast", { event: "support_msg" }, ({ payload }) => {
        if (!payload || !payload.phone) return
        const incoming = payload as SupportMsg
        const currentPhone = (phoneRef.current || "").replace(/\D/g, "").slice(-10)
        const incomingPhone = (incoming.phone || "").replace(/\D/g, "").slice(-10)

        if (incomingPhone && currentPhone && incomingPhone === currentPhone) {
          setLiveMessages((prev) => {
            const next = mergeSupportMessages(prev, [incoming])
            saveChatToLocal(currentPhone, next)
            return next
          })
          if (incoming.sender === "support") {
            setView("live")
          }
        }
      })
      .on("broadcast", { event: "request_history" }, () => {
        const currentPhone = (phoneRef.current || "").replace(/\D/g, "").slice(-10)
        if (currentPhone && liveMessagesRef.current.length > 0) {
          broadcastChannel.send({
            type: "broadcast",
            event: "sync_history",
            payload: liveMessagesRef.current,
          })
        }
      })
      .subscribe()

    return () => {
      supabase?.removeChannel(broadcastChannel)
    }
  }, [])

  // Database fetch & Postgres changes when student phone is available
  useEffect(() => {
    const clean = phone?.replace(/\D/g, "").slice(-10)
    if (!clean || !supabase) return

    supabase
      .from("support_messages")
      .select("*")
      .eq("phone", clean)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setLiveMessages((prev) => {
            const next = mergeSupportMessages(prev, data as SupportMsg[])
            saveChatToLocal(clean, next)
            return next
          })
        }
      })

    const pgChannel = supabase
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
            setLiveMessages((prev) => {
              const next = mergeSupportMessages(prev, [newMsg])
              saveChatToLocal(clean, next)
              return next
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase?.removeChannel(pgChannel)
    }
  }, [phone])

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

  const handleSendFaqQuestion = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!faqInput.trim()) return
    const query = faqInput.trim()
    setFaqInput("")
    const answer = getAutomatedAnswer(query)

    setFaqHistory((prev) => [
      ...prev,
      { id: `faq-u-${Date.now()}`, sender: "user", text: query },
      { id: `faq-b-${Date.now() + 1}`, sender: "bot", text: answer, showEscalate: true },
    ])
  }

  const handleResetChat = () => {
    setLiveMessages([])
    setName(customerName || "")
    setPhone(customerPhone || localStorage.getItem("messmate_phone") || "")
    setIssue("")
    setView("faq")
  }

  const handleStartLiveChat = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError("Please enter your name.")
      return
    }
    const cleanPhone = phone.replace(/\D/g, "").slice(0, 10)
    if (cleanPhone.length !== 10) {
      setFormError("Please enter a valid 10-digit mobile number.")
      return
    }

    setIsSubmitting(true)
    const activePhone = cleanPhone
    localStorage.setItem("messmate_phone", activePhone)

    const issueText = issue.trim() || "Requested campus team callback."

    const initialCustomerMsg: SupportMsg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phone: activePhone,
      customer_name: name.trim(),
      sender: "customer",
      message: issueText,
      created_at: new Date().toISOString(),
    }

    const acknowledgmentMsg: SupportMsg = {
      id: `ack-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
      phone: activePhone,
      customer_name: "MessMate Support",
      sender: "support",
      message: `Thanks ${name.trim()}! We have received your details. We will contact you shortly on ${activePhone}.`,
      created_at: new Date().toISOString(),
    }

    const nextMsgs = mergeSupportMessages([], [initialCustomerMsg, acknowledgmentMsg])
    setLiveMessages(nextMsgs)
    saveChatToLocal(activePhone, nextMsgs)
    setView("live")

    if (supabase) {
      // 1. Broadcast immediately across Supabase Realtime channel so Admin receives it without delay
      const bc = supabase.channel("messmate_support_broadcast")
      bc.send({
        type: "broadcast",
        event: "support_msg",
        payload: initialCustomerMsg,
      })

      // 2. Also try inserting into database table
      try {
        await supabase
          .from("support_messages")
          .insert({
            phone: activePhone,
            customer_name: name.trim(),
            sender: "customer",
            message: issueText,
          })
      } catch (err) {
        console.warn("DB notice (table might not exist yet):", err)
      }
    }
    setIsSubmitting(false)
  }

  const handleSendLiveMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!liveInput.trim()) return
    const text = liveInput.trim()
    setLiveInput("")

    const cleanPhone = (phone || localStorage.getItem("messmate_phone") || "").replace(/\D/g, "").slice(-10)

    const optimistic: SupportMsg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phone: cleanPhone,
      customer_name: name || "Student",
      sender: "customer",
      message: text,
      created_at: new Date().toISOString(),
    }
    const next = mergeSupportMessages(liveMessages, [optimistic])
    setLiveMessages(next)
    saveChatToLocal(cleanPhone, next)

    if (supabase) {
      const bc = supabase.channel("messmate_support_broadcast")
      bc.send({
        type: "broadcast",
        event: "support_msg",
        payload: optimistic,
      })

      try {
        await supabase.from("support_messages").insert({
          phone: cleanPhone,
          customer_name: name || "Student",
          sender: "customer",
          message: text,
        })
      } catch (err) {
        console.warn("DB notice:", err)
      }
    }
  }

  return (
    <>
      <button
        className={`support-fab ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open support chat"
        title="MessMate Support"
      >
        <span className="support-fab-dot" />
        <Icon name={isOpen ? "close" : "chat"} size={19} />
        <span>{isOpen ? "Close" : "Support"}</span>
      </button>

      {isOpen && (
        <aside className="support-chat-card" role="dialog" aria-label="Support Chat">
          <div className="support-header">
            <div className="support-header-info">
              <div className="support-avatar">
                <Icon name="chat" size={17} />
              </div>
              <div className="support-header-text">
                <strong>MessMate Support</strong>
                <small>
                  <span className="support-header-dot" /> Online · Campus Help
                </small>
              </div>
            </div>
            <button
              className="support-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close support chat"
            >
              <Icon name="close" size={18} />
            </button>
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
              <div className="support-body">
                {faqHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`chat-bubble ${item.sender}`}
                  >
                    <span className="chat-bubble-sender">
                      {item.sender === "bot" ? "MessMate Bot" : "You"}
                    </span>
                    <div>{item.text}</div>
                    {item.showEscalate && (
                      <div className="support-escalate-card">
                        <p>Need more details or direct assistance?</p>
                        <button
                          type="button"
                          className="support-escalate-btn"
                          onClick={() => setView("request")}
                        >
                          <Icon name="chat" size={13} />
                          Request Live Chat Support
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
            <div className="support-body">
              <form
                className="support-request-form"
                onSubmit={handleStartLiveChat}
              >
                <div className="support-request-intro">
                  <h4>Talk to Campus Support</h4>
                  <p>
                    Submit your name and phone number. Our campus team will
                    contact you shortly!
                  </p>
                </div>

                {formError && (
                  <div className="validation-hint" style={{ textAlign: "left" }}>
                    {formError}
                  </div>
                )}

                <div className="support-field">
                  <label>Your Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Ananya"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="support-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <label>Phone Number</label>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {phone.replace(/\D/g, "").length}/10 digits
                    </span>
                  </div>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    required
                  />
                </div>

                <div className="support-field">
                  <label>Your Issue / Question (Optional)</label>
                  <textarea
                    placeholder="What do you need help with? (e.g. delivery query, change room number...)"
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
                    type="submit"
                    className="primary-button olive"
                    disabled={isSubmitting || !name.trim() || phone.replace(/\D/g, "").length !== 10}
                    style={{ flex: 1, minHeight: 44, fontSize: 13 }}
                  >
                    {isSubmitting ? "Submitting..." : "Submit & Contact Me"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {view === "live" && (
            <>
              <div className="support-status-banner">
                <div className="support-status-badge">
                  <Icon name="check" size={14} />
                </div>
                <div className="support-status-copy">
                  <strong>We will contact you shortly!</strong>
                  <span>Reaching out to <strong>{phone.replace(/\D/g, "").slice(-10)}</strong></span>
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

              <div className="support-body">
                {liveMessages.length === 0 ? (
                  <div className="empty-state" style={{ padding: 20 }}>
                    <Icon name="chat" size={24} />
                    <p>No messages yet. Send a message below to start.</p>
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
                        {msg.sender === "customer"
                          ? msg.customer_name || "You"
                          : "Campus Support Team"}
                      </span>
                      <div>{msg.message}</div>
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

export default function App() {
  const [screen, setScreen] = useState<Screen>("home")

  const [selectedProduct, setSelectedProduct] = useState("Andhra Mango Pickle")

  const [cart, setCart] = useState<CartItem[]>([])

  const [details, setDetails] = useState<CustomerDetails>(() => ({
    name: "",
    phone: (localStorage.getItem("messmate_phone") || "").replace(/\D/g, "").slice(-10),
    hostel: "",
    room: "",
  }))

  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup")
  const [pickupPoint, setPickupPoint] = useState("Hostel 3 Entrance")

  const [slot, setSlot] = useState("8:30–9:00 PM")

  const [orderNumber, setOrderNumber] = useState<number | string>(1048)
  const [orderPin, setOrderPin] = useState<string>("1048")

  const [paymentMethodName, setPaymentMethodName] = useState("PhonePe UPI")

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Real-time Sold Out items state
  const [soldOutItems, setSoldOutItems] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("messmate_menu_inventory")
      if (saved) {
        const items: any[] = JSON.parse(saved)
        return new Set(items.filter((i) => !i.is_available).map((i) => i.name))
      }
    } catch (e) {
      console.warn("Could not read inventory cache", e)
    }
    return new Set()
  })

  // Live Ready-for-Pickup Alert state
  const [activeReadyOrder, setActiveReadyOrder] = useState<any>(null)
  const [dismissedReadyIds, setDismissedReadyIds] = useState<Set<string>>(new Set())

  // Sync inventory with Supabase realtime & broadcast
  useEffect(() => {
    if (!supabase) return

    // 1. Fetch current inventory from table if available
    supabase
      .from("menu_inventory")
      .select("*")
      .then(({ data, error }) => {
        if (!error && data) {
          const out = new Set<string>()
          data.forEach((row: any) => {
            if (!row.is_available) out.add(row.name)
          })
          setSoldOutItems(out)
        }
      })

    // 2. Realtime broadcast channel
    const stockChannel = supabase
      .channel("menu_stock_updates")
      .on("broadcast", { event: "stock_update" }, ({ payload }) => {
        if (payload?.id) {
          const match = DEFAULT_MENU_ITEMS.find((i) => i.id === payload.id)
          if (match) {
            setSoldOutItems((prev) => {
              const next = new Set(prev)
              if (payload.is_available) {
                next.delete(match.name)
              } else {
                next.add(match.name)
              }
              return next
            })
          }
        }
      })
      .subscribe()

    return () => {
      supabase?.removeChannel(stockChannel)
    }
  }, [])

  // Live listener for Ready-for-pickup alert
  useEffect(() => {
    const client = supabase
    if (!client) return
    const phone = details.phone || localStorage.getItem("messmate_phone")
    if (!phone) return

    const checkReadyOrders = async () => {
      const { data } = await client
        .from("orders")
        .select("*")
        .eq("customer_phone", phone)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)

      if (data && data.length > 0) {
        const order = data[0]
        if (!dismissedReadyIds.has(order.id)) {
          setActiveReadyOrder(order)
        }
      } else {
        setActiveReadyOrder(null)
      }
    }

    checkReadyOrders()

    const ordersChannel = client
      .channel("student_ready_alerts")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updated = payload.new as any
          if (updated.customer_phone === phone) {
            if (updated.status === "ready" && !dismissedReadyIds.has(updated.id)) {
              setActiveReadyOrder(updated)
            } else if (updated.status === "delivered" || updated.status === "cancelled") {
              setActiveReadyOrder(null)
            }
          }
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(ordersChannel)
    }
  }, [details.phone, dismissedReadyIds])

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  )

  const go = (next: Screen) => {
    if (next === "home" && screen === "confirmation") setCart([])

    setScreen(next)

    window.scrollTo({ top: 0, behavior: "smooth" })
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
    setCart(items)
    go("cart")
  }

  const handlePay = async (method: "upi" | "counter", utr?: string) => {
    setIsSubmitting(true)

    try {
      const fee = fulfilment === "delivery" ? 7 : 0

      const subtotal = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      )

      const orderTotal = subtotal + fee

      const cleanUtr = utr?.trim()
      const paymentLabel =
        method === "upi"
          ? cleanUtr
            ? `PhonePe UPI (UTR: ${cleanUtr})`
            : "PhonePe UPI"
          : "Pay at Counter"

      setPaymentMethodName(paymentLabel)

      // Generate a 4-digit pickup PIN for this order
      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
      setOrderPin(generatedPin)

      if (supabase) {
        const payload: any = {
          customer_name: details.name || "Student",
          customer_phone: details.phone || "0000000000",
          hostel: fulfilment === "pickup" ? pickupPoint : (details.hostel || "Hostel 3"),
          room: fulfilment === "pickup" ? "" : (details.room || "Room"),
          fulfilment,
          slot,
          items: cart,
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

        // Fallback: If DB columns pickup_code or payment_status not yet added in Supabase
        if (error && error.code === "42703") {
          delete payload.pickup_code
          delete payload.payment_status
          const retry = await supabase
            .from("orders")
            .insert(payload)
            .select("order_number")
            .single()
          data = retry.data
          error = retry.error
        }

        if (error) {
          console.error("Supabase insert error:", error)
        } else if (data?.order_number) {
          setOrderNumber(data.order_number)
          if (details.phone) {
            localStorage.setItem("messmate_phone", details.phone)
          }
        }
      }
    } catch (err) {
      console.error("Failed to place order:", err)
    } finally {
      setIsSubmitting(false)
      go("confirmation")
    }
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        {/* Live Floating Alert Banner for Ready Orders */}
        {activeReadyOrder && (
          <div className="ready-order-alert-banner">
            <div className="alert-banner-content">
              <span className="alert-bell">
                <Icon name="bell" size={16} />
              </span>
              <div>
                <strong>Order #{activeReadyOrder.order_number} is READY for Pickup!</strong>
                <p>
                  At <u>{activeReadyOrder.hostel || "Campus Station"}</u> · PIN: <b>{getPickupPin(activeReadyOrder)}</b>
                </p>
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

        {screen === "home" && (
          <Home go={go} cartCount={cartCount} cartTotal={total} />
        )}
        {screen === "pickles" && (
          <PickleList
            go={go}
            cartCount={cartCount}
            soldOutItems={soldOutItems}
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
          />
        )}
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
          />
        )}
        {screen === "checkout" && (
          <Checkout
            go={go}
            details={details}
            setDetails={setDetails}
            fulfilment={fulfilment}
            setFulfilment={setFulfilment}
            pickupPoint={pickupPoint}
          />
        )}
        {screen === "fulfilment" && (
          <Fulfilment
            go={go}
            fulfilment={fulfilment}
            details={details}
            slot={slot}
            setSlot={setSlot}
            pickupPoint={pickupPoint}
            setPickupPoint={setPickupPoint}
          />
        )}
        {screen === "payment" && (
          <Payment
            go={go}
            items={cart}
            fulfilment={fulfilment}
            onPay={handlePay}
            isSubmitting={isSubmitting}
          />
        )}
        {screen === "confirmation" && (
          <Confirmation
            go={go}
            fulfilment={fulfilment}
            details={details}
            slot={slot}
            items={cart}
            orderNumber={orderNumber}
            paymentMethod={paymentMethodName}
            pickupPoint={pickupPoint}
            pickupPin={orderPin}
          />
        )}
        {screen === "orders" && (
          <OrdersPage
            go={go}
            phone={details.phone}
            setPhone={(phone) => setDetails((prev) => ({ ...prev, phone }))}
            cartCount={cartCount}
            onReorder={handleReorder}
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
        />
      </div>
    </div>
  )
}

