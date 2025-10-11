import { getAuthHeader } from './databaseService.ts';

const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`/api/license${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
            ...options.headers,
        },
        ...options,
    });
    
    // Don't auto-logout if the token was null to begin with (e.g. initial load)
    if (response.status === 401 && options.headers?.['Authorization'] && !options.headers['Authorization'].includes('Bearer null')) {
        localStorage.removeItem('authToken');
        window.location.reload();
        throw new Error('Session expired. Please log in again.');
    }
  
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'An error occurred with the license service.');
    }

    return data as T;
};

export interface LicenseStatus {
    isValid: boolean;
    expiryDate?: string;
    message?: string;
}

export const getHardwareId = (): Promise<{ hwid: string }> => {
    return fetchData<{ hwid: string }>('/hwid');
};

export const getLicenseStatus = (): Promise<LicenseStatus> => {
    return fetchData<LicenseStatus>('/status');
};

export const activateLicense = (key: string): Promise<LicenseStatus> => {
    return fetchData<LicenseStatus>('/activate', {
        method: 'POST',
        body: JSON.stringify({ key }),
    });
};
