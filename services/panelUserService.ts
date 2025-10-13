import { getAuthHeader } from './databaseService.ts';

const apiBaseUrl = '/api/panel-users';

export interface PanelUser {
    id: string;
    username: string;
    role: 'admin' | 'employee';
}

export interface NewUserData {
    username: string;
    password: any;
    role: 'admin' | 'employee';
}

const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
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

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Request failed with status ${response.status}` }));
        throw new Error(errorData.message);
    }
    
    if (response.status === 204) { // No Content
        return {} as T;
    }

    return response.json() as Promise<T>;
};

export const getPanelUsers = () => fetchData<PanelUser[]>('/');
export const createPanelUser = (data: NewUserData) => fetchData<PanelUser>('/', { method: 'POST', body: JSON.stringify(data) });
export const removePanelUser = (userId: string) => fetchData<void>(`/${userId}`, { method: 'DELETE' });
