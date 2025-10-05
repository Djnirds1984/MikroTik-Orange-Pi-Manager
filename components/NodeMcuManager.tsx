import React, { useMemo } from 'react';
import type { RouterConfigWithId, HotspotHost } from '../types.ts';
import { ChipIcon, ExclamationTriangleIcon } from '../constants.tsx';

interface NodeMcuManagerProps {
    hosts: HotspotHost[];
    selectedRouter: RouterConfigWithId | null;
}

export const NodeMcuManager: React.FC<NodeMcuManagerProps> = ({ hosts, selectedRouter }) => {

    const nodeMcuDevices = useMemo(() => {
        return hosts
            .filter(host => host.comment && /vendo|nodemcu|pisowifi/i.test(host.comment))
            .map(host => ({
                ...host,
                name: host.comment?.replace(/\[|\]/g, '').trim() || host.macAddress,
            }));
    }, [hosts]);

    // Placeholder for future actions
    const handleAction = (ip: string, action: 'reboot' | 'settings') => {
        alert(`Action '${action}' for device at ${ip} is not yet implemented. This would require direct communication with the NodeMCU device.`);
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-400 flex items-start gap-3">
                 <ExclamationTriangleIcon className="w-8 h-8 text-yellow-400 flex-shrink-0" />
                 <div>
                    <h4 className="font-bold text-slate-200">How to add a NodeMCU device:</h4>
                    <p>This panel identifies NodeMCU/PisoWiFi devices by looking for specific keywords in the <span className="font-mono text-cyan-400">Comment</span> field of an entry in your router's <span className="font-mono text-cyan-400">IP &gt; Hotspot &gt; Hosts</span> list. To make a device appear here, add a comment containing <span className="font-mono text-orange-400">"vendo"</span>, <span className="font-mono text-orange-400">"nodemcu"</span>, or <span className="font-mono text-orange-400">"pisowifi"</span>.</p>
                </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Device Name</th>
                                <th scope="col" className="px-6 py-3">IP Address</th>
                                <th scope="col" className="px-6 py-3">MAC Address</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {nodeMcuDevices.length > 0 ? nodeMcuDevices.map(device => (
                                <tr key={device.id} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-slate-200 flex items-center gap-2">
                                        <ChipIcon className="w-5 h-5 text-cyan-400" />
                                        {device.name}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-cyan-400">{device.address}</td>
                                    <td className="px-6 py-4 font-mono text-slate-300">{device.macAddress}</td>
                                    <td className="px-6 py-4">
                                        {device.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-500/20 text-sky-400">Bypassed</span>}
                                        {device.authorized && !device.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400">Authorized</span>}
                                        {!device.authorized && !device.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-600/50 text-slate-400">Guest</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => handleAction(device.address, 'reboot')} className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded-md font-semibold text-white" title="Not implemented">
                                            Reboot
                                        </button>
                                        <button onClick={() => handleAction(device.address, 'settings')} className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded-md font-semibold text-white" title="Not implemented">
                                            Settings
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-slate-500">
                                        No NodeMCU devices found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};