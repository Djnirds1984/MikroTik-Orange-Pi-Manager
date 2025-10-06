import type { PanelHostStatus } from '../types.ts';

const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    // The panel API is on port 3001
    const apiBaseUrl = `http://${window.location.hostname}:3001`;
    const response = await fetch(`${apiBaseUrl}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
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
};

export const getPanelHostStatus = (): Promise<PanelHostStatus> => {
    return fetchData<PanelHostStatus>('/api/host-status');
};
