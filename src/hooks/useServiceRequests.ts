import { useEffect, useState, useCallback } from "react";
import {
  subscribeToServiceRequests,
  subscribeToCustomerRequests,
  createServiceRequest,
  updateServiceRequestStatus,
} from "../services/serviceRequestService";
import type {
  ServiceRequest,
  ServiceRequestType,
  ServiceRequestStatus,
} from "../types/serviceRequest";

export function useRealtimeServiceRequests(
  restaurantId: string | null,
  status?: ServiceRequestStatus | null
) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToServiceRequests(restaurantId, (list) => {
      setRequests(list);
      setLoading(false);
    }, status ?? undefined);
    return () => unsub();
  }, [restaurantId, status]);

  const changeStatus = useCallback(
    async (requestId: string, newStatus: ServiceRequestStatus) => {
      if (!restaurantId) return;
      await updateServiceRequestStatus(restaurantId, requestId, newStatus);
    },
    [restaurantId]
  );

  return { requests, loading, changeStatus };
}

export function useCustomerServiceRequests(
  restaurantId: string | null,
  tableId: string | null
) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId || !tableId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToCustomerRequests(restaurantId, tableId, (list) => {
      setRequests(list);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId, tableId]);

  const create = useCallback(
    async (input: {
      restaurantId: string;
      tableId: string;
      tableNumber: number;
      requestType: ServiceRequestType;
      orderId?: string;
    }) => {
      return createServiceRequest(input);
    },
    []
  );

  return { requests, loading, create };
}
