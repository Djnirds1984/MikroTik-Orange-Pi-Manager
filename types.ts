export type View = 'dashboard' | 'scripting' | 'routers' | 'pppoe' | 'users' | 'billing' | 'updater' | 'zerotier' | 'hotspot' | 'system' | 'sales' | 'network' | 'inventory';

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

export interface SystemInfo {
  boardName: string;
  version: string;
  cpuLoad: number;
  uptime: string;
  memoryUsage: number;
  totalMemory: string;
}

export interface Interface {
  name:string;
  type: string;
  rxRate: number; // in bits per second
  txRate: number; // in bits per second
}

export interface TrafficHistoryPoint {
  rx: number; // in Mbps
  tx: number; // in Mbps
}

export interface InterfaceWithHistory extends Interface {
  trafficHistory: TrafficHistoryPoint[];
}

export interface HotspotActiveUser {
    id: string;
    user: string;
    address: string;
    macAddress: string;
    uptime: string;
    bytesIn: number;
    bytesOut: number;
    comment?: string;
}

export interface HotspotHost {
    id: string;
    macAddress: string;
    address: string;
    toAddress: string;
    authorized: boolean;
    bypassed: boolean;
    comment?: string;
}

export interface PppProfile {
    id: string;
    name: string;
    localAddress?: string;
    remoteAddress?: string;
    rateLimit?: string;
}

export type PppProfileData = Omit<PppProfile, 'id'>;

export interface PppSecret {
    id: string;
    name: string;
    // Fix: Add optional password property. The MikroTik API requires this for creating/updating
    // secrets, but doesn't return it on GET requests for security. This fixes type errors.
    password?: string;
    service: string;
    profile: string;
    comment?: string;
    ['remote-address']?: string; // User's static IP if assigned directly in the secret.
}

export type PppSecretData = Omit<PppSecret, 'id'>;

export interface PppActiveConnection {
    id: string;
    name: string;
    uptime: string;
}

export interface IpPool {
    id: string;
    name: string;
}

export interface BillingPlan {
    name: string;
    price: number;
    currency: string;
    cycle: 'Monthly' | 'Quarterly' | 'Yearly';
    pppoeProfile: string;
    description: string;
}

export interface BillingPlanWithId extends BillingPlan {
    id: string;
}

// New types for Panel's ZeroTier service
export interface ZeroTierInfo {
    address: string;
    clock: number;
    config: {
        settings: {
            primaryPort: number;
            secondaryPort: number;
            tertiaryPort: number;
            portMappingEnabled: boolean;
            allowNonRoutable: boolean;
        }
    };
    online: boolean;
    planetWorldId: number;
    planetWorldTimestamp: number;
    version: string;
    versionBuild: number;
    versionMajor: number;
    versionMinor: number;
    versionRev: number;
}

export interface ZeroTierNetwork {
    nwid: string;
    name: string;
    mac: string;
    status: string;
    type: 'PRIVATE' | 'PUBLIC';
    dev?: string;
    broadcastEnabled: boolean;
    allowManaged: boolean;

    allowGlobal: boolean;
    allowDefault: boolean;
    allowDNS: boolean;
    assignedAddresses: string[];
    portDeviceName?: string;
    portError?: number;
}

export interface ZeroTierStatusResponse {
    info: ZeroTierInfo;
    networks: ZeroTierNetwork[];
}

// Type for the AI Fixer feature
export interface AIFixResponse {
    explanation: string;
    fixedCode: string;
}

// Type for the AI Help Chat feature
export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

// Type for System Settings page
export interface NtpSettings {
    enabled: boolean;
    primaryNtp: string;
    secondaryNtp: string;
}

// Type for Sales Report
export interface SaleRecord {
  id: string;
  date: string; // ISO string format for the payment date
  clientName: string;
  planName: string;
  planPrice: number;
  currency: string;
  discountAmount: number;
  finalAmount: number;
  routerName: string;
}

// Type for Panel Host Status
export interface PanelHostStatus {
    cpuUsage: number;
    memory: {
        used: string;
        total: string;
        percent: number;
    };
    disk: {
        used: string;
        total: string;
        percent: number;
    };
}

// Type for Network Management Page
export interface VlanInterface {
    id: string;
    name: string;
    'vlan-id': string;
    interface: string;
}

// Type for Stock & Inventory
export interface InventoryItem {
    id: string;
    name: string;
    quantity: number;
    price?: number;
    serialNumber?: string;
    dateAdded: string;
}
