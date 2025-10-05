import { useState, useEffect, useCallback } from 'react';
import type { BillingPlan, BillingPlanWithId } from '../types.ts';
import { dbApi } from '../services/databaseService.ts';

export const useBillingPlans = () => {
    const [plans, setPlans] = useState<BillingPlanWithId[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPlans = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await dbApi.get<BillingPlanWithId[]>('/billing-plans');
            setPlans(data);
        } catch (err) {
            setError((err as Error).message);
            console.error("Failed to fetch billing plans from DB", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPlans();
    }, [fetchPlans]);

    const addPlan = async (planConfig: BillingPlan) => {
        try {
            const newPlan: BillingPlanWithId = {
                ...planConfig,
                id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            };
            await dbApi.post('/billing-plans', newPlan);
            await fetchPlans();
        } catch (err) {
            console.error("Failed to add billing plan:", err);
        }
    };

    const updatePlan = async (updatedPlan: BillingPlanWithId) => {
        try {
            await dbApi.patch(`/billing-plans/${updatedPlan.id}`, updatedPlan);
            await fetchPlans();
        } catch (err) {
            console.error("Failed to update billing plan:", err);
        }
    };

    const deletePlan = async (planId: string) => {
        try {
            await dbApi.delete(`/billing-plans/${planId}`);
            await fetchPlans();
        } catch (err) {
            console.error("Failed to delete billing plan:", err);
        }
    };

    return { plans, addPlan, updatePlan, deletePlan, isLoading, error };
};