
// App structure
export type View = 'dashboard' | 'scripting' | 'routers' | 'network' | 'terminal' | 'pppoe' | 'billing' | 'sales' | 'inventory' | 'hotspot' | 'panel_hotspot' | 'zerotier' | 'company' | 'system' | 'updater' | 'super_router' | 'logs';

// Router configuration
export interface RouterConfig {
  name: string;
  host: string;
  user: string;
  password?: string;
  port: number;
}
export interface RouterConfigWithId extends RouterConfig {
  id: string;
}

// Updater types
export interface VersionInfo {
    title: string;
    hash: string;
    description?: string;
}
export interface NewVersionInfo extends VersionInfo {
    changelog: string;
}

// AI Service types
export interface AIFixResponse {
  explanation: string;
  fixedCode: string;
}
export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

// Hotspot types
export interface HotspotSetupParams {
    hotspotInterface: string;
    localAddress: string;
    addressPool: string;
    sslCertificate: string;
    dnsServers: string;
    dnsName: string;
    hotspotUser: string;
    hotspotPass: string;
}
export interface HotspotServer {
  '.id': string;
  id: string;
  name: string;
  interface: string;
  'address-pool': string;
  profile: string;
  disabled: boolean;
  comment?: string;
}
export interface HotspotUserProfile {
    '.id': string;
    id: string;
    name: string;
    'shared-users': string | number;
    'rate-limit': string;
}
export interface HotspotUser {
  '.id': string;
  id: string;
  server: string;
  name: string;
  profile: string;
  uptime: string;
  'bytes-in': number;
  'bytes-out': number;
  comment?: string;
  disabled: boolean;
}
export interface HotspotActiveUser {
    '.id': string;
    id: string;
    server: string;
    user: string;
    address: string;
    'mac-address': string;
    uptime: string;
    'session-time-left': string;
    'bytes-in': number;
    'bytes-out': number;
}
export interface HotspotHost {
    '.id': string;
    id: string;
    'mac-address': string;
    address: string;
    'to-address': string;
    server: string;
    comment?: string;
    authorized: boolean;
    bypassed: boolean;
}
// For voucher system
export interface HotspotUserData {
    name: string;
    password?: string;
    profile: string;
    server?: string;
    'limit-uptime'?: string;
    comment?: string;
    disabled?: 'true' | 'false';
}

// MikroTik general types
export interface SystemResource {
  uptime: string;
  version: string;
  'cpu-load': number;
  'free-memory': number;
  'total-memory': number;
  'free-hdd-space': number;
  'total-hdd-space': number;
}
export interface RouterboardInfo {
  model: string;
  'serial-number': string;
  'current-firmware': string;
}
export interface Interface {
  '.id': string;
  id: string;
  name: string;
  type: string;
  'mac-address': string;
  running: boolean;
  disabled: boolean;
  comment?: string;
  'rx-byte': number;
  'tx-byte': number;
}
export interface TrafficHistoryPoint {
    rx: number;
    tx: number;
    timestamp: number;
}
export interface SslCertificate {
  '.id': string;
  id: string;
  name: string;
  issuer: string;
  'expires-after': string;
  trusted: boolean;
}
export interface PppProfile {
    '.id': string;
    id: string;
    name: string;
    'local-address'?: string;
    'remote-address'?: string;
    'rate-limit'?: string;
    comment?: string;
}
export interface PppSecret {
    '.id': string;
    id: string;
    name: string;
    service: string;
    profile: string;
    'last-logged-out'?: string;
    disabled: boolean;
    comment?: string;
    customer?: Customer | null;
}
export interface PppActiveConnection {
    '.id': string;
    id: string;
    name: string;
    service: string;
    address: string;
    uptime: string;
}
export interface DhcpLease {
    '.id': string;
    id: string;
    address: string;
    'mac-address': string;
    server: string;
    status: string;
    'expires-after': string;
    comment?: string;
}

// Billing and Sales
export interface BillingPlan {
    name: string;
    price: number;
    cycle: 'Monthly' | 'Quarterly' | 'Yearly';
    pppoeProfile: string;
    description: string;
    currency: string;
}
export interface BillingPlanWithId extends BillingPlan {
    id: string;
    routerId: string;
}
export interface SaleRecord {
    id: string;
    routerId: string;
    routerName?: string;
    date: string;
    clientName: string;
    planName: string;
    planPrice: number;
    discountAmount: number;
    finalAmount: number;
    currency: string;
    clientAddress?: string;
    clientContact?: string;
    clientEmail?: string;
}

// Inventory and Expenses
export interface InventoryItem {
    id: string;
    name: string;
    quantity: number;
    price?: number;
    serialNumber?: string;
    dateAdded: string;
}
export interface ExpenseRecord {
    id: string;
    date: string;
    category: string;
    description: string;
    amount: number;
}

// Company & Panel Settings
export interface CompanySettings {
    companyName?: string;
    address?: string;
    contactNumber?: string;
    email?: string;
    logoBase64?: string;
}
export interface PanelSettings {
    language: 'en' | 'es' | 'fil';
    currency: 'USD' | 'EUR' | 'PHP';
}

// Customers
export interface Customer {
    id: string;
    routerId: string;
    username: string; // This links to pppoe secret name
    fullName: string;
    address: string;
    contactNumber: string;
    email: string;
}

// Voucher Hotspot
export interface VoucherPlan {
    name: string;
    duration_minutes: number;
    price: number;
    currency: string;
    mikrotik_profile_name: string;
}
export interface VoucherPlanWithId extends VoucherPlan {
    id: string;
    routerId: string;
}


// ZeroTier types from ZeroTierPanelService
export interface ZeroTierNetwork {
    nwid: string;
    name: string;
    status: string;
    type: string;
    mac: string;
    assignedAddresses: string[];
    allowManaged: boolean;
    allowGlobal: boolean;
    allowDefault: boolean;
}
export interface ZeroTierInfo {
    address: string;
    online: boolean;
    version: string;
    config: {
        settings: {
            portMappingEnabled: boolean;
        }
    };
}
export interface ZeroTierStatusResponse {
    info: ZeroTierInfo;
    networks: ZeroTierNetwork[];
}

// Dataplicity
export interface DataplicityStatus {
    installed: boolean;
    active: boolean;
    url?: string;
    config?: any;
}

// Ngrok
export interface NgrokStatus {
    installed: boolean;
    active: boolean;
    url: string | null;
    config: {
        authtoken?: string;
        proto?: string;
        port?: number;
    } | null;
}

// Host Status types
export interface PanelHostStatus {
  cpuUsage: number;
  memory: {
    total: string;
    used: string;
    free: string;
    percent: number;
  };
  disk: {
    total: string;
    used: string;
    free: string;
    percent: number;
  };
}
export interface PanelNtpStatus {
    enabled: boolean;
    synchronized: boolean;
    time: string;
    timezone: string;
}
export interface HostNetworkConfig {
    interfaces: { name: string; mac: string; ip: string | null }[];
    ipForwarding: boolean;
    natActive: boolean;
    dnsmasqActive: boolean;
    wanInterface: string | null;
    lanInterface: string | null;
    lanIp: string | null;
}

// Firewall
export interface FirewallRule {
    '.id': string;
    id: string;
    chain: string;
    action: string;
    protocol?: string;
    'src-address'?: string;
    'dst-address'?: string;
    'dst-port'?: string;
    comment?: string;
    disabled: boolean;
    dynamic: boolean;
    invalid: boolean;
}

// Logs
export interface LogEntry {
    time: string;
    topics: string;
    message: string;
}
