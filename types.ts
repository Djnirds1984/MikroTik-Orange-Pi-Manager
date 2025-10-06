
export type View =
  | 'dashboard'
  | 'scripting'
  | 'routers'
  | 'network'
  | 'pppoe'
  | 'users'
  | 'billing'
  | 'sales'
  | 'inventory'
  | 'hotspot'
  | 'zerotier'
  | 'company'
  | 'system'
  | 'updater'
  | 'help';

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
  name: string;
  type: string;
  rxRate: number;
  txRate: number;
}

export interface TrafficHistoryPoint {
  name: string;
  rx: number;
  tx: number;
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
  comment: string;
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

export interface IpPool {
    id: string;
    name: string;
    ranges: string;
}

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
}

export interface PppSecret {
    id: string;
    name: string;
    service: string;
    profile: string;
    comment: string;
    disabled: string;
    'last-logged-out'?: string;
    password?: string;
}

export type PppSecretData = Omit<PppSecret, 'id' | 'last-logged-out'>;

export interface PppActiveConnection {
    id: string;
    name: string;
    service: string;
    'caller-id': string;
    address: string;
    uptime: string;
}

export interface NtpSettings {
    enabled: boolean;
    primaryNtp: string;
    secondaryNtp: string;
}

export interface VlanInterface {
    id: string;
    name: string;
    'vlan-id': string;
    interface: string;
}

export interface SaleRecord {
    id: string;
    date: string;
    clientName: string;
    planName: string;
    planPrice: number;
    discountAmount: number;
    finalAmount: number;
    routerName: string;
    currency: string;
}

export interface InventoryItem {
    id: string;
    name: string;
    quantity: number;
    price?: number;
    serialNumber?: string;
    dateAdded: string;
}

export interface CompanySettings {
    companyName?: string;
    address?: string;
    contactNumber?: string;
    email?: string;
    logoBase64?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface AIFixResponse {
  explanation: string;
  fixedCode: string;
}

export interface ZeroTierInfo {
    address: string;
    clock: number;
    config: {
        settings: {
            portMappingEnabled: boolean;
            primaryPort: number;
        }
    };
    online: boolean;
    version: string;
}

export interface ZeroTierNetwork {
    allowDefault: boolean;
    allowGlobal: boolean;
    allowManaged: boolean;
    assignedAddresses: string[];
    bridge: boolean;
    mac: string;
    mtu: number;
    name: string;
    netconfRevision: number;
    nwid: string;
    portDeviceName: string;
    portError: number;
    status: string;
    type: string;
}

export interface ZeroTierStatusResponse {
    info: ZeroTierInfo;
    networks: ZeroTierNetwork[];
}

export interface PanelHostStatus {
    cpuUsage: number;
    memory: {
        total: string;
        free: string;
        used: string;
        percent: number;
    };
    disk: {
        total: string;
        used: string;
        free: string;
        percent: number;
    };
}

export interface PanelSettings {
    language: 'en' | 'fil';
    currency: 'USD' | 'PHP';
}

export interface Customer {
    id: string;
    name: string;
    contact: string;
    address: string;
    notes: string;
}
