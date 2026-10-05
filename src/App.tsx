import { useMemo, useState, useEffect, type ReactNode } from "react"

import { supabase } from "./lib/supabase"

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

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
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
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
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
    <article className={`category-card ${type}`}>
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
        <button className="text-cta" onClick={onClick}>
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
}: {
  go: (screen: Screen) => void
  selectProduct: (name: string) => void
  cartCount: number
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
          {pickleProducts.map((product) => (
            <article
              className="product-card"
              key={product.name}
              onClick={() => selectProduct(product.name)}
            >
              <img src={product.image} alt={product.name} />
              <div className="product-info">
                <div className="spice">
                  <span></span>
                  {product.spice} spice
                </div>
                <h3>{product.name}</h3>
                <p>{product.desc}</p>
                <div className="product-bottom">
                  <div>
                    <small>Starts at</small>
                    <strong>₹{product.price}</strong>
                  </div>
                  <button aria-label={`View ${product.name}`}>
                    <Icon name="arrow-right" size={17} />
                  </button>
                </div>
              </div>
            </article>
          ))}
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
}: {
  go: (screen: Screen) => void
  productName: string
  add: (item: CartItem) => void
  cartCount?: number
}) {
  const [selected, setSelected] = useState(0)

  const pack = packOptions[selected]

  const handleAdd = () => {
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
                <div className="desktop-pack-tag">In stock today</div>
              </div>
              <PrimaryButton tone="pickle" onClick={handleAdd}>
                Add to cart
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
        <PrimaryButton tone="pickle" onClick={handleAdd}>
          Add to cart
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

function FruitBuilder({
  go,
  add,
  cartCount,
}: {
  go: (screen: Screen) => void
  add: (item: CartItem) => void
  cartCount: number
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

                return (
                  <article
                    className={`fruit-card ${count ? "selected" : ""}`}
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
                      <small>
                        {count
                          ? `${count} portion${count > 1 ? "s" : ""}`
                          : "Tap + to add"}
                      </small>
                    </div>
                    <Quantity
                      value={count}
                      onChange={(value) => update(fruit.name, value)}
                      small
                    />
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
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
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
}: {
  go: (screen: Screen) => void
  details: CustomerDetails
  setDetails: (value: CustomerDetails) => void
  fulfilment: "pickup" | "delivery"
  setFulfilment: (value: "pickup" | "delivery") => void
}) {
  const set = (key: keyof CustomerDetails, value: string) =>
    setDetails({ ...details, [key]: value })

  const isComplete = Boolean(
    details.name && details.phone && details.hostel && details.room,
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
                  placeholder="+91 98765 43210"
                  type="tel"
                  value={details.phone}
                  onChange={(v) => set("phone", v)}
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
                <Icon name="shield" size={17} /> We'll only use your phone number for
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
                    ? "Hostel 3 Entrance Security Point"
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
                  Please fill in all contact fields to continue
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
}: {
  go: (screen: Screen) => void
  fulfilment: "pickup" | "delivery"
  details: CustomerDetails
  slot: string
  setSlot: (value: string) => void
}) {
  const slots = ["8:00–8:30 PM", "8:30–9:00 PM", "9:00–9:30 PM"]

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
              ? "Choose a pickup time that works for you."
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
                      <strong>Hostel 3 Entrance</strong>
                      <p>Next to the main security desk</p>
                    </div>
                  </div>
                </div>
                <div className="availability">
                  <span></span>Pickup available today
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
  onPay: (method: "upi" | "other") => void
  isSubmitting: boolean
}) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )

  const fee = fulfilment === "delivery" ? 7 : 0

  const total = subtotal + fee

  const [method, setMethod] = useState<"upi" | "other">("upi")

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
          <h1>One last look.</h1>
          <p>Everything correct? You're ready to go.</p>
        </section>
        <div className="payment-layout">
          <div className="payment-left-col">
            <section className="payment-methods">
              <h2>Select Payment Method</h2>
              <button
                className={method === "upi" ? "selected" : ""}
                onClick={() => setMethod("upi")}
              >
                <span className="upi-mark">UPI</span>
                <span>
                  <strong>Pay with UPI</strong>
                  <small>GPay, PhonePe, Paytm & more</small>
                </span>
                <span className="radio">{method === "upi" && <span />}</span>
              </button>
              <button
                className={method === "other" ? "selected" : ""}
                onClick={() => setMethod("other")}
              >
                <span className="card-mark">••••</span>
                <span>
                  <strong>Other payment methods</strong>
                  <small>Cards and net banking</small>
                </span>
                <span className="radio">{method === "other" && <span />}</span>
              </button>
            </section>
            <div className="reassurance">
              <Icon name="shield" size={18} /> Your payment is safe and secure
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
                <PrimaryButton disabled={isSubmitting} onClick={() => onPay(method)}>
                  {isSubmitting ? "Placing order..." : `Pay ₹${total}`}
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
        <PrimaryButton disabled={isSubmitting} onClick={() => onPay(method)}>
          {isSubmitting ? "Placing order..." : `Pay ₹${total}`}
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
}: {
  go: (screen: Screen) => void
  fulfilment: "pickup" | "delivery"
  details: CustomerDetails
  slot: string
  items: CartItem[]
  orderNumber: number | string
}) {
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
                  ? "Hostel 3 Entrance"
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
        </section>
        <div className="sms-note">
          <Icon name="shield" size={18} />
          <span>
            We'll send order details and live updates to{" "}
            <strong>{details.phone}</strong>.
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

function OrdersPage({
  go,
  phone,
  setPhone,
  cartCount,
}: {
  go: (screen: Screen) => void
  phone: string
  setPhone: (phone: string) => void
  cartCount: number
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
                className={`filter-chip ${searchInput === phone ? "active" : ""}`}
                onClick={() => {
                  setSearchInput(phone)
                  loadOrders(phone)
                }}
              >
                <Icon name="receipt" size={13} /> My Phone ({phone})
              </button>
            </div>
          )}
          <div className="orders-search-note">
            <Icon name="shield" size={14} />
            <span>
              Enter your phone number to view your active delivery and past orders
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
                      <small>Order #{order.order_number}</small>
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
                            ? "Hostel 3 Entrance Pickup Point"
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
                          {order.customer_phone})
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
                        <strong style={{ textTransform: "uppercase" }}>
                          {order.payment_method}
                        </strong>
                      </div>
                      <div>
                        <span>Total Paid</span>
                        <strong>₹{order.total}</strong>
                      </div>
                    </div>
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

