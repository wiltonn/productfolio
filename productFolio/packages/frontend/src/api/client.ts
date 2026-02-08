const API_BASE = '/api';

let getToken: (() => Promise<string>) | null = null;

export function setTokenProvider(fn: () => Promise<string>) {
  getToken = fn;
}

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

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Attach Auth0 Bearer token if available
  if (getToken) {
    try {
      const token = await getToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // Token retrieval failed — let the request proceed without auth
      // Auth0 SDK will handle re-auth if needed
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

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
