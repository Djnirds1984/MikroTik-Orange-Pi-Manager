
export const mockSystemInfo = {
  boardName: "MikroTik RB4011iGS+",
  version: "7.15.1 (stable)",
  cpuLoad: 23,
  uptime: "12d 4h 32m 15s",
  memoryUsage: 45,
  totalMemory: "1024MiB",
};

export const mockInterfaces = [
  { name: "ether1-gateway", type: "ethernet", rxRate: "12.5 Mbit/s", txRate: "2.3 Mbit/s" },
  { name: "ether2-lan", type: "ethernet", rxRate: "890 kbit/s", txRate: "7.1 Mbit/s" },
  { name: "wlan1-main", type: "wifi", rxRate: "1.2 Mbit/s", txRate: "450 kbit/s" },
  { name: "vlan20-guest", type: "vlan", rxRate: "0 kbit/s", txRate: "0 kbit/s" },
  { name: "eoip-tunnel-1", type: "tunnel", rxRate: "500 kbit/s", txRate: "120 kbit/s" },
];

export const mockHotspotClients = [
  { macAddress: "A1:B2:C3:D4:E5:F6", uptime: "2h 15m", signal: "-55dBm" },
  { macAddress: "F9:E8:D7:C6:B5:A4", uptime: "0h 45m", signal: "-62dBm" },
  { macAddress: "12:34:56:78:90:AB", uptime: "5h 2m", signal: "-71dBm" },
];

export const mockLogs = [
  { time: "10:30:15", topic: "firewall,info", message: "input connection from 8.8.8.8 dropped" },
  { time: "10:30:12", topic: "dhcp,info", message: "dhcp1 assigned 192.168.1.150 to A1:B2:C3:D4:E5:F6" },
  { time: "10:29:55", topic: "system,info", message: "user admin logged in from 192.168.1.100" },
  { time: "10:28:01", topic: "wireless,info", message: "F9:E8:D7:C6:B5:A4@wlan1-main connected" },
  { time: "10:27:40", topic: "firewall,info", message: "port 8080 forwarded to 192.168.1.100" },
];
