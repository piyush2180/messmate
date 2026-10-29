import { useState, useEffect, useMemo, useRef } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./lib/supabase"
import type {
  CounterSale,
  Expense,
  OrderRecord,
  OrderStatus,
  PaymentStatus,
  SupportMessage,
  DashboardTab,
  MenuItemStock,
  VisitStats,
} from "./types"
import { DEFAULT_MENU_ITEMS, getPickupPin } from "./lib/inventory"
import { computeStats } from "./lib/stats"
import logoUrl from "./assets/happy-tummy-logo.webp"

// Support replies are stored under this name. Older names stay recognised so past chats still read as support.
const SUPPORT_NAME = "Happy Tummy Co. Support Team"
const SUPPORT_NAMES = [SUPPORT_NAME, "MessMate Support Team", "MessMate Support", "Campus Support Team"]
// Messages saved before the rename still mention the old name in their text
const rebrand = (text: string) => text.replace(/MessMate Support Team/g, SUPPORT_NAME).replace(/MessMate/g, "Happy Tummy Co.")
// "1 order" / "2 orders"
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// One shared audio context. Browsers keep it muted until someone taps the page once after loading.
let audioCtx: AudioContext | null = null
function getAudio(): AudioContext | null {
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (Ctor) audioCtx = new Ctor()
  }
  return audioCtx
}

// Rising two-note ding for a new order; one softer note for a new chat message
function playChime(kind: "order" | "message" = "order") {
  const ctx = getAudio()
  if (!ctx || ctx.state !== "running") return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(kind === "order" ? 587.33 : 880, ctx.currentTime) // D5 / A5
    if (kind === "order") osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(kind === "order" ? 0.2 : 0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch (err) {
    console.warn("Chime failed:", err)
  }
}

// "Today, 05:03 PM" / "Yesterday, …" / "6 Oct, …" so older orders and chats don't look like today's.
function formatWhen(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`
}

function get10DigitPhone(raw: string | null | undefined): string {
  if (!raw) return ""
  const digits = String(raw).replace(/\D/g, "")
  return digits.length > 10 ? digits.slice(-10) : digits
}

// Rows and broadcasts come from an open database and channel, so check their shape before using them
const isValidMessage = (m: any): m is SupportMessage =>
  Boolean(m) &&
  typeof m.id === "string" &&
  m.id !== "" &&
  typeof m.phone === "string" &&
  typeof m.message === "string" &&
  m.message !== "" &&
  typeof m.sender === "string" &&
  typeof m.created_at === "string" &&
  (m.customer_name == null || typeof m.customer_name === "string")

// Ids the apps give a message before the database assigns its own
const isLocalId = (id: unknown) => /^(msg|local|admin|ack)-/.test(String(id))

// The same message seen twice: a screen's local copy and the saved row. Two saved rows are always
// distinct, even with the same text ("ok", "ok"). Cheap checks first: this runs for every pair.
function isSameMessage(a: SupportMessage, b: SupportMessage): boolean {
  if (a.sender !== b.sender || a.message.trim() !== b.message.trim()) return false
  if (!isLocalId(a.id) && !isLocalId(b.id)) return false
  const p1 = get10DigitPhone(a.phone)
  const p2 = get10DigitPhone(b.phone)
  if (p1 && p2 && p1 !== p2) return false
  const t1 = new Date(a.created_at).getTime()
  const t2 = new Date(b.created_at).getTime()
  return isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 90000
}

function mergeSupportMessages(
  existing: SupportMessage[],
  incomingList: SupportMessage[]
): SupportMessage[] {
  const result = [...existing]

  for (const incoming of incomingList) {
    // A malformed row or broadcast must not crash the dashboard
    if (!isValidMessage(incoming)) continue

    const exactIndex = result.findIndex((m) => m.id === incoming.id)
    if (exactIndex !== -1) {
      result[exactIndex] = { ...result[exactIndex], ...incoming }
      continue
    }

    const fuzzyIndex = result.findIndex((m) => isSameMessage(m, incoming))
    if (fuzzyIndex === -1) {
      result.push(incoming)
    } else if (!isLocalId(incoming.id)) {
      result[fuzzyIndex] = incoming // the saved row replaces the local copy
    }
  }

  const deduped: SupportMessage[] = []
  for (const msg of result) {
    if (!deduped.some((d) => d.id === msg.id || isSameMessage(d, msg))) deduped.push(msg)
  }

  return deduped.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

// Money staff type in by hand, by table
const ENTRY_LABEL = { counter_sales: "counter sale", expenses: "expense" } as const
// Pickup / delivery slots the store offers: Asima's morning window (longer at weekends), Kalam's evening slots (keep in step with src/lib/order-logic.ts)
const SLOT_OPTIONS = ["8:30–9:30 AM", "8:30–10:30 AM", "6:00–6:30 PM", "6:30–7:00 PM"]

// Staff log in before the dashboard loads anything; the database only lets the staff account make changes
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return null
  if (!session) return <StaffLogin />
  return <Dashboard onLogout={() => supabase?.auth.signOut()} />
}

function StaffLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      setError("Not connected to the database.")
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(/invalid/i.test(error.message) ? "Wrong email or password." : "Couldn't log in. Please check the connection and try again.")
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleLogin}>
        <img className="brand-logo" src={logoUrl} alt="Happy Tummy Co." />
        <h1>Staff login</h1>
        <p>Kitchen dashboard for the Happy Tummy Co. team.</p>
        <label>
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="action-btn primary" disabled={busy || !email.trim() || !password}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  )
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<DashboardTab>("orders")
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [ordersError, setOrdersError] = useState(false)
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>(() => {
    try {
      const saved = localStorage.getItem("messmate_admin_support_messages")
      if (saved) {
        const parsed = JSON.parse(saved)
        const sanitized = Array.isArray(parsed)
          ? parsed.map((m: any) => ({
              ...m,
              customer_name:
                SUPPORT_NAMES.includes(m.customer_name) || m.sender === "support"
                  ? SUPPORT_NAME
                  : m.customer_name || m.customerName || "Customer",
            }))
          : []
        // Older dashboards cached demo chats (ids "seed-msg-…"); never show them.
        return mergeSupportMessages([], sanitized.filter((m: SupportMessage) => !String(m.id).startsWith("seed-msg-")))
      }
    } catch (e) {
      console.warn("Could not read local support cache", e)
    }
    return []
  })
  const supportRef = useRef(supportMessages)
  useEffect(() => {
    supportRef.current = supportMessages
  }, [supportMessages])
  // True when a message isn't on screen yet (each one arrives by broadcast and again from the database)
  const isNewMessage = (m: SupportMessage) =>
    typeof m?.message === "string" && !supportRef.current.some((s) => s.id === m.id || isSameMessage(s, m))

  // Sound needs one tap after every page load; any tap or key press turns it on
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => {
    const ctx = getAudio()
    if (!ctx) return
    const sync = () => setSoundOn(ctx.state === "running")
    const unlock = () => {
      if (ctx.state !== "running") ctx.resume().then(sync).catch(() => {})
    }
    sync()
    ctx.addEventListener("statechange", sync)
    window.addEventListener("pointerdown", unlock)
    window.addEventListener("keydown", unlock)
    return () => {
      ctx.removeEventListener("statechange", sync)
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
    }
  }, [])

  // Connection state for the "connection lost" notice
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine))
  const [liveOk, setLiveOk] = useState(true)

  // Open / Closed switch the student store follows (null until loaded)
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null)
  const [storeStatusMissing, setStoreStatusMissing] = useState(false)
  // Pickles Preorder switch ("Arriving soon" in the store); null until loaded, or while its SQL hasn't been run
  const [picklesSoon, setPicklesSoon] = useState<boolean | null>(null)

  const [counterSales, setCounterSales] = useState<CounterSale[]>([])
  const [counterSalesState, setCounterSalesState] = useState<"loading" | "ready" | "missing" | "error">("loading")
  const [saleAmount, setSaleAmount] = useState("")
  const [saleNote, setSaleNote] = useState("")
  const [savingSale, setSavingSale] = useState(false)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expensesState, setExpensesState] = useState<"loading" | "ready" | "missing" | "error">("loading")
  const [expenseAmount, setExpenseAmount] = useState("")
  const [expenseNote, setExpenseNote] = useState("")
  const [savingExpense, setSavingExpense] = useState(false)
  const [visitStats, setVisitStats] = useState<VisitStats | null>(null)
  const [visitStatsState, setVisitStatsState] = useState<"loading" | "ready" | "missing" | "error">("loading")
  // Ticks every minute so "today" numbers and "Today, …" labels roll over at midnight
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Store visitor totals from the visit_stats() SQL function; refreshed whenever Analytics opens.
  useEffect(() => {
    if (!supabase || tab !== "analytics") return
    supabase.rpc("visit_stats").then(({ data, error }) => {
      if (error) {
        console.warn("Visitor stats unavailable:", error.message)
        // PGRST202 / 42883: the visit_stats() function hasn't been created yet
        setVisitStatsState(error.code === "PGRST202" || error.code === "42883" ? "missing" : "error")
        return
      }
      setVisitStats(data as VisitStats)
      setVisitStatsState("ready")
    })
  }, [tab])

  const saveAdminSupportToLocal = (msgs: SupportMessage[]) => {
    try {
      localStorage.setItem("messmate_admin_support_messages", JSON.stringify(msgs))
    } catch {}
  }

  // Menu Inventory State
  const [inventory, setInventory] = useState<MenuItemStock[]>(() => {
    try {
      const saved = localStorage.getItem("messmate_menu_inventory")
      if (saved) {
        // The cache only restores stock flags; the item list always comes from DEFAULT_MENU_ITEMS so menu changes show up.
        const cached = new Map((JSON.parse(saved) as MenuItemStock[]).map((i) => [i.id, i.is_available]))
        return DEFAULT_MENU_ITEMS.map((item) => ({ ...item, is_available: cached.get(item.id) ?? item.is_available }))
      }
    } catch (e) {
      console.warn("Could not read local inventory cache", e)
    }
    return DEFAULT_MENU_ITEMS
  })
  const [inventoryCategory, setInventoryCategory] = useState<string>("all")

  // Filters & Timeframe
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [fulfilmentFilter, setFulfilmentFilter] = useState<string>("all")
  const [slotFilter, setSlotFilter] = useState<string>("all")
  const [revenuePeriod, setRevenuePeriod] = useState<"today" | "all">("today")

  // Support thread state (mobile = the CSS single-pane layout, max-width: 768px)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth <= 768
    }
    return false
  })
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [adminReplyText, setAdminReplyText] = useState("")

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Orders from the database. Also runs after a reconnect, so changes missed while offline show up.
  const loadOrders = () => {
    if (!supabase) return
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("Failed to load orders:", error.message)
        setOrdersError(Boolean(error))
        if (error || !data) return
        const fetched = data as OrderRecord[]
        // Keep orders that arrived live while this request was on its way
        setOrders((prev) => {
          const ids = new Set(fetched.map((o) => o.id))
          const recent = prev.filter((o) => !ids.has(o.id) && Date.now() - new Date(o.created_at).getTime() < 60_000)
          return [...recent, ...fetched]
        })
      })
  }

  // Initial Fetch & Realtime for Orders
  useEffect(() => {
    if (!supabase) return
    loadOrders()

    let joined = false
    const ordersChannel = supabase
      .channel("admin_orders_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newOrder = payload.new as OrderRecord
            setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)])
            playChime("order")
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as OrderRecord
            setOrders((prev) =>
              prev.map((o) => (o.id === updated.id ? updated : o))
            )
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as any).id
            setOrders((prev) => prev.filter((o) => o.id !== deletedId))
          }
        }
      )
      .subscribe((status) => {
        setLiveOk(status === "SUBSCRIBED")
        // Rejoined after the connection dropped: fetch whatever changed in between
        if (status === "SUBSCRIBED" && joined) loadOrders()
        if (status === "SUBSCRIBED") joined = true
      })

    return () => {
      supabase?.removeChannel(ordersChannel)
    }
  }, [])

  const loadSupport = () => {
    if (!supabase) return
    supabase
      .from("support_messages")
      .select("*")
      // Newest first so the row limit drops old chats, not new ones (the merge re-sorts oldest first)
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (!error && data) {
          setSupportMessages((prev) => {
            // The database is the source of truth, so deleted chats disappear; keep only
            // messages from the last few minutes that may not have been saved yet.
            const unsaved = prev.filter(
              (m) => /^(admin-reply|msg|local|ack)-/.test(m.id) && Date.now() - new Date(m.created_at).getTime() < 5 * 60 * 1000,
            )
            const next = mergeSupportMessages(unsaved, data as SupportMessage[])
            saveAdminSupportToLocal(next)
            return next
          })
        }
      })
  }

  // Initial Fetch & Realtime for Support Messages
  useEffect(() => {
    if (!supabase) return
    loadSupport()

    // Messages arrive from the database only, never from the open broadcast channel (anyone could fake those)
    // 3. Postgres changes if table exists
    let pgJoined = false
    const pgChannel = supabase
      .channel("admin_support_pg_channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const newMsg = payload.new as SupportMessage
          const fresh = isNewMessage(newMsg)
          setSupportMessages((prev) => {
            const next = mergeSupportMessages(prev, [newMsg])
            saveAdminSupportToLocal(next)
            return next
          })
          if (fresh && newMsg.sender === "customer") playChime("message")
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && pgJoined) loadSupport()
        if (status === "SUBSCRIBED") pgJoined = true
      })

    return () => {
      supabase?.removeChannel(pgChannel)
    }
  }, [])

  // Counter sales and expenses staff typed in; also re-fetched after a reconnect
  const loadEntries = (
    table: keyof typeof ENTRY_LABEL,
    setRows: (rows: CounterSale[]) => void,
    setState: (state: "ready" | "missing" | "error") => void,
  ) => {
    if (!supabase) return
    supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (error) {
          console.warn(`${table} unavailable:`, error.message)
          // PGRST205 / 42P01: the table hasn't been created yet
          setState(error.code === "PGRST205" || error.code === "42P01" ? "missing" : "error")
          return
        }
        setRows((data as CounterSale[]).map((s) => ({ ...s, amount: Number(s.amount) })))
        setState("ready")
      })
  }
  const loadCounterSales = () => loadEntries("counter_sales", setCounterSales, setCounterSalesState)
  const loadExpenses = () => loadEntries("expenses", setExpenses, setExpensesState)

  const loadStoreStatus = () => {
    if (!supabase) return
    supabase
      .from("store_status")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn("Store status unavailable:", error.message)
          // PGRST205 / 42P01: the store_status table hasn't been created yet
          setStoreStatusMissing(error.code === "PGRST205" || error.code === "42P01")
          return
        }
        setStoreStatusMissing(false)
        setStoreOpen(data ? Boolean(data.is_open) : true)
        // No row yet means pickles are on sale; a row without the column means its SQL hasn't been run
        setPicklesSoon(!data ? false : typeof data.pickles_coming_soon === "boolean" ? data.pickles_coming_soon : null)
      })
  }

  const handleTogglePicklesSoon = async () => {
    if (!supabase || picklesSoon === null) return
    const next = !picklesSoon
    if (next && !confirm("Put pickles on Preorder? Students will see \"Arriving soon\" and a Preorder button, and pickles they order will be marked Preorder.")) return
    setPicklesSoon(next)
    const { error } = await supabase
      .from("store_status")
      .upsert({ id: 1, pickles_coming_soon: next, updated_at: new Date().toISOString() })
    if (error) {
      console.error("Pickles switch not saved:", error.message)
      setPicklesSoon(!next)
      alert("Couldn't change the pickles switch. Please check the connection and try again.")
    }
  }

  const handleToggleStore = async () => {
    if (!supabase || storeOpen === null) return
    const next = !storeOpen
    if (!next && !confirm("Close the store? Students won't be able to place orders, and the chat will say \"Unavailable at the moment\".")) return
    setStoreOpen(next)
    const { error } = await supabase
      .from("store_status")
      .upsert({ id: 1, is_open: next, updated_at: new Date().toISOString() })
    if (error) {
      console.error("Store status not saved:", error.message)
      setStoreOpen(!next)
      alert(
        error.code === "PGRST205" || error.code === "42P01"
          ? "The Open / Closed switch needs the latest SQL in Supabase. Please run it first."
          : "Couldn't change the store status. Please check the connection and try again."
      )
    }
  }

  useEffect(() => {
    loadCounterSales()
    loadExpenses()
    loadStoreStatus()
    const storeChannel = supabase
      ?.channel("admin_store_status")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_status" }, (payload) => {
        const row = payload.new as { is_open?: boolean; pickles_coming_soon?: boolean }
        if (typeof row?.is_open === "boolean") setStoreOpen(row.is_open)
        if (typeof row?.pickles_coming_soon === "boolean") setPicklesSoon(row.pickles_coming_soon)
      })
      .subscribe()
    // A counter sale or expense added or removed on another phone shows up here too
    let moneyJoined = false
    const moneyChannel = supabase?.channel("admin_money")
    for (const [table, setRows] of [
      ["counter_sales", setCounterSales],
      ["expenses", setExpenses],
    ] as const) {
      moneyChannel
        ?.on("postgres_changes", { event: "INSERT", schema: "public", table }, (payload) => {
          const row = payload.new as CounterSale
          setRows((prev) => (prev.some((s) => s.id === row.id) ? prev : [{ ...row, amount: Number(row.amount) }, ...prev]))
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table }, (payload) => {
          const id = (payload.old as { id?: string }).id
          setRows((prev) => prev.filter((s) => s.id !== id))
        })
    }
    moneyChannel?.subscribe((status) => {
      // Rejoined after the connection dropped: fetch whatever changed in between
      if (status === "SUBSCRIBED" && moneyJoined) {
        loadCounterSales()
        loadExpenses()
      }
      if (status === "SUBSCRIBED") moneyJoined = true
    })
    const refresh = () => {
      loadOrders()
      loadSupport()
      loadCounterSales()
      loadExpenses()
      loadStoreStatus()
    }
    const onOnline = () => {
      setIsOnline(true)
      refresh()
    }
    const onOffline = () => setIsOnline(false)
    // A tablet waking up, or staff coming back from PhonePe: catch up on anything missed
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (storeChannel) supabase?.removeChannel(storeChannel)
      if (moneyChannel) supabase?.removeChannel(moneyChannel)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  // Realtime & Sync for Menu Inventory
  useEffect(() => {
    if (!supabase) return

    // Try fetching from menu_inventory table if it exists
    supabase
      .from("menu_inventory")
      .select("*")
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          const map = new Map(data.map((item: any) => [item.id, item.is_available]))
          setInventory((prev) =>
            prev.map((item) => ({
              ...item,
              is_available: map.has(item.id) ? Boolean(map.get(item.id)) : item.is_available,
            }))
          )
        }
      })

    // Stock changes from any admin device, straight from the table
    const stockChannel = supabase
      .channel("admin_menu_inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_inventory" }, (payload) => {
        const row = payload.new as { id?: string; is_available?: boolean }
        if (!row?.id || typeof row.is_available !== "boolean") return
        setInventory((prev) => {
          const updated = prev.map((item) => (item.id === row.id ? { ...item, is_available: row.is_available as boolean } : item))
          try {
            localStorage.setItem("messmate_menu_inventory", JSON.stringify(updated))
          } catch {}
          return updated
        })
      })
      .subscribe()

    return () => {
      supabase?.removeChannel(stockChannel)
    }
  }, [])

  // Toggle Item Stock (Sold Out / In Stock)
  const handleToggleStock = async (itemId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus
    const setStock = (available: boolean) =>
      setInventory((prev) => {
        const next = prev.map((item) => (item.id === itemId ? { ...item, is_available: available } : item))
        try {
          localStorage.setItem("messmate_menu_inventory", JSON.stringify(next))
        } catch {}
        return next
      })
    setStock(newStatus)

    const itemObj = inventory.find((i) => i.id === itemId)
    if (!supabase || !itemObj) return
    const { error } = await supabase.from("menu_inventory").upsert({
      id: itemObj.id,
      name: itemObj.name,
      category: itemObj.category,
      is_available: newStatus,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      console.error("Failed to save stock change:", error.message)
      setStock(currentStatus)
      alert("Couldn't save the stock change. Please check the connection and try again.")
      return
    }
    // Saved: student screens and other admin devices pick it up live from the table
  }

  // Update Order Status
  const handleUpdateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    const previous = orders.find((o) => o.id === orderId)?.status
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    )

    if (!supabase) return
    // supabase-js reports failures (even offline) in `error` instead of throwing
    const { error } = await supabase.from("orders").update({ status: nextStatus }).eq("id", orderId)
    if (error) {
      console.error("Failed to update order status:", error.message)
      // Undo just this change, unless a newer update already replaced it
      if (previous) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId && o.status === nextStatus ? { ...o, status: previous } : o))
        )
      }
      alert(
        nextStatus === "no_show" && (error.code === "23514" || error.code === "P0001")
          ? "No-shows need the latest SQL in Supabase. Please run it first."
          : "Couldn't save the order status. Please check the connection and try again."
      )
    }
  }

  // Verify or Flag Payment Status
  const handleVerifyPayment = async (orderId: string, verified: boolean) => {
    const targetStatus: PaymentStatus = verified ? "verified" : "rejected"
    const orderToUpdate = orders.find((o) => o.id === orderId)
    if (!orderToUpdate) return

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, payment_status: targetStatus } : o
      )
    )

    if (supabase) {
      try {
        // Try updating payment_status column
        const { error } = await supabase
          .from("orders")
          .update({ payment_status: targetStatus })
          .eq("id", orderId)

        // Fallback: If column doesn't exist yet, annotate payment_method
        if (error && error.code === "42703") {
          const cleanMethod = (orderToUpdate.payment_method || "").replace(/\s*\[(VERIFIED|FAILED)\]/g, "")
          const updatedMethod = `${cleanMethod} [${verified ? "VERIFIED" : "FAILED"}]`
          const fallback = await supabase
            .from("orders")
            .update({ payment_method: updatedMethod })
            .eq("id", orderId)
          if (fallback.error) throw fallback.error
        } else if (error) {
          throw error
        }
      } catch (err) {
        console.error("Failed to update payment verification:", err)
        // Put only the payment badge back, so a status change that arrived meanwhile stays
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? { ...o, payment_status: orderToUpdate.payment_status, payment_method: orderToUpdate.payment_method }
              : o
          )
        )
        alert("Couldn't save the payment status. Please try again.")
      }
    }
  }

  // UPI money sent back to the student (cancelled orders, or a no-show you chose to refund)
  const handleMarkRefunded = async (orderId: string) => {
    const before = orders.find((o) => o.id === orderId)
    if (!before || !supabase) return
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, payment_status: "refunded" } : o)))
    const { error } = await supabase.from("orders").update({ payment_status: "refunded" }).eq("id", orderId)
    if (error) {
      console.error("Failed to mark refunded:", error.message)
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, payment_status: before.payment_status } : o)))
      alert(
        error.code === "23514"
          ? "Refunds need the latest SQL in Supabase. Please run it first."
          : "Couldn't save the refund. Please check the connection and try again."
      )
    }
  }

  // Saves a counter sale or an expense; false when it wasn't saved
  const addEntry = async (
    table: keyof typeof ENTRY_LABEL,
    rawAmount: string,
    note: string,
    setRows: React.Dispatch<React.SetStateAction<CounterSale[]>>,
  ) => {
    const amount = Math.round(Number(rawAmount) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      alert("Enter an amount between ₹1 and ₹1,00,000.")
      return false
    }
    if (!supabase) return false
    const { data, error } = await supabase
      .from(table)
      .insert({ amount, note: note.trim() || null })
      .select()
      .single()
    if (error || !data) {
      console.error(`${table} not saved:`, error?.message)
      alert(`Couldn't save the ${ENTRY_LABEL[table]}. Please try again.`)
      return false
    }
    const saved = data as CounterSale
    // The live update may already have added it
    setRows((prev) => (prev.some((s) => s.id === saved.id) ? prev : [{ ...saved, amount: Number(saved.amount) }, ...prev]))
    return true
  }

  const removeEntry = async (
    table: keyof typeof ENTRY_LABEL,
    entry: CounterSale,
    setRows: React.Dispatch<React.SetStateAction<CounterSale[]>>,
  ) => {
    if (!supabase || !confirm(`Remove the ₹${entry.amount} ${ENTRY_LABEL[table]}${entry.note ? ` (${entry.note})` : ""}?`)) return
    const { error } = await supabase.from(table).delete().eq("id", entry.id)
    if (error) {
      console.error(`${table} not removed:`, error.message)
      alert("Couldn't remove it. Please try again.")
      return
    }
    setRows((prev) => prev.filter((s) => s.id !== entry.id))
  }

  const handleAddCounterSale = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSale(true)
    if (await addEntry("counter_sales", saleAmount, saleNote, setCounterSales)) {
      setSaleAmount("")
      setSaleNote("")
    }
    setSavingSale(false)
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingExpense(true)
    if (await addEntry("expenses", expenseAmount, expenseNote, setExpenses)) {
      setExpenseAmount("")
      setExpenseNote("")
    }
    setSavingExpense(false)
  }

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false
      if (fulfilmentFilter !== "all" && order.fulfilment !== fulfilmentFilter) return false
      if (slotFilter !== "all" && order.slot !== slotFilter) return false

      const q = search.trim().toLowerCase()
      if (q) {
        const orderNumStr = `#${order.order_number}`
        const pin = getPickupPin(order)
        const matchNum = orderNumStr.includes(q)
        const matchPin = pin.includes(q)
        const matchName = (order.customer_name || "").toLowerCase().includes(q)
        // "+91 98765 43210" or "98765-43210" still finds the stored 10 digits
        const phoneQuery = /^[\d\s+()-]+$/.test(q) ? get10DigitPhone(q.replace(/^\+91/, "")) : ""
        const matchPhone = phoneQuery !== "" && get10DigitPhone(order.customer_phone).includes(phoneQuery)
        const matchHostel = (order.hostel || "").toLowerCase().includes(q)
        const matchRoom = (order.room || "").toLowerCase().includes(q)
        return matchNum || matchPin || matchName || matchPhone || matchHostel || matchRoom
      }

      return true
    })
  }, [orders, statusFilter, fulfilmentFilter, slotFilter, search])

  // KPI Calculations & Analytics Breakdown
  const stats = useMemo(
    () => computeStats(orders, supportMessages, inventory, now, counterSales, expenses),
    [orders, supportMessages, inventory, now, counterSales, expenses],
  )
  const todaysSales = useMemo(() => {
    const startOfToday = new Date(now).setHours(0, 0, 0, 0)
    return counterSales.filter((s) => new Date(s.created_at).getTime() >= startOfToday)
  }, [counterSales, now])
  const todaysExpenses = useMemo(() => {
    const startOfToday = new Date(now).setHours(0, 0, 0, 0)
    return expenses.filter((s) => new Date(s.created_at).getTime() >= startOfToday)
  }, [expenses, now])
  // Latest student reviews, newest order first
  const reviews = useMemo(
    () =>
      orders
        .filter((o) => typeof o.rating === "number" && o.rating > 0)
        .sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())
        .slice(0, 30),
    [orders]
  )

  // Analytics charts use the same period as the money cards; cancelled orders are left out
  const chartOrders = useMemo(() => {
    const startOfToday = new Date(now).setHours(0, 0, 0, 0)
    return orders.filter(
      (o) => o.status !== "cancelled" && (revenuePeriod === "all" || new Date(o.created_at).getTime() >= startOfToday),
    )
  }, [orders, revenuePeriod, now])
  const chartDeliveries = chartOrders.filter((o) => o.fulfilment === "delivery").length
  const chartPickups = chartOrders.filter((o) => o.fulfilment === "pickup").length
  const periodLabel = revenuePeriod === "all" ? "All time" : "Today"

  // Support Threads grouped by clean 10-digit phone
  const supportThreads = useMemo(() => {
    const threads: Record<string, { customerName: string; messages: SupportMessage[]; latestAt: string }> = {}
    supportMessages.forEach((msg) => {
      const cleanPhone = get10DigitPhone(msg.phone) || msg.phone
      if (!cleanPhone) return
      if (!threads[cleanPhone]) {
        threads[cleanPhone] = {
          customerName: "Student",
          messages: [],
          latestAt: msg.created_at,
        }
      }
      threads[cleanPhone].messages.push(msg)
      if (msg.created_at > threads[cleanPhone].latestAt) {
        threads[cleanPhone].latestAt = msg.created_at
      }
      if (
        msg.sender === "customer" &&
        msg.customer_name &&
        msg.customer_name !== "Student" &&
        !SUPPORT_NAMES.includes(msg.customer_name)
      ) {
        threads[cleanPhone].customerName = msg.customer_name
      }
    })

    return Object.entries(threads)
      .map(([phone, data]) => ({ phone, ...data }))
      .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
  }, [supportMessages])

  // Desktop: Auto-select first thread if none selected.
  // Mobile: Keep selectedPhone null so admin sees the full conversation list and can choose any chat.
  useEffect(() => {
    if (!isMobile && !selectedPhone && supportThreads.length > 0) {
      setSelectedPhone(supportThreads[0].phone)
    }
  }, [isMobile, supportThreads, selectedPhone])

  // If a selected phone is no longer in supportThreads, fallback
  useEffect(() => {
    if (selectedPhone && supportThreads.length > 0) {
      const cleanSelected = get10DigitPhone(selectedPhone) || selectedPhone
      const exists = supportThreads.some(
        (t) => (get10DigitPhone(t.phone) || t.phone) === cleanSelected
      )
      if (!exists) {
        setSelectedPhone(isMobile ? null : supportThreads[0].phone)
      }
    }
  }, [isMobile, supportThreads, selectedPhone])

  const threadMessagesRef = useRef<HTMLDivElement>(null)
  const activeThread = useMemo(() => {
    if (!selectedPhone) return null
    const cleanSelected = get10DigitPhone(selectedPhone) || selectedPhone
    return supportThreads.find((t) => (get10DigitPhone(t.phone) || t.phone) === cleanSelected) || null
  }, [supportThreads, selectedPhone])

  // Open a chat at its newest message, and follow new ones as they arrive
  useEffect(() => {
    const el = threadMessagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [tab, activeThread?.phone, activeThread?.messages.length])

  // Send Admin Reply to Support Thread
  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPhone || !adminReplyText.trim()) return
    if (!supabase) {
      alert("Not connected to the database, so the reply can't be sent.")
      return
    }

    const reply = adminReplyText.trim()
    setAdminReplyText("")

    const targetPhone = get10DigitPhone(selectedPhone) || selectedPhone
    const optimistic: SupportMessage = {
      id: `admin-reply-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phone: targetPhone,
      customer_name: SUPPORT_NAME,
      sender: "support",
      message: reply,
      created_at: new Date().toISOString(),
    }
    setSupportMessages((prev) => {
      const next = mergeSupportMessages(prev, [optimistic])
      saveAdminSupportToLocal(next)
      return next
    })

    const { error } = await supabase.from("support_messages").insert({
      phone: targetPhone,
      customer_name: SUPPORT_NAME,
      sender: "support",
      message: reply,
    })
    if (error) {
      console.error("Reply not saved:", error.message)
      // Take the bubble back and return the text, so nothing looks sent that wasn't
      setSupportMessages((prev) => {
        const next = prev.filter((m) => m.id !== optimistic.id)
        saveAdminSupportToLocal(next)
        return next
      })
      setAdminReplyText(reply)
      alert("Couldn't send the reply. Please check the connection and try again.")
      return
    }
    // Saved: the student's screen gets it live from the database
  }

  // Filtered inventory list
  const filteredInventory = useMemo(() => {
    if (inventoryCategory === "all") return inventory
    return inventory.filter((item) => item.category.toLowerCase() === inventoryCategory.toLowerCase())
  }, [inventory, inventoryCategory])

  return (
    <div className="admin-shell">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="brand-section">
            <img className="brand-logo" src={logoUrl} alt="Happy Tummy Co." />
            <div className="brand-text">
              <div className="brand-title">
                Happy Tummy Co. <span className="brand-pill">Kitchen & Ops</span>
              </div>
              <span className="brand-subtitle">Campus Order Management Console</span>
            </div>
            <button
              type="button"
              className="logout-btn"
              onClick={() => {
                if (confirm("Log out of the kitchen dashboard?")) onLogout()
              }}
            >
              Log out
            </button>
          </div>

          {/* Navigation Tabs */}
          <nav className="admin-nav-tabs">
            <button
              type="button"
              className={`nav-tab-btn ${tab === "orders" ? "active" : ""}`}
              onClick={() => setTab("orders")}
            >
              <span>Live Orders</span>
              <span className="nav-counter">{orders.length}</span>
            </button>

            <button
              type="button"
              className={`nav-tab-btn ${tab === "inventory" ? "active" : ""}`}
              onClick={() => setTab("inventory")}
            >
              <span>Menu & Stock</span>
              {stats.soldOutCount > 0 && (
                <span className="nav-counter" style={{ background: "#d90429", color: "#fff" }}>
                  {stats.soldOutCount} sold out
                </span>
              )}
            </button>

            <button
              type="button"
              className={`nav-tab-btn ${tab === "support" ? "active" : ""}`}
              onClick={() => setTab("support")}
            >
              <span>Support & Callbacks</span>
              {stats.pendingCallbacks > 0 && (
                <span className="nav-counter" style={{ background: "#f59e0b", color: "#fff" }}>
                  {stats.pendingCallbacks}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`nav-tab-btn ${tab === "analytics" ? "active" : ""}`}
              onClick={() => setTab("analytics")}
            >
              <span>Analytics</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className={`admin-main tab-${tab}`}>
        {storeStatusMissing ? (
          <div className="store-status-bar missing">Run the store_status SQL in Supabase to use the Open / Closed switch.</div>
        ) : (
          storeOpen !== null && (
            <div className={`store-status-bar ${storeOpen ? "open" : "closed"}`}>
              <span>
                <span className="store-status-dot" />
                {storeOpen ? "Store is open" : "Store is closed: students can't order right now"}
              </span>
              <button type="button" className="action-btn-small" onClick={handleToggleStore}>
                {storeOpen ? "Close store" : "Open store"}
              </button>
            </div>
          )
        )}
        {!soundOn && (
          <button
            type="button"
            className="admin-banner sound"
            onClick={() => getAudio()?.resume().then(() => playChime("order")).catch(() => {})}
          >
            🔔 Tap here to turn on the new-order sound
          </button>
        )}
        {(!isOnline || !liveOk) && (
          <div className="admin-banner offline" role="status">
            Connection lost. The board will refresh by itself as soon as it's back.
          </div>
        )}
        {/* KPI Ribbon */}
        <section className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-header">
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span>{revenuePeriod === "all" ? "Collected (All Time)" : "Collected Today"}</span>
                <div className="revenue-toggle-group">
                  <button
                    type="button"
                    className={`revenue-toggle-btn ${revenuePeriod === "today" ? "active" : ""}`}
                    onClick={() => setRevenuePeriod("today")}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`revenue-toggle-btn ${revenuePeriod === "all" ? "active" : ""}`}
                    onClick={() => setRevenuePeriod("all")}
                  >
                    All Time
                  </button>
                </div>
              </div>
              <div className="kpi-icon-wrap olive">₹</div>
            </div>
            <div className="kpi-value">
              ₹{(revenuePeriod === "all" ? stats.allTimeRevenue : stats.revenue).toLocaleString()}
            </div>
            <span className="kpi-subtext">
              {revenuePeriod === "all"
                ? `₹${stats.allTimeUpiRevenue.toLocaleString()} UPI · ₹${stats.allTimeCashRevenue.toLocaleString()} counter · ₹${stats.toCollectAllTime.toLocaleString()} still to collect`
                : `₹${stats.todayUpiRevenue.toLocaleString()} UPI · ₹${stats.todayCashRevenue.toLocaleString()} counter · ₹${stats.toCollectToday.toLocaleString()} still to collect`}
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span>{revenuePeriod === "all" ? "Spent (All Time)" : "Spent Today"}</span>
              <div className="kpi-icon-wrap blue">₹</div>
            </div>
            <div className="kpi-value">
              ₹{(revenuePeriod === "all" ? stats.spentAllTime : stats.spentToday).toLocaleString()}
            </div>
            <span className="kpi-subtext">
              {revenuePeriod === "all"
                ? `${plural(stats.allTimeExpenseCount, "expense", "expenses")} added so far`
                : stats.todayExpenseCount > 0
                  ? `${plural(stats.todayExpenseCount, "expense", "expenses")} added today`
                  : "Nothing spent today"}
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span>Kitchen Active</span>
              <div className="kpi-icon-wrap amber">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
            </div>
            <div className="kpi-value">{stats.active}</div>
            <span className="kpi-subtext">Placed, preparing, or ready</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span>Pending UTRs</span>
              <div className="kpi-icon-wrap amber">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
            <div className="kpi-value">{stats.pendingUtrs}</div>
            <span className="kpi-subtext">Awaiting payment verification</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span>Customer Rating</span>
              <div className="kpi-icon-wrap green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#2d6a4f" stroke="#2d6a4f" strokeWidth="1.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
            </div>
            <div className="kpi-value">
              {stats.avgRating} {stats.ratedCount > 0 && <small style={{ fontSize: 13, color: "var(--muted)" }}>/ 5.0</small>}
            </div>
            <span className="kpi-subtext">
              {stats.ratedCount === 0
                ? "No reviews yet"
                : `${stats.ratedCount} delivered review${stats.ratedCount > 1 ? "s" : ""}`}
            </span>
          </div>
        </section>

        {/* Tab 1: Live Orders */}
        {tab === "orders" && (
          <>
            {/* Quick Status Filter Tabs Ribbon */}
            <div className="status-tabs-ribbon">
              {[
                { id: "all", label: "All Orders", count: orders.length },
                { id: "placed", label: "Placed", count: orders.filter((o) => o.status === "placed").length },
                { id: "preparing", label: "Preparing", count: orders.filter((o) => o.status === "preparing").length },
                { id: "ready", label: "Ready", count: orders.filter((o) => o.status === "ready").length },
                { id: "delivered", label: "Delivered", count: orders.filter((o) => o.status === "delivered").length },
                { id: "cancelled", label: "Cancelled", count: orders.filter((o) => o.status === "cancelled").length },
                { id: "no_show", label: "No-show", count: orders.filter((o) => o.status === "no_show").length },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  className={`status-pill-btn ${statusFilter === pill.id ? "active" : ""}`}
                  onClick={() => setStatusFilter(pill.id)}
                >
                  <span className={`status-dot ${pill.id}`} />
                  <span>{pill.label}</span>
                  <span className="status-pill-counter">{pill.count}</span>
                </button>
              ))}
            </div>

            {/* Filter and Search Bar */}
            <div className="controls-bar">
              <div className="search-input-wrap">
                <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Order #, PIN, phone or name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="search-input"
                />
                {search && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="filters-group">
                <select
                  value={fulfilmentFilter}
                  onChange={(e) => setFulfilmentFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Fulfilment</option>
                  <option value="delivery">Hostel Room Delivery</option>
                  <option value="pickup">Campus pickup</option>
                </select>

                <select
                  value={slotFilter}
                  onChange={(e) => setSlotFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Time Slots</option>
                  {SLOT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Orders Feed (Responsive Cards) */}
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <p>
                  {ordersError
                    ? "Couldn't load orders. Check the connection and reload the page."
                    : orders.length === 0
                      ? "No orders yet."
                      : "No orders match these filters."}
                </p>
                {orders.length > 0 && (
                  <button
                    type="button"
                    className="action-btn secondary"
                    style={{ width: "auto", padding: "8px 20px" }}
                    onClick={() => {
                      setStatusFilter("all")
                      setFulfilmentFilter("all")
                      setSlotFilter("all")
                      setSearch("")
                    }}
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="orders-feed-grid">
                {filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onUpdateStatus={handleUpdateStatus}
                    onVerifyPayment={handleVerifyPayment}
                    onMarkRefunded={handleMarkRefunded}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab 2: Menu & Stock Inventory Management */}
        {tab === "inventory" && (
          <div className="inventory-section">
            <div className="inventory-header-bar">
              <div>
                <h3 style={{ fontSize: 18, color: "var(--olive)", fontWeight: 800 }}>Campus Menu & Stock Management</h3>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  Toggle items here. Sold out items instantly grey out on the student app in real-time.
                </p>
              </div>
              <div className="inventory-category-pills">
                {["all", "pickles", "fruits", "bowls"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`inventory-cat-btn ${inventoryCategory === cat ? "active" : ""}`}
                    onClick={() => setInventoryCategory(cat)}
                  >
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {picklesSoon === null ? (
              storeOpen !== null && (
                <div className="store-status-bar missing">Run the pickles SQL in Supabase to use the Preorder switch.</div>
              )
            ) : (
              <div className={`store-status-bar ${picklesSoon ? "soon" : "open"}`}>
                <span>
                  <span className="store-status-dot" />
                  {picklesSoon ? "Pickles are on Preorder: students see “Arriving soon”" : "Pickles are on sale"}
                </span>
                <button type="button" className="action-btn-small" onClick={handleTogglePicklesSoon}>
                  {picklesSoon ? "Put pickles on sale" : "Switch to Preorder"}
                </button>
              </div>
            )}

            <div className="inventory-grid">
              {filteredInventory.map((item) => (
                <div key={item.id} className={`inventory-item-card ${item.is_available ? "in-stock" : "sold-out"}`}>
                  <div className="inventory-item-top">
                    <div>
                      <span className="inventory-item-cat">{item.category}</span>
                      <strong className="inventory-item-name">{item.name}</strong>
                    </div>
                    <span className={`inventory-stock-pill ${item.is_available ? "available" : "out"}`}>
                      {item.is_available ? "In Stock" : "Sold Out"}
                    </span>
                  </div>

                  <div className="inventory-item-actions">
                    <button
                      type="button"
                      className={`inventory-toggle-btn ${item.is_available ? "to-sold" : "to-stock"}`}
                      onClick={() => handleToggleStock(item.id, item.is_available)}
                    >
                      {item.is_available ? "Mark as Sold Out" : "Mark as In Stock"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Support & Callback Inbox */}
        {tab === "support" && (
          <div className={`support-inbox-grid ${activeThread ? "has-selected" : ""}`}>
            {/* Left Column: Thread list */}
            <div className="support-list-pane">
              <div className="inbox-header">
                <span>Student Callback Requests</span>
                <span className="kanban-badge-count">{supportThreads.length}</span>
              </div>
              <div className="inbox-list">
                {supportThreads.length === 0 ? (
                  <div className="empty-state">
                    <p>No support requests received yet</p>
                  </div>
                ) : (
                  supportThreads.map((thread) => (
                    <div
                      key={thread.phone}
                      className={`inbox-item ${
                        selectedPhone &&
                        (get10DigitPhone(selectedPhone) || selectedPhone) ===
                          (get10DigitPhone(thread.phone) || thread.phone)
                          ? "active"
                          : ""
                      }`}
                      onClick={() => setSelectedPhone(thread.phone)}
                    >
                      <div className="inbox-item-top">
                        <span className="inbox-item-name">
                          {thread.messages[thread.messages.length - 1]?.sender === "customer" && (
                            <span className="awaiting-dot" title="Waiting for a reply" aria-label="Waiting for a reply" />
                          )}
                          {thread.customerName}
                        </span>
                        <span className="inbox-item-time">
                          {formatWhen(thread.latestAt)}
                        </span>
                      </div>
                      <span className="inbox-item-phone">{get10DigitPhone(thread.phone)}</span>
                      <div className="inbox-item-preview">
                        {thread.messages[thread.messages.length - 1]?.sender === "support" ? "You: " : ""}
                        {rebrand(thread.messages[thread.messages.length - 1]?.message || "Requested contact")}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Column: Active Thread Detail */}
            <div className="support-thread-pane">
              {activeThread ? (
                <>
                  <div className="thread-header">
                    <button
                      type="button"
                      className="mobile-back-to-inbox"
                      onClick={() => setSelectedPhone(null)}
                      aria-label="Back to conversations"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                      </svg>
                    </button>
                    <div className="thread-user-info">
                      <strong>{activeThread.customerName}</strong>
                      <span>({get10DigitPhone(activeThread.phone)})</span>
                    </div>
                    <a
                      href={`tel:${get10DigitPhone(activeThread.phone)}`}
                      className="action-btn call"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                      <span>Call {get10DigitPhone(activeThread.phone)}</span>
                    </a>
                  </div>

                  <div className="thread-messages" ref={threadMessagesRef}>
                    {activeThread.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`thread-bubble ${m.sender === "customer" ? "customer" : "support"}`}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, opacity: 0.8 }}>
                          {m.sender === "customer" && !SUPPORT_NAMES.includes(m.customer_name)
                            ? activeThread.customerName
                            : SUPPORT_NAME}
                        </div>
                        <div>{rebrand(m.message)}</div>
                        <div style={{ fontSize: 10, textAlign: "right", marginTop: 4, opacity: 0.7 }}>
                          {formatWhen(m.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <form className="thread-reply-bar" onSubmit={handleSendAdminReply}>
                    <input
                      type="text"
                      placeholder="Type a message to the student (syncs to their screen in real-time)..."
                      maxLength={2000}
                      value={adminReplyText}
                      onChange={(e) => setAdminReplyText(e.target.value)}
                      className="thread-reply-input"
                    />
                    <button
                      type="submit"
                      className="action-btn primary"
                      disabled={!adminReplyText.trim()}
                      style={{ flex: "0 0 auto", padding: "10px 20px" }}
                    >
                      Send Reply
                    </button>
                  </form>
                </>
              ) : (
                <div className="empty-state" style={{ margin: "auto" }}>
                  <p>Select a student request on the left to view messages</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Analytics */}
        {tab === "analytics" && (
          <div className="analytics-grid">
            {/* Store visitors: anonymous, one visit per browser session */}
            <div className="analytics-card" style={{ gridColumn: "1 / -1" }}>
              <div className="analytics-card-title">
                <div>
                  <span>Store Visitors</span>
                  <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "normal", marginTop: "2px" }}>
                    Phones and laptops that opened the student website (a visit is one browser-tab session)
                  </div>
                </div>
              </div>
              {visitStatsState === "ready" && visitStats ? (
                <div className="analytics-financial-grid">
                  <div className="fin-metric-box">
                    <small>Today</small>
                    <strong>{visitStats.today_visitors}</strong>
                    <span>
                      {visitStats.today_visitors === 1 ? "visitor" : "visitors"} · {plural(visitStats.today_visits, "visit", "visits")}
                    </span>
                  </div>
                  <div className="fin-metric-box">
                    <small>Last 7 Days</small>
                    <strong>{visitStats.week_visitors}</strong>
                    <span>
                      {visitStats.week_visitors === 1 ? "visitor" : "visitors"} · {plural(visitStats.week_visits, "visit", "visits")}
                    </span>
                  </div>
                  <div className="fin-metric-box highlight">
                    <small>All Time</small>
                    <strong>{visitStats.total_visitors}</strong>
                    <span>
                      {visitStats.total_visitors === 1 ? "visitor" : "visitors"} · {plural(visitStats.total_visits, "visit", "visits")}
                    </span>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
                  {visitStatsState === "missing"
                    ? "Visitor counts appear once the site_visits SQL has been run in Supabase."
                    : visitStatsState === "error"
                      ? "Couldn't load visitor counts. Open this tab again to retry."
                      : "Loading visitor counts…"}
                </p>
              )}
            </div>

            {/* Financial Settlement Breakdown */}
            <div className="analytics-card" style={{ gridColumn: "1 / -1" }}>
              <div className="analytics-card-title">
                <div>
                  <span>
                    {revenuePeriod === "all"
                      ? "All-Time Revenue"
                      : "Daily Cash Flow"}
                  </span>
                  <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "normal", marginTop: "2px" }}>
                    {revenuePeriod === "all"
                      ? "Complete historical revenue ledger across all fulfilled orders"
                      : "Today's ledger from midnight to present"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div className="revenue-toggle-group">
                    <button
                      type="button"
                      className={`revenue-toggle-btn ${revenuePeriod === "today" ? "active" : ""}`}
                      onClick={() => setRevenuePeriod("today")}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className={`revenue-toggle-btn ${revenuePeriod === "all" ? "active" : ""}`}
                      onClick={() => setRevenuePeriod("all")}
                    >
                      All Time
                    </button>
                  </div>
                  <span className="brand-pill">Verified vs Cash</span>
                </div>
              </div>
              <div className="analytics-financial-grid">
                <div className="fin-metric-box">
                  <small>PhonePe UPI (verified)</small>
                  <strong>
                    ₹{(revenuePeriod === "all" ? stats.allTimeUpiRevenue : stats.todayUpiRevenue).toLocaleString()}
                  </strong>
                  <span>{plural(revenuePeriod === "all" ? stats.allTimeUpiCount : stats.todayUpiCount, "verified order", "verified orders")}</span>
                </div>
                <div className="fin-metric-box">
                  <small>Paid at Counter</small>
                  <strong>
                    ₹{(revenuePeriod === "all" ? stats.allTimeCashRevenue : stats.todayCashRevenue).toLocaleString()}
                  </strong>
                  <span>
                    {plural(revenuePeriod === "all" ? stats.allTimeCashCount : stats.todayCashCount, "handed-over order", "handed-over orders")}
                    {(revenuePeriod === "all" ? stats.allTimeCounterSales : stats.todayCounterSales) > 0 &&
                      ` + ${plural(revenuePeriod === "all" ? stats.allTimeCounterSales : stats.todayCounterSales, "counter sale", "counter sales")}`}
                  </span>
                </div>
                <div className="fin-metric-box">
                  <small>Delivery Fees</small>
                  <strong>
                    ₹{(revenuePeriod === "all" ? stats.allTimeDeliveryFees : stats.todayDeliveryFees).toLocaleString()}
                  </strong>
                  <span>
                    {plural(revenuePeriod === "all" ? stats.allTimePaidDeliveries : stats.todayPaidDeliveries, "paid room delivery", "paid room deliveries")}
                    {" "}· already counted in UPI + counter
                  </span>
                </div>
                <div className="fin-metric-box">
                  <small>Still to Collect</small>
                  <strong>
                    ₹{(revenuePeriod === "all" ? stats.toCollectAllTime : stats.toCollectToday).toLocaleString()}
                  </strong>
                  <span>Unverified UPI + counter orders not handed over</span>
                </div>
                <div className="fin-metric-box">
                  <small>Refunds Due</small>
                  <strong>₹{stats.refundsDue.toLocaleString()}</strong>
                  <span>
                    {stats.refundsDueCount > 0
                      ? `${plural(stats.refundsDueCount, "cancelled UPI order", "cancelled UPI orders")} to pay back`
                      : "Nothing to refund"}
                  </span>
                </div>
                <div className="fin-metric-box highlight">
                  <small>Total Collected</small>
                  <strong>
                    ₹{(revenuePeriod === "all" ? stats.allTimeRevenue : stats.revenue).toLocaleString()}
                  </strong>
                  <span>
                    {revenuePeriod === "all"
                      ? `${plural(stats.allTimeTotalOrders, "paid order", "paid orders")}${stats.allTimeCounterSales ? ` + ${plural(stats.allTimeCounterSales, "counter sale", "counter sales")}` : ""} (all time)`
                      : `${plural(stats.todayUpiCount + stats.todayCashCount, "paid order", "paid orders")}${stats.todayCounterSales ? ` + ${plural(stats.todayCounterSales, "counter sale", "counter sales")}` : ""} today`}
                  </span>
                </div>
                <div className="fin-metric-box">
                  <small>Total Spent</small>
                  <strong>
                    ₹{(revenuePeriod === "all" ? stats.spentAllTime : stats.spentToday).toLocaleString()}
                  </strong>
                  <span>
                    {revenuePeriod === "all"
                      ? `${plural(stats.allTimeExpenseCount, "expense", "expenses")} (all time)`
                      : `${plural(stats.todayExpenseCount, "expense", "expenses")} today`}
                  </span>
                </div>
              </div>
            </div>

            {/* Payments taken at the counter without an app order */}
            <div className="analytics-card" style={{ gridColumn: "1 / -1" }}>
              <div className="analytics-card-title">
                <div>
                  <span>Counter Sales</span>
                  <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "normal", marginTop: "2px" }}>
                    Cash or soundbox payments taken without an app order. They add into Paid at Counter.
                  </div>
                </div>
              </div>
              {counterSalesState === "missing" ? (
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
                  Run the counter_sales SQL in Supabase to start adding counter sales.
                </p>
              ) : (
                <>
                  <form className="counter-sale-form" onSubmit={handleAddCounterSale}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="any"
                      placeholder="Amount (₹)"
                      aria-label="Amount in rupees"
                      value={saleAmount}
                      onChange={(e) => setSaleAmount(e.target.value)}
                    />
                    <input
                      type="text"
                      maxLength={200}
                      placeholder="Note (optional)"
                      aria-label="Note"
                      value={saleNote}
                      onChange={(e) => setSaleNote(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="action-btn primary"
                      disabled={savingSale || !saleAmount}
                      style={{ flex: "0 0 auto", padding: "10px 20px" }}
                    >
                      {savingSale ? "Adding…" : "Add"}
                    </button>
                  </form>
                  {counterSalesState === "error" && (
                    <p style={{ fontSize: 12, color: "var(--red)", margin: "10px 0 0" }}>
                      Couldn't load counter sales. Reload the page to try again.
                    </p>
                  )}
                  {todaysSales.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>No counter sales added today.</p>
                  ) : (
                    <ul className="counter-sale-list">
                      {todaysSales.map((sale) => (
                        <li key={sale.id}>
                          <strong>₹{sale.amount.toLocaleString()}</strong>
                          <span>{sale.note || "Counter sale"}</span>
                          <small>{formatWhen(sale.created_at)}</small>
                          <button
                            type="button"
                            className="action-btn-small flag-btn"
                            onClick={() => removeEntry("counter_sales", sale, setCounterSales)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Money spent: fruit, packaging, gas and so on */}
            <div className="analytics-card" style={{ gridColumn: "1 / -1" }}>
              <div className="analytics-card-title">
                <div>
                  <span>Expenses</span>
                  <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "normal", marginTop: "2px" }}>
                    Money spent on fruit, packaging, gas and so on. They add into Spent.
                  </div>
                </div>
              </div>
              {expensesState === "missing" ? (
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
                  Run the expenses SQL in Supabase to start adding expenses.
                </p>
              ) : (
                <>
                  <form className="counter-sale-form" onSubmit={handleAddExpense}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="any"
                      placeholder="Amount (₹)"
                      aria-label="Expense amount in rupees"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                    />
                    <input
                      type="text"
                      maxLength={200}
                      placeholder="What for? (optional)"
                      aria-label="What the money was spent on"
                      value={expenseNote}
                      onChange={(e) => setExpenseNote(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="action-btn primary"
                      disabled={savingExpense || !expenseAmount}
                      style={{ flex: "0 0 auto", padding: "10px 20px" }}
                    >
                      {savingExpense ? "Adding…" : "Add"}
                    </button>
                  </form>
                  {expensesState === "error" && (
                    <p style={{ fontSize: 12, color: "var(--red)", margin: "10px 0 0" }}>
                      Couldn't load expenses. Reload the page to try again.
                    </p>
                  )}
                  {todaysExpenses.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>No expenses added today.</p>
                  ) : (
                    <ul className="counter-sale-list">
                      {todaysExpenses.map((expense) => (
                        <li key={expense.id}>
                          <strong>₹{expense.amount.toLocaleString()}</strong>
                          <span>{expense.note || "Expense"}</span>
                          <small>{formatWhen(expense.created_at)}</small>
                          <button
                            type="button"
                            className="action-btn-small flag-btn"
                            onClick={() => removeEntry("expenses", expense, setExpenses)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="analytics-card">
              <div className="analytics-card-title">
                <span>Fulfilment Ratio · {periodLabel}</span>
              </div>
              <div className="analytics-bar-row">
                <div className="analytics-bar-header">
                  <span>Hostel Room Delivery</span>
                  <span>{plural(chartDeliveries, "order", "orders")}</span>
                </div>
                <div className="analytics-progress-track">
                  <div
                    className="analytics-progress-fill"
                    style={{
                      width: `${(chartDeliveries / Math.max(chartDeliveries + chartPickups, 1)) * 100}%`,
                      background: "#bc6c25",
                    }}
                  />
                </div>
              </div>
              <div className="analytics-bar-row">
                <div className="analytics-bar-header">
                  <span>Campus Pickup</span>
                  <span>{plural(chartPickups, "order", "orders")}</span>
                </div>
                <div className="analytics-progress-track">
                  <div
                    className="analytics-progress-fill"
                    style={{
                      width: `${(chartPickups / Math.max(chartDeliveries + chartPickups, 1)) * 100}%`,
                      background: "var(--olive)",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card-title">
                <span>Slots Volume · {periodLabel}</span>
              </div>
              {SLOT_OPTIONS.map((slotName) => {
                const count = chartOrders.filter((o) => o.slot === slotName).length
                const pct = (count / Math.max(chartOrders.length, 1)) * 100
                return (
                  <div key={slotName} className="analytics-bar-row">
                    <div className="analytics-bar-header">
                      <span>{slotName}</span>
                      <span>{plural(count, "order", "orders")}</span>
                    </div>
                    <div className="analytics-progress-track">
                      <div className="analytics-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* What students said when rating their orders */}
            <div className="analytics-card" style={{ gridColumn: "1 / -1" }}>
              <div className="analytics-card-title">
                <div>
                  <span>Reviews</span>
                  <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "normal", marginTop: "2px" }}>
                    {stats.ratedCount > 0
                      ? `${stats.avgRating} average from ${plural(stats.ratedCount, "review", "reviews")}`
                      : "No reviews yet"}
                  </div>
                </div>
              </div>
              {reviews.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
                  Students can rate an order in Track Orders once it's delivered.
                </p>
              ) : (
                <ul className="review-list">
                  {reviews.map((o) => {
                    const stars = Math.max(0, Math.min(5, Math.round(o.rating || 0)))
                    return (
                      <li key={o.id}>
                        <div className="review-top">
                          <span className="review-stars" aria-label={`${stars} out of 5 stars`}>
                            {"★".repeat(stars)}
                            {"☆".repeat(5 - stars)}
                          </span>
                          <small>
                            #{o.order_number} · {o.customer_name} · {formatWhen(o.created_at)}
                          </small>
                        </div>
                        <p>{o.rating_feedback ? `"${o.rating_feedback}"` : "No written feedback"}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// Responsive Touch-Optimized Order Card with Payment Verification & PIN
function OrderCard({
  order,
  onUpdateStatus,
  onVerifyPayment,
  onMarkRefunded,
}: {
  order: OrderRecord
  onUpdateStatus: (id: string, next: OrderStatus) => void
  onVerifyPayment: (id: string, verified: boolean) => void
  onMarkRefunded: (id: string) => void
}) {
  const [copiedUtr, setCopiedUtr] = useState(false)
  const utrMatch = order.payment_method?.match(/UTR:\s*([A-Za-z0-9]+)/i)
  const utrCode = utrMatch ? utrMatch[1] : null

  const isUpi = order.payment_method?.includes("PhonePe") || order.payment_method?.toLowerCase().includes("upi")
  const isVerified = order.payment_status === "verified" || order.payment_method?.includes("[VERIFIED]")
  const isFailed = order.payment_status === "rejected" || order.payment_method?.includes("[FAILED]")

  const pin = getPickupPin(order)

  const handleCopyUtr = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (utrCode && navigator.clipboard) {
      navigator.clipboard.writeText(utrCode)
      setCopiedUtr(true)
      setTimeout(() => setCopiedUtr(false), 2000)
    }
  }

  const statusMap: Record<OrderStatus, { label: string; cls: string }> = {
    placed: { label: "Placed (New)", cls: "placed" },
    preparing: { label: "Preparing", cls: "preparing" },
    ready: { label: "Ready", cls: "ready" },
    delivered: { label: "Delivered", cls: "delivered" },
    cancelled: { label: "Cancelled", cls: "cancelled" },
    no_show: { label: "No-show", cls: "cancelled" },
  }

  // One wrong tap shouldn't cancel an order, so these ask first
  const cancel = () => {
    if (confirm(`Cancel order #${order.order_number}? The student will see it as cancelled.`)) onUpdateStatus(order.id, "cancelled")
  }
  const markNoShow = () => {
    if (confirm(`Mark order #${order.order_number} as not collected (no-show)?`)) onUpdateStatus(order.id, "no_show")
  }
  const markRefunded = () => {
    if (confirm(`Mark ₹${order.total} as refunded for order #${order.order_number}? Do this after you've sent the money back.`)) {
      onMarkRefunded(order.id)
    }
  }
  const st = statusMap[order.status] || { label: order.status, cls: "placed" }

  return (
    <div className={`order-card-mobile ${order.status}${isFailed ? " flagged" : ""}`}>
      {/* Top Header Row */}
      <div className="card-top-bar">
        <div className="card-top-left">
          <span className={`order-status-badge ${st.cls}`}>
            <span className={`status-dot ${st.cls}`} />
            <span>{st.label}</span>
          </span>
          <span className="order-number-pill">#{order.order_number}</span>
          <span className="pickup-pin-pill" title="Student must show this 4-digit code to collect">
            PIN {pin}
          </span>
        </div>
        <div className="order-time-slot">
          <span className="order-time-text">
            {formatWhen(order.created_at)}
          </span>
          <span className="order-slot-pill">{order.slot}</span>
        </div>
      </div>

      {/* Customer Info & Location */}
      <div className="card-customer-row">
        <div className="customer-info-block">
          <span className="customer-name-heading">{order.customer_name || "Campus Student"}</span>
          <span className="customer-location-desc">
            {order.fulfilment === "delivery" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                {order.hostel || "Hostel"}, Room {order.room || "—"}
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {order.hostel || "Campus pickup"}
              </span>
            )}
          </span>
        </div>
        <a
          href={`tel:${get10DigitPhone(order.customer_phone)}`}
          className="customer-call-action"
          title={`Call ${get10DigitPhone(order.customer_phone)}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span>{get10DigitPhone(order.customer_phone)}</span>
        </a>
      </div>

      <div className={`fulfilment-pill-row ${order.fulfilment}`}>
        <span>{order.fulfilment === "delivery" ? `Hostel Room Delivery (₹${order.delivery_fee})` : "Campus Pickup (Free)"}</span>
      </div>

      {/* Items List */}
      <div className="card-items-block">
        {(Array.isArray(order.items) ? order.items : []).filter(Boolean).map((item, idx) => (
          <div key={idx} className="card-item-entry">
            <span className="item-title">
              <strong className="item-qty-tag">{Number(item.quantity)}×</strong>
              <span>{String(item.name ?? "")}</span>
              {item.detail && <small className="item-subdetail">({String(item.detail)})</small>}
            </span>
            <span className="item-price-tag">₹{Number(item.price) * Number(item.quantity)}</span>
          </div>
        ))}
      </div>

      {/* Payment & Amount Row with Anti-Fraud Verification */}
      <div className="card-payment-amount-row">
        <div className="payment-badge-wrap">
          {isUpi ? (
            <div className="phonepe-status-pill">
              <span className="pe-brand">PhonePe UPI</span>
              {utrCode && (
                <button
                  type="button"
                  className="utr-inline-badge"
                  onClick={handleCopyUtr}
                  title="Click to copy UTR"
                >
                  <code>{utrCode}</code>
                  <span className="utr-copy-state">{copiedUtr ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>
          ) : (
            <span className="counter-status-pill">{order.fulfilment === "delivery" ? "Pay on Delivery" : "Pay at Counter"}</span>
          )}

          {/* Payment Verification Status Badge */}
          {isUpi && (
            <div className="payment-verification-status">
              {order.payment_status === "refunded" ? (
                <span className="verify-badge refunded">Refunded</span>
              ) : isVerified ? (
                <span className="verify-badge success">UTR Verified</span>
              ) : isFailed ? (
                <span className="verify-badge danger">Unverified / Flagged</span>
              ) : (
                <span className="verify-badge pending">Pending Verification</span>
              )}
            </div>
          )}
        </div>

        <div className="amount-display-box">
          <small>Total Amount</small>
          <strong>₹{order.total}</strong>
        </div>
      </div>

      {/* UPI Payment Verification Buttons */}
      {isUpi && order.payment_status !== "refunded" && (
        <div className="payment-verify-actions">
          {!isVerified && (
            <button
              type="button"
              className="action-btn-small verify-btn"
              onClick={() => onVerifyPayment(order.id, true)}
              title="Click after checking soundbox/merchant app"
            >
              Verify Payment
            </button>
          )}
          {!isFailed && (
            <button
              type="button"
              className="action-btn-small flag-btn"
              onClick={() => {
                if (confirm(`Flag order #${order.order_number} as unpaid? It won't count as money collected.`)) {
                  onVerifyPayment(order.id, false)
                }
              }}
              title="Flag if UTR is fake or payment was not received"
            >
              Flag Unpaid
            </button>
          )}
          {isVerified && (
            <span className="verified-confirm-text">Payment confirmed by kitchen staff</span>
          )}
        </div>
      )}

      {/* Student Feedback & Star Rating (if present) */}
      {typeof order.rating === "number" && order.rating > 0 && (
        <div className="order-rating-box">
          <div style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <svg
                key={s}
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill={s <= order.rating! ? "#f59e0b" : "none"}
                stroke="#f59e0b"
                strokeWidth="1.5"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ))}
          </div>
          <span className="rating-val">{order.rating}/5.0</span>
          {order.rating_feedback && (
            <p className="rating-comment">"{order.rating_feedback}"</p>
          )}
        </div>
      )}

      {/* Touch-Friendly Action Buttons */}
      <div className="card-action-buttons">
        {order.status === "placed" && (
          <>
            <button
              type="button"
              className="action-btn blue main-touch-btn"
              onClick={() => onUpdateStatus(order.id, "preparing")}
            >
              Start Kitchen Prep →
            </button>
            <button type="button" className="action-btn secondary cancel-touch-btn" onClick={cancel}>
              Cancel
            </button>
          </>
        )}

        {order.status === "preparing" && (
          <>
            <button
              type="button"
              className="action-btn green main-touch-btn"
              onClick={() => onUpdateStatus(order.id, "ready")}
            >
              Mark Ready for Pickup / Drop
            </button>
            <button type="button" className="action-btn secondary cancel-touch-btn" onClick={cancel}>
              Cancel
            </button>
          </>
        )}

        {order.status === "ready" && (
          <>
            <button
              type="button"
              className="action-btn primary main-touch-btn"
              onClick={() => onUpdateStatus(order.id, "delivered")}
            >
              Complete & Mark Delivered
            </button>
            <button type="button" className="action-btn secondary cancel-touch-btn" onClick={markNoShow}>
              No-show
            </button>
          </>
        )}

        {order.status === "delivered" && (
          <div className="order-closed-banner">
            <span>Completed & Delivered</span>
          </div>
        )}

        {order.status === "cancelled" && (
          <div className="order-cancelled-banner">
            <span>Order Cancelled</span>
          </div>
        )}

        {order.status === "no_show" && (
          <div className="order-cancelled-banner">
            <span>Not collected (no-show)</span>
          </div>
        )}

        {/* UPI money on an order that never went out: refund it (or keep it, for a no-show) */}
        {(order.status === "cancelled" || order.status === "no_show") &&
          isUpi &&
          (isVerified || order.payment_status === "refunded") &&
          (order.payment_status === "refunded" ? (
            <span className="verified-confirm-text refund-action">₹{order.total} refunded to the student</span>
          ) : (
            <button type="button" className="action-btn secondary refund-action" onClick={markRefunded}>
              {order.status === "cancelled" ? `Refund due ₹${order.total} · Mark refunded` : `Paid ₹${order.total} · Mark refunded`}
            </button>
          ))}
      </div>
    </div>
  )
}
