

import type { PanelHostStatus, PanelNtpStatus } from '../types.ts';
import { getAuthHeader } from './databaseService.ts';


const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const apiBaseUrl = ``;
    const response = await fetch(`${apiBaseUrl}${path}`, {
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
  
    const contentType = response.headers.get("content-type");
    if (!response.ok) {
        let errorMsg = `Request failed with status ${response.status}`;
        if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMsg = errorData.message || errorMsg;
        } else {
            const textError = await response.text();
            if (textError) errorMsg = textError;
        }
        throw new Error(errorMsg);
    }
    
    if (response.status === 204) { // No Content
        // For endpoints that return lists, an empty array is a better "no content" representation
        // than null, which can cause .filter/.map errors downstream.
        if (path.includes('backups') || path.includes('/api/db/')) {
            return [] as unknown as T;
        }
        return null as T;
    }

    const text = await response.text();

    if (contentType && contentType.includes("application/json")) {
        // Return a default value for empty JSON responses to prevent parsing errors
        if (!text) {
             if (path.includes('backups') || path.startsWith('/api/db/')) return [] as unknown as T;
             if (path.includes('settings')) return {} as unknown as T;
             return null as T;
        }
        return JSON.parse(text) as T;
    }
    
    // This will handle the text/plain response for logs
    if (path.startsWith('/api/host/logs')) {
        return text as unknown as T;
    }

    // Fallback for non-JSON 200 OK responses (e.g., server returning index.html)
    throw new Error(`Expected a JSON response from '${path}' but received '${contentType}'.`);
};

export const getPanelHostStatus = (): Promise<PanelHostStatus> => {
    return fetchData<PanelHostStatus>('/api/host-status');
};

// Panel NTP
export const getPanelNtpStatus = (): Promise<PanelNtpStatus> => {
    return fetchData<PanelNtpStatus>('/api/system/host-ntp-status');
};

export const togglePanelNtp = (enabled: boolean): Promise<{ message: string }> => {
    return fetchData<{ message: string }>('/api/system/host-ntp/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
    });
};


// --- Database Backup Services ---
export const createDatabaseBackup = (): Promise<{ message: string }> => {
    return fetchData<{ message: string }>('/api/create-backup', { method: 'POST' });
};

export const listDatabaseBackups = (): Promise<string[]> => {
    return fetchData<string[]>('/api/list-backups');
};

export const deleteDatabaseBackup = (backupFile: string): Promise<{ message: string }> => {
    return fetchData<{ message: string }>('/api/delete-backup', {
        method: 'POST',
        body: JSON.stringify({ backupFile }),
    });
};

// --- Host Logs ---
export const getHostLog = (type: 'panel-ui' | 'panel-api' | 'nginx-access' | 'nginx-error'): Promise<string> => {
    return fetchData<string>(`/api/host/logs?type=${type}`);
};