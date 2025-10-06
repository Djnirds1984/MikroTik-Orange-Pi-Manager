import React, { useState, useEffect } from 'react';
import type { Customer, BillingPlanWithId, SaleRecord, CompanySettings } from '../types.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { PrintableReceipt } from './PrintableReceipt.tsx';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
    plans: BillingPlanWithId[];
    onSave: (sale: Omit<SaleRecord, 'id' | 'date' | 'routerName'>) => void;
    companySettings: CompanySettings;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, customer, plans, onSave, companySettings }) => {
    const { t, formatCurrency } = useLocalization();
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [discountDays, setDiscountDays] = useState('0');
    const [receiptData, setReceiptData] = useState<SaleRecord | null>(null);

    useEffect(() => {
        if (isOpen && plans.length > 0) {
            setSelectedPlanId(plans[0].id);
            setDiscountDays('0');
            setReceiptData(null);
        }
    }, [isOpen, plans]);

    useEffect(() => {
        if (receiptData) {
            const timer = setTimeout(() => window.print(), 100);
            return () => clearTimeout(timer);
        }
    }, [receiptData]);

    useEffect(() => {
        const handleAfterPrint = () => {
            if (receiptData) {
                setReceiptData(null);
                onClose();
            }
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, [receiptData, onClose]);

    if (!isOpen || !customer) return null;

    const selectedPlan = plans.find(p => p.id === selectedPlanId);
    const planPrice = selectedPlan?.price || 0;
    
    let daysInCycle = 30; // Default to Monthly
    if (selectedPlan?.cycle === 'Yearly') {
        daysInCycle = 365;
    } else if (selectedPlan?.cycle === 'Quarterly') {
        daysInCycle = 90;
    }
    
    const pricePerDay = daysInCycle > 0 ? planPrice / daysInCycle : 0;
    const discountDaysValue = parseInt(discountDays, 10) || 0;
    const discountAmount = pricePerDay * discountDaysValue;
    const finalAmount = Math.max(0, planPrice - discountAmount);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPlan) {
            alert(t('payment.select_plan_alert'));
            return;
        }

        const saleData = {
            clientName: customer.fullName || customer.username,
            planName: selectedPlan.name,
            planPrice: selectedPlan.price,
            discountAmount: discountAmount,
            finalAmount: finalAmount,
            currency: selectedPlan.currency,
            clientAddress: customer.address,
            clientContact: customer.contactNumber,
            clientEmail: customer.email,
        };
        
        onSave(saleData);

        // Prepare for printing
        const fullSaleRecord: SaleRecord = {
            ...saleData,
            id: `temp_${Date.now()}`,
            date: new Date().toISOString(),
            routerName: '', // not needed for receipt
        };
        setReceiptData(fullSaleRecord);
    };

    return (
        <>
            <div className={receiptData ? 'printable-area' : 'hidden'}>
                <PrintableReceipt sale={receiptData} companySettings={companySettings} />
            </div>
            <div className={`fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 ${receiptData ? 'hidden' : ''}`}>
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-700">
                    <form onSubmit={handleSubmit}>
                        <div className="p-6">
                            {/* FIX: The t() function does not support a default value string as a second argument. */}
                            <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-1">{t('payment.new_payment_title')}</h3>
                            {/* FIX: The t() function was called with three arguments (key, default value, replacements). It only supports two (key, replacements). */}
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('payment.for_customer', { name: customer.fullName || customer.username })}</p>

                            <div className="space-y-4">
                                <div>
                                    {/* FIX: The t() function does not support a default value string as a second argument. */}
                                    <label htmlFor="plan" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('payment.billing_plan')}</label>
                                    <select id="plan" value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                        {plans.map(plan => (
                                            <option key={plan.id} value={plan.id}>
                                                {plan.name} ({formatCurrency(plan.price)})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="discountDays" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Discount for Downtime (Days)</label>
                                    <input type="number" id="discountDays" value={discountDays} onChange={(e) => setDiscountDays(e.target.value)} min="0" step="1" className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                                </div>
                                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                                        {/* FIX: The t() function does not support a default value string as a second argument. */}
                                        <span>{t('payment.subtotal')}</span>
                                        <span>{formatCurrency(planPrice)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                                        {/* FIX: The t() function does not support a default value string as a second argument. */}
                                        <span>{t('payment.discount')}</span>
                                        <span>- {formatCurrency(discountAmount)}</span>
                                    </div>
                                    <div className="flex justify-between text-lg font-bold text-slate-900 dark:text-white mt-2">
                                        {/* FIX: The t() function does not support a default value string as a second argument. */}
                                        <span>{t('payment.total')}</span>
                                        <span>{formatCurrency(finalAmount)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600">{t('common.cancel')}</button>
                            {/* FIX: The t() function does not support a default value string as a second argument. */}
                            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500]">{t('payment.process_payment_print')}</button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};