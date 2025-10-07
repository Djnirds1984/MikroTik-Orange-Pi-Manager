import type { PanelHostStatus, PanelNtpStatus } from '../types.ts';

const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    // The panel API is on port 3001
    const apiBaseUrl = `http://${window.location.hostname}:3001`;
    const response = await fetch(`${apiBaseUrl}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
  
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
        throw new Error(errorData.message);
    }
    
    if (response.status === 204) { // No Content
        return null as T;
    }

    // Handle non-JSON responses for download
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
        return response.blob() as unknown as Promise<T>;
    }

    return response.json() as Promise<T>;
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
    return fetchData<{ message: string }>('/api/create-backup');
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