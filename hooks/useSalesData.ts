import { useState, useEffect, useCallback } from 'react';
import type { SaleRecord } from '../types.ts';

const STORAGE_KEY = 'mikrotikSalesReport';

export const useSalesData = () => {
    const [sales, setSales] = useState<SaleRecord[]>([]);

    useEffect(() => {
        try {
            const storedSales = localStorage.getItem(STORAGE_KEY);
            if (storedSales) {
                setSales(JSON.parse(storedSales));
            }
        } catch (error) {
            console.error("Failed to parse sales from localStorage", error);
            setSales([]);
        }
    }, []);

    const saveSales = useCallback((updatedSales: SaleRecord[]) => {
        // Sort by date descending before saving
        const sortedSales = updatedSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setSales(sortedSales);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sortedSales));
    }, []);

    const addSale = (newSaleData: Omit<SaleRecord, 'id'>) => {
        const newSale: SaleRecord = {
            ...newSaleData,
            id: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        };
        saveSales([newSale, ...sales]);
    };
    
    const deleteSale = (saleId: string) => {
        const updatedSales = sales.filter(sale => sale.id !== saleId);
        saveSales(updatedSales);
    };

    const clearSales = () => {
        saveSales([]);
    };

    return { sales, addSale, deleteSale, clearSales };
};
