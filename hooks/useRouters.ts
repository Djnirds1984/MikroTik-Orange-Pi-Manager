import { useState, useEffect, useCallback } from 'react';
import type { RouterConfig, RouterConfigWithId } from '../types.ts';

const STORAGE_KEY = 'mikrotikRouters';

export const useRouters = () => {
    const [routers, setRouters] = useState<RouterConfigWithId[]>([]);

    useEffect(() => {
        try {
            const storedRouters = localStorage.getItem(STORAGE_KEY);
            if (storedRouters) {
                setRouters(JSON.parse(storedRouters));
            }
        } catch (error) {
            console.error("Failed to parse routers from localStorage", error);
            setRouters([]);
        }
    }, []);

    const saveRouters = useCallback((updatedRouters: RouterConfigWithId[]) => {
        setRouters(updatedRouters);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedRouters));
    }, []);

    const addRouter = (routerConfig: RouterConfig) => {
        const newRouter: RouterConfigWithId = {
            ...routerConfig,
            id: crypto.randomUUID(),
        };
        saveRouters([...routers, newRouter]);
    };

    const updateRouter = (updatedRouter: RouterConfigWithId) => {
        const updatedRouters = routers.map(router => 
            router.id === updatedRouter.id ? updatedRouter : router
        );
        saveRouters(updatedRouters);
    };

    const deleteRouter = (routerId: string) => {
        const updatedRouters = routers.filter(router => router.id !== routerId);
        saveRouters(updatedRouters);
    };

    return { routers, addRouter, updateRouter, deleteRouter };
};