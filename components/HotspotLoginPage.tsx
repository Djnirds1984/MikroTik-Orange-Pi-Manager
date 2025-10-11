import React, { useState, useEffect, useMemo } from 'react';
import type { VoucherPlanWithId, CompanySettings } from '../types.ts';

const WifiIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.136 11.886c3.87-3.87 10.154-3.87 14.024 0M12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
    </svg>
);

const Loader: React.FC = () => (
    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export const HotspotLoginPage: React.FC = () => {
    const [plans, setPlans] = useState<VoucherPlanWithId[]>([]);
    const [companySettings, setCompanySettings] = useState<CompanySettings>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [voucherCode, setVoucherCode] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    
    const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);
    const linkLoginOnly = queryParams.get('link-login-only');
    const routerId = queryParams.get('router_id');

    useEffect(() => {
        const fetchData = async () => {
            if (!routerId) {
                setError("Configuration Error: Router ID is missing from the URL.");
                setIsLoading(false);
                return;
            }
            try {
                const [plansRes, companyRes] = await Promise.all([
                    fetch(`/api/public/voucher-plans/${routerId}`),
                    fetch(`/api/public/company-settings`)
                ]);

                if (!plansRes.ok) throw new Error(`Could not load voucher plans. Please check router configuration.`);
                if (!companyRes.ok) throw new Error(`Could not load company settings.`);

                const plansData = await plansRes.json();
                const companyData = await companyRes.json();
                
                setPlans(plansData);
                setCompanySettings(companyData);
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [routerId]);

    const formatCurrency = (amount: number, currencyCode: string = 'USD') => {
        const lang = currencyCode === 'PHP' ? 'en-PH' : 'en-US';
        return new Intl.NumberFormat(lang, { style: 'currency', currency: currencyCode }).format(amount);
    };

    const handlePlanClick = (plan: VoucherPlanWithId) => {
        alert(`This is a ${plan.name}. Please purchase and enter the voucher code to connect.`);
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!voucherCode.trim()) {
            alert("Please enter a voucher code.");
            return;
        }
        setIsLoggingIn(true);
        // The form submission will handle the rest
    };
    
    if (isLoading) {
        return <div className="flex h-screen items-center justify-center"><p className="text-slate-500">Loading Portal...</p></div>;
    }
    
    if (error) {
         return <div className="flex h-screen items-center justify-center p-4"><div className="p-4 bg-red-100 text-red-700 rounded-md text-center">{error}</div></div>;
    }
    
    if (!linkLoginOnly) {
         return <div className="flex h-screen items-center justify-center p-4"><div className="p-4 bg-yellow-100 text-yellow-800 rounded-md text-center">Connection parameter `link-login-only` not found. Please connect through the Hotspot.</div></div>;
    }

    return (
        <div className="min-h-screen font-sans antialiased text-slate-800 dark:text-slate-200">
            <main className="max-w-md mx-auto p-4">
                <header className="text-center my-8">
                    {companySettings.logoBase64 ? (
                        <img src={companySettings.logoBase64} alt="Company Logo" className="h-16 w-auto mx-auto object-contain" />
                    ) : (
                        <WifiIcon className="w-16 h-16 mx-auto text-[--color-primary-500]" />
                    )}
                    <h1 className="text-3xl font-bold mt-4">{companySettings.companyName || 'WiFi Hotspot'}</h1>
                    <p className="text-slate-500 dark:text-slate-400">Welcome! Please enter your voucher code to connect.</p>
                </header>

                <form action={linkLoginOnly} method="post" onSubmit={handleLogin}>
                    <input type="hidden" name="username" value={voucherCode} />
                    <input type="hidden" name="password" value={voucherCode} />
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="voucherCode" className="sr-only">Voucher Code</label>
                            <input
                                id="voucherCode"
                                name="dst"
                                type="text"
                                value={voucherCode}
                                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                                placeholder="ENTER VOUCHER CODE"
                                required
                                className="w-full text-center text-lg font-mono tracking-widest p-4 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[--color-primary-500] focus:border-[--color-primary-500]"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoggingIn}
                            className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-lg shadow-sm text-lg font-medium text-white bg-[--color-primary-600] hover:bg-[--color-primary-500] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--color-primary-500] disabled:opacity-50"
                        >
                            {isLoggingIn ? <Loader /> : 'Connect'}
                        </button>
                    </div>
                </form>

                {plans.length > 0 && (
                    <section className="mt-12">
                        <h2 className="text-center font-semibold text-slate-600 dark:text-slate-300 mb-4">Available Plans</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {plans.map(plan => (
                                <button key={plan.id} onClick={() => handlePlanClick(plan)} className="p-3 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                    <p className="font-bold text-[--color-primary-500]">{plan.name}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{plan.duration_minutes} minutes</p>
                                    <p className="text-lg font-bold mt-1">{formatCurrency(plan.price, plan.currency)}</p>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
};
