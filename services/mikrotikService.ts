import type { RouterConfig, SystemInfo, Interface, HotspotActiveUser, HotspotHost, PppProfile, PppProfileData, IpPool, IpAddress, IpRoute, IpRouteData, NtpSettings, VlanInterface, PppSecret, PppSecretData, PppActiveConnection, BillingPlanWithId, WanRoute, FailoverStatus, FirewallFilterRule, FirewallNatRule, FirewallMangleRule, FirewallRuleData } from '../types.ts';

// The API backend is on a different port, usually 3002 as per README.md
const API_BASE_URL = `http://${window.location.hostname}:3002`;

// A generic fetcher for MikroTik API POST calls
const mikrotikApiPost = async <T>(path: string, body: Record<string, any>): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const contentType = response.headers.get("content-type");
    if (!response.ok) {
        let errorMsg = `Request failed with status ${response.status}`;
        let details: any = {};
        if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMsg = errorData.message || errorMsg;
            details = errorData.details;
        } else {
            errorMsg = await response.text();
        }
        const error = new Error(errorMsg) as any;
        error.details = details;
        throw error;
    }
    
    if (response.status === 204) { // No Content
        return null as T;
    }

    return response.json() as Promise<T>;
};


// --- API Functions ---

// Dashboard
export const getSystemInfo = (router: RouterConfig): Promise<SystemInfo> => mikrotikApiPost<SystemInfo>('/api/system-info', { routerConfig: router });
export const getInterfaces = (router: RouterConfig): Promise<Interface[]> => mikrotikApiPost<Interface[]>('/api/interfaces', { routerConfig: router });
export const testRouterConnection = async (router: RouterConfig): Promise<{ success: boolean; message: string }> => {
    try {
        const result = await mikrotikApiPost<{ success: boolean; message: string }>('/api/test-connection', { routerConfig: router });
        return result;
    } catch (err) {
        return { success: false, message: `Connection failed: ${(err as Error).message}` };
    }
};

// PPPoE
export const getPppProfiles = (router: RouterConfig): Promise<PppProfile[]> => mikrotikApiPost( '/api/ppp/profiles', { routerConfig: router });
export const addPppProfile = (router: RouterConfig, profileData: PppProfileData): Promise<any> => mikrotikApiPost('/api/ppp/profiles/add', { routerConfig: router, profileData });
export const updatePppProfile = (router: RouterConfig, profileData: PppProfile): Promise<any> => mikrotikApiPost('/api/ppp/profiles/update', { routerConfig: router, profileData });
export const deletePppProfile = (router: RouterConfig, profileId: string): Promise<any> => mikrotikApiPost('/api/ppp/profiles/delete', { routerConfig: router, profileId });

// PPPoE Users
export const getPppSecrets = (router: RouterConfig): Promise<PppSecret[]> => mikrotikApiPost('/api/ppp/secrets', { routerConfig: router });
export const getPppActiveConnections = (router: RouterConfig): Promise<PppActiveConnection[]> => mikrotikApiPost('/api/ppp/active', { routerConfig: router });
export const addPppSecret = (router: RouterConfig, secretData: PppSecretData): Promise<any> => mikrotikApiPost('/api/ppp/secrets/add', { routerConfig: router, secretData });
export const updatePppSecret = (router: RouterConfig, secretData: PppSecret): Promise<any> => mikrotikApiPost('/api/ppp/secrets/update', { routerConfig: router, secretData });
export const deletePppSecret = (router: RouterConfig, secretId: string): Promise<any> => mikrotikApiPost('/api/ppp/secrets/delete', { routerConfig: router, secretId });

// Payment Processing
export interface PaymentData {
    secret: PppSecret;
    plan: BillingPlanWithId;
    nonPaymentProfile: string;
    discountDays: number;
    paymentDate: string;
}
export const processPppPayment = (router: RouterConfig, paymentData: PaymentData): Promise<any> => mikrotikApiPost('/api/ppp/process-payment', { routerConfig: router, ...paymentData });


// Hotspot
export const getHotspotActiveUsers = (router: RouterConfig): Promise<HotspotActiveUser[]> => mikrotikApiPost( '/api/hotspot/active', { routerConfig: router });
export const getHotspotHosts = (router: RouterConfig): Promise<HotspotHost[]> => mikrotikApiPost( '/api/hotspot/hosts', { routerConfig: router });
export const removeHotspotActiveUser = (router: RouterConfig, userId: string): Promise<any> => mikrotikApiPost( '/api/hotspot/active/remove', { routerConfig: router, userId });

