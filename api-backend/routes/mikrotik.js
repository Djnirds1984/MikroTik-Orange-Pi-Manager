import express from 'express';
import { getRouterConfig, mikrotikApi } from '../api.js';
import { isAuthenticated } from './auth.js';

const router = express.Router();
router.use(isAuthenticated);

const createMikrotikMiddleware = (path, method = 'get', bodyHandler = null) => {
    return async (req, res) => {
        const { routerId } = req.params;
        try {
            const routerConfig = await getRouterConfig(routerId);
            const data = bodyHandler ? bodyHandler(req.body) : (method !== 'get' ? req.body : null);
            const result = await mikrotikApi(routerConfig, method, path, data);
            res.json(result);
        } catch (error) {
            res.status(error.status || 500).json({ message: error.message });
        }
    };
};

const createMikrotikIdMiddleware = (path, method = 'get') => {
    return async (req, res) => {
        const { routerId, id } = req.params;
        const fullPath = `${path}/${id}`;
        try {
            const routerConfig = await getRouterConfig(routerId);
            const result = await mikrotikApi(routerConfig, method, fullPath, method !== 'get' ? req.body : null);
            if (method === 'delete' && Object.keys(result).length === 0) {
                 res.status(204).send();
            } else {
                res.json(result);
            }
        } catch (error) {
            res.status(error.status || 500).json({ message: error.message });
        }
    };
};

// Dashboard
router.get('/:routerId/system/resource', createMikrotikMiddleware('/system/resource'));
router.get('/:routerId/interface', createMikrotikMiddleware('/interface'));

// Network
router.get('/:routerId/ip/address', createMikrotikMiddleware('/ip/address'));
router.get('/:routerId/ip/route', createMikrotikMiddleware('/ip/route'));
router.get('/:routerId/ip/pool', createMikrotikMiddleware('/ip/pool'));
router.get('/:routerId/vlan', createMikrotikMiddleware('/interface/vlan'));
router.get('/:routerId/firewall/filter', createMikrotikMiddleware('/ip/firewall/filter'));
router.get('/:routerId/firewall/nat', createMikrotikMiddleware('/ip/firewall/nat'));
router.get('/:routerId/firewall/mangle', createMikrotikMiddleware('/ip/firewall/mangle'));
router.post('/:routerId/firewall/:type', async (req, res) => {
    const { routerId, type } = req.params;
    const validTypes = ['filter', 'nat', 'mangle'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ message: 'Invalid firewall rule type.' });
    }
    const path = `/ip/firewall/${type}`;
    try {
        const routerConfig = await getRouterConfig(routerId);
        const result = await mikrotikApi(routerConfig, 'put', path, req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});
router.patch('/:routerId/firewall/:type/:id', createMikrotikIdMiddleware('/ip/firewall/:type'));
router.delete('/:routerId/firewall/:type/:id', createMikrotikIdMiddleware('/ip/firewall/:type', 'delete'));


// PPPoE
router.get('/:routerId/ppp/profile', createMikrotikMiddleware('/ppp/profile'));
router.post('/:routerId/ppp/profile', createMikrotikMiddleware('/ppp/profile', 'put'));
router.patch('/:routerId/ppp/profile/:id', createMikrotikIdMiddleware('/ppp/profile', 'patch'));
router.delete('/:routerId/ppp/profile/:id', createMikrotikIdMiddleware('/ppp/profile', 'delete'));

router.get('/:routerId/ppp/secret', createMikrotikMiddleware('/ppp/secret'));
router.post('/:routerId/ppp/secret', createMikrotikMiddleware('/ppp/secret', 'put'));
router.patch('/:routerId/ppp/secret/:id', createMikrotikIdMiddleware('/ppp/secret', 'patch'));
router.delete('/:routerId/ppp/secret/:id', createMikrotikIdMiddleware('/ppp/secret', 'delete'));

router.get('/:routerId/ppp/active', createMikrotikMiddleware('/ppp/active'));
router.post('/:routerId/ppp/active/remove', createMikrotikMiddleware('/ppp/active/remove', 'post'));

router.get('/:routerId/ppp/server', createMikrotikMiddleware('/interface/pppoe-server/server'));

