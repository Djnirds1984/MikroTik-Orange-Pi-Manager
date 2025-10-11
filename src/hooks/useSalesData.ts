import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { SaleRecord } from '../types';

export const useSalesData = (routerId: string | 'all' | null) => {
    const [sales, setSales] = useState<SaleRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchSales = useCallback(async () => {
        if (!routerId) {
            setSales([]);
            setIsLoading(false);
            return;
        };
        setIsLoading(true);
        try {
            const { data } = await api.get(`/system/sales/${routerId}`);
            setSales(data);
        } catch (error) {
            console.error("Failed to fetch sales data", error);
            setSales([]);
        } finally {
            setIsLoading(false);
        }
    }, [routerId]);

    useEffect(() => {
        fetchSales();
    }, [fetchSales]);

    return { sales, isLoading, refreshSales: fetchSales };
};
