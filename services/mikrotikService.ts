import type { SystemInfo, Interface, HotspotClient, LogEntry, RouterConfig, RouterConfigWithId, TestConnectionResponse } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';

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
      const errorBody = await response.json();
      throw new Error(errorBody.error || `Proxy server returned an error: ${response.status}`);
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