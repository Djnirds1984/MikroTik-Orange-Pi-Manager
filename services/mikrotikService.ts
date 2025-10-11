
import type { RouterConfig, RouterConfigWithId, SystemResource, RouterboardInfo, Interface, PppProfile, PppSecret, PppActiveConnection, SslCertificate, HotspotSetupParams, HotspotUserProfile, HotspotUser, HotspotActiveUser, HotspotHost, DhcpLease, HotspotUserData, FirewallRule, LogEntry, HotspotServer } from '../types.ts';
import { getAuthHeader } from './databaseService.ts';

const apiBaseUrl = '/mt-api'; // The backend proxy for MikroTik API

// Helper function to handle API calls to the backend proxy
const apiCall = async <T>(routerId: string, path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${apiBaseUrl}/${routerId}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
            ...options.headers,
        },
        ...options,
    });

    if (response.status === 401) {
        localStorage.removeItem('authToken');
        window.location.reload();
        throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
        let errorMsg = `MikroTik API Error: Request failed with status ${response.status}`;
        try {
            const errorData = await response.json();
            // MikroTik errors are often in a 'detail' or 'message' field
            errorMsg = errorData.detail || errorData.message || JSON.stringify(errorData);
        } catch {
            const textError = await response.text();
            if (textError) errorMsg = textError;
        }
        throw new Error(errorMsg);
    }
    
    if (response.status === 204) {
        return {} as T;
    }

    return response.json() as Promise<T>;
};

// --- Test Connection (uses a different endpoint) ---
export const testRouterConnection = async (routerConfig: RouterConfig): Promise<{ success: boolean, message: string }> => {
    try {
        const response = await fetch('/mt-api/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader(),
            },
            body: JSON.stringify(routerConfig),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Unknown error');
        }
        return { success: true, message: data.message };
    } catch (err) {
        return { success: false, message: (err as Error).message };
    }
};

// --- System Info ---
export const getSystemResource = (router: RouterConfigWithId) => apiCall<SystemResource[]>(router.id, '/system/resource').then(res => res[0]);
export const getRouterboardInfo = (router: RouterConfigWithId) => apiCall<RouterboardInfo[]>(router.id, '/system/routerboard').then(res => res[0]);
export const getInterfaces = (router: RouterConfigWithId) => apiCall<Interface[]>(router.id, '/interface');
export const getInterfaceTraffic = (router: RouterConfigWithId, interfaceName: string) => apiCall<any[]>(router.id, '/interface/monitor-traffic', {
    method: 'POST',
    body: JSON.stringify({ interface: interfaceName, once: 'true' }),
}).then(res => res[0]);

// --- PPPoE ---
export const getPppProfiles = (router: RouterConfigWithId) => apiCall<PppProfile[]>(router.id, '/ppp/profile');
export const getPppSecrets = (router: RouterConfigWithId) => apiCall<PppSecret[]>(router.id, '/ppp/secret');
export const getPppActiveConnections = (router: RouterConfigWithId) => apiCall<PppActiveConnection[]>(router.id, '/ppp/active');
export const updatePppSecret = (router: RouterConfigWithId, secretId: string, data: Partial<PppSecret>) => apiCall(router.id, `/ppp/secret/${secretId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const addPppSecret = (router: RouterConfigWithId, data: Partial<PppSecret>) => apiCall(router.id, '/ppp/secret', { method: 'PUT', body: JSON.stringify(data) });
export const deletePppSecret = (router: RouterConfigWithId, secretId: string) => apiCall(router.id, `/ppp/secret/${secretId}`, { method: 'DELETE' });
export const disconnectPppUser = (router: RouterConfigWithId, connectionId: string) => apiCall(router.id, `/ppp/active/${connectionId}`, { method: 'DELETE' });

// --- Hotspot ---
export const getSslCertificates = (router: RouterConfigWithId) => apiCall<SslCertificate[]>(router.id, '/system/certificate');
export const runHotspotSetup = (router: RouterConfigWithId, params: HotspotSetupParams) => apiCall<{ message: string }>(router.id, '/system/script/run', {
    method: 'POST',
    body: JSON.stringify({
        // This is a placeholder for a complex operation that should ideally be a dedicated backend endpoint.
        // For now, we assume the backend handles this based on the request.
        // The HotspotInstaller will use this.
        source: `# Smart setup for Hotspot on ${params.hotspotInterface}`
    })
});

// Voucher Hotspot
export const runPanelHotspotSetup = (router: RouterConfigWithId) => {
    return fetch(`${apiBaseUrl}/${router.id}/hotspot/panel-setup`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader()
        },
        body: JSON.stringify({ panelHostname: window.location.hostname })
    }).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Setup failed');
        return data;
    });
};
export const getHotspotUserProfiles = (router: RouterConfigWithId) => apiCall<HotspotUserProfile[]>(router.id, '/ip/hotspot/user/profile');
export const getHotspotUsers = (router: RouterConfigWithId) => apiCall<HotspotUser[]>(router.id, '/ip/hotspot/user');
export const addHotspotUser = (router: RouterConfigWithId, userData: HotspotUserData) => apiCall(router.id, '/ip/hotspot/user', { method: 'PUT', body: JSON.stringify(userData) });
export const deleteHotspotUser = (router: RouterConfigWithId, userId: string) => apiCall(router.id, `/ip/hotspot/user/${userId}`, { method: 'DELETE' });
// FIX: Corrected type name from HotspotServer to HotspotUser, which was a typo. The correct type is HotspotServer, which is now imported.
export const getHotspotServers = (router: RouterConfigWithId) => apiCall<HotspotServer[]>(router.id, '/ip/hotspot');
export const getHotspotActiveUsers = (router: RouterConfigWithId) => apiCall<HotspotActiveUser[]>(router.id, '/ip/hotspot/active');
export const getHotspotHosts = (router: RouterConfigWithId) => apiCall<HotspotHost[]>(router.id, '/ip/hotspot/host');

// Hotspot Editor
export const listHotspotFiles = (router: RouterConfigWithId, path: string) => apiCall<any[]>(router.id, `/file?path=${path}`);
export const getHotspotFileContent = (router: RouterConfigWithId, fileId: string) => apiCall<any[]>(router.id, '/file/print', {
    method: 'POST',
    body: JSON.stringify({ "file": fileId })
}).then(res => ({ content: res[0].contents }));
export const saveHotspotFileContent = (router: RouterConfigWithId, fileId: string, content: string) => apiCall(router.id, `/file/${fileId}`, { method: 'PATCH', body: JSON.stringify({ contents: content }) });
export const createHotspotFile = (router: RouterConfigWithId, fullPath: string, content: string) => apiCall(router.id, '/file', { method: 'PUT', body: JSON.stringify({ name: fullPath, contents: content }) });


// Network
export const getDhcpLeases = (router: RouterConfigWithId) => apiCall<DhcpLease[]>(router.id, '/ip/dhcp-server/lease');

// Firewall
export const getFirewallRules = (router: RouterConfigWithId) => apiCall<FirewallRule[]>(router.id, '/ip/firewall/filter');

// Logs
export const getLogs = (router: RouterConfigWithId) => apiCall<LogEntry[]>(router.id, '/log');
