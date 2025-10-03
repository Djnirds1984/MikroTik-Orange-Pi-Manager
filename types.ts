export type View = 'dashboard' | 'scripting' | 'routers' | 'pppoe' | 'users' | 'billing' | 'updater';

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

export interface HotspotClient {
  macAddress: string;
  uptime: string;
  signal: string;
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
    service: string;
    profile: string;
    comment?: string;
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