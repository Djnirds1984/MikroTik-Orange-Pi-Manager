import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { ExpenseRecord } from '../types';

export const useExpensesData = () => {
    const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchExpenses = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data } = await api.get('/system/expenses');
            setExpenses(data);
        } catch (error) {
            console.error("Failed to fetch expenses", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    return { expenses, isLoading, refreshExpenses: fetchExpenses };
};
