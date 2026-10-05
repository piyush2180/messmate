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
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [fulfilmentFilter, setFulfilmentFilter] = useState<string>("all")
  const [slotFilter, setSlotFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban")

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

          {/* Header Actions */}
          <div className="header-actions">
            <div className="live-indicator">
              <span className="live-dot" />
              <span>Realtime Live</span>
            </div>
            <button
              type="button"
              className={`sound-toggle-btn ${soundEnabled ? "active" : ""}`}
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Sound Alert On" : "Sound Alert Off"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {soundEnabled && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
              </svg>
              <span>{soundEnabled ? "Chime On" : "Chime Off"}</span>
            </button>
          </div>
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
              </div>

              <div className="filters-group">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="placed">Placed (New)</option>
                  <option value="preparing">Preparing</option>
                  <option value="ready">Ready</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  value={fulfilmentFilter}
                  onChange={(e) => setFulfilmentFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Fulfilment</option>
                  <option value="delivery">Hostel Room Delivery</option>
                  <option value="pickup">Campus Pickup</option>
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

                <div className="view-mode-toggle">
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === "kanban" ? "active" : ""}`}
                    onClick={() => setViewMode("kanban")}
                  >
                    Kanban
                  </button>
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === "table" ? "active" : ""}`}
                    onClick={() => setViewMode("table")}
                  >
                    Table
                  </button>
                </div>
              </div>
            </div>

            {/* Kanban View */}
            {viewMode === "kanban" && (
              <div className="kanban-board">
                {/* Column 1: Placed (New Orders) */}
                <div className="kanban-column">
                  <div className="kanban-col-header">
                    <div className="kanban-col-title">
                      <span className="status-dot placed" />
                      <span>Placed (New)</span>
                    </div>
                    <span className="kanban-badge-count">
                      {filteredOrders.filter((o) => o.status === "placed").length}
                    </span>
                  </div>
                  {filteredOrders
                    .filter((o) => o.status === "placed")
                    .map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onUpdateStatus={handleUpdateStatus}
                      />
                    ))}
                  {filteredOrders.filter((o) => o.status === "placed").length === 0 && (
                    <div className="empty-state">
                      <p>No new orders pending prep</p>
                    </div>
                  )}
                </div>

                {/* Column 2: Preparing */}
                <div className="kanban-column">
                  <div className="kanban-col-header">
                    <div className="kanban-col-title">
                      <span className="status-dot preparing" />
                      <span>Preparing in Kitchen</span>
                    </div>
                    <span className="kanban-badge-count">
                      {filteredOrders.filter((o) => o.status === "preparing").length}
                    </span>
                  </div>
                  {filteredOrders
                    .filter((o) => o.status === "preparing")
                    .map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onUpdateStatus={handleUpdateStatus}
                      />
                    ))}
                  {filteredOrders.filter((o) => o.status === "preparing").length === 0 && (
                    <div className="empty-state">
                      <p>No orders currently in prep</p>
                    </div>
                  )}
                </div>

                {/* Column 3: Ready */}
                <div className="kanban-column">
                  <div className="kanban-col-header">
                    <div className="kanban-col-title">
                      <span className="status-dot ready" />
                      <span>Ready for Pickup / Drop</span>
                    </div>
                    <span className="kanban-badge-count">
                      {filteredOrders.filter((o) => o.status === "ready").length}
                    </span>
                  </div>
                  {filteredOrders
                    .filter((o) => o.status === "ready")
                    .map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onUpdateStatus={handleUpdateStatus}
                      />
                    ))}
                  {filteredOrders.filter((o) => o.status === "ready").length === 0 && (
                    <div className="empty-state">
                      <p>No orders waiting for delivery</p>
                    </div>
                  )}
                </div>

                {/* Column 4: Delivered / Completed */}
                <div className="kanban-column">
                  <div className="kanban-col-header">
                    <div className="kanban-col-title">
                      <span className="status-dot delivered" />
                      <span>Delivered / Done</span>
                    </div>
                    <span className="kanban-badge-count">
                      {filteredOrders.filter((o) => o.status === "delivered").length}
                    </span>
                  </div>
                  {filteredOrders
                    .filter((o) => o.status === "delivered")
                    .slice(0, 10)
                    .map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onUpdateStatus={handleUpdateStatus}
                      />
                    ))}
                  {filteredOrders.filter((o) => o.status === "delivered").length === 0 && (
                    <div className="empty-state">
                      <p>No completed orders yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Table View */}
            {viewMode === "table" && (
              <div className="orders-table-card">
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Time & Slot</th>
                      <th>Customer</th>
                      <th>Fulfilment</th>
                      <th>Items</th>
                      <th>Payment / UTR</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>#{order.order_number}</strong>
                        </td>
                        <td>
                          <div>{new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                          <small style={{ color: "var(--muted)" }}>{order.slot}</small>
                        </td>
                        <td>
                          <div><strong>{order.customer_name}</strong></div>
                          <a href={`tel:${order.customer_phone}`} style={{ color: "var(--olive)", fontSize: 12 }}>
                            {order.customer_phone}
                          </a>
                        </td>
                        <td>
                          <span className={`order-fulfilment-pill ${order.fulfilment}`}>
                            {order.fulfilment === "delivery"
                              ? `Room Drop (${order.hostel || "Hostel"}, ${order.room || "Room"})`
                              : "Pickup (Hostel 3)"}
                          </span>
                        </td>
                        <td>
                          {(order.items || []).map((it, idx) => (
                            <div key={idx} style={{ fontSize: 12 }}>
                              {it.quantity}x {it.name}
                            </div>
                          ))}
                        </td>
                        <td>
                          {order.payment_method?.includes("PhonePe") ? (
                            <div className="table-payment-cell">
                              <span className="table-badge phonepe">⚡ PhonePe UPI</span>
                              {order.payment_method.includes("UTR:") && (
                                <code className="table-utr-tag">
                                  {order.payment_method.split("UTR:")[1]?.replace(")", "").trim()}
                                </code>
                              )}
                            </div>
                          ) : (
                            <span className="table-badge counter">{order.payment_method || "Counter"}</span>
                          )}
                        </td>
                        <td>
                          <strong>₹{order.total}</strong>
                        </td>
                        <td>
                          <select
                            value={order.status}
                            onChange={(e) => handleUpdateStatus(order.id, e.target.value as OrderStatus)}
                            className="filter-select"
                            style={{ fontSize: 11, padding: "4px 8px" }}
                          >
                            <option value="placed">Placed</option>
                            <option value="preparing">Preparing</option>
                            <option value="ready">Ready</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                        <td>
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="action-btn call"
                            title="Call Student"
                          >
                            📞 Call
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

// Order Card Component for Kanban
function OrderCard({
  order,
  onUpdateStatus,
}: {
  order: OrderRecord
  onUpdateStatus: (id: string, next: OrderStatus) => void
}) {
  return (
    <div className="order-card">
      <div className="order-card-top">
        <span className="order-number-badge">#{order.order_number}</span>
        <span className="order-time">
          {new Date(order.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div className="order-customer-info">
        <span className="customer-name">{order.customer_name || "Campus Student"}</span>
        <span className="customer-location">
          {order.fulfilment === "delivery" ? (
            <>🚪 {order.hostel || "Hostel"}, Room {order.room || "—"}</>
          ) : (
            <>📍 Hostel 3 Pickup Table</>
          )}
        </span>
      </div>

      <div className={`order-fulfilment-pill ${order.fulfilment}`}>
        {order.fulfilment === "delivery" ? "Room Delivery (₹7)" : "Free Pickup"}
      </div>

      <div className="order-items-box">
        {(order.items || []).map((item, idx) => (
          <div key={idx}>
            <div className="order-item-row">
              <strong>{item.quantity}x {item.name}</strong>
              <span>₹{item.price * item.quantity}</span>
            </div>
            {item.detail && <div className="order-item-detail">{item.detail}</div>}
          </div>
        ))}
      </div>

      <div className="order-card-footer">
        <span className="order-total-price">₹{order.total}</span>
        {order.payment_method?.includes("PhonePe") ? (
          <div className="phonepe-admin-badge" title="PhonePe UPI">
            <span>⚡ {order.payment_method}</span>
          </div>
        ) : (
          <span className="order-payment-method">{order.payment_method || "Counter"}</span>
        )}
      </div>

      <div className="card-actions">
        <a href={`tel:${order.customer_phone}`} className="action-btn call" title="Call Student">
          📞
        </a>

        {order.status === "placed" && (
          <button
            type="button"
            className="action-btn blue"
            onClick={() => onUpdateStatus(order.id, "preparing")}
          >
            Start Prep →
          </button>
        )}

        {order.status === "preparing" && (
          <button
            type="button"
            className="action-btn green"
            onClick={() => onUpdateStatus(order.id, "ready")}
          >
            Mark Ready ✓
          </button>
        )}

        {order.status === "ready" && (
          <button
            type="button"
            className="action-btn primary"
            onClick={() => onUpdateStatus(order.id, "delivered")}
          >
            Mark Delivered ✓
          </button>
        )}

        {order.status !== "cancelled" && order.status !== "delivered" && (
          <button
            type="button"
            className="action-btn secondary"
            onClick={() => onUpdateStatus(order.id, "cancelled")}
            title="Cancel order"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
