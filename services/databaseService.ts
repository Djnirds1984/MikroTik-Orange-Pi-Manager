// This service handles all communication with the panel's own database API (on port 3001)

const API_BASE_URL = `http://${window.location.hostname}:3001/api/db`;

async function fetcher<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
    throw new Error(errorData.message);
  }

  if (response.status === 204) { // No Content
    return null as T;
  }

  return response.json() as Promise<T>;
}

export const dbApi = {
    get: <T>(endpoint: string) => fetcher<T>(endpoint),
    post: <T>(endpoint: string, body: any) => fetcher<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
    patch: <T>(endpoint: string, body: any) => fetcher<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: <T>(endpoint: string) => fetcher<T>(endpoint, { method: 'DELETE' }),
};

// Specific endpoints for panel settings
export const getPanelSettings = () => dbApi.get('/panel-settings');
export const savePanelSettings = (settings: any) => dbApi.post('/panel-settings', settings);