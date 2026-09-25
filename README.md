# Smart Dine — QR Restaurant Ordering & Management System

A complete, production-ready QR-based restaurant ordering platform built on **Firebase**.

**No Supabase.** Firebase is the single source of truth.

Four user experiences in one system:

| Role | Experience |
|------|-----------|
| **Owner** | Web dashboard: restaurant, menu, categories, tables & QR, orders, staff (kitchen + waiter), settings, analytics, reports, live stats, billing |
| **Kitchen** | Web dashboard: real-time order tickets, acknowledge → preparing → ready → served, cancel (PLACED/PREPARING) |
| **Waiter** | Web dashboard: service-request inbox (call waiter / water / bill / assistance), acknowledge → complete, plus tables view |
| **Customer** | Public mobile-first web menu: scan QR → browse/search → cart → checkout (GST/service charge) → real-time tracking → bill & split → service requests |

> This repository also contains a Flutter Android app (`android/`, `lib/`) that has been
> configured to use the same Firebase project (`com.example.smartdine`). The main web
> product lives in the React app at the root.

---

## Tech Stack

- **React 18 + TypeScript + Vite** (code-split vendor/firebase/ui)
- **Tailwind CSS** + **Lucide React** + **@fontsource/inter**
- **React Router** (role-based protected routes, OWNER/KITCHEN/WAITER)
- **React Hook Form + Zod** (front-end validation)
- **Firebase Web SDK**
  - Authentication (email/password, secondary-app for staff creation — owner session preserved)
  - Cloud Firestore (real-time `onSnapshot`, transactions for stock, batched reports)
  - Cloud Functions (`createSecureOrder` authoritative GST/stock, `createStaff`/`createKitchenStaff` via Admin SDK)
  - Cloud Storage **(optional)** — only for logo / food image uploads; whole app works without it
- **QRCode** (QR generation / download / print) + **Billing** (`utils/billing.ts` + `sanitize.ts` for XSS-safe PDFs)
- **Vitest** (unit tests for billing, formatting, validation, analytics, order transitions)

