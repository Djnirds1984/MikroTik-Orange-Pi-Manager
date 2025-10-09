import type { ZeroTierStatusResponse } from '../types.ts';

const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    // The API backend is on the same host, but managed by the proxy server on port 3001
    const apiBaseUrl = ``;
    const response = await fetch(`${apiBaseUrl}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
  
    const contentType = response.headers.get("content-type");
    if (!response.ok) {
        let errorMsg = `Request failed with status ${response.status}`;
        if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMsg = errorData.message || errorMsg;
            // Attach the JSON response to the error object for inspection in the catch block.
            const error = new Error(errorMsg);
            (error as any).data = errorData;
            throw error;
        } else {
            errorMsg = await response.text();
        }
        throw new Error(errorMsg);
    }

    if (contentType && contentType.includes("application/json")) {
        return response.json() as Promise<T>;
    }
    // Handle cases where the response might be empty (e.g., 204 No Content) or text
    return response.text() as unknown as Promise<T>;
};

export const getZeroTierStatus = (): Promise<ZeroTierStatusResponse> => {
    return fetchData<ZeroTierStatusResponse>('/api/zt/status');
};

export const joinZeroTierNetwork = (networkId: string): Promise<{ message: string }> => {
    return fetchData<{ message: string }>('/api/zt/join', {
        method: 'POST',
        body: JSON.stringify({ networkId }),
    });
};

export const leaveZeroTierNetwork = (networkId: string): Promise<{ message: string }> => {
    return fetchData<{ message: string }>('/api/zt/leave', {
        method: 'POST',
        body: JSON.stringify({ networkId }),
    });
};

type ZeroTierSetting = 'allowManaged' | 'allowGlobal' | 'allowDefault';
export const setZeroTierNetworkSetting = (networkId: string, setting: ZeroTierSetting, value: boolean): Promise<{ message: string }> => {
    return fetchData<{ message: string }>('/api/zt/set', {
        method: 'POST',
        body: JSON.stringify({ networkId, setting, value }),
    });
};