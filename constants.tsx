import React from 'react';

export const EXAMPLE_PROMPTS = [
  {
    title: "Basic Firewall",
    prompt: "Create a basic firewall for a home router. Drop all incoming connections not initiated from inside the LAN, but allow established and related connections. The LAN interface is ether2."
  },
  {
    title: "Guest WiFi",
    prompt: "Set up a new VLAN (VLAN ID 20) for guest wifi on the wlan1 interface. Create a new bridge for it, a new DHCP server on the 192.168.20.0/24 network, and a firewall rule to prevent guests from accessing the main LAN (192.168.1.0/24)."
  },
  {
    title: "Port Forwarding",
    prompt: "Forward port 8080 from the WAN interface to an internal server at 192.168.1.100 on port 80."
  },
    {
    title: "Block Social Media",
    prompt: "Create a layer7 protocol rule to block facebook.com and tiktok.com for all users on the LAN bridge."
  }
];

export const MikroTikLogoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 5a1 1 0 10-2 0v8a1 1 0 102 0V7zm-2 2.5a.5.5 0 000 1h2a.5.5 0 000-1h-2zM15 7a1 1 0 10-2 0v8a1 1 0 102 0V7zm-2 2.5a.5.5 0 000 1h2a.5.5 0 000-1h-2z" fill="currentColor"/>
  </svg>
);

export const EthernetIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3.75H19.5M8.25 6.75H19.5M8.25 9.75H19.5M8.25 12.75H19.5m-11.25 4.5h11.25a2.25 2.25 0 002.25-2.25v-13.5a2.25 2.25 0 00-2.25-2.25H4.5A2.25 2.25 0 002.25 4.5v13.5A2.25 2.25 0 004.5 20.25h11.25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 16.5h.008v.008H4.5v-.008zm0-3h.008v.008H4.5v-.008zm0-3h.008v.008H4.5V10.5zm0-3h.008v.008H4.5V7.5zm0-3h.008v.008H4.5V4.5z" />
    </svg>
);

export const WifiIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.136 11.886c3.87-3.87 10.154-3.87 14.024 0M19.5 18a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 A 0.75 0.75 0 0 0 4.5 21.25 z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
    </svg>
);

export const TunnelIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
);

export const VlanIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
);

export const UpdateIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

export const CheckCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const ExclamationTriangleIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
);

export const CloudArrowUpIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const RouterIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3V9a3 3 0 013-3h13.5a3 3 0 013 3v2.25a3 3 0 01-3 3m-13.5 0v-2.25a3 3 0 00-3-3m13.5 2.25v-2.25a3 3 0 00-3-3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75h.008v.008H8.25V9.75zm3.75 0h.008v.008H12V9.75zm3.75 0h.008v.008H15.75V9.75z" />
    </svg>
);

export const EditIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

export const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.033-2.134H8.033c-1.12 0-2.033.954-2.033 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);
