import axios, { AxiosRequestConfig } from "axios";
import { API_BASE } from "./config";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  clearTokens,
} from "./auth-storage";
import { getDeviceKey, type RestrictedDeviceAccess } from "./device-access";

const API = axios.create({
  baseURL: API_BASE,
  timeout: 600000, // 10 minutes
});

API.interceptors.request.use(async (config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  const deviceKey = getDeviceKey();
  if (deviceKey) {
    config.headers = config.headers || {};
    (config.headers as any)["X-Device-Key"] = deviceKey;
  }
  (config.headers as any).Accept = (config.headers as any).Accept || "application/json";
  const method = (config.method || 'get').toUpperCase();
  const isForm = typeof FormData !== 'undefined' && config.data instanceof FormData;
  if (!isForm && (method !== 'GET' || config.data !== undefined)) {
    (config.headers as any)["Content-Type"] = (config.headers as any)["Content-Type"] || "application/json";
  }
  return config;
});

interface FailedRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

export type RetriableAxiosConfig = AxiosRequestConfig & { _retry?: boolean };

const DEVICE_ACCESS_CODES = new Set([
  "DEVICE_CONTEXT_REQUIRED",
  "DEVICE_PENDING",
  "DEVICE_REREQUEST_PENDING",
  "DEVICE_REJECTED",
  "DEVICE_REVOKED",
  "IP_BLOCKED",
]);

function emitRestrictedAccess(data: RestrictedDeviceAccess | undefined) {
  if (typeof window === "undefined" || !data?.authState) return;
  window.dispatchEvent(
    new CustomEvent("device-access-restricted", { detail: data })
  );
}

const AUTH_STATE_BY_CODE: Record<string, RestrictedDeviceAccess["authState"]> = {
  DEVICE_CONTEXT_REQUIRED: "registration_required",
  DEVICE_PENDING: "pending",
  DEVICE_REREQUEST_PENDING: "rerequest_pending",
  DEVICE_REJECTED: "rejected",
  DEVICE_REVOKED: "revoked",
  IP_BLOCKED: "ip_blocked",
};

function normalizeRestrictedAccess(
  data: RestrictedDeviceAccess | undefined,
  code: string
): RestrictedDeviceAccess | undefined {
  const authState = data?.authState || AUTH_STATE_BY_CODE[code];
  return authState ? { ...(data || {}), authState, code } : undefined;
}

function invalidateSession() {
  clearTokens();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-session-invalidated"));
  }
}

API.interceptors.response.use(
  (response) => response,
  async (error: any) => {
    const originalRequest: RetriableAxiosConfig = error.config || {};
    const status = error?.response?.status;
    const responseData = error?.response?.data as RestrictedDeviceAccess | undefined;
    const responseCode = String((responseData as any)?.code || "");

    if (DEVICE_ACCESS_CODES.has(responseCode) || responseData?.authState === "ip_blocked") {
      const restricted = normalizeRestrictedAccess(responseData, responseCode);
      if (restricted?.authState === "registration_required" && !restricted.challengeToken) {
        invalidateSession();
      } else {
        emitRestrictedAccess(restricted);
      }
      return Promise.reject(error);
    }

    if ((status === 401 || status === 403) && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            (originalRequest.headers as any) =
              (originalRequest.headers as any) || {};
            (originalRequest.headers as any)[
              "Authorization"
            ] = `Bearer ${token}`;
            return API(originalRequest as any);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const currentRefreshToken = getRefreshToken();
        if (!currentRefreshToken) {
          processQueue(error, null);
          clearTokens();
          return Promise.reject(error);
        }

        const { data } = await axios.post<{ accessToken?: string }>(
          `${API_BASE}/auth/refresh-token`,
          { token: currentRefreshToken },
          { headers: getDeviceKey() ? { "X-Device-Key": getDeviceKey() as string } : undefined }
        );

        const newAccessToken = data?.accessToken;
        if (!newAccessToken) {
          throw new Error("No access token returned from refresh");
        }

        setAccessToken(newAccessToken);
        API.defaults.headers.common[
          "Authorization"
        ] = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        (originalRequest.headers as any) =
          (originalRequest.headers as any) || {};
        (originalRequest.headers as any)[
          "Authorization"
        ] = `Bearer ${newAccessToken}`;
        return API(originalRequest as any);
      } catch (refreshError) {
        processQueue(refreshError, null);
        const refreshData = (refreshError as any)?.response?.data as RestrictedDeviceAccess | undefined;
        const refreshCode = String((refreshData as any)?.code || "");
        const restricted = normalizeRestrictedAccess(refreshData, refreshCode);
        if (restricted?.authState === "registration_required" && !restricted.challengeToken) {
          invalidateSession();
        } else {
          emitRestrictedAccess(restricted);
        }
        clearTokens();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default API;
