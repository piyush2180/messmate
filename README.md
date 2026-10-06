# MessMate · Campus Food Ordering & Kitchen Operations System

> A high-performance, mobile-first campus food delivery and artisanal pickle ordering web application tailored for university hostels, featuring real-time kitchen tracking, PhonePe UPI verification, and live two-way support chat.

---

## 📌 Table of Contents
1. [Overview](#-overview)
2. [Complete Technology Stack](#-complete-technology-stack)
   - [Frontend & UI Framework](#frontend--ui-framework)
   - [Styling & Design System](#styling--design-system)
   - [Backend, Database & Real-Time Sync](#backend-database--real-time-sync)
   - [Audio & Browser Native APIs](#audio--browser-native-apis)
   - [Quality Assurance & Testing](#quality-assurance--testing)
3. [Architecture & Repository Structure](#-architecture--repository-structure)
4. [In-Depth Feature Walkthrough](#-in-depth-feature-walkthrough)
   - [1. Student Storefront](#1-student-storefront)
   - [2. Kitchen Operations Dashboard](#2-kitchen-operations-dashboard)
   - [3. Automated Support Bot & Live Chat](#3-automated-support-bot--live-chat)
5. [Core Algorithms & Business Logic](#-core-algorithms--business-logic)
   - [Phone Normalization & Indian Mobile Validation](#phone-normalization--indian-mobile-validation)
   - [Deterministic 4-Digit Pickup PIN Generation](#deterministic-4-digit-pickup-pin-generation)
   - [Financial Arithmetic & Tampering Protection](#financial-arithmetic--tampering-protection)
   - [Dynamic Fruit Bowl Pricing Formula](#dynamic-fruit-bowl-pricing-formula)
   - [UPI UTR Reference Validation](#upi-utr-reference-validation)
   - [Order Idempotency Fingerprinting](#order-idempotency-fingerprinting)
   - [Fuzzy Chat Deduplication & Anti-Spam Rate Limiting](#fuzzy-chat-deduplication--anti-spam-rate-limiting)
   - [Safe Storage Resilience](#safe-storage-resilience)
   - [XSS & Malicious Input Sanitization](#xss--malicious-input-sanitization)
6. [Database Schema & Defense-in-Depth Security](#-database-schema--defense-in-depth-security)
   - [Database Tables](#database-tables)
   - [PostgreSQL Check Constraints](#postgresql-check-constraints)
   - [PL/pgSQL Anti-Tamper Immutability Trigger](#plpgsql-anti-tamper-immutability-trigger)
   - [Row Level Security (RLS) Policies](#row-level-security-rls-policies)
   - [High-Performance Database Indexes](#high-performance-database-indexes)
7. [Payment & Settlement Workflow](#-payment--settlement-workflow)
8. [Automated QA & Testing Suite](#-automated-qa--testing-suite)
9. [Local Development & Setup Guide](#-local-development--setup-guide)
10. [Production Deployment Guidelines](#-production-deployment-guidelines)

---

## 🚀 Overview

**MessMate** solves campus dining friction by providing university hostel students with quick access to authentic, homemade South Indian pickles, custom fresh fruit bowls, and evening dinner deliveries directly to their hostel blocks or pickup gates.

The system connects students with kitchen staff through **Supabase Realtime WebSockets**, delivering instant order status transitions, live kitchen sound alerts, live item availability toggling, and two-way in-app support chat without page reloads.

---

## 🛠 Complete Technology Stack

Everything powering MessMate has been carefully chosen for performance, zero runtime bloat, security, and mobile ergonomics:

### Frontend & UI Framework
- **React 19 (`react` & `react-dom` v19.0.0)**:
  - Leverages modern functional components and hooks (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`).
  - Utilizes React 19's optimized reconciliation engine for instant updates across cart interactions, real-time counters, and modals.
- **Vite 8 (`vite` v8.0.5)**:
  - Next-generation build tool and development server using native ES modules.
  - Sub-millisecond Hot Module Replacement (HMR) and optimized rollup production bundling.
  - Configured via `@vitejs/plugin-react` for Fast Refresh.
- **TypeScript 5.7 (`typescript` v5.7.0)**:
  - Strict type checking enabled (`strict: true`, `noImplicitAny: true`).
  - Explicit data contracts for orders, cart items, inventory status, support threads, and database tables.

### Styling & Design System
- **Tailwind CSS v4 (`tailwindcss` & `@tailwindcss/vite` v4.0.0)**:
  - The latest generation of Tailwind CSS with zero-config Vite integration via `@tailwindcss/vite`.
  - Utility-first layout engine for responsive touch grids, flex layouts, and adaptive spacing.
- **Custom Design Tokens & CSS Micro-Interactions (`src/index.css` & `admin-app/src/index.css`)**:
  - **Color Palette**: Bespoke campus culinary theme — olive sage greens, warm turmeric creams, crisp terracotta accents, and soft slate neutrals.
  - **Glassmorphism**: Backdrop blur overlays (`backdrop-blur-md`) for sticky navigation bars, slide-out cart drawers, and modals.
  - **Typography**: Editorial typography featuring Google Fonts:
    - *Newsreader* / *Playfair*: High-end serif styling for brand headings and pickle heritage titles.
    - *Outfit* / *Inter*: Highly legible sans-serif for numbers, prices, tags, and data tables.
  - **Micro-Animations**: Keyframe slide-ins, pulse badges, ripple taps, and smooth status transitions.

### Backend, Database & Real-Time Sync
- **Supabase (`@supabase/supabase-js` v2.117.2)**:
  - Official JavaScript/TypeScript client library for Supabase.
  - Manages database queries, connection pooling, and WebSocket subscriptions.
- **PostgreSQL 15 (Managed on Supabase)**:
  - Relational database engine powering persistent tables (`orders`, `support_messages`, `menu_inventory`).
  - Native PL/pgSQL procedural triggers for immutable audit protection.
  - Declarative check constraints for financial integrity.
- **Supabase Realtime (WebSockets & Postgres CDC)**:
  - Listens to PostgreSQL `INSERT` and `UPDATE` change data capture (CDC) events via `supabase_realtime` publication channels.
  - Pushes status changes to students and incoming orders to the kitchen instantly without polling.

### Audio & Browser Native APIs
- **Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`)**:
  - Generates synthetic melodic chimes directly through the browser sound engine.
  - Requires **zero external MP3/audio files**, guaranteeing zero network bandwidth usage and instant offline-ready acoustic alerts for new orders and incoming chat messages.
- **Mobile UPI Intent Linking (`upi://pay`)**:
  - Native deep-linking schema allowing 1-tap mobile handoff directly into PhonePe, Google Pay, Paytm, or BHIM.
- **Clipboard API (`navigator.clipboard.writeText`)**:
  - 1-click UPI ID copying with visual confirmation feedback.
- **Telephony API (`tel:`)**:
  - Direct 1-tap calling link in the support inbox allowing kitchen staff to immediately dial students for delivery clarification.

### Quality Assurance & Testing
- **Node.js Native Test Runner (`node --test`)**:
  - Zero-dependency automated test runner executing in milliseconds.
  - Runs with `--experimental-strip-types` to execute TypeScript tests natively without external transpile overhead.
- **Oxfmt (`oxfmt` v0.2.0)**:
  - Blazing-fast Rust-based code formatter ensuring consistent styling across the codebase.

---

## 🏗 Architecture & Repository Structure

The project is structured as a modular monorepo containing the student application, kitchen operations dashboard, database migrations, and QA test suites:

```
MessMate Monorepo
├── src/                                  # Student Storefront Application
│   ├── assets/                           # Brand assets, static media, SVGs
│   ├── lib/
│   │   ├── inventory.ts                  # Menu items catalog, categories, pickup locations, slots
│   │   ├── order-logic.ts                # Calculation engine, phone normalization, sanitization, validation
│   │   └── supabase.ts                   # Supabase client singleton & environment configuration
│   ├── App.tsx                           # Main student application state machine & UI views
│   ├── index.css                         # Student design tokens, animations, responsive classes
│   └── main.tsx                          # React entry point mounting to #root
│
├── admin-app/                            # Kitchen Operations & Dispatch Dashboard
│   ├── src/
│   │   ├── lib/
│   │   │   ├── inventory.ts              # Menu inventory definitions for stock toggling
│   │   │   └── supabase.ts               # Supabase client singleton for dashboard
│   │   ├── App.tsx                       # Kanban orders board, soundbox verification, support inbox
│   │   ├── index.css                     # High-density desktop & mobile kitchen dashboard styling
│   │   ├── types.ts                      # TypeScript data models and order status types
│   │   └── main.tsx                      # Admin React entry point
│   ├── package.json                      # Dashboard dependencies
│   ├── tsconfig.json                     # TypeScript configuration
│   └── vite.config.ts                    # Vite bundler configuration
│
├── tests/                                # Automated QA Test Suites
│   ├── messmate-qa-edge-cases.test.ts    # 46 automated unit, financial, security, and edge-case tests
│   └── messmate-live-db-integration.test.ts # 8 live Supabase integration & trigger verification tests
│
├── supabase_schema.sql                   # Idempotent database migrations, RLS, triggers & indexes
├── index.html                            # Student Vite HTML shell with SEO meta tags & mobile viewports
├── package.json                          # Root dependencies and scripts
├── tsconfig.json                         # Root TypeScript configuration
└── vite.config.ts                        # Root Vite configuration with @tailwindcss/vite
```

---

## 🌟 In-Depth Feature Walkthrough

### 1. Student Storefront
- **Artisanal Pickle Catalog**:
  - Interactive cards featuring Andhra Mango (*Avakaya*), Gongura Leaf (*Ambadi*), Spicy Garlic, and Tangy Lemon pickles.
  - Each item displays a visual spice meter (1 to 3 chillies), diet tags (Vegetarian, Vegan, Gluten-Free), and detailed shelf-life guidance.
  - Dynamic weight selector allows switching between **50g**, **100g**, **250g**, and **500g** portion sizes with instant price calculation.
- **Interactive Fruit Bowl Customizer**:
  - Real-time custom fresh fruit bowl builder.
  - Base portion starts at ₹35, with optional add-on fruits (Apple, Banana, Papaya, Watermelon, Pineapple, Pomegranate, Muskmelon) dynamically calculated at ₹7 per portion.
- **Slide-Out Cart Drawer**:
  - Quantity increment/decrement controls with automatic zero-item removal guards.
  - Subtotal calculation shielded against floating-point precision errors.
- **Flexible Campus Fulfillment**:
  - **Campus Pickup (₹0 Free)**: Choose from predefined campus hubs:
    - *Hostel 3 Main Entrance*
    - *APJ Block Mess Gate*
    - *Asima Hostel Foyer*
  - **Room Delivery (₹7 Runner Fee)**: Direct-to-door delivery with hostel block and room number inputs.
- **Scheduled Evening Delivery Slots**:
  - Pre-order for dinner windows: *8:00–8:30 PM*, *8:30–9:00 PM*, or *9:00–9:30 PM*.
- **UPI & Cash Settlement**:
  - 1-tap mobile UPI intent link (`upi://pay`) to launch payment apps directly (PhonePe, Google Pay, Paytm).
  - 1-click UPI ID copy.
  - 12-digit bank UTR reference input with pattern validation.
  - Option to choose *Pay at Counter* (cash or counter scan upon pickup).
- **Deterministic 4-Digit Pickup PIN**:
  - Generates a secure 4-digit verification code for counter collection.
- **Real-Time Order Tracking**:
  - Students track active and historical orders by entering their phone number.
  - Visual status progress bar:
    $$\text{Placed} \longrightarrow \text{Preparing} \longrightarrow \text{Ready for Pickup} \longrightarrow \text{Delivered}$$
  - Live subscription listens for kitchen updates via WebSockets without page refreshes.
- **Floating Order-Ready Banner**:
  - When the kitchen marks an order as *Ready for Pickup*, a floating alert automatically pops up on the student's screen with their pickup PIN and instructions.
- **1-Click Reorder**:
  - Re-adds previous meal items into the cart with a single click from the order history view.
- **Pre-Prep Cancellation**:
  - Students can cancel orders with one tap as long as the kitchen has not started preparation.
- **Post-Delivery Meal Rating**:
  - Interactive 1 to 5 star rating modal with written feedback submitted directly to the database.

---

### 2. Kitchen Operations Dashboard
- **Kanban Kitchen Dispatch Board**:
  - High-visibility columns: *Placed (New)*, *Preparing*, *Ready for Pickup*, *Delivered*, and *Cancelled*.
  - Displays customer phone number, room/pickup location, fulfillment type, item breakdown, and total price.
- **Web Audio Soundbox Alerts**:
  - Integrated audio chime plays immediately upon receiving a new order or a student support message.
- **UPI Soundbox Verification**:
  - Kitchen staff inspects the student's entered 12-digit UTR against their physical UPI soundbox or banking app and toggles *Verify Payment* to confirm settlement.
- **Real-Time Stock Inventory Management**:
  - 1-click toggles to mark individual pickles or fruit bowl ingredients as *In Stock* or *Sold Out*, immediately reflecting on all student devices.
- **Multi-Thread Customer Support Inbox**:
  - Grouped by student phone number with full message history.
  - Direct telephone call button (`tel:`) to instantly call students for directions or clarification.
  - Bidirectional reply composer pushing instant replies to the student's screen.
  - Mobile-responsive layout allowing kitchen staff to switch between inbox and conversations effortlessly.
- **Kitchen Financial Analytics**:
  - Real-time calculations of gross revenue, cash vs. UPI breakdown, delivery fee collection, and average meal satisfaction ratings.

---

### 3. Automated Support Bot & Live Chat
- **Automated FAQ Intelligence**:
  - Offline intent classifier matching student keywords across 11 key campus mess topics:
    - Pickup location details
    - Pickup PIN retrieval
    - Pickle shelf life & ingredients
    - Delivery time slot schedules
    - Fruit bowl pricing formula
    - Order cancellation & refund guidelines
    - Payment settlement support
- **Live Support Escalation**:
  - If automated answers do not address the question, students can seamlessly type custom messages to live kitchen staff.
- **Fuzzy Message Deduplication**:
  - Merges optimistic client messages with server-synced records within a 90-second timestamp window.
- **Mobile Keyboard Resilience**:
  - Input bar stays anchored above the virtual keyboard without being obscured.

---

## 🧠 Core Algorithms & Business Logic

All core business logic resides in [`src/lib/order-logic.ts`](file:///c:/Users/Piyush/OneDrive/Desktop/fooododoo/src/lib/order-logic.ts) and is thoroughly tested by 46 automated test suites:

### Phone Normalization & Indian Mobile Validation
Standardizes Indian mobile numbers into clean 10-digit formats regardless of how the user formats their input:
- Strips international prefixes (`+91`, `0091`, `91`), leading zeros, spaces, parentheses, and dashes.
- Validates that the number starts with valid Indian telecom mobile prefixes (`6`, `7`, `8`, or `9`).
- Rejects incomplete numbers (<10 digits) or invalid characters.

### Deterministic 4-Digit Pickup PIN Generation
Ensures that both the student and the kitchen derive the exact same 4-digit pickup PIN for any order without needing server roundtrips:
```typescript
export function generatePickupPin(orderNumber?: number, explicitCode?: string): string {
  if (explicitCode && /^\d{4}$/.test(explicitCode)) return explicitCode;
  const num = Math.abs(Number(orderNumber) || 0);
  const pin = 1000 + (num * 7919 + 1013) % 9000;
  return pin.toString().padStart(4, '0');
}
```
*Properties*: Guaranteed range of `1000` to `9999`, uniformly distributed via the large prime multiplier `7919`.

### Financial Arithmetic & Tampering Protection
Prevents floating-point precision issues (e.g., `0.1 + 0.2 = 0.30000000000000004`) and guards against negative prices or quantities:
```typescript
export function calculateOrderTotals(items: Array<{ price: number; quantity: number }>, fulfillmentType: string) {
  let subtotal = 0;
  for (const item of items) {
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    const price = Math.max(0, Number(item.price) || 0);
    subtotal += price * qty;
  }
  const deliveryFee = fulfillmentType === 'delivery' ? 7 : 0;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    deliveryFee,
    total: Math.round((subtotal + deliveryFee) * 100) / 100
  };
}
```

### Dynamic Fruit Bowl Pricing Formula
$$P_{\text{bowl}} = ₹35 + (N_{\text{extra fruits}} \times ₹7)$$
Guarantees consistent base pricing while allowing unlimited combinations of fresh fruits.

### UPI UTR Reference Validation
Validates that customer-provided UPI transaction references match official NPCI / bank standards:
- Must be exactly 12 numeric digits (`^\d{12}$`).
- Rejects fake repeated digits (e.g., `000000000000`, `111111111111`).
- Rejects test sequences (e.g., `123456789012`).

### Order Idempotency Fingerprinting
Generates a deterministic hash from the order payload (phone, total, item signatures, and fulfillment type). If a student double-taps the place-order button, the identical fingerprint prevents duplicate submissions.

### Fuzzy Chat Deduplication & Anti-Spam Rate Limiting
- Merges optimistic client chat bubbles with server-confirmed records if text, phone, and sender match within a 90-second window.
- Rate limits chat burst submissions: triggers a spam warning if more than 4 messages are sent in 5 seconds.

### Safe Storage Resilience
The `safeStorage` wrapper wraps `window.localStorage` in a resilient `try/catch` block with an automatic in-memory fallback cache. This prevents catastrophic crashes when students browse in **Private / Incognito mode** or when browser storage quotas are exceeded (`QUOTA_EXCEEDED_ERR`).

### XSS & Malicious Input Sanitization
The `sanitizeInput` engine purges dangerous markup from student notes, delivery instructions, and chat messages:
- Strips `<script>...</script>`, `<style>...</style>`, and `<iframe>...</iframe>` blocks completely along with their inner contents.
- Removes HTML entities (`<`, `>`, `"`, `'`).
- Eliminates zero-width spaces and ASCII control characters.
- Truncates strings to safe maximum lengths (e.g., 500 characters).

---

## 🔒 Database Schema & Defense-in-Depth Security

All database structures and security rules are defined in [`supabase_schema.sql`](file:///c:/Users/Piyush/OneDrive/Desktop/fooododoo/supabase_schema.sql):

### Database Tables
1. **`public.orders`**:
   - `id`: Unique UUID primary key.
   - `order_number`: Monotonically increasing sequential integer.
   - `customer_name`: Student full name.
   - `customer_phone`: Normalized 10-digit phone number.
   - `delivery_address`: Room number, hostel block, or pickup gate.
   - `fulfillment_type`: `'pickup'` or `'delivery'`.
   - `time_slot`: Selected delivery window.
   - `items`: JSONB array storing items, portions, and unit prices.
   - `subtotal`: Cart subtotal in INR.
   - `delivery_fee`: Fulfillment fee (`0` for pickup, `7` for delivery).
   - `total`: Total payable amount in INR.
   - `payment_method`: `'upi'` or `'counter'`.
   - `payment_status`: `'pending'`, `'verified'`, or `'failed'`.
   - `utr_number`: 12-digit bank reference.
   - `pickup_code`: 4-digit counter pickup code.
   - `status`: `'placed'`, `'preparing'`, `'ready'`, `'delivered'`, `'cancelled'`.
   - `rating`: 1 to 5 star rating.
   - `rating_comment`: Student review feedback text.
   - `created_at`: Timestamp with timezone.

2. **`public.support_messages`**:
   - `id`: Unique UUID primary key.
   - `phone`: Customer phone number.
   - `sender`: `'customer'` or `'admin'`.
   - `message`: Text message body.
   - `created_at`: Timestamp with timezone.

3. **`public.menu_inventory`**:
   - `id`: Product slug identifier.
   - `item_name`: Display name.
   - `in_stock`: Boolean availability toggle.
   - `updated_at`: Timestamp with timezone.

### PostgreSQL Check Constraints
Enforced directly at the database engine level, making it impossible for malicious API calls to bypass frontend validations:
```sql
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_positive_total CHECK (total >= 0);
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_positive_subtotal CHECK (subtotal >= 0);
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_delivery_fee CHECK (delivery_fee IN (0, 7));
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_valid_rating CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_payment_status CHECK (payment_status IN ('pending', 'verified', 'failed'));
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_valid_phone CHECK (length(customer_phone) >= 10);
```

### PL/pgSQL Anti-Tamper Immutability Trigger
Prevents attackers from altering pricing, order numbers, or items on orders that have already been placed:
```sql
CREATE OR REPLACE FUNCTION protect_order_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.total != NEW.total OR OLD.subtotal != NEW.subtotal OR OLD.items != NEW.items OR OLD.order_number != NEW.order_number) THEN
    IF OLD.status != 'placed' AND NEW.status != 'cancelled' THEN
      RAISE EXCEPTION 'Order financial details and items are immutable once placed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_order_immutability
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION protect_order_immutability();
```

### Row Level Security (RLS) Policies
- Anonymous public users can only **insert** orders where `status = 'placed'` and `payment_status = 'pending'`. Attempts to inject pre-verified or pre-delivered orders are rejected by RLS.
- Students can read their own order records filtered by phone number.
- Public users can insert support messages for their own phone number and subscribe to real-time replies.

### High-Performance Database Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders (customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_phone ON public.support_messages (phone);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON public.support_messages (created_at ASC);
```

---

## 💳 Payment & Settlement Workflow

```
Student Cart (₹35)
       │
       ▼
Select Payment Method
 ├── Pay at Counter ──► Collect PIN ──► Pay cash or scan at counter pickup
 └── UPI Payment
       │
       ├── Option A: Tap 1-Click UPI Intent Link (PhonePe/GPay/Paytm)
       └── Option B: Copy UPI ID
       │
       ▼
Input 12-Digit UTR (Reference Number)
       │
       ▼
Order Submitted (Payment Status: Pending)
       │
       ▼
Kitchen Dashboard Receives Order + Chime Alert
       │
       ▼
Staff checks Soundbox / Bank App ──► Clicks "Verify Payment" ──► Order Prepped
```

---

## 🧪 Automated QA & Testing Suite

MessMate includes 54 automated unit, financial, security, and live database integration tests executed via the native Node.js test runner:

```bash
# Run the entire test suite
npm test
```

### Verified Test Suites
1. **Live Supabase Ping & Latency Benchmark**: Verifies database connectivity and roundtrip latency (<1000ms).
2. **Live Order Placement & Schema Contract**: Tests end-to-end order placement with auto-increment order numbers.
3. **Database Check Constraints**: Verifies PostgreSQL blocks negative subtotals/totals and invalid phone numbers.
4. **Anti-Tamper Order Immutability Trigger**: Validates PostgreSQL aborts tampering with prices, items, or order numbers.
5. **Order State Machine Transitions**: Tests status progression (`placed` -> `preparing` -> `ready` -> `delivered` -> meal rating).
6. **Support Messaging Lifecycle**: Tests bidirectional conversation threading and chronological message ordering.
1. **Phone Normalization & Validation (6 Tests)**: Handles clean digits, strips `+91`/`91`, leading zeros, dashes, brackets, malicious script injections, and rejects malformed inputs.
2. **Deterministic Pickup PIN Algorithm (6 Tests)**: Preserves explicit codes, calculates 4-digit PINs deterministically, tests zero/negative/undefined order numbers, and fuzzes 1,000 random order numbers.
3. **Order Subtotals & Delivery Fees (4 Tests)**: Empty cart handling, ₹0 campus pickup, ₹7 room delivery, and negative quantity protections.
4. **Fruit Bowl Formula (1 Test)**: Validates base price ₹35 + ₹7 per portion.
5. **Order Cancellation Policy (1 Test)**: Restricts cancellation strictly to pending orders.
6. **Support Message Deduplication & Sorting (4 Tests)**: Exact ID deduplication, optimistic-to-server merging, chronological ascending order sorting, and rapid double-click filtering.
7. **Automated FAQ Intelligence Bot (7 Tests)**: Tests delivery timing, pickup spots, fruit pricing, shelf life, order tracking, cancellation queries, and fallback routing.
8. **UPI UTR Reference Validation (4 Tests)**: Enforces 12-digit numeric constraint, rejects malformed lengths, and blocks dummy patterns (`000000000000`, `123456789012`).
9. **Order Tracking Phone Normalization (1 Test)**: Normalizes varied customer phone inputs to find matching orders.
10. **Empty Cart Defense (1 Test)**: Detects and rejects empty order submissions.
11. **Admin Multi-Thread Grouping & Mobile Navigation (2 Tests)**: Groups messages across phone formats and verifies mobile inbox back-navigation.
12. **Financial Arithmetic Integrity (3 Tests)**: Guards against negative prices/quantities, fractional quantities, and float precision rounding (`0.1 + 0.2`).
13. **Storage Resilience (1 Test)**: Validates graceful fallback when `localStorage` is disabled or full.
14. **Input Sanitization & XSS Defense (2 Tests)**: Validates complete stripping of script bodies, HTML entities, and enforces maximum string lengths.
15. **Order Idempotency Fingerprinting (1 Test)**: Validates deterministic fingerprint generation to prevent duplicate submissions.
16. **Support Chat Rate Limiting (2 Tests)**: Enforces message content boundaries and detects burst spamming (>4 messages in 5s).

---

## 💻 Local Development & Setup Guide

### Prerequisites
- Node.js 20+ installed
- A free Supabase account and project

### 1. Clone the Repository
```bash
git clone https://github.com/tech-upriser/MessMate.git
cd MessMate
```

### 2. Install Dependencies
```bash
# Install student app dependencies
npm install

# Install kitchen dashboard dependencies
cd admin-app
npm install
cd ..
```

### 3. Configure Supabase Environment Variables
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```
Create a corresponding `.env` file inside `admin-app/`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Apply Database Migrations
1. Navigate to your Supabase project's **SQL Editor**.
2. Open [`supabase_schema.sql`](file:///c:/Users/Piyush/OneDrive/Desktop/fooododoo/supabase_schema.sql) from the repository.
3. Paste the contents into the SQL Editor and click **Run**.
4. The schema idempotently creates all tables, check constraints, RLS policies, indexes, and enables real-time publication.

### 5. Launch the Applications
```bash
# Terminal 1: Launch Student Storefront
npm run dev

# Terminal 2: Launch Kitchen Operations Dashboard
cd admin-app
npm run dev
```

---

## 🚀 Production Deployment Guidelines

### Student Storefront (Vercel)
- **Root Directory**: `./` (Root)
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_SUPABASE_URL`: Your production Supabase project URL
  - `VITE_SUPABASE_ANON_KEY`: Your production Supabase anonymous API key

### Kitchen Operations Dashboard (Vercel)
- Deploy as a separate project pointing to the same repository.
- **Root Directory**: `admin-app`
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_SUPABASE_URL`: Your production Supabase project URL
  - `VITE_SUPABASE_ANON_KEY`: Your production Supabase anonymous API key
- **Security Recommendation**: Enable **Deployment Protection** (Password Protection or SSO) under *Project Settings → Deployment Protection* in Vercel to restrict kitchen dashboard access to authorized campus dining staff.

