import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { CompanySettings } from '../types';

export const useCompanySettings = () => {
    const [settings, setSettings] = useState<CompanySettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data } = await api.get('/system/company-settings');
            setSettings(data);
        } catch (error) {
            console.error("Failed to fetch company settings", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const saveSettings = async (newSettings: CompanySettings) => {
        await api.post('/system/company-settings', newSettings);
        setSettings(newSettings); // Optimistic update
    };

    return { settings, isLoading, saveSettings, refreshSettings: fetchSettings };
};
