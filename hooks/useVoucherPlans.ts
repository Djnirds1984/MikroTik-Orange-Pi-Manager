import { useState, useEffect, useCallback } from 'react';
import type { VoucherPlan, VoucherPlanWithId } from '../types.ts';
import { dbApi } from '../services/databaseService.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';

export const useVoucherPlans = (routerId: string | null) => {
    const { currency } = useLocalization();
    const [plans, setPlans] = useState<VoucherPlanWithId[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPlans = useCallback(async () => {
        if (!routerId) {
            setPlans([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            // FIX: Use snake_case for the API endpoint to match the database table name.
            const data = await dbApi.get<VoucherPlanWithId[]>(`/voucher_plans?routerId=${routerId}`);
            setPlans(data);
        } catch (err) {
            setError((err as Error).message);
            console.error("Failed to fetch voucher plans from DB", err);
        } finally {
            setIsLoading(false);
        }
    }, [routerId]);

    useEffect(() => {
        fetchPlans();
    }, [fetchPlans]);

    const addPlan = async (planConfig: Omit<VoucherPlanWithId, 'id'>) => {
        if (!routerId) {
            console.error("Cannot add plan without a selected router.");
            return;
        }
        try {
            const newPlan: VoucherPlanWithId = {
                ...planConfig,
                id: `vplan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                routerId: routerId,
                currency: planConfig.currency || currency,
            };
            // FIX: Use snake_case for the API endpoint to match the database table name.
            await dbApi.post('/voucher_plans', newPlan);
            await fetchPlans();
        } catch (err) {
            console.error("Failed to add voucher plan:", err);
            throw err;
        }
    };

    const updatePlan = async (updatedPlan: VoucherPlanWithId) => {
        try {
            // FIX: Use snake_case for the API endpoint to match the database table name.
            await dbApi.patch(`/voucher_plans/${updatedPlan.id}`, updatedPlan);
            await fetchPlans();
        } catch (err) {
            console.error("Failed to update voucher plan:", err);
            throw err;
        }
    };

    const deletePlan = async (planId: string) => {
        try {
            // FIX: Use snake_case for the API endpoint to match the database table name.
            await dbApi.delete(`/voucher_plans/${planId}`);
            await fetchPlans();
        } catch (err) {
            console.error("Failed to delete voucher plan:", err);
        }
    };

    return { plans, addPlan, updatePlan, deletePlan, isLoading, error };
};