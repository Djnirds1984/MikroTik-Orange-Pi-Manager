import { useState, useEffect, useCallback } from 'react';
import type { SaleRecord } from '../types.ts';
import { dbApi } from '../services/databaseService.ts';

export const useSalesData = () => {
    const [sales, setSales] = useState<SaleRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSales = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await dbApi.get<SaleRecord[]>('/sales');
            setSales(data);
        } catch (err) {
            setError((err as Error).message);
            console.error("Failed to fetch sales from DB", err);
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    useEffect(() => {
        fetchSales();
    }, [fetchSales]);

    const addSale = useCallback(async (newSaleData: Omit<SaleRecord, 'id'>) => {
        try {
            const newSale: SaleRecord = {
                ...newSaleData,
                id: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            };
            await dbApi.post('/sales', newSale);
            await fetchSales();
        } catch (err) {
             console.error("Failed to add sale:", err);
        }
    }, [fetchSales]);
    
    const deleteSale = useCallback(async (saleId: string) => {
        try {
            await dbApi.delete(`/sales/${saleId}`);
            await fetchSales();
        } catch (err) {
             console.error("Failed to delete sale:", err);
        }
    }, [fetchSales]);

    const clearSales = useCallback(async () => {
        try {
            await dbApi.delete('/sales/all');
            await fetchSales();
        } catch (err) {
            console.error("Failed to clear sales:", err);
        }
    }, [fetchSales]);

    return { sales, addSale, deleteSale, clearSales, isLoading, error };
};