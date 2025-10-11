import express from 'express';
import { getRouterConfig, mikrotikApi } from '../api.js';
import { isAuthenticated } from './auth.js';

const router = express.Router();
router.use(isAuthenticated);

const mikrotikRequestHandler = (path, method = 'get', isIdSpecific = false, customBodyHandler = null) => {
    return async (req, res) => {
        const { routerId, id } = req.params;
        const fullPath = isIdSpecific ? `${path}/${id}` : path;
        
        try {
            const routerConfig = await getRouterConfig(routerId);
            let body = null;
            if (method !== 'get' && method !== 'delete') {
                body = customBodyHandler ? customBodyHandler(req.body) : req.body;
            }

            const result = await mikrotikApi(routerConfig, method, fullPath, body);
            
            // For DELETE requests, MikroTik often returns an empty object on success.
            if (method === 'delete' && (result === undefined || Object.keys(result).length === 0)) {
                 return res.status(204).send();
            }

            // For POST/PUT requests
            if (method === 'put' && result['.id']) {
                 return res.status(201).json(result);
            }

            res.json(result);
        } catch (error) {
            res.status(error.status || 500).json({ message: error.message });
        }
    };
};

// Dashboard
router.get('/:routerId/system/resource', mikrotikRequestHandler('/system/resource'));
router.get('/:routerId/interface', mikrotikRequestHandler('/interface'));
router.get('/:routerId/log', mikrotikRequestHandler('/log'));

// Network
router.get('/:routerId/ip/address', mikrotikRequestHandler('/ip/address'));
router.get('/:routerId/ip/route', mikrotikRequestHandler('/ip/route'));
router.get('/:routerId/ip/pool', mikrotikRequestHandler('/ip/pool'));
router.get('/:routerId/interface/vlan', mikrotikRequestHandler('/interface/vlan'));

// Firewall
for (const type of ['filter', 'nat', 'mangle']) {
    const basePath = `/ip/firewall/${type}`;
    router.get(`/:routerId/firewall/${type}`, mikrotikRequestHandler(basePath));
    router.put(`/:routerId/firewall/${type}`, mikrotikRequestHandler(basePath, 'put'));
    router.patch(`/:routerId/firewall/${type}/:id`, mikrotikRequestHandler(basePath, 'patch', true));
    router.delete(`/:routerId/firewall/${type}/:id`, mikrotikRequestHandler(basePath, 'delete', true));
}

// PPPoE
router.get('/:routerId/ppp/profile', mikrotikRequestHandler('/ppp/profile'));
router.put('/:routerId/ppp/profile', mikrotikRequestHandler('/ppp/profile', 'put'));
router.patch('/:routerId/ppp/profile/:id', mikrotikRequestHandler('/ppp/profile', 'patch', true));
router.delete('/:routerId/ppp/profile/:id', mikrotikRequestHandler('/ppp/profile', 'delete', true));

router.get('/:routerId/ppp/secret', mikrotikRequestHandler('/ppp/secret'));
router.put('/:routerId/ppp/secret', mikrotikRequestHandler('/ppp/secret', 'put'));
router.patch('/:routerId/ppp/secret/:id', mikrotikRequestHandler('/ppp/secret', 'patch', true));
router.delete('/:routerId/ppp/secret/:id', mikrotikRequestHandler('/ppp/secret', 'delete', true));

router.get('/:routerId/ppp/active', mikrotikRequestHandler('/ppp/active'));
router.post('/:routerId/ppp/active/remove', mikrotikRequestHandler('/ppp/active/remove', 'post'));

router.get('/:routerId/interface/pppoe-server/server', mikrotikRequestHandler('/interface/pppoe-server/server'));

// System Scripts & Scheduler (for billing)
router.put('/:routerId/system/script', mikrotikRequestHandler('/system/script', 'put'));
router.put('/:routerId/system/scheduler', mikrotikRequestHandler('/system/scheduler', 'put'));
router.get('/:routerId/system/script', mikrotikRequestHandler('/system/script'));
router.delete('/:routerId/system/script/:id', mikrotikRequestHandler('/system/script', 'delete', true));
router.delete('/:routerId/system/scheduler/:id', mikrotikRequestHandler('/system/scheduler', 'delete', true));

// Hotspot
router.get('/:routerId/ip/hotspot/active', mikrotikRequestHandler('/ip/hotspot/active'));
router.get('/:routerId/ip/hotspot/host', mikrotikRequestHandler('/ip/hotspot/host'));
router.get('/:routerId/ip/hotspot/user/profile', mikrotikRequestHandler('/ip/hotspot/user/profile'));
router.get('/:routerId/ip/hotspot/profile', mikrotikRequestHandler('/ip/hotspot/profile'));
router.get('/:routerId/ip/hotspot/user', mikrotikRequestHandler('/ip/hotspot/user'));
router.put('/:routerId/ip/hotspot/user', mikrotikRequestHandler('/ip/hotspot/user', 'put'));
router.patch('/:routerId/ip/hotspot/user/:id', mikrotikRequestHandler('/ip/hotspot/user', 'patch', true));
router.delete('/:routerId/ip/hotspot/user/:id', mikrotikRequestHandler('/ip/hotspot/user', 'delete', true));
router.get('/:routerId/certificate', mikrotikRequestHandler('/certificate'));

// ZeroTier
router.get('/:routerId/zerotier/interface', mikrotikRequestHandler('/zerotier/interface'));
router.put('/:routerId/zerotier/interface', mikrotikRequestHandler('/zerotier/interface', 'put'));
router.patch('/:routerId/zerotier/interface/:id', mikrotikRequestHandler('/zerotier/interface', 'patch', true));
router.delete('/:routerId/zerotier/interface/:id', mikrotikRequestHandler('/zerotier/interface', 'delete', true));

// System Settings
router.get('/:routerId/system/ntp/client', mikrotikRequestHandler('/system/ntp/client'));
router.patch('/:routerId/system/ntp/client', mikrotikRequestHandler(
    '/system/ntp/client', 
    'patch',
    false,
    (body) => ({
        enabled: body.enabled ? 'yes' : 'no',
        'primary-ntp': body.primaryNtp,
        'secondary-ntp': body.secondaryNtp,
    })
));
router.post('/:routerId/system/reboot', mikrotikRequestHandler('/system/reboot', 'post'));
router.post('/:routerId/system/shutdown', mikrotikRequestHandler('/system/shutdown', 'post'));

export default router;