> **Firebase Storage is OPTIONAL.** Smart Dine runs 100% on the Firebase **Spark
> (free) plan** — no billing upgrade, no storage bucket, no image uploads required.
> Everything works without Storage: menu items and settings save fine with no
> image, and the UI shows clean default placeholders. See
> [Firebase Storage is optional](#firebase-storage-is-optional).

---

## Feature Overview

### Owner
Register → create restaurant → add categories → add menu items (with optional stock tracking, low-stock badges, GST/service-charge) → add tables → generate/download/print QR, toggle `Customer Access` (`isAccessAvailable`) → monitor dashboard (Today's orders, active, completed, revenue, menu/table counts, occupancy) → all orders with status filters + cancel (PLACED/PREPARING) + pagination (`Load more`) → manage **kitchen + waiter** staff (owner session preserved via Cloud Function or secondary app) → analytics (`today/thisWeek/thisMonth/custom` with dish/peak/GST) → reports (`daily/weekly/monthly/custom` with batched CSV BOM + XSS-safe PDF) → edit restaurant & logo (Storage optional) → bill & split view → table occupancy (`AVAILABLE/OCCUPIED/PAYMENT_PENDING`).

### Kitchen
Login with owner-created credentials → see only assigned restaurant → Kanban `PLACED/PREPARING/READY` live tickets with big TABLE number, items, special instructions → `START COOKING → MARK READY → MARK SERVED` plus **Cancel** (PLACED/PREPARING) with confirmation → enforced `VALID_ORDER_TRANSITIONS`.

### Waiter
Login as WAITER → see only assigned restaurant → inbox of customer **service requests** (`CALL_WAITER`, `REQUEST_WATER`, `REQUEST_BILL`, `NEED_ASSISTANCE`) with `PENDING/ACKNOWLEDGED/COMPLETED` filters → `Acknowledge` → `Complete` / `Cancel` → plus tables view (occupancy, order, requests; owner-only actions hidden).

### Customer
Scan QR → public menu page (`/menu/:restaurantId/:tableId?token=...`) validates `isActive && qrToken && isAccessAvailable` → search, browse by category, stock `OUT/LOW` badges → add to cart (±, notes) → sticky cart → checkout (re-validates fresh table, shows `calculateBill` subtotal/GST/service/grand) → `createOrder` (tries `createSecureOrder` Cloud Function, falls back to transactional client with server-recomputed prices, stock atomic, GST) → real-time tracking page (`/order/:orderId?token=...` with `trackingToken`) → **Digital Bill** (`/bill/:restaurantId/:orderId`) with historical GST snapshot + `Download` (print, XSS-safe) + `Share` (Web Share API → clipboard) + **Split Bill** (equally by people or by items) → **Service Requests** panel (4 types, 5-min duplicate guard).

---

## Project Structure

```
src/
  components/  common/{Button,Form,Modal,States,Spinner,StatusBadge}  customer/ServiceRequestPanel
  pages/       auth/{Login,Register,ForgotPassword,CompleteSetup,AuthLayout}
              owner/{Dashboard,Menu,Categories,Tables,Orders,Staff,Settings,Analytics,Reports}
              kitchen/{Dashboard,Orders}  waiter/Dashboard  customer/{Menu,Checkout,OrderTracking,InvalidTable,Bill,BillShare}
  layouts/     OwnerLayout.tsx KitchenLayout.tsx WaiterLayout.tsx
  hooks/       useAuth useRestaurant useMenu useOrders useRealtimeOrders useTables useTableOccupancy useServiceRequests useAnalytics
  services/    authService restaurantService menuService tableService orderService staffService storageService serviceRequestService
  lib/         firebase.ts
  types/       auth restaurant menu table order serviceRequest
  utils/       qr validation formatting session billing sanitize
  routes/      AppRoutes.tsx ProtectedRoute.tsx
  context/     CartContext.tsx
  __tests__/   billing.test.ts formatting.test.ts validation.test.ts useAnalytics.test.ts sanitize.test.ts order.test.ts
  vitest.config.ts
```

Backend config:

```
firebase.json  firestore.rules  storage.rules  firestore.indexes.json
functions/     (createSecureOrder, createStaff, createKitchenStaff)  // stock + GST authoritative
android/app/google-services.json
.env.example   .firebaserc  vercel.json
```

> `storage.rules` is provided for future use but it is **not referenced** in
> `firebase.json`, so deploying **does not require Firebase Storage**.

---

## Getting Started (Web)

### Prerequisites
- Node.js 18+
- npm
- Firebase CLI (`npm install -g firebase-tools`)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill your Firebase values:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_PUBLIC_URL=
```

> `VITE_PUBLIC_URL` is used to build QR URLs. Leave empty to default to
> `window.location.origin`.

> `VITE_FIREBASE_STORAGE_BUCKET` is **optional**. You can leave it empty — the app
> runs fully on the Spark plan without it. It is only used to enable image uploads
> if you later add Firebase Storage.

### 3. Run locally

```bash
npm run dev        # dev server
npm run build      # type-check + production build
npm run lint       # lint
npm run preview    # serve production build
```

---

## Firebase Console Setup

For the project `smart-dine-befb9`:

1. **Firebase Authentication** → Sign-in method → enable **Email/Password**.
2. **Firestore Database** → create database (production mode); deploy rules (below).
3. **Hosting** → link project.

> **Firebase Storage is NOT required.** On the free Spark plan you can skip Cloud
> Storage entirely — the app runs fully without it (menu items and settings save
> without images, and default placeholders are shown). Cloud Functions are also
> **optional**: if you stay on Spark, ordering works via the client-side fallback
> documented below. Only add Storage and/or deploy Cloud Functions if you upgrade
> to the Blaze plan and want image uploads / server-side ordering.

### Deploy rules & indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

> There is **no Storage deploy step required**: `storage.rules` is not referenced
> in `firebase.json`, so `firebase deploy` succeeds without a Cloud Storage bucket
> (Spark plan).

### Deploy Cloud Functions (optional — needs Blaze plan)

```bash
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions
```

`createSecureOrder` is the **preferred** server-side path: it validates the QR
token, restaurant/table activity, menu availability, and computes prices
server-side (the client never supplies a price). If it is **not** deployed (e.g.
the free Spark plan, where Cloud Functions cannot run), the web client
automatically **falls back to client-side order creation** via Firestore, so the
full ordering flow — order → kitchen realtime → tracking → owner monitoring —
still works with **no billing upgrade**. The client path re-reads prices from
Firestore and re-validates the restaurant/table/token in the UI, and the
`firestore.rules` gate order creation to active tables with a matching QR token.

### Deploy web hosting

```bash
npm run build
firebase deploy --only hosting
```

---

## Firebase Storage is optional

Smart Dine runs **100% on the Firebase free Spark plan**, with **no billing
upgrade** and **without Firebase Storage**.

- `createSecureOrder` is called first; if the Cloud Function is not deployed
  (Spark), the client automatically falls back to Firestore order creation.
- The app never initialized Storage eagerly, so there are **no Storage
  initialization errors**, even when no bucket exists.
- **Menu items** can be created with **no image** — the image picker is optional
  and a failed/absent upload never blocks saving.
- **Restaurant profile** can be saved **without a logo**.
- When an item has no image, a clean **placeholder** (`🍽️`) is shown; when a
  restaurant has no logo, a **default letter avatar** is shown. No fake image
  URLs are stored in the database, and no external/third-party storage is used.
- `firebase.json` does **not** reference `storage.rules`, so `firebase deploy`
  succeeds on Spark without a Cloud Storage bucket.

> If you later enable Firebase Storage (Blaze plan) and uncomment/restore the
> `storage` block in `firebase.json`, image uploads become available. Until then,
> everything above continues to work.

---

## Data Model (Firestore)

```
users/{uid}
  uid, fullName, email, role ("OWNER"|"KITCHEN"|"WAITER"), restaurantId, timestamps

restaurants/{restaurantId}
  name, description, logoUrl, phone, address, ownerId, isActive, gstPercent, serviceChargePercent, timestamps

restaurants/{restaurantId}/categories/{categoryId}
  name, displayOrder, isActive, timestamps

restaurants/{restaurantId}/menuItems/{menuItemId}
  name, description, price, categoryId, imageUrl, preparationTime, isAvailable, trackStock, stockEnabled, stockQuantity, lowStockThreshold, timestamps

restaurants/{restaurantId}/tables/{tableId}
  tableNumber, capacity, qrToken, isActive, isAccessAvailable, timestamps

restaurants/{restaurantId}/staff/{staffId}
  uid, fullName, email, role ("KITCHEN"|"WAITER"), isActive, createdAt

restaurants/{restaurantId}/orders/{orderId}
  restaurantId, tableId, tableNumber, customerSessionId, status,
  totalAmount, gstPercent, gstAmount, serviceChargePercent, serviceChargeAmount, grandTotal, paymentStatus, qrToken,
  specialInstructions, trackingToken, timestamps (createdAt, updatedAt, preparingAt, readyAt, servedAt, paidAt)

restaurants/{restaurantId}/orders/{orderId}/items/{orderItemId}
  menuItemId, itemName, price, quantity, specialInstruction, restaurantId, tableId, qrToken, createdAt

restaurants/{restaurantId}/serviceRequests/{requestId}
  restaurantId, tableId, tableNumber, requestType/type ("CALL_WAITER"|"REQUEST_WATER"|"REQUEST_BILL"|"NEED_ASSISTANCE"),
  status ("PENDING"|"ACKNOWLEDGED"|"COMPLETED"|"RESOLVED"|"CANCELLED"), customerSessionId, orderId?, timestamps
```

**Order status flow (enforced):**

```
PLACED → PREPARING → READY → SERVED
PLACED → CANCELLED   (also allowed from PREPARING)
```

> `itemName` and `price` are snapshotted onto each order item, so later menu price
> changes never mutate old orders.

---

## Security

- **Firestore rules** (`firestore.rules` 265+ lines): `isOwnerOf` / `isKitchenOf` / `isWaiterOf` helpers; owners only access own restaurant (`restaurants/{id}.ownerId`); kitchen/waiter limited to assigned `restaurantId`; staff `isActive` not bypassed; `serviceRequests` `allow get` staff-only + `allow list` customer filtered `where tableId && customerSessionId` (prevents enumeration) + 5-clause composite indexes; stock decrement only via `stockQuantity` decrease + `name/price/categoryId` unchanged.
- **Order creation security.** `createSecureOrder` is authoritative: validates `isActive`, `isAccessAvailable`, QR token, menu `isAvailable`, price, **stock (trackStock/stockEnabled)**, computes `totalAmount + gstAmount + serviceChargeAmount + grandTotal` server-side with same `Math.round(...*100)/100`, transactional stock decrement (`isAvailable=false` if 0). Client fallback `createClientOrder` mirrors same transaction — **never trust client price/total**. `firestore.rules` `tableQrValid` gates Spark fallback to active table matching QR token.
- **Staff creation security.** Owner stays signed in: `createStaff` Cloud Function (Admin SDK, `ownerId` check, `already-exists` guard) is preferred; fallback uses **secondary Firebase app** (`initializeApp(..., "secondary-staff-creator")` + `signOut` after) so primary auth not switched. No Admin SDK keys in frontend.
- **Storage rules** (`storage.rules`): `size < 2 MiB` + `image/.*`, owner-only `firestore.get` check; **not referenced** in `firebase.json` on Spark (deploys without bucket).
- **XSS:** Bills/Reports PDFs use `escapeHtml` + `sanitizeUrl` (`utils/sanitize.ts`) before `document.write`; CSR CSV has BOM `\uFEFF` + quoted fields.
- **No passwords stored**, **no Admin SDK keys in frontend**, **no fake data** — all production data from Firestore. Tracking via unpredictable `trackingToken`; customers only see own order/request via token/session.

> **Realtime:** All dashboards and tracking use Firestore `onSnapshot` listeners
> (properly unsubscribed) — no polling, no manual refresh.

---

## Android Configuration (Flutter)

The Android app (`com.example.smartdine`) is wired to the same Firebase project.

- `android/app/google-services.json` is included.
- `android/settings.gradle.kts` declares the Google Services plugin:
  `id("com.google.gms.google-services") version "4.5.0" apply false`
- `android/app/build.gradle.kts` applies the plugin, sets `minSdk = 23`, and adds
  Firebase BoM `34.18.0` with only the services used:
  `firebase-firestore`, `firebase-auth`, `firebase-storage`, `firebase-appcheck`.

To build/run the Android app:

```bash
cd android && ./gradlew :app:assembleDebug
# or
flutter build apk
```

> If you change package name or re-download config, replace
> `android/app/google-services.json` from the Firebase console
> (Project settings → Your apps → Android).

---

## End-to-End Test Script

1. **Owner**: register → logged in → restaurant created.
2. Add category `Biriyani`.
3. Add menu item `Chicken Biriyani` ₹180.
4. Add **Table 5** → generate QR → download QR.
5. **Customer**: open the QR URL → menu appears with Table 5 → Chicken Biriyani visible → add quantity 2 → cart total ₹360 → **Place Order**.
6. **Kitchen**: dashboard receives the new order automatically → Table 5, Chicken Biriyani ×2 shown → **Start Cooking** (status → PREPARING).
7. **Customer**: tracking page automatically shows PREPARING.
8. **Kitchen**: **Mark Ready** (READY).
9. **Customer**: automatically sees READY.
10. **Owner**: dashboard shows the order and its live status; order appears in history.

---

## Build & Verify

```
npm install
npm run lint   # 0 errors (3 react-refresh warnings)
npm test       # 48 tests (billing, formatting, validation, analytics, sanitize, order transitions)
npm run build  # tsc + vite build, code-split vendor/firebase/ui/forms
npx tsc --noEmit
dart analyze   # flutter wrapper
```

> Note: The first `npm install` on this machine was interrupted; if you see
> `Cannot find module 'firebase/firestore'` (TS7016), run `npm install` again —
> a full, single-pass install is required for the Firebase type declarations.

---

## Troubleshooting

- **TS7016 / "implicitly any" for firebase modules** → re-run `npm install` cleanly
  (delete `node_modules` + `package-lock.json`), then `npm install`.
- **No composite index** → the app ships `firestore.indexes.json`; deploy it
  (`firebase deploy --only firestore:indexes`).
- **Order placement fails** → confirm `createSecureOrder` Cloud Function is deployed.
- **QR opens "Table Not Available"** → QR token rotated or table deactivated;
  regenerate the QR from the owner tables page.
