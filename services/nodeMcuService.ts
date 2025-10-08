import type { NodeMcuSettings } from '../types.ts';

const fetchData = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    // API backend is on port 3002
    const apiBaseUrl = `http://${window.location.hostname}:3002`;
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

    // Reboot might return text/html, settings should return json
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
};


export const getSettings = (deviceIp: string): Promise<NodeMcuSettings> => {
    return fetchData<NodeMcuSettings>('/api/nodemcu/proxy-get', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, path: '/admin/config.json' }),
    });
};

export const saveSettings = (deviceIp: string, settings: Partial<NodeMcuSettings>): Promise<string> => {
    // Transform settings into the flat structure the firmware likely expects
    const formData: Record<string, any> = {
        deviceName: settings.deviceName,
        portalUrl: settings.portalUrl,
    };

    settings.rates?.forEach(rate => {
        // Ensure that we don't create empty rate parameters
        if (rate.credit > 0) {
            formData[`rate${rate.credit}`] = rate.time;
        }
    });

    return fetchData<string>('/api/nodemcu/proxy-post', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, path: '/admin/save', data: formData }),
    });
};


export const rebootDevice = (deviceIp: string): Promise<string> => {
    return fetchData<string>('/api/nodemcu/proxy-get', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, path: '/admin/reboot' }),
    });
};
