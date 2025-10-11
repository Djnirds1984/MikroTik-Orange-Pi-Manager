import React from 'react';
import { RouterConfigWithId } from '../types';

interface ViewProps {
  selectedRouter: RouterConfigWithId | null;
}

const ViewPlaceholder: React.FC<{ name: string; requiresRouter?: boolean; selectedRouter: RouterConfigWithId | null }> = ({ name, requiresRouter = true, selectedRouter }) => {
  // Sales can be viewed for 'all' routers, so we don't strictly require one to be selected.
  return (
    <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{name}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          This is the {name} component. Content will be added here.
        </p>
    </div>
  );
};

export const SalesReport: React.FC<ViewProps> = ({ selectedRouter }) => <ViewPlaceholder name="Sales Report" requiresRouter={false} selectedRouter={selectedRouter} />;

export default SalesReport;