// Network
export const getIpPools = (router: RouterConfig): Promise<IpPool[]> => mikrotikApiPost('/api/ip/pools', { routerConfig: router });
export const getIpAddresses = (router: RouterConfig): Promise<IpAddress[]> => mikrotikApiPost('/api/ip/addresses', { routerConfig: router });
export const getIpRoutes = (router: RouterConfig): Promise<IpRoute[]> => mikrotikApiPost('/api/ip/routes', { routerConfig: router });
export const addIpRoute = (router: RouterConfig, routeData: IpRouteData): Promise<any> => mikrotikApiPost('/api/ip/routes/add', { routerConfig: router, routeData });
export const updateIpRoute = (router: RouterConfig, routeId: string, routeData: Partial<IpRouteData>): Promise<any> => mikrotikApiPost('/api/ip/routes/update', { routerConfig: router, routeId, routeData });
export const deleteIpRoute = (router: RouterConfig, routeId: string): Promise<any> => mikrotikApiPost('/api/ip/routes/delete', { routerConfig: router, routeId });
export const getVlans = (router: RouterConfig): Promise<VlanInterface[]> => mikrotikApiPost('/api/network/vlans', { routerConfig: router });
export const addVlan = (router: RouterConfig, vlanData: Omit<VlanInterface, 'id'>): Promise<any> => mikrotikApiPost('/api/network/vlans/add', { routerConfig: router, vlanData });
export const deleteVlan = (router: RouterConfig, vlanId: string): Promise<any> => mikrotikApiPost('/api/network/vlans/delete', { routerConfig: router, vlanId });
export const getWanRoutes = (router: RouterConfig): Promise<WanRoute[]> => mikrotikApiPost('/api/network/wan-routes', { routerConfig: router });
export const setRouteProperty = (router: RouterConfig, routeId: string, properties: Record<string, any>): Promise<any> => mikrotikApiPost('/api/network/routes/set', { routerConfig: router, routeId, properties });
export const getWanFailoverStatus = (router: RouterConfig): Promise<FailoverStatus> => mikrotikApiPost('/api/network/wan-failover/status', { routerConfig: router });
export const configureWanFailover = (router: RouterConfig, enabled: boolean): Promise<{ message: string }> => mikrotikApiPost('/api/network/wan-failover/configure', { routerConfig: router, enabled });

// Firewall
export const getFirewallFilter = (router: RouterConfig): Promise<FirewallFilterRule[]> => mikrotikApiPost('/api/firewall/filter', { routerConfig: router });
export const addFirewallFilter = (router: RouterConfig, ruleData: FirewallRuleData): Promise<any> => mikrotikApiPost('/api/firewall/filter/add', { routerConfig: router, ruleData });
export const updateFirewallFilter = (router: RouterConfig, ruleId: string, ruleData: Partial<FirewallRuleData>): Promise<any> => mikrotikApiPost('/api/firewall/filter/update', { routerConfig: router, ruleId, ruleData });
export const deleteFirewallFilter = (router: RouterConfig, ruleId: string): Promise<any> => mikrotikApiPost('/api/firewall/filter/delete', { routerConfig: router, ruleId });

export const getFirewallNat = (router: RouterConfig): Promise<FirewallNatRule[]> => mikrotikApiPost('/api/firewall/nat', { routerConfig: router });
export const addFirewallNat = (router: RouterConfig, ruleData: FirewallRuleData): Promise<any> => mikrotikApiPost('/api/firewall/nat/add', { routerConfig: router, ruleData });
export const updateFirewallNat = (router: RouterConfig, ruleId: string, ruleData: Partial<FirewallRuleData>): Promise<any> => mikrotikApiPost('/api/firewall/nat/update', { routerConfig: router, ruleId, ruleData });
export const deleteFirewallNat = (router: RouterConfig, ruleId: string): Promise<any> => mikrotikApiPost('/api/firewall/nat/delete', { routerConfig: router, ruleId });

export const getFirewallMangle = (router: RouterConfig): Promise<FirewallMangleRule[]> => mikrotikApiPost('/api/firewall/mangle', { routerConfig: router });
export const addFirewallMangle = (router: RouterConfig, ruleData: FirewallRuleData): Promise<any> => mikrotikApiPost('/api/firewall/mangle/add', { routerConfig: router, ruleData });
export const updateFirewallMangle = (router: RouterConfig, ruleId: string, ruleData: Partial<FirewallRuleData>): Promise<any> => mikrotikApiPost('/api/firewall/mangle/update', { routerConfig: router, ruleId, ruleData });
export const deleteFirewallMangle = (router: RouterConfig, ruleId: string): Promise<any> => mikrotikApiPost('/api/firewall/mangle/delete', { routerConfig: router, ruleId });

// System
export const getRouterNtp = (router: RouterConfig): Promise<NtpSettings> => mikrotikApiPost( '/api/system/ntp/client', { routerConfig: router });
export const setRouterNtp = (router: RouterConfig, settings: NtpSettings): Promise<any> => mikrotikApiPost('/api/system/ntp/client/set', { routerConfig: router, settings });
export const rebootRouter = (router: RouterConfig): Promise<{ message: string }> => mikrotikApiPost( '/api/system/reboot', { routerConfig: router });