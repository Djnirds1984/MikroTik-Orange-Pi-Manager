import type { NtpSettings } from '../types.ts';

// The panel's own API is served by the proxy on port 3001
const API_BASE_URL = `http://${window.location.hostname}:3001`;

const postData = async <T>(path: string, body: Record<string, any> = {}): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Panel API request failed');
  }
  return response.json();
};

const getData = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Panel API request failed');
  }
  return response.json();
}

export const rebootPanel = (): Promise<{ message: string }> => {
    return postData('/api/panel/reboot');
};

export const getPanelNtp = (): Promise<NtpSettings> => {
    return getData('/api/panel/ntp');
};

export const setPanelNtp = (settings: NtpSettings): Promise<{ message: string }> => {
    return postData('/api/panel/ntp', { settings });
};
