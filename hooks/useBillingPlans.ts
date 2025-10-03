
import { useState, useEffect, useCallback } from 'react';
import type { BillingPlan, BillingPlanWithId } from '../types.ts';

const STORAGE_KEY = 'mikrotikBillingPlans';

const initialPlans: BillingPlan[] = [
    { name: 'Basic 5Mbps', price: 10, currency: 'USD', cycle: 'Monthly', pppoeProfile: 'profile-5m', description: 'Good for basic browsing and email.' },
    { name: 'Standard 25Mbps', price: 25, currency: 'USD', cycle: 'Monthly', pppoeProfile: 'profile-25m', description: 'Ideal for streaming HD video on one device.' },
    { name: 'Premium 100Mbps', price: 50, currency: 'USD', cycle: 'Monthly', pppoeProfile: 'profile-100m', description: 'Perfect for families and multiple 4K streams.' },
];

export const useBillingPlans = () => {
    const [plans, setPlans] = useState<BillingPlanWithId[]>([]);

    useEffect(() => {
        try {
            const storedPlans = localStorage.getItem(STORAGE_KEY);
            if (storedPlans) {
                setPlans(JSON.parse(storedPlans));
            } else {
                // Pre-populate with initial data if nothing is in storage
                const plansWithIds = initialPlans.map((plan, index) => ({
                    ...plan,
                    id: `plan_${Date.now()}_${index}`,
                }));
                setPlans(plansWithIds);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(plansWithIds));
            }
        } catch (error) {
            console.error("Failed to parse plans from localStorage", error);
            setPlans([]);
        }
    }, []);

    const savePlans = useCallback((updatedPlans: BillingPlanWithId[]) => {
        setPlans(updatedPlans);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPlans));
    }, []);

    const addPlan = (planConfig: BillingPlan) => {
        const newPlan: BillingPlanWithId = {
            ...planConfig,
            id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        };
        savePlans([...plans, newPlan]);
    };

    const updatePlan = (updatedPlan: BillingPlanWithId) => {
        const updatedPlans = plans.map(plan =>
            plan.id === updatedPlan.id ? updatedPlan : plan
        );
        savePlans(updatedPlans);
    };

    const deletePlan = (planId: string) => {
        const updatedPlans = plans.filter(plan => plan.id !== planId);
        savePlans(updatedPlans);
    };

    return { plans, addPlan, updatePlan, deletePlan };
};