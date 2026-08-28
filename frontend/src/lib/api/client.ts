// src/lib/api/client.ts

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

let currentAccessToken: string | null = sessionStorage.getItem('docshield_access_token');
let activeOrgId: string | null = localStorage.getItem('docshield_active_org_id');
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

export const setAccessToken = (token: string | null) => {
  currentAccessToken = token;
  if (token) {
    sessionStorage.setItem('docshield_access_token', token);
  } else {
    sessionStorage.removeItem('docshield_access_token');
  }
};

export const getAccessToken = (): string | null => {
  return currentAccessToken;
};

export const setActiveOrganizationId = (orgId: string | null) => {
  activeOrgId = orgId;
  if (orgId) {
    localStorage.setItem('docshield_active_org_id', orgId);
  } else {
    localStorage.removeItem('docshield_active_org_id');
  }
};

export const getActiveOrganizationId = (): string | null => {
  return activeOrgId;
};

export interface RequestOptions extends RequestInit {
  params?: Record<string, any>;
  skipAuth?: boolean;
  isBlob?: boolean;
}

export class ApiError extends Error {
  public code: string;
  public status: number;
  public details?: any;

  constructor(message: string, code = 'API_ERROR', status = 500, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function apiClient<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, skipAuth, isBlob, headers, ...customConfig } = options;

  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  // Only set application/json if body is not FormData
  if (!(customConfig.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  if (!skipAuth && currentAccessToken) {
    defaultHeaders['Authorization'] = `Bearer ${currentAccessToken}`;
  }

  const currentOrgId = activeOrgId || localStorage.getItem('docshield_active_org_id');
  if (currentOrgId) {
    defaultHeaders['x-organization-id'] = currentOrgId;
  }

  const config: RequestInit = {
    ...customConfig,
    headers: {
      ...defaultHeaders,
      ...headers,
    },
    credentials: 'include', // include HTTP-only refresh cookies
  };

  let response = await fetch(url, config);

  // If 401 Unauthorized and not an auth attempt itself, attempt token refresh
  if (response.status === 401 && !skipAuth && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    if (isRefreshing) {
      try {
        const newToken = await new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
        // Retry with new token
        (config.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, config);
      } catch (err) {
        setAccessToken(null);
        throw err;
      }
    } else {
      isRefreshing = true;

      try {
        const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        const refreshData = await refreshRes.json();

        if (refreshRes.ok && refreshData.success && refreshData.data?.tokens?.accessToken) {
          const newToken = refreshData.data.tokens.accessToken;
          setAccessToken(newToken);
          processQueue(null, newToken);

          // Retry initial request
          (config.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
          response = await fetch(url, config);
        } else {
          setAccessToken(null);
          processQueue(new ApiError('Session expired. Please log in again.', 'AUTH_SESSION_EXPIRED', 401), null);
          throw new ApiError('Session expired. Please log in again.', 'AUTH_SESSION_EXPIRED', 401);
        }
      } catch (refreshErr) {
        setAccessToken(null);
        processQueue(refreshErr, null);
        throw refreshErr;
      } finally {
        isRefreshing = false;
      }
    }
  }

  if (isBlob) {
    if (!response.ok) {
      throw new ApiError('Failed to download artifact stream', 'DOWNLOAD_FAILED', response.status);
    }
    const blob = await response.blob();
    return blob as unknown as T;
  }

  let responseData: any;
  try {
    responseData = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new ApiError('An unexpected server error occurred', 'SERVER_ERROR', response.status);
    }
    return {} as T;
  }

  if (!response.ok || responseData.success === false) {
    const errorMsg = responseData?.error?.message || responseData?.message || 'Request failed';
    const errorCode = responseData?.error?.code || 'REQUEST_FAILED';
    const details = responseData?.error?.details;
    throw new ApiError(errorMsg, errorCode, response.status, details);
  }

  return responseData;
}
