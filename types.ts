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

export interface InterfaceWithHistory extends Interface {
    trafficHistory: { rx: number, tx: number }[]; // in Mbit/s for the chart
}

export interface HotspotClient {
  macAddress: string;
  uptime: string;
  signal: string;
}

export interface PppoeClient {
    id: string;
    name: string;
    service: string;
    callerId: string;
    address: string;
    uptime: string;
}

export interface RadiusConfig {
    address: string;
    secret: string; // Masked on arrival
    timeout: string;
}
export interface PppoeSettings {
    useRadius: boolean;
    defaultProfile: string;
    authentication: {
        pap: boolean;
        chap: boolean;
        mschap1: boolean;
        mschap2: boolean;
    },
    radiusConfig: RadiusConfig | null;
}

export interface LogEntry {
  time: string;
  topic: string;
  message: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
}

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

export interface TestConnectionResponse {
    success: boolean;
    message: string;
}