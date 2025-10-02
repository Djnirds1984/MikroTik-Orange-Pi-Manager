
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.136 11.886c3.87-3.87 10.154-3.87 14.024 0M19.5 18a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
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
