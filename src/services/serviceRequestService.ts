import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  getDocs,
  Unsubscribe,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  ServiceRequest,
  ServiceRequestType,
  ServiceRequestStatus,
} from "../types/serviceRequest";
import { getOrCreateSessionId } from "../utils/session";

function serviceRequestCol(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "serviceRequests");
}

function toMs(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis!();
  }
  return Date.now();
}

function normalize(data: Record<string, unknown>): Omit<ServiceRequest, "id"> {
  const rawType = (data.requestType || data.type) as ServiceRequestType;
  const rawStatus = (data.status as ServiceRequestStatus) || "PENDING";
  // Normalize RESOLVED -> COMPLETED for spec alignment
  const status = rawStatus === "RESOLVED" ? "COMPLETED" : rawStatus;
  return {
    restaurantId: String(data.restaurantId || ""),
    tableId: String(data.tableId || ""),
    tableNumber: Number(data.tableNumber) || 0,
    requestType: rawType,
    type: rawType,
    status: status as ServiceRequestStatus,
    customerSessionId: String(data.customerSessionId || ""),
    orderId: data.orderId ? String(data.orderId) : undefined,
    createdAt: toMs(data.createdAt),
    updatedAt: toMs(data.updatedAt),
  };
}

export async function createServiceRequest(input: {
  restaurantId: string;
  tableId: string;
  tableNumber: number;
  requestType: ServiceRequestType;
  orderId?: string;
}): Promise<string> {
  const customerSessionId = getOrCreateSessionId();
  const col = serviceRequestCol(input.restaurantId);

  // Duplicate prevention: if identical PENDING request exists for same table/session within last 5 minutes, don't create new
  const fiveMinAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
  const dupQuery = query(
    col,
    where("tableId", "==", input.tableId),
    where("customerSessionId", "==", customerSessionId),
    where("requestType", "==", input.requestType),
    where("status", "==", "PENDING"),
    where("createdAt", ">=", fiveMinAgo)
  );
  const dupSnap = await getDocs(dupQuery);
  if (!dupSnap.empty) {
    throw new Error("A similar request is already pending. Please wait for staff to respond.");
  }

  const ref = await addDoc(col, {
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    tableNumber: input.tableNumber,
    requestType: input.requestType,
    type: input.requestType,
    status: "PENDING" as ServiceRequestStatus,
    customerSessionId,
    orderId: input.orderId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateServiceRequestStatus(
  restaurantId: string,
  requestId: string,
  newStatus: ServiceRequestStatus
): Promise<void> {
  const ref = doc(db, "restaurants", restaurantId, "serviceRequests", requestId);
  await updateDoc(ref, {
    status: newStatus,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToServiceRequests(
  restaurantId: string,
  callback: (requests: ServiceRequest[]) => void,
  status?: ServiceRequestStatus | null
): Unsubscribe {
  let q = query(serviceRequestCol(restaurantId), orderBy("createdAt", "desc"), limit(100));
  if (status) {
    q = query(
      serviceRequestCol(restaurantId),
      where("status", "==", status),
      orderBy("createdAt", "desc"),
      limit(100)
    );
  }
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...normalize(d.data()) }));
      callback(list);
    },
    () => callback([])
  );
}

export function subscribeToCustomerRequests(
  restaurantId: string,
  tableId: string,
  callback: (requests: ServiceRequest[]) => void
): Unsubscribe {
  const customerSessionId = getOrCreateSessionId();
  const q = query(
    serviceRequestCol(restaurantId),
    where("tableId", "==", tableId),
    where("customerSessionId", "==", customerSessionId),
    orderBy("createdAt", "desc"),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...normalize(d.data()) }));
      callback(list);
    },
    () => callback([])
  );
}

export async function getServiceRequests(
  restaurantId: string,
  status?: ServiceRequestStatus | null
): Promise<ServiceRequest[]> {
  let q = query(serviceRequestCol(restaurantId), orderBy("createdAt", "desc"), limit(100));
  if (status) {
    q = query(
      serviceRequestCol(restaurantId),
      where("status", "==", status),
      orderBy("createdAt", "desc"),
      limit(100)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...normalize(d.data()) }));
}