// System Scripts & Scheduler (for billing)
router.post('/:routerId/system/script', createMikrotikMiddleware('/system/script', 'put'));
router.post('/:routerId/system/scheduler', createMikrotikMiddleware('/system/scheduler', 'put'));
router.get('/:routerId/system/script', createMikrotikMiddleware('/system/script'));
router.delete('/:routerId/system/script/:id', createMikrotikIdMiddleware('/system/script', 'delete'));
router.delete('/:routerId/system/scheduler/:id', createMikrotikIdMiddleware('/system/scheduler', 'delete'));


// Hotspot
router.get('/:routerId/ip/hotspot/active', createMikrotikMiddleware('/ip/hotspot/active'));
router.get('/:routerId/ip/hotspot/host', createMikrotikMiddleware('/ip/hotspot/host'));
router.get('/:routerId/ip/hotspot/user/profile', createMikrotikMiddleware('/ip/hotspot/user/profile'));
router.get('/:routerId/ip/hotspot/profile', createMikrotikMiddleware('/ip/hotspot/profile'));
router.get('/:routerId/ip/hotspot/user', createMikrotikMiddleware('/ip/hotspot/user'));
router.post('/:routerId/ip/hotspot/user', createMikrotikMiddleware('/ip/hotspot/user', 'put'));
router.patch('/:routerId/ip/hotspot/user/:id', createMikrotikIdMiddleware('/ip/hotspot/user', 'patch'));
router.delete('/:routerId/ip/hotspot/user/:id', createMikrotikIdMiddleware('/ip/hotspot/user', 'delete'));
router.get('/:routerId/certificate', createMikrotikMiddleware('/certificate'));
router.post('/:routerId/hotspot-setup', async (req, res) => {
    const { routerId } = req.params;
    const params = req.body;
    const commands = [
      `/ip pool add name=hs-pool ranges=${params.addressPool}`,
      `/ip hotspot add name=hotspot1 interface=${params.hotspotInterface} address-pool=hs-pool profile=hsprof1`,
      `/ip address add address=${params.localAddress} interface=${params.hotspotInterface}`,
      `/ip hotspot profile set hsprof1 hotspot-address=${params.localAddress.split('/')[0]} dns-name=${params.dnsName}`,
      `/ip hotspot user add name=${params.hotspotUser} password=${params.hotspotPass}`,
      `/ip dns set servers=${params.dnsServers}`
    ];
    if (params.sslCertificate !== 'none') {
        commands.push(`/ip service set www-ssl certificate=${params.sslCertificate} disabled=no`);
        commands.push(`/ip hotspot profile set hsprof1 login-by=https,http-chap,http-pap`);
    }

    try {
        const routerConfig = await getRouterConfig(routerId);
        // We can't run setup via REST, so this is a placeholder.
        // In a real scenario, you might have a script on the router that you trigger.
        // For now, we return a success with the commands that would be run.
        console.log("Simulating Hotspot Setup. Commands:", commands);
        res.json({ status: "success", message: "Hotspot setup simulated. Check backend console for commands." });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});


// ZeroTier
router.get('/:routerId/zerotier/interface', createMikrotikMiddleware('/zerotier/interface'));
router.post('/:routerId/zerotier/interface', createMikrotikMiddleware('/zerotier/interface', 'put'));
router.patch('/:routerId/zerotier/interface/:id', createMikrotikIdMiddleware('/zerotier/interface', 'patch'));
router.delete('/:routerId/zerotier/interface/:id', createMikrotikIdMiddleware('/zerotier/interface', 'delete'));

// System Settings
router.get('/:routerId/system/ntp/client', createMikrotikMiddleware('/system/ntp/client'));
router.patch('/:routerId/system/ntp/client', createMikrotikMiddleware('/system/ntp/client', 'patch', (body) => ({
    enabled: body.enabled ? 'yes' : 'no',
    'primary-ntp': body.primaryNtp,
    'secondary-ntp': body.secondaryNtp,
}))
);
router.post('/:routerId/system/reboot', createMikrotikMiddleware('/system/reboot', 'post'));
router.post('/:routerId/system/shutdown', createMikrotikMiddleware('/system/shutdown', 'post'));

// Logs
router.get('/:routerId/log', createMikrotikMiddleware('/log'));


export default router;
