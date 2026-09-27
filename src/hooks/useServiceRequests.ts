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
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = subscribeToServiceRequests(
      restaurantId,
      (list) => {
        setRequests(list);
        setError(null);
        setLoading(false);
      },
      status ?? undefined,
      () => {
        setError("Unable to load service requests. Please check your connection and try again.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [restaurantId, status, retryKey]);

  const changeStatus = useCallback(
    async (requestId: string, newStatus: ServiceRequestStatus) => {
      if (!restaurantId) return;
      await updateServiceRequestStatus(restaurantId, requestId, newStatus);
    },
    [restaurantId]
  );

  const retry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  return { requests, loading, error, retry, changeStatus };
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
