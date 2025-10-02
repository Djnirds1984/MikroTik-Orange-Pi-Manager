import { mockSystemInfo, mockInterfaces, mockHotspotClients, mockLogs } from '../data/mockData';
import type { SystemInfo, Interface, HotspotClient, LogEntry } from '../types';

// --- IMPORTANT ---
// This is a MOCK API service. 
// A web browser cannot directly connect to the MikroTik API (port 8728/8729) 
// due to security restrictions (CORS and lack of raw TCP socket access).
//
// In a real-world application, you would need a backend proxy server
// (e.g., using Node.js, Python, or Go) that:
// 1. Receives requests from this frontend application.
// 2. Connects to the MikroTik router's API.
// 3. Fetches the data and sends it back to the frontend.
//
// This service simulates that backend interaction by returning mock data asynchronously.

const API_LATENCY = 800; // Simulate network latency

export const getSystemInfo = async (): Promise<SystemInfo> => {
  console.log("Fetching system info...");
  return new Promise(resolve => {
    setTimeout(() => resolve(mockSystemInfo), API_LATENCY);
  });
};

export const getInterfaces = async (): Promise<Interface[]> => {
    console.log("Fetching interfaces...");
    return new Promise(resolve => {
      setTimeout(() => resolve(mockInterfaces), API_LATENCY);
    });
};
  
export const getHotspotClients = async (): Promise<HotspotClient[]> => {
  console.log("Fetching hotspot clients...");
  return new Promise(resolve => {
    setTimeout(() => resolve(mockHotspotClients), API_LATENCY);
  });
};
  
export const getLogs = async (): Promise<LogEntry[]> => {
  console.log("Fetching logs...");
  return new Promise(resolve => {
    setTimeout(() => resolve(mockLogs), API_LATENCY);
  });
};
