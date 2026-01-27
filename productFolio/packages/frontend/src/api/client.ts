const API_BASE = '/api';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Attempt to refresh the access token
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Always include cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle 401 - attempt token refresh
  if (response.status === 401) {
    // Avoid multiple concurrent refresh attempts
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken();
    }

    const refreshed = await refreshPromise;
    isRefreshing = false;
    refreshPromise = null;

    if (refreshed) {
      // Retry the original request
      const retryResponse = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (retryResponse.ok) {
        if (retryResponse.status === 204) {
          return undefined as T;
        }
        return retryResponse.json();
      }

      // If retry also fails, throw the error
      const errorBody = await retryResponse.text();
      let message: string;
      try {
        const parsed = JSON.parse(errorBody);
        message = parsed.message || parsed.error || retryResponse.statusText;
      } catch {
        message = errorBody || retryResponse.statusText;
      }
      throw new ApiError(retryResponse.status, retryResponse.statusText, message);
    }

    // Refresh failed - user needs to login again
    // Don't redirect here, let the ProtectedRoute handle it
    throw new ApiError(401, 'Unauthorized', 'Session expired. Please log in again.');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    let message: string;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.message || parsed.error || response.statusText;
    } catch {
      message = errorBody || response.statusText;
    }
    throw new ApiError(response.status, response.statusText, message);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint),

  post: <T>(endpoint: string, data: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  put: <T>(endpoint: string, data: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  patch: <T>(endpoint: string, data: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string, options?: { data?: unknown }) => {
    const requestOptions: RequestInit = { method: 'DELETE' };
    if (options?.data) {
      requestOptions.body = JSON.stringify(options.data);
    }
    return apiRequest<T>(endpoint, requestOptions);
  },
};
