import React from 'react';
import { RouterConfigWithId } from '../types';

const ViewPlaceholder: React.FC<{ name: string; requiresRouter?: boolean; selectedRouter: RouterConfigWithId | null }> = ({ name }) => {
  return (
    <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{name}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          This is the {name} component. Content will be added here.
        </p>
    </div>
  );
};

export const Company: React.FC = () => <ViewPlaceholder name="Company" requiresRouter={false} selectedRouter={null} />;

export default Company;
