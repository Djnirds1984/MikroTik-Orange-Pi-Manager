import type { RouterConfig, SystemInfo, Interface, HotspotActiveUser, HotspotHost, PppProfile, PppProfileData, IpPool, NtpSettings, VlanInterface, PppSecret, PppSecretData, PppActiveConnection } from '../types.ts';

// The API backend is on a different port, usually 3002 as per README.md
const API_BASE_URL = `http://${window.location.hostname}:3002/api/mikrotik`;

// A generic fetcher for MikroTik API calls
const mikrotikFetcher = async <T>(routerConfig: RouterConfig, path: string, options: RequestInit = {}): Promise<T> => {
    const { host, user, password, port } = routerConfig;
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-Router-Host': host,
            'X-Router-User': user,
            'X-Router-Password': password || '',
            'X-Router-Port': port.toString(),
            ...options.headers,
        },
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
export const getSystemInfo = (router: RouterConfig): Promise<SystemInfo> => mikrotikFetcher<SystemInfo>(router, '/system-info');
export const getInterfaces = (router: RouterConfig): Promise<Interface[]> => mikrotikFetcher<Interface[]>(router, '/interfaces');
export const testRouterConnection = async (router: RouterConfig): Promise<{ success: boolean; message: string }> => {
    try {
        await mikrotikFetcher(router, '/system/resource');
        return { success: true, message: 'Connection successful!' };
    } catch (err) {
        return { success: false, message: `Connection failed: ${(err as Error).message}` };
    }
};

// PPPoE
export const getPppProfiles = (router: RouterConfig): Promise<PppProfile[]> => mikrotikFetcher(router, '/ppp/profile');
export const getIpPools = (router: RouterConfig): Promise<IpPool[]> => mikrotikFetcher(router, '/ip/pool');
export const addPppProfile = (router: RouterConfig, profileData: PppProfileData): Promise<any> => mikrotikFetcher(router, '/ppp/profile', { method: 'POST', body: JSON.stringify(profileData) });
export const updatePppProfile = (router: RouterConfig, profileData: PppProfile): Promise<any> => mikrotikFetcher(router, `/ppp/profile/${profileData.id}`, { method: 'PATCH', body: JSON.stringify(profileData) });
export const deletePppProfile = (router: RouterConfig, profileId: string): Promise<any> => mikrotikFetcher(router, `/ppp/profile/${profileId}`, { method: 'DELETE' });

// PPPoE Users
export const getPppSecrets = (router: RouterConfig): Promise<PppSecret[]> => mikrotikFetcher(router, '/ppp/secret');
export const getPppActiveConnections = (router: RouterConfig): Promise<PppActiveConnection[]> => mikrotikFetcher(router, '/ppp/active');
export const addPppSecret = (router: RouterConfig, secretData: PppSecretData): Promise<any> => mikrotikFetcher(router, '/ppp/secret', { method: 'POST', body: JSON.stringify(secretData) });
export const updatePppSecret = (router: RouterConfig, secretData: PppSecret): Promise<any> => mikrotikFetcher(router, `/ppp/secret/${secretData.id}`, { method: 'PATCH', body: JSON.stringify(secretData) });
export const deletePppSecret = (router: RouterConfig, secretId: string): Promise<any> => mikrotikFetcher(router, `/ppp/secret/${secretId}`, { method: 'DELETE' });
export const disablePppSecret = (router: RouterConfig, secretId: string): Promise<any> => mikrotikFetcher(router, `/ppp/secret/${secretId}/disable`, { method: 'POST' });
export const enablePppSecret = (router: RouterConfig, secretId: string): Promise<any> => mikrotikFetcher(router, `/ppp/secret/${secretId}/enable`, { method: 'POST' });
export const removePppActiveConnection = (router: RouterConfig, connectionId: string): Promise<any> => mikrotikFetcher(router, `/ppp/active/${connectionId}`, { method: 'DELETE' });

// Hotspot
export const getHotspotActiveUsers = (router: RouterConfig): Promise<HotspotActiveUser[]> => mikrotikFetcher(router, '/ip/hotspot/active');
export const getHotspotHosts = (router: RouterConfig): Promise<HotspotHost[]> => mikrotikFetcher(router, '/ip/hotspot/host');
export const removeHotspotActiveUser = (router: RouterConfig, userId: string): Promise<any> => mikrotikFetcher(router, `/ip/hotspot/active/${userId}`, { method: 'DELETE' });

// Network
export const getVlans = (router: RouterConfig): Promise<VlanInterface[]> => mikrotikFetcher(router, '/interface/vlan');
export const addVlan = (router: RouterConfig, vlanData: Omit<VlanInterface, 'id'>): Promise<any> => mikrotikFetcher(router, '/interface/vlan', { method: 'POST', body: JSON.stringify(vlanData) });
export const deleteVlan = (router: RouterConfig, vlanId: string): Promise<any> => mikrotikFetcher(router, `/interface/vlan/${vlanId}`, { method: 'DELETE' });

// System
export const getRouterNtp = (router: RouterConfig): Promise<NtpSettings> => mikrotikFetcher(router, '/system/ntp/client');
export const setRouterNtp = (router: RouterConfig, settings: NtpSettings): Promise<any> => mikrotikFetcher(router, '/system/ntp/client', { method: 'POST', body: JSON.stringify(settings) });
export const rebootRouter = (router: RouterConfig): Promise<{ message: string }> => mikrotikFetcher(router, '/system/reboot', { method: 'POST' });