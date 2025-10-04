import type { RouterConfig, RouterConfigWithId, SystemInfo, Interface, HotspotActiveUser, HotspotHost, PppProfile, PppProfileData, IpPool, BillingPlan, PppSecret, PppSecretData, PppActiveConnection } from '../types.ts';

// The new, dedicated API backend runs on port 3002
const API_BASE_URL = `http://${window.location.hostname}:3002`;

// Generic fetch helper for our backend API
const fetchData = async (path: string, routerConfig: RouterConfigWithId, body: Record<string, any> = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ routerConfig, ...body }),
  });
  
  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    let errorDetails: any = { path, status: response.status };

    if (contentType && contentType.indexOf("application/json") !== -1) {
        const errorData = await response.json();
        errorMsg = errorData.message || errorMsg;
        errorDetails.rawError = errorData;
    } else {
        const textError = await response.text();
        errorMsg = textError || `Could not connect to the API backend. Is it running? (Status: ${response.status})`;
        errorDetails.rawError = textError;
    }
    const error = new Error(errorMsg);
    (error as any).details = errorDetails;
    throw error;
  }

  if (contentType && contentType.indexOf("application/json") !== -1) {
      return response.json();
  }
  return null; 
};


export const testRouterConnection = async (routerConfig: RouterConfig): Promise<{ success: boolean, message: string }> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/test-connection`, {
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

export const getHotspotActiveUsers = (router: RouterConfigWithId): Promise<HotspotActiveUser[]> => {
    return fetchData('/api/hotspot/active', router);
};

export const getHotspotHosts = (router: RouterConfigWithId): Promise<HotspotHost[]> => {
    return fetchData('/api/hotspot/hosts', router);
};

export const removeHotspotActiveUser = (router: RouterConfigWithId, userId: string): Promise<any> => {
    return fetchData('/api/hotspot/active/remove', router, { userId });
};

export const getPppProfiles = (router: RouterConfigWithId): Promise<PppProfile[]> => {
    return fetchData('/api/ppp/profiles', router);
};

export const getIpPools = (router: RouterConfigWithId): Promise<IpPool[]> => {
    return fetchData('/api/ip/pools', router);
};

export const addPppProfile = (router: RouterConfigWithId, profileData: PppProfileData): Promise<any> => {
    return fetchData('/api/ppp/profiles/add', router, { profileData });
};

export const updatePppProfile = (router: RouterConfigWithId, profileData: PppProfile): Promise<any> => {
    return fetchData('/api/ppp/profiles/update', router, { profileData });
};

export const deletePppProfile = (router: RouterConfigWithId, profileId: string): Promise<any> => {
    return fetchData('/api/ppp/profiles/delete', router, { profileId });
};

// --- PPPoE Secret Services ---
export const getPppSecrets = (router: RouterConfigWithId): Promise<PppSecret[]> => {
    return fetchData('/api/ppp/secrets', router);
};

export const getPppActive = (router: RouterConfigWithId): Promise<PppActiveConnection[]> => {
    return fetchData('/api/ppp/active', router);
};

export const addPppSecret = (router: RouterConfigWithId, secretData: PppSecretData): Promise<any> => {
    return fetchData('/api/ppp/secrets/add', router, { secretData });
};

export const updatePppSecret = (router: RouterConfigWithId, secretData: PppSecret): Promise<any> => {
    return fetchData('/api/ppp/secrets/update', router, { secretData });
};

export const deletePppSecret = (router: RouterConfigWithId, secretId: string): Promise<any> => {
    return fetchData('/api/ppp/secrets/delete', router, { secretId });
};

export const processPppPayment = (router: RouterConfigWithId, secret: PppSecret, plan: BillingPlan, nonPaymentProfile: string, discountDays: number, paymentDate: string): Promise<any> => {
    return fetchData('/api/ppp/process-payment', router, { secret, plan, nonPaymentProfile, discountDays, paymentDate });
};