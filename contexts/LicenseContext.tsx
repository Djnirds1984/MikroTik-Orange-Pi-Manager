import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getLicenseStatus, activateLicense, getHardwareId, type LicenseStatus } from '../services/licenseService.ts';
import { useAuth } from './AuthContext.tsx';

interface LicenseContextType {
    isValid: boolean;
    expiryDate: string | null;
    hwid: string | null;
    isLoading: boolean;
    error: string | null;
    checkStatus: () => Promise<void>;
    activate: (key: string) => Promise<LicenseStatus>;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isLoading: isAuthLoading } = useAuth();
    const [isValid, setIsValid] = useState(false);
    const [expiryDate, setExpiryDate] = useState<string | null>(null);
    const [hwid, setHwid] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const checkStatus = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const status = await getLicenseStatus();
            setIsValid(status.isValid);
            setExpiryDate(status.expiryDate || null);
        } catch (e) {
            setError((e as Error).message);
            setIsValid(false);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchHwid = useCallback(async () => {
        try {
            const data = await getHardwareId();
            setHwid(data.hwid);
        } catch (e) {
            setError((e as Error).message);
        }
    }, []);

    useEffect(() => {
        if (!isAuthLoading) {
            if (user) {
                checkStatus();
                fetchHwid();
            } else {
                // Not logged in, so no license check needed yet.
                setIsValid(false);
                setIsLoading(false);
            }
        }
    }, [user, isAuthLoading, checkStatus, fetchHwid]);

    const activate = async (key: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const status = await activateLicense(key);
            setIsValid(status.isValid);
            setExpiryDate(status.expiryDate || null);
            return status;
        } catch (e) {
            setError((e as Error).message);
            setIsValid(false);
            throw e;
        } finally {
            setIsLoading(false);
        }
    };
    
    const value = { isValid, expiryDate, hwid, isLoading, error, checkStatus, activate };

    return (
        <LicenseContext.Provider value={value}>
            {children}
        </LicenseContext.Provider>
    );
};

export const useLicense = () => {
    const context = useContext(LicenseContext);
    if (context === undefined) {
        throw new Error('useLicense must be used within a LicenseProvider');
    }
    return context;
};
