export const API_BASE = '/api/v1';

export class ApiError extends Error {
  code: string;
  details: any;
  status: number;

  constructor(status: number, code: string, message: string, details: any = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let storedOwnerToken: string = '';

export function getOwnerToken(): string {
  if (!storedOwnerToken && typeof window !== 'undefined') {
    try {
      storedOwnerToken = localStorage.getItem('excelmind_owner_token') || '';
    } catch {}
  }
  return storedOwnerToken;
}

export function setOwnerToken(token: string) {
  if (token) {
    storedOwnerToken = token;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('excelmind_owner_token', token);
      } catch {}
    }
  }
}

export function clearOwnerToken() {
  storedOwnerToken = '';
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('excelmind_owner_token');
    } catch {}
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const headers = new Headers(options.headers || {});
  const token = getOwnerToken();
  if (token) {
    headers.set('X-Owner-Token', token);
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  // Extract owner token if backend returned or renewed one
  const respToken = response.headers.get('X-Owner-Token');
  if (respToken) {
    setOwnerToken(respToken);
  }

  if (!response.ok) {
    let errJson: any = null;
    try {
      errJson = await response.json();
    } catch {
      // Not JSON
    }

    const code = errJson?.error?.code || 'UNKNOWN_ERROR';
    const message = errJson?.error?.message || `Request failed with status ${response.status}`;
    const details = errJson?.error?.details || {};

    throw new ApiError(response.status, code, message, details);
  }

  // Handle binary/download responses
  const contentType = response.headers.get('content-type');
  if (contentType && (contentType.includes('application/octet-stream') || contentType.includes('text/csv') || contentType.includes('spreadsheetml'))) {
    return (await response.blob()) as unknown as T;
  }

  const data = await response.json();
  if (data && typeof data === 'object' && 'owner_token' in data && data.owner_token) {
    setOwnerToken(data.owner_token);
  }

  return data;
}