export default function App() {
  const [screen, setScreen] = useState<Screen>("home")

  const [selectedProduct, setSelectedProduct] = useState("Andhra Mango Pickle")

  const [cart, setCart] = useState<CartItem[]>([])

  const [details, setDetails] = useState<CustomerDetails>(() => ({
    name: "",
    phone: localStorage.getItem("messmate_phone") || "",
    hostel: "",
    room: "",
  }))

  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup")

  const [slot, setSlot] = useState("8:30–9:00 PM")

  const [orderNumber, setOrderNumber] = useState<number | string>(1048)

  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const handlePay = async (method: "upi" | "other") => {
    setIsSubmitting(true)

    try {
      if (supabase) {
        const fee = fulfilment === "delivery" ? 7 : 0

        const subtotal = cart.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        )

        const orderTotal = subtotal + fee

        const { data, error } = await supabase

          .from("orders")

          .insert({
            customer_name: details.name || "Student",

            customer_phone: details.phone || "0000000000",

            hostel: details.hostel || "Hostel 3",

            room: details.room || "Room",

            fulfilment,

            slot,

            items: cart,

            subtotal,

            delivery_fee: fee,

            total: orderTotal,

            payment_method: method,

            status: "placed",
          })

          .select("order_number")

          .single()

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
        {screen === "home" && (
          <Home go={go} cartCount={cartCount} cartTotal={total} />
        )}
        {screen === "pickles" && (
          <PickleList
            go={go}
            cartCount={cartCount}
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
          />
        )}
        {screen === "fruit-builder" && (
          <FruitBuilder go={go} add={add} cartCount={cartCount} />
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
          />
        )}
        {screen === "fulfilment" && (
          <Fulfilment
            go={go}
            fulfilment={fulfilment}
            details={details}
            slot={slot}
            setSlot={setSlot}
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
          />
        )}
        {screen === "orders" && (
          <OrdersPage
            go={go}
            phone={details.phone}
            setPhone={(phone) => setDetails((prev) => ({ ...prev, phone }))}
            cartCount={cartCount}
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
      </div>
    </div>
  )
}

