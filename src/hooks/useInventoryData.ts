import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { InventoryItem } from '../types';

export const useInventoryData = () => {
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchInventory = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data } = await api.get('/system/inventory');
            setInventory(data);
        } catch (error) {
            console.error("Failed to fetch inventory", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInventory();
    }, [fetchInventory]);

    return { inventory, isLoading, refreshInventory: fetchInventory };
};
