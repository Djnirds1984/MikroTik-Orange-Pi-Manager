
import type { RouterConfig, RouterConfigWithId, SystemInfo, Interface, HotspotClient, PppoeSettings, PppoeClient } from '../types';
import { mockSystemInfo, mockInterfaces, mockHotspotClients } from '../data/mockData';

// This is a helper function to structure API calls to our backend proxy.
const apiRequest = async (router: RouterConfig, path: string, method: 'POST' | 'GET' = 'POST', body: object = {}) => {
  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      routerConfig: router,
      path,
      method,
      body,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred' }));
    throw new Error(errorData.message || `Request failed with status ${response.status}`);
  }

  return response.json();
};


export const testRouterConnection = async (routerConfig: RouterConfig): Promise<{ success: boolean, message: string }> => {
    try {
        // A simple request to a read-only endpoint like /system/resource is a good test.
        await apiRequest(routerConfig, '/rest/system/resource');
        return { success: true, message: 'Connection successful! Router is reachable.' };
    } catch (error) {
        console.error("Connection test failed:", error);
        return { success: false, message: `Connection failed: ${(error as Error).message}` };
    }
};

// For the dashboard, we'll use mock data to demonstrate functionality.
// In a real application, these would make API calls like `apiRequest(router, '/rest/system/resource')`.

export const getSystemInfo = async (router: RouterConfigWithId): Promise<SystemInfo> => {
    console.log(`Fetching system info for ${router.name}`);
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
    return Promise.resolve(mockSystemInfo);
};

// Helper to convert mock rates (e.g., "12.5 Mbit/s") to bps
const parseRate = (rateStr: string): number => {
    if (typeof rateStr !== 'string') return 0;
    const [value, unit] = rateStr.toLowerCase().split(' ');
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return 0;
    switch (unit) {
        case 'gbit/s': return numValue * 1000000000;
        case 'mbit/s': return numValue * 1000000;
        case 'kbit/s': return numValue * 1000;
        default: return numValue;
    }
}

export const getInterfaces = async (router: RouterConfigWithId): Promise<Interface[]> => {
    console.log(`Fetching interfaces for ${router.name}`);
    // Mock implementation
    return Promise.resolve(mockInterfaces.map(iface => ({
        name: iface.name,
        type: iface.type,
        rxRate: parseRate(iface.rxRate),
        txRate: parseRate(iface.txRate),
    })));
};

export const getHotspotClients = async (router: RouterConfigWithId): Promise<HotspotClient[]> => {
    console.log(`Fetching hotspot clients for ${router.name}`);
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 300));
    return Promise.resolve(mockHotspotClients);
};

export const getPppoeSettings = async (router: RouterConfigWithId): Promise<PppoeSettings> => {
    console.log(`Fetching PPPoE settings for ${router.name}`);
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 400));
    return Promise.resolve({
        useRadius: false,
        defaultProfile: 'default-encryption',
        authentication: { pap: false, chap: true, mschap1: true, mschap2: true },
    });
};

export const getPppoeActiveClients = async (router: RouterConfigWithId): Promise<PppoeClient[]> => {
    console.log(`Fetching PPPoE clients for ${router.name}`);
    // Mock implementation
    return Promise.resolve([
        { id: '*1', name: 'user1', service: 'pppoe-in1', address: '10.0.0.10', callerId: 'A1:B2:C3:D4:E5:F6', uptime: '2h15m30s' },
        { id: '*2', name: 'user2', service: 'pppoe-in1', address: '10.0.0.12', callerId: 'F9:E8:D7:C6:B5:A4', uptime: '0h45m12s' },
    ]);
};
