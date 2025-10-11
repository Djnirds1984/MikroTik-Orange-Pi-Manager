import React from 'react';
import { RouterConfigWithId } from '../types';

interface ViewProps {
  selectedRouter: RouterConfigWithId | null;
}

const ViewPlaceholder: React.FC<{ name: string; requiresRouter?: boolean; selectedRouter: RouterConfigWithId | null }> = ({ name, requiresRouter = true, selectedRouter }) => {
  if (requiresRouter && !selectedRouter) {
    return (
      <div className="rounded-md border-l-4 border-yellow-500 bg-yellow-100 p-4 text-yellow-700 dark:border-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300">
        <p className="font-bold">Please select a router</p>
        <p>This feature requires an active router to be selected from the top bar.</p>
      </div>
    );
  }

  return (
    <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{name}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          This is the {name} component. Content will be added here.
        </p>
    </div>
  );
};

export const Pppoe: React.FC<ViewProps> = ({ selectedRouter }) => <ViewPlaceholder name="PPPoE" requiresRouter={true} selectedRouter={selectedRouter} />;
export const Users: React.FC<ViewProps> = ({ selectedRouter }) => <ViewPlaceholder name="PPPoE Users" requiresRouter={true} selectedRouter={selectedRouter} />;

export default Pppoe;
