import type { NodeMcuStatus } from '../types.ts';

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

    // Reboot might return text/html, settings should return json
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
};

export const getVendingStatus = (deviceIp: string, apiKey: string): Promise<NodeMcuStatus> => {
    return fetchData<NodeMcuStatus>('/api/nodemcu/proxy-get', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, path: '/get_status', apiKey }),
    });
};