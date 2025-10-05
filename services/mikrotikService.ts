import type { RouterConfig, RouterConfigWithId, SystemInfo, Interface, HotspotActiveUser, HotspotHost, PppProfile, PppProfileData, IpPool, BillingPlan, PppSecret, PppSecretData, PppActiveConnection, NtpSettings, VlanInterface } from '../types.ts';

// Generic fetch helper for our backend API
const fetchData = async (path: string, routerConfig: RouterConfigWithId, body: Record<string, any> = {}) => {
  // The new, dedicated API backend runs on port 3002
  const apiBaseUrl = `http://${window.location.hostname}:3002`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
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
        const apiBaseUrl = `http://${window.location.hostname}:3002`;
        const response = await fetch(`${apiBaseUrl}/api/test-connection`, {
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

// --- System Management Services ---
export const rebootRouter = (router: RouterConfigWithId): Promise<{ message: string }> => {
    return fetchData('/api/system/reboot', router);
};

export const getRouterNtp = (router: RouterConfigWithId): Promise<NtpSettings> => {
    return fetchData('/api/system/ntp/client', router);
};

export const setRouterNtp = (router: RouterConfigWithId, settings: Omit<NtpSettings, 'enabled'> & {enabled: boolean}): Promise<{ message: string }> => {
    return fetchData('/api/system/ntp/client/set', router, { settings });
};

// --- Network Management Services (VLAN) ---
export const getVlans = (router: RouterConfigWithId): Promise<VlanInterface[]> => {
    return fetchData('/api/network/vlans', router);
};

export const addVlan = (router: RouterConfigWithId, vlanData: Omit<VlanInterface, 'id'>): Promise<any> => {
    return fetchData('/api/network/vlans/add', router, { vlanData });
};

export const deleteVlan = (router: RouterConfigWithId, vlanId: string): Promise<any> => {
    return fetchData('/api/network/vlans/delete', router, { vlanId });
};
