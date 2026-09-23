import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

interface OrderInputItem {
  menuItemId: string;
  quantity: number;
  specialInstruction: string;
}

interface CreateOrderInput {
  restaurantId: string;
  tableId: string;
  qrToken: string;
  customerSessionId?: string;
  items: OrderInputItem[];
  specialInstructions?: string;
}

interface CreateStaffInput {
  restaurantId: string;
  fullName: string;
  email: string;
  password: string;
}

function randomToken(): string {
  return admin.firestore().collection("x").doc().id + admin.firestore().collection("x").doc().id;
}

/**
 * Securely creates an order for a customer.
 *
 * Validates restaurant/table/token server-side and uses the prices stored in
 * Firestore to compute the total — the client never supplies price or amount.
 */
export const createSecureOrder = functions.https.onCall(
  async (data: CreateOrderInput, context) => {
    if (!data || !data.restaurantId || !data.tableId || !data.qrToken) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Order is empty.");
    }

    const restaurantRef = db.doc(`restaurants/${data.restaurantId}`);
    const restaurantSnap = await restaurantRef.get();
    if (!restaurantSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Restaurant not found.");
    }
    const restaurant = restaurantSnap.data()!;
    if (!restaurant.isActive) {
      throw new functions.https.HttpsError("failed-precondition", "Restaurant is not active.");
    }

    const tableRef = restaurantRef.collection("tables").doc(data.tableId);
    const tableSnap = await tableRef.get();
    if (!tableSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Table not found.");
    }
    const table = tableSnap.data()!;
    if (!table.isActive) {
      throw new functions.https.HttpsError("failed-precondition", "Table is not active.");
    }
    if (table.qrToken !== data.qrToken) {
      throw new functions.https.HttpsError("permission-denied", "Invalid QR token.");
    }

    const orderItems: Array<{
      menuItemId: string;
      itemName: string;
      price: number;
      quantity: number;
      specialInstruction: string;
    }> = [];
    let totalAmount = 0;

    const seen = new Set<string>();
    for (const item of data.items) {
      const qty = Math.floor(Number(item.quantity));
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "Quantity must be greater than 0.");
      }
      if (seen.has(item.menuItemId)) {
        throw new functions.https.HttpsError("invalid-argument", "Duplicate menu item in order.");
      }
      seen.add(item.menuItemId);

      const menuRef = restaurantRef.collection("menuItems").doc(item.menuItemId);
      const menuSnap = await menuRef.get();
      if (!menuSnap.exists) {
        throw new functions.https.HttpsError("not-found", "A menu item is no longer available.");
      }
      const menu = menuSnap.data()!;
      if (!menu.isAvailable) {
        throw new functions.https.HttpsError("failed-precondition", "A menu item is unavailable.");
      }
      const price = Number(menu.price);
      if (!Number.isFinite(price)) {
        throw new functions.https.HttpsError("internal", "Invalid menu price.");
      }
      orderItems.push({
        menuItemId: item.menuItemId,
        itemName: menu.name,
        price,
        quantity: qty,
        specialInstruction: (item.specialInstruction || "").slice(0, 300),
      });
      totalAmount += price * qty;
    }

    const orderRef = restaurantRef.collection("orders").doc();
    await db.runTransaction(async (t) => {
      t.create(orderRef, {
        restaurantId: data.restaurantId,
        tableId: data.tableId,
        tableNumber: table.tableNumber,
        customerSessionId: data.customerSessionId || randomToken(),
        status: "PLACED",
        totalAmount,
        specialInstructions: (data.specialInstructions || "").slice(0, 500),
        trackingToken: randomToken(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const itemsCol = orderRef.collection("items");
      orderItems.forEach((oi) => {
        t.create(itemsCol.doc(), {
          ...oi,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    });

    return { orderId: orderRef.id, trackingToken: (await orderRef.get()).data()!.trackingToken };
  }
);

/**
 * Creates a kitchen staff member: a Firebase Auth user bound to the caller's
 * restaurant with KITCHEN role. Only the owner of the restaurant may call this.
 */
export const createKitchenStaff = functions.https.onCall(
  async (data: CreateStaffInput, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }

    if (!data || !data.restaurantId || !data.fullName || !data.email || !data.password) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const ownerUid = context.auth.uid;

    const restaurantSnap = await db.doc(`restaurants/${data.restaurantId}`).get();
    if (!restaurantSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Restaurant not found.");
    }
    if (restaurantSnap.data()!.ownerId !== ownerUid) {
      throw new functions.https.HttpsError("permission-denied", "You do not own this restaurant.");
    }

    const user = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.fullName,
    });

    const staffRef = restaurantSnap.ref.collection("staff").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await staffRef.set({
      uid: user.uid,
      fullName: data.fullName,
      email: data.email,
      role: "KITCHEN",
      isActive: true,
      createdAt: now,
    });

    await db.doc(`users/${user.uid}`).set(
      {
        uid: user.uid,
        fullName: data.fullName,
        email: data.email,
        role: "KITCHEN",
        restaurantId: data.restaurantId,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return { staffId: staffRef.id };
  }
);
