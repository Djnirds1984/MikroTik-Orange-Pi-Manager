
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
  rxRate: string;
  txRate: string;
}

export interface InterfaceWithHistory extends Interface {
    trafficHistory: { rx: number, tx: number }[];
}

export interface HotspotClient {
  macAddress: string;
  uptime: string;
  signal: string;
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
