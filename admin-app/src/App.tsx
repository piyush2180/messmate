import { useState, useEffect, useMemo, useRef } from "react"
import { supabase } from "./lib/supabase"
import type {
  OrderRecord,
  OrderStatus,
  SupportMessage,
  DashboardTab,
} from "./types"

// Web Audio API Ding chime for incoming orders
function playOrderChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15) // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch (err) {
    console.warn("Audio chime not allowed yet:", err)
  }
}

export default function App() {
  const [tab, setTab] = useState<DashboardTab>("orders")
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Filters
  // Filters
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [fulfilmentFilter, setFulfilmentFilter] = useState<string>("all")
  const [slotFilter, setSlotFilter] = useState<string>("all")

  // Support thread state
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [adminReplyText, setAdminReplyText] = useState("")

  // Initial Fetch & Realtime for Orders
  useEffect(() => {
    if (!supabase) return

    setIsLoadingOrders(true)
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setOrders(data as OrderRecord[])
        }
        setIsLoadingOrders(false)
      })

    const ordersChannel = supabase
      .channel("admin_orders_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newOrder = payload.new as OrderRecord
            setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)])
            if (soundEnabled) playOrderChime()
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
      .subscribe()

    return () => {
      supabase?.removeChannel(ordersChannel)
    }
  }, [soundEnabled])

  // Initial Fetch & Realtime for Support Messages
  useEffect(() => {
    if (!supabase) return

    supabase
      .from("support_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setSupportMessages(data as SupportMessage[])
        }
      })

    const supportChannel = supabase
      .channel("admin_support_channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const newMsg = payload.new as SupportMessage
          setSupportMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          if (soundEnabled && newMsg.sender === "customer") playOrderChime()
        }
      )
      .subscribe()

    return () => {
      supabase?.removeChannel(supportChannel)
    }
  }, [soundEnabled])

  // Update Order Status
  const handleUpdateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    )

    if (supabase) {
      try {
        await supabase
          .from("orders")
          .update({ status: nextStatus })
          .eq("id", orderId)
      } catch (err) {
        console.error("Failed to update order status:", err)
      }
    }
  }

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false
      if (fulfilmentFilter !== "all" && order.fulfilment !== fulfilmentFilter) return false
      if (slotFilter !== "all" && order.slot !== slotFilter) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const orderNumStr = `#${order.order_number}`
        const matchNum = orderNumStr.includes(q)
        const matchName = (order.customer_name || "").toLowerCase().includes(q)
        const matchPhone = (order.customer_phone || "").toLowerCase().includes(q)
        const matchHostel = (order.hostel || "").toLowerCase().includes(q)
        const matchRoom = (order.room || "").toLowerCase().includes(q)
        return matchNum || matchName || matchPhone || matchHostel || matchRoom
      }

      return true
    })
  }, [orders, statusFilter, fulfilmentFilter, slotFilter, search])

  // KPI Calculations
  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]
    const todayOrders = orders.filter((o) => (o.created_at || "").startsWith(today))
    const nonCancelledToday = todayOrders.filter((o) => o.status !== "cancelled")

    const revenue = nonCancelledToday.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    const active = orders.filter((o) => ["placed", "preparing", "ready"].includes(o.status)).length
    const deliveries = todayOrders.filter((o) => o.fulfilment === "delivery").length
    const pickups = todayOrders.filter((o) => o.fulfilment === "pickup").length
    const pendingCallbacks = new Set(
      supportMessages.filter((m) => m.sender === "customer").map((m) => m.phone)
    ).size

    return { revenue, active, deliveries, pickups, pendingCallbacks }
  }, [orders, supportMessages])

  // Support Threads grouped by phone
  const supportThreads = useMemo(() => {
    const threads: Record<string, { customerName: string; messages: SupportMessage[]; latestAt: string }> = {}
    supportMessages.forEach((msg) => {
      if (!threads[msg.phone]) {
        threads[msg.phone] = {
          customerName: msg.customer_name || "Student",
          messages: [],
          latestAt: msg.created_at,
        }
      }
      threads[msg.phone].messages.push(msg)
      if (msg.created_at > threads[msg.phone].latestAt) {
        threads[msg.phone].latestAt = msg.created_at
      }
      if (msg.customer_name && msg.customer_name !== "Student") {
        threads[msg.phone].customerName = msg.customer_name
      }
    })

    return Object.entries(threads)
      .map(([phone, data]) => ({ phone, ...data }))
      .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
  }, [supportMessages])

  // Select first phone if none selected
  useEffect(() => {
    if (!selectedPhone && supportThreads.length > 0) {
      setSelectedPhone(supportThreads[0].phone)
    }
  }, [supportThreads, selectedPhone])

  const activeThread = useMemo(() => {
    if (!selectedPhone) return null
    return supportThreads.find((t) => t.phone === selectedPhone) || null
  }, [supportThreads, selectedPhone])

  // Send Admin Reply to Support Thread
  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPhone || !adminReplyText.trim()) return

    const reply = adminReplyText.trim()
    setAdminReplyText("")

    const optimistic: SupportMessage = {
      id: `local-admin-${Date.now()}`,
      phone: selectedPhone,
      customer_name: activeThread?.customerName || "Student",
      sender: "support",
      message: reply,
      created_at: new Date().toISOString(),
    }
    setSupportMessages((prev) => [...prev, optimistic])

    if (supabase) {
      try {
        await supabase.from("support_messages").insert({
          phone: selectedPhone,
          customer_name: activeThread?.customerName || "Student",
          sender: "support",
          message: reply,
        })
      } catch (err) {
        console.error("Failed to send admin reply:", err)
      }
    }
  }

  return (
    <div className="admin-shell">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="brand-section">
            <div className="brand-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 4C11 4 5 8 5 15c0 2 1 4 3 5 7-1 11-6 12-16Z" />
                <path d="M4 21c3-6 7-9 13-12" />
              </svg>
            </div>
            <div className="brand-text">
              <div className="brand-title">
                MessMate <span className="brand-pill">Kitchen & Ops</span>
              </div>
              <span className="brand-subtitle">Campus Order Management Console</span>
            </div>
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
      <main className="admin-main">
        {/* KPI Ribbon */}
        <section className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-header">
              <span>Today's Revenue</span>
              <div className="kpi-icon-wrap olive">₹</div>
            </div>
            <div className="kpi-value">₹{stats.revenue.toLocaleString()}</div>
            <span className="kpi-subtext">From confirmed campus orders</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span>Kitchen Active</span>
              <div className="kpi-icon-wrap amber">⚡</div>
            </div>
            <div className="kpi-value">{stats.active}</div>
            <span className="kpi-subtext">Placed, preparing, or ready</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span>Hostel Deliveries</span>
              <div className="kpi-icon-wrap blue">🚪</div>
            </div>
            <div className="kpi-value">{stats.deliveries}</div>
            <span className="kpi-subtext">Room drop orders today</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span>Campus Pickups</span>
              <div className="kpi-icon-wrap green">📍</div>
            </div>
            <div className="kpi-value">{stats.pickups}</div>
            <span className="kpi-subtext">Hostel 3 station pickups</span>
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
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by order #, phone, student, hostel, room..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="search-input"
                />
                {search && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setSearch("")}
                  >
                    ✕
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
                  <option value="delivery">Hostel Room Delivery (₹7)</option>
                  <option value="pickup">Campus Pickup Table</option>
                </select>

                <select
                  value={slotFilter}
                  onChange={(e) => setSlotFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Time Slots</option>
                  <option value="8:00–8:30 PM">8:00–8:30 PM</option>
                  <option value="8:30–9:00 PM">8:30–9:00 PM</option>
                  <option value="9:00–9:30 PM">9:00–9:30 PM</option>
                </select>
              </div>
            </div>

            {/* Orders Feed (Responsive Cards) */}
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <p>No orders found matching this filter.</p>
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
              </div>
            ) : (
              <div className="orders-feed-grid">
                {filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onUpdateStatus={handleUpdateStatus}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab 2: Support & Callback Inbox */}
        {tab === "support" && (
          <div className="support-inbox-grid">
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
                      className={`inbox-item ${selectedPhone === thread.phone ? "active" : ""}`}
                      onClick={() => setSelectedPhone(thread.phone)}
                    >
                      <div className="inbox-item-top">
                        <span className="inbox-item-name">{thread.customerName}</span>
                        <span className="inbox-item-time">
                          {new Date(thread.latestAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <span className="inbox-item-phone">{thread.phone}</span>
                      <div className="inbox-item-preview">
                        {thread.messages[thread.messages.length - 1]?.message || "Requested contact"}
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
                    <div className="thread-user-info">
                      <strong>{activeThread.customerName}</strong>
                      <span>({activeThread.phone})</span>
                    </div>
                    <a
                      href={`tel:${activeThread.phone}`}
                      className="action-btn call"
                    >
                      📞 Call {activeThread.phone}
                    </a>
                  </div>

                  <div className="thread-messages">
                    {activeThread.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`thread-bubble ${m.sender === "customer" ? "customer" : "support"}`}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, opacity: 0.8 }}>
                          {m.sender === "customer" ? activeThread.customerName : "Campus Support Team"}
                        </div>
                        <div>{m.message}</div>
                        <div style={{ fontSize: 10, textAlign: "right", marginTop: 4, opacity: 0.7 }}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <form className="thread-reply-bar" onSubmit={handleSendAdminReply}>
                    <input
                      type="text"
                      placeholder="Type a message to the student (syncs to their screen in real-time)..."
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

        {/* Tab 3: Analytics */}
        {tab === "analytics" && (
          <div className="analytics-grid">
            <div className="analytics-card">
              <div className="analytics-card-title">
                <span>Fulfilment Ratio</span>
              </div>
              <div className="analytics-bar-row">
                <div className="analytics-bar-header">
                  <span>Hostel Room Delivery (₹7)</span>
                  <span>{stats.deliveries} orders</span>
                </div>
                <div className="analytics-progress-track">
                  <div
                    className="analytics-progress-fill"
                    style={{
                      width: `${(stats.deliveries / Math.max(stats.deliveries + stats.pickups, 1)) * 100}%`,
                      background: "#bc6c25",
                    }}
                  />
                </div>
              </div>
              <div className="analytics-bar-row">
                <div className="analytics-bar-header">
                  <span>Campus Pickup (Hostel 3)</span>
                  <span>{stats.pickups} orders</span>
                </div>
                <div className="analytics-progress-track">
                  <div
                    className="analytics-progress-fill"
                    style={{
                      width: `${(stats.pickups / Math.max(stats.deliveries + stats.pickups, 1)) * 100}%`,
                      background: "var(--olive)",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card-title">
                <span>Evening Slots Volume</span>
              </div>
              {["8:00–8:30 PM", "8:30–9:00 PM", "9:00–9:30 PM"].map((slotName) => {
                const count = orders.filter((o) => o.slot === slotName).length
                const pct = (count / Math.max(orders.length, 1)) * 100
                return (
                  <div key={slotName} className="analytics-bar-row">
                    <div className="analytics-bar-header">
                      <span>{slotName}</span>
                      <span>{count} orders</span>
                    </div>
                    <div className="analytics-progress-track">
                      <div className="analytics-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// Responsive Touch-Optimized Order Card
function OrderCard({
  order,
  onUpdateStatus,
}: {
  order: OrderRecord
  onUpdateStatus: (id: string, next: OrderStatus) => void
}) {
  const [copiedUtr, setCopiedUtr] = useState(false)
  const utrMatch = order.payment_method?.match(/UTR:\s*([A-Za-z0-9]+)/i)
  const utrCode = utrMatch ? utrMatch[1] : null

  const handleCopyUtr = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (utrCode && navigator.clipboard) {
      navigator.clipboard.writeText(utrCode)
      setCopiedUtr(true)
      setTimeout(() => setCopiedUtr(false), 2000)
    }
  }

  const statusMap: Record<OrderStatus, { label: string; icon: string; cls: string }> = {
    placed: { label: "Placed (New)", icon: "🕒", cls: "placed" },
    preparing: { label: "Preparing", icon: "🔥", cls: "preparing" },
    ready: { label: "Ready", icon: "📦", cls: "ready" },
    delivered: { label: "Delivered", icon: "✅", cls: "delivered" },
    cancelled: { label: "Cancelled", icon: "❌", cls: "cancelled" },
  }
  const st = statusMap[order.status] || { label: order.status, icon: "•", cls: "placed" }

  return (
    <div className={`order-card-mobile ${order.status}`}>
      {/* Top Header Row */}
      <div className="card-top-bar">
        <div className="card-top-left">
          <span className={`order-status-badge ${st.cls}`}>
            <span>{st.icon}</span>
            <span>{st.label}</span>
          </span>
          <span className="order-number-pill">#{order.order_number}</span>
        </div>
        <div className="order-time-slot">
          <span className="order-time-text">
            {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
              <>🚪 {order.hostel || "Hostel"}, Room {order.room || "—"}</>
            ) : (
              <>📍 Hostel 3 Pickup Point</>
            )}
          </span>
        </div>
        <a
          href={`tel:${order.customer_phone}`}
          className="customer-call-action"
          title={`Call ${order.customer_phone}`}
        >
          <span>📞</span>
          <span>{order.customer_phone}</span>
        </a>
      </div>

      <div className={`fulfilment-pill-row ${order.fulfilment}`}>
        <span>{order.fulfilment === "delivery" ? "🚀 Hostel Room Delivery (₹7)" : "🛍️ Campus Pickup (Hostel 3)"}</span>
      </div>

      {/* Items List */}
      <div className="card-items-block">
        {(order.items || []).map((item, idx) => (
          <div key={idx} className="card-item-entry">
            <span className="item-title">
              <strong className="item-qty-tag">{item.quantity}×</strong>
              <span>{item.name}</span>
              {item.detail && <small className="item-subdetail">({item.detail})</small>}
            </span>
            <span className="item-price-tag">₹{item.price * item.quantity}</span>
          </div>
        ))}
      </div>

      {/* Payment & Amount Row */}
      <div className="card-payment-amount-row">
        <div className="payment-badge-wrap">
          {order.payment_method?.includes("PhonePe") ? (
            <div className="phonepe-status-pill">
              <span className="pe-bolt">⚡</span>
              <span className="pe-brand">PhonePe UPI</span>
              {utrCode && (
                <button
                  type="button"
                  className="utr-inline-badge"
                  onClick={handleCopyUtr}
                  title="Click to copy UTR"
                >
                  <code>{utrCode}</code>
                  <span className="utr-copy-state">{copiedUtr ? "✓" : "📋"}</span>
                </button>
              )}
            </div>
          ) : (
            <span className="counter-status-pill">{order.payment_method || "Pay at Counter"}</span>
          )}
        </div>
        <div className="amount-display-box">
          <small>Total Amount</small>
          <strong>₹{order.total}</strong>
        </div>
      </div>

      {/* Touch-Friendly Action Buttons */}
      <div className="card-action-buttons">
        {order.status === "placed" && (
          <>
            <button
              type="button"
              className="action-btn blue main-touch-btn"
              onClick={() => onUpdateStatus(order.id, "preparing")}
            >
              🔥 Start Kitchen Prep →
            </button>
            <button
              type="button"
              className="action-btn secondary cancel-touch-btn"
              onClick={() => onUpdateStatus(order.id, "cancelled")}
            >
              Cancel
            </button>
          </>
        )}

        {order.status === "preparing" && (
          <button
            type="button"
            className="action-btn green main-touch-btn"
            onClick={() => onUpdateStatus(order.id, "ready")}
          >
            📦 Mark Ready for Pickup / Drop ✓
          </button>
        )}

        {order.status === "ready" && (
          <button
            type="button"
            className="action-btn primary main-touch-btn"
            onClick={() => onUpdateStatus(order.id, "delivered")}
          >
            ✅ Complete & Mark Delivered ✓
          </button>
        )}

        {order.status === "delivered" && (
          <div className="order-closed-banner">
            <span>✅ Completed & Delivered</span>
          </div>
        )}

        {order.status === "cancelled" && (
          <div className="order-cancelled-banner">
            <span>❌ Order Cancelled</span>
          </div>
        )}
      </div>
    </div>
  )
}
