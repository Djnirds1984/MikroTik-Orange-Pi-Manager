import type { NodeMcuSettings } from '../types.ts';

const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    // API backend is on port 3002
    const apiBaseUrl = `http://${window.location.hostname}:3002`;
    const response = await fetch(`${apiBaseUrl}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
  
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
        const error = new Error(errorData.message);
        (error as any).status = response.status;
        throw error;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
};

export const getNodeMcuSettings = (deviceIp: string, apiKey: string): Promise<NodeMcuSettings> => {
    return fetchData<NodeMcuSettings>('/api/nodemcu/proxy-get', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, path: '/get_config', apiKey }),
    });
};

export const saveNodeMcuSettings = (deviceIp: string, apiKey: string, settings: Partial<NodeMcuSettings>): Promise<{ message: string }> => {
    return fetchData<{ message: string }>('/api/nodemcu/proxy-post', {
        method: 'POST',
        body: JSON.stringify({
            deviceIp,
            path: '/save_config',
            apiKey,
            data: settings
        }),
    });
};

export const generateNodeMcuApiKey = (deviceIp: string, apiKey: string): Promise<{ new_api_key: string }> => {
    return fetchData<{ new_api_key: string }>('/api/nodemcu/proxy-get', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, path: '/generate_api_key', apiKey }),
    });
};