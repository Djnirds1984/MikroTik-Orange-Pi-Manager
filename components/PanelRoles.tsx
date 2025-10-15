import React from 'react';
import { LockClosedIcon, UsersIcon } from '../constants';

export const PanelRoles: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-3">
                <LockClosedIcon className="w-8 h-8" />
                Panel User Roles
            </h2>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md p-6 text-center">
                 <UsersIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4 mx-auto" />
                 <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Feature Under Construction</h3>
                 <p className="mt-2 text-slate-500 dark:text-slate-400">
                    This section will allow you to manage user accounts and permissions for accessing this web panel.
                 </p>
            </div>
        </div>
    );
};
