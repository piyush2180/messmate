import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

// Load .env variables if present
function loadEnv(): { url: string; key: string } {
  let url = process.env.VITE_SUPABASE_URL || ""
  let key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ""

  const envPath = resolve(process.cwd(), ".env")
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n")
    for (const line of lines) {
      const match = line.trim().match(/^([^=]+)=(.*)$/)
      if (match) {
        const [, k, v] = match
        if (k === "VITE_SUPABASE_URL" && !url) url = v.trim()
        if ((k === "VITE_SUPABASE_ANON_KEY" || k === "VITE_SUPABASE_PUBLISHABLE_KEY") && !key) key = v.trim()
      }
    }
  }

  return { url, key }
}

const { url, key } = loadEnv()
const hasLiveConfig = Boolean(url && key && url.startsWith("https://"))
const supabase = hasLiveConfig ? createClient(url, key) : null

describe("Live Supabase Integration & Security Controls QA", { skip: !hasLiveConfig }, () => {
  let testOrderId: string | null = null
  const testPhone = "9999888877"

  test("1. Live Supabase Ping & Latency Benchmark", async () => {
    assert.ok(supabase, "Supabase client should be initialized")
    const start = Date.now()
    const { data, error } = await supabase.from("menu_inventory").select("id, name, is_available").limit(5)
    const latency = Date.now() - start

    assert.equal(error, null, `Live query should succeed without error: ${error?.message}`)
    assert.ok(Array.isArray(data), "Should return menu inventory items array")
    assert.ok(latency < 3000, `Database round-trip latency (${latency}ms) should be under 3000ms`)
  })

  test("2. Live Order Placement & Constraints Verification", async () => {
    assert.ok(supabase)
    const payload = {
      customer_name: "QA Live Test Bot",
      customer_phone: testPhone,
      hostel: "Hostel 3 Entrance",
      room: "",
      fulfilment: "pickup",
      slot: "8:00 - 8:30 PM",
      items: [
        { id: "mango", name: "Andhra Mango Pickle", weight: "100g", price: 65, quantity: 1 }
      ],
      subtotal: 65,
      delivery_fee: 0,
      total: 65,
      payment_method: "counter",
      payment_status: "pending",
      pickup_code: "8888",
      status: "placed"
    }

    const { data, error } = await supabase.from("orders").insert(payload).select().single()

    assert.equal(error, null, `Order placement should succeed: ${error?.message}`)
    assert.ok(data, "Should return created order record")
    assert.ok(data.id, "Created order should have UUID id")
    assert.ok(data.order_number, "Created order should have sequential order_number")
    assert.equal(data.total, 65)
    assert.equal(data.status, "placed")

    testOrderId = data.id
  })

  test("3. Security: Database CHECK Constraint blocks negative order total", async () => {
    assert.ok(supabase)
    const maliciousPayload = {
      customer_name: "Attacker",
      customer_phone: "9876543210",
      hostel: "Fake Hostel",
      room: "0",
      fulfilment: "pickup",
      slot: "8:00 - 8:30 PM",
      items: [{ id: "mango", name: "Andhra Mango Pickle", price: -100, quantity: 1 }],
      subtotal: -100,
      delivery_fee: 0,
      total: -100,
      payment_method: "counter",
      payment_status: "pending",
      status: "placed"
    }

    const { error } = await supabase.from("orders").insert(maliciousPayload)
    assert.ok(error, "Database must reject negative total with a CHECK constraint error")
  })

  test("4. Security: Database CHECK Constraint blocks invalid short phone numbers", async () => {
    assert.ok(supabase)
    const shortPhonePayload = {
      customer_name: "Invalid Phone",
      customer_phone: "123", // Short phone (< 10 digits)
      hostel: "Hostel 3",
      room: "101",
      fulfilment: "delivery",
      slot: "8:00 - 8:30 PM",
      items: [{ id: "garlic", name: "Garlic Pickle", price: 65, quantity: 1 }],
      subtotal: 65,
      delivery_fee: 7,
      total: 72,
      payment_method: "counter",
      payment_status: "pending",
      status: "placed"
    }

    const { error } = await supabase.from("orders").insert(shortPhonePayload)
    assert.ok(error, "Database must reject phone numbers shorter than 10 digits")
  })

  test("5. Security: Anti-Tamper Trigger blocks modifying financial values on placed orders", async () => {
    assert.ok(supabase)
    assert.ok(testOrderId, "Requires testOrderId from previous test")

    // Attempt to tamper with price of placed order from ₹65 down to ₹1
    const { error } = await supabase
      .from("orders")
      .update({ total: 1, subtotal: 1 })
      .eq("id", testOrderId)

    assert.ok(error, "PostgreSQL immutability trigger must abort price alteration on placed orders")
    assert.match(
      error.message || "",
      /immutable|Security violation/i,
      "Error message should mention immutability or security violation"
    )
  })

  test("6. Order Status State Machine Transitions", async () => {
    assert.ok(supabase)
    assert.ok(testOrderId)

    // Transition: placed -> preparing
    const { error: prepError } = await supabase
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", testOrderId)
    assert.equal(prepError, null, "Should allow updating status to 'preparing'")

    // Transition: preparing -> ready
    const { error: readyError } = await supabase
      .from("orders")
      .update({ status: "ready" })
      .eq("id", testOrderId)
    assert.equal(readyError, null, "Should allow updating status to 'ready'")

    // Transition: ready -> delivered
    const { error: delError } = await supabase
      .from("orders")
      .update({ status: "delivered" })
      .eq("id", testOrderId)
    assert.equal(delError, null, "Should allow updating status to 'delivered'")

    // Submit post-delivery customer rating (5 stars)
    const { error: rateError } = await supabase
      .from("orders")
      .update({ rating: 5 })
      .eq("id", testOrderId)
    assert.equal(rateError, null, "Should allow submitting rating for delivered meal")
  })

  test("7. Support Messages Lifecycle & Query Validation", async () => {
    assert.ok(supabase)

    // 1. Insert customer message
    const { data: custMsg, error: custErr } = await supabase
      .from("support_messages")
      .insert({
        phone: testPhone,
        customer_name: "QA Live Test Bot",
        sender: "customer",
        message: "Where do I collect my order?"
      })
      .select()
      .single()

    assert.equal(custErr, null, "Customer support message insert should succeed")
    assert.ok(custMsg?.id, "Message should have a valid ID")

    // 2. Insert admin reply
    const { data: adminMsg, error: adminErr } = await supabase
      .from("support_messages")
      .insert({
        phone: testPhone,
        customer_name: "Mess Support Team",
        sender: "support",
        message: "Please collect from Hostel 3 Entrance counter!"
      })
      .select()
      .single()

    assert.equal(adminErr, null, "Support reply insert should succeed")
    assert.ok(adminMsg?.id)

    // 3. Query conversation thread by phone
    const { data: thread, error: threadErr } = await supabase
      .from("support_messages")
      .select("*")
      .eq("phone", testPhone)
      .order("created_at", { ascending: true })

    assert.equal(threadErr, null)
    assert.ok(thread && thread.length >= 2, "Thread should contain both customer and support messages")
    assert.equal(thread[thread.length - 2].sender, "customer")
    assert.equal(thread[thread.length - 1].sender, "support")
  })

  test("8. Teardown: Mark test order as cancelled", async () => {
    assert.ok(supabase)
    if (testOrderId) {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", testOrderId)
      assert.equal(error, null, "Should cleanly cancel QA test order")
    }
  })
})
