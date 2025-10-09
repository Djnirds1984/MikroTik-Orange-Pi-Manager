
import type { PanelSettings } from '../types.ts';

const apiBaseUrl = '/api/db';

const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
  
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Request failed with status ${response.status}` }));
        throw new Error(errorData.message);
    }
    
    if (response.status === 204) { // No Content
        return {} as T;
    }

    return response.json() as Promise<T>;
};

export const dbApi = {
    get: <T>(path: string): Promise<T> => fetchData<T>(path),
    post: <T>(path: string, data: any): Promise<T> => fetchData<T>(path, { method: 'POST', body: JSON.stringify(data) }),
    patch: <T>(path: string, data: any): Promise<T> => fetchData<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: <T>(path: string): Promise<T> => fetchData<T>(path, { method: 'DELETE' }),
};

export const getPanelSettings = (): Promise<PanelSettings> => {
    return dbApi.get<PanelSettings>('/panel-settings');
};

export const savePanelSettings = (settings: Partial<PanelSettings>): Promise<{ message: string }> => {
    return dbApi.post<{ message: string }>('/panel-settings', settings);
};
