import type { SystemInfo, Interface, HotspotClient, LogEntry, RouterConfig, RouterConfigWithId, TestConnectionResponse, PppoeSettings, PppoeClient } from '../types.ts';

const API_BASE_URL = '/api';

const fetchData = async <T>(endpoint: string, router: RouterConfigWithId): Promise<T> => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(router),
    });
    if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `Proxy server returned an error: ${response.status}`;

        if (contentType && contentType.includes('application/json')) {
            const errorBody = await response.json();
            errorMessage = errorBody.error || errorMessage;
        } else {
            // The response is not JSON, likely HTML from the catch-all for a 404
            const textResponse = await response.text();
            if (textResponse.includes('DOCTYPE html')) {
                 errorMessage = `The API endpoint was not found (${response.status}). The backend server may be out of date or misconfigured.`;
            } else {
                 errorMessage = `Received a non-JSON response from the server: ${response.statusText}`;
            }
        }
        throw new Error(errorMessage);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    console.error(`Failed to fetch from ${endpoint} for router ${router.name}:`, error);
    throw error;
  }
};

export const getSystemInfo = async (router: RouterConfigWithId): Promise<SystemInfo> => {
  return fetchData<SystemInfo>('/system-info', router);
};

export const getInterfaces = async (router: RouterConfigWithId): Promise<Interface[]> => {
  return fetchData<Interface[]>('/interfaces', router);
};
  
export const getHotspotClients = async (router: RouterConfigWithId): Promise<HotspotClient[]> => {
  return fetchData<HotspotClient[]>('/hotspot-clients', router);
};

export const getPppoeSettings = async (router: RouterConfigWithId): Promise<PppoeSettings> => {
    return fetchData<PppoeSettings>('/pppoe-settings', router);
};

export const getPppoeActiveClients = async (router: RouterConfigWithId): Promise<PppoeClient[]> => {
    return fetchData<PppoeClient[]>('/pppoe-active', router);
};
  
export const getLogs = async (): Promise<LogEntry[]> => {
  console.warn("getLogs is not implemented in the backend proxy.");
  return Promise.resolve([]);
};

export const testRouterConnection = async (routerConfig: RouterConfig): Promise<TestConnectionResponse> => {
    try {
        const response = await fetch(`${API_BASE_URL}/test-connection`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(routerConfig),
        });
        // We expect JSON response even for errors from the proxy
        return response.json() as Promise<TestConnectionResponse>;
    } catch (error) {
        console.error("Failed to send test connection request:", error);
        // This catches network errors, like if the proxy is down
        return {
            success: false,
            message: "Failed to connect to the backend proxy server."
        };
    }
};