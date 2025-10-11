import React from 'react';
import { CogIcon } from '../constants';

interface LoaderProps {
  fullScreen?: boolean;
  text?: string;
}

export const Loader: React.FC<LoaderProps> = ({ fullScreen = false, text = 'Loading...' }) => {
  const loaderContent = (
    <div className="flex flex-col items-center justify-center space-y-2">
      <CogIcon className="h-10 w-10 animate-spin text-blue-500" />
      <span className="text-slate-600 dark:text-slate-300">{text}</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100/80 dark:bg-slate-900/80">
        {loaderContent}
      </div>
    );
  }

  return (
    <div className="py-10">
      {loaderContent}
    </div>
  );
};
