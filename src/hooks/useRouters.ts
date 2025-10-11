import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { RouterConfigWithId } from '../types';

export const useRouters = () => {
    const [routers, setRouters] = useState<RouterConfigWithId[] | null>(null);
    const [selectedRouter, setSelectedRouterState] = useState<RouterConfigWithId | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRouters = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await api.get<RouterConfigWithId[]>('/routers');
            setRouters(data);
            if (data.length > 0) {
                const lastSelectedId = localStorage.getItem('selectedRouterId');
                const routerToSelect = data.find(r => r.id === lastSelectedId) || data[0];
                setSelectedRouterState(routerToSelect);
                 if (routerToSelect) {
                    localStorage.setItem('selectedRouterId', routerToSelect.id);
                }
            } else {
                setSelectedRouterState(null);
                localStorage.removeItem('selectedRouterId');
            }
        } catch (err) {
            setError('Failed to fetch routers.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRouters();
    }, [fetchRouters]);

    const setSelectedRouter = (router: RouterConfigWithId | null) => {
        setSelectedRouterState(router);
        if (router) {
            localStorage.setItem('selectedRouterId', router.id);
        } else {
            localStorage.removeItem('selectedRouterId');
        }
    };

    return { routers, selectedRouter, setSelectedRouter, isLoading, error, refreshRouters: fetchRouters };
};
