import type { NodeMcuSettings, NodeMcuRate } from '../types.ts';

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
        const error = new Error(errorData.message);
        (error as any).status = response.status;
        throw error;
    }

    // Reboot might return text/html, settings should return json
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
};

export const loginToDevice = (deviceIp: string, password: string): Promise<{ cookie: string }> => {
    return fetchData<{ cookie: string }>('/api/nodemcu/login', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, password, user: 'admin' }),
    });
};


export const getSettings = async (deviceIp: string, cookie: string): Promise<NodeMcuSettings> => {
    const rawSettings = await fetchData<any>('/api/nodemcu/proxy-get', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, path: '/get_config', cookie }),
    });

    // Transform the flat rate structure into an array of objects
    const rates: NodeMcuRate[] = [];
    if (rawSettings) {
        for (const key in rawSettings) {
            if (key.startsWith('rate')) {
                const credit = parseInt(key.substring(4), 10);
                const time = parseInt(rawSettings[key], 10);
                if (!isNaN(credit) && credit > 0 && !isNaN(time)) {
                    rates.push({ credit, time });
                }
            }
        }
    }
    
    // Sort rates by credit for consistent display
    rates.sort((a, b) => a.credit - b.credit);

    const settings: NodeMcuSettings = {
        deviceName: rawSettings.deviceName || '',
        portalUrl: rawSettings.portalUrl || '',
        rates: rates,
    };

    return settings;
};

export const saveSettings = (deviceIp: string, cookie: string, settings: Partial<NodeMcuSettings>): Promise<string> => {
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
        body: JSON.stringify({ deviceIp, path: '/save_config', data: formData, cookie }),
    });
};


export const rebootDevice = (deviceIp: string, cookie: string): Promise<string> => {
    return fetchData<string>('/api/nodemcu/proxy-get', {
        method: 'POST',
        body: JSON.stringify({ deviceIp, path: '/reboot_device', cookie }),
    });
};