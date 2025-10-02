import type { SystemInfo, Interface, HotspotClient, LogEntry } from '../types';

// The address of the backend proxy server.
// In a production environment, this would be the address of your Orange Pi.
const API_BASE_URL = 'http://localhost:3001/api';

const fetchData = async <T>(endpoint: string): Promise<T> => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Proxy server returned an error: ${response.status} ${errorBody}`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    console.error(`Failed to fetch from ${endpoint}:`, error);
    throw error;
  }
};


export const getSystemInfo = async (): Promise<SystemInfo> => {
  return fetchData<SystemInfo>('/system-info');
};

export const getInterfaces = async (): Promise<Interface[]> => {
  return fetchData<Interface[]>('/interfaces');
};
  
export const getHotspotClients = async (): Promise<HotspotClient[]> => {
  return fetchData<HotspotClient[]>('/hotspot-clients');
};
  
// Note: Log fetching is not implemented in the basic proxy.
// This would require a more complex implementation on the backend.
export const getLogs = async (): Promise<LogEntry[]> => {
  console.warn("getLogs is not implemented in the backend proxy.");
  return Promise.resolve([]);
};