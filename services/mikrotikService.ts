import type { RouterConfig, RouterConfigWithId, SystemInfo, Interface, HotspotClient, PppoeSettings, PppoeClient, PppProfile, BillingPlan } from '../types';

// Generic fetch helper for our backend API
const fetchData = async (path: string, routerConfig: RouterConfigWithId) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ routerConfig }),
  });
  
  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    if (contentType && contentType.indexOf("application/json") !== -1) {
        const errorData = await response.json();
        errorMsg = errorData.message || errorMsg;
    } else {
        // If the response is not JSON (e.g., HTML for a 404), provide a clearer error.
        errorMsg = `The API endpoint was not found or returned an invalid response. (Status: ${response.status})`;
    }
    throw new Error(errorMsg);
  }

  if (contentType && contentType.indexOf("application/json") !== -1) {
      return response.json();
  }
  // Handle cases where a 200 OK response might not have a JSON body
  return null; 
};


export const testRouterConnection = async (routerConfig: RouterConfig): Promise<{ success: boolean, message: string }> => {
    try {
        const response = await fetch('/api/test-connection', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ routerConfig })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        return { success: true, message: result.message };
    } catch (error) {
        return { success: false, message: `Connection failed: ${(error as Error).message}` };
    }
};

export const getSystemInfo = (router: RouterConfigWithId): Promise<SystemInfo> => {
    return fetchData('/api/system-info', router);
};

export const getInterfaces = (router: RouterConfigWithId): Promise<Interface[]> => {
    return fetchData('/api/interfaces', router);
};

export const getHotspotClients = (router: RouterConfigWithId): Promise<HotspotClient[]> => {
    return fetchData('/api/hotspot-clients', router);
};

export const getPppoeSettings = (router: RouterConfigWithId): Promise<PppoeSettings> => {
    return fetchData('/api/pppoe-settings', router);
};

export const getPppoeActiveClients = (router: RouterConfigWithId): Promise<PppoeClient[]> => {
    return fetchData('/api/pppoe-active', router);
};

export const getPppProfiles = (router: RouterConfigWithId): Promise<PppProfile[]> => {
    return fetchData('/api/ppp-profiles', router);
};
