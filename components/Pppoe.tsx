import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, PppoeSettings, PppoeClient } from '../types.ts';
import { getPppoeSettings, getPppoeActiveClients } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon } from '../constants.tsx';

const DashboardCard: React.FC<{ title: string, children: React.ReactNode, className?: string }> = ({ title, children, className }) => (
  <div className={`bg-slate-800 border border-slate-700 rounded-lg p-6 ${className}`}>
    <h3 className="text-lg font-semibold text-orange-400 mb-4">{title}</h3>
    {children}
  </div>
);

const InfoItem: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between items-center py-2.5 border-b border-slate-700/50 last:border-b-0">
    <span className="text-slate-400 text-sm">{label}</span>
    <div className="text-slate-100 font-mono text-sm text-right">{children}</div>
  </div>
);

const ToggleSwitch: React.FC<{ checked: boolean, onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`${
        checked ? 'bg-orange-600' : 'bg-slate-600'
        } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-800`}
    >
        <span
        aria-hidden="true"
        className={`${
            checked ? 'translate-x-5' : 'translate-x-0'
        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
  </button>
);


interface PppoeProps {
  selectedRouter: RouterConfigWithId | null;
}

export const Pppoe: React.FC<PppoeProps> = ({ selectedRouter }) => {
    const [settings, setSettings] = useState<PppoeSettings | null>(null);
    const [clients, setClients] = useState<PppoeClient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setIsLoading(false);
            setSettings(null);
            setClients([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        setSettings(null);
        setClients([]);

        try {
            const [settingsData, clientsData] = await Promise.all([
                getPppoeSettings(selectedRouter),
                getPppoeActiveClients(selectedRouter),
            ]);
            setSettings(settingsData);
            setClients(clientsData);
        } catch (err) {
            console.error("Failed to fetch PPPoE data:", err);
            setError(`Could not fetch PPPoE data from "${selectedRouter.name}". Ensure the PPP package is enabled and configured.`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    useEffect(() => {
        if (!selectedRouter || isLoading || error) return;

        const interval = setInterval(async () => {
            try {
                const updatedClients = await getPppoeActiveClients(selectedRouter);
                setClients(updatedClients);
            } catch (err) {
                console.error("Failed to poll PPPoE clients:", err);
            }
        }, 5000); // Refresh every 5 seconds

        return () => clearInterval(interval);
    }, [isLoading, error, selectedRouter]);


    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-slate-800 rounded-lg border border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-200">PPPoE Manager</h2>
                <p className="mt-2 text-slate-400">Please select a router to manage its PPPoE settings and clients.</p>
            </div>
        );
    }
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-orange-400">Fetching PPPoE data from {selectedRouter.name}...</p>
            </div>
        );
    }
    
    if (error || !settings) {
         return (
            <div className="flex flex-col items-center justify-center h-64 bg-slate-800 rounded-lg border border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-400">Failed to load PPPoE data.</p>
                <p className="mt-2 text-slate-400 text-sm">{error}</p>
            </div>
         );
    }

    const authMethods = Object.entries(settings.authentication)
        .filter(([, enabled]) => enabled)
        .map(([method]) => method.toUpperCase())
        .join(', ');

    return (
        <div className="flex flex-col space-y-8">
            <DashboardCard title="PPPoE Server Configuration">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <InfoItem label="Authentication Mode">
                        <div className="flex items-center gap-3">
                            <span className={`text-xs font-semibold ${!settings.useRadius ? 'text-green-400' : 'text-slate-500'}`}>NATIVE</span>
                            <ToggleSwitch checked={settings.useRadius} onChange={() => { /* Read-only for now */ }} />
                            <span className={`text-xs font-semibold ${settings.useRadius ? 'text-cyan-400' : 'text-slate-500'}`}>RADIUS</span>
                        </div>
                    </InfoItem>
                     <InfoItem label="Default Profile">
                        <span className="px-2 py-1 bg-slate-700 rounded text-xs">{settings.defaultProfile}</span>
                    </InfoItem>
                     <InfoItem label="Authentication Methods">
                        <span>{authMethods || 'None'}</span>
                    </InfoItem>
                    {settings.useRadius && settings.radiusConfig && (
                         <InfoItem label="RADIUS Server">
                            <span>{settings.radiusConfig.address}</span>
                        </InfoItem>
                    )}
                </div>
            </DashboardCard>
            
            <DashboardCard title={`Active PPPoE Clients (${clients.length})`}>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-800">
                            <tr>
                                <th scope="col" className="px-4 py-3">User</th>
                                <th scope="col" className="px-4 py-3">Service</th>
                                <th scope="col" className="px-4 py-3">Assigned Address</th>
                                <th scope="col" className="px-4 py-3">Caller ID (MAC)</th>
                                <th scope="col" className="px-4 py-3 text-right">Uptime</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                           {clients.length > 0 ? clients.map(client => (
                                <tr key={client.id} className="hover:bg-slate-700/50">
                                    <td className="px-4 py-3 font-medium text-slate-200">{client.name}</td>
                                    <td className="px-4 py-3 font-mono text-slate-300">{client.service}</td>
                                    <td className="px-4 py-3 font-mono text-cyan-400">{client.address}</td>
                                    <td className="px-4 py-3 font-mono text-slate-400">{client.callerId}</td>
                                    <td className="px-4 py-3 font-mono text-slate-300 text-right">{client.uptime}</td>
                                </tr>
                           )) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-slate-500">
                                        No active PPPoE clients found.
                                    </td>
                                </tr>
                           )}
                        </tbody>
                    </table>
                </div>
            </DashboardCard>
        </div>
    );
};