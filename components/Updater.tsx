import React, { useState } from 'react';
import { UpdateIcon, CloudArrowUpIcon, CheckCircleIcon, ExclamationTriangleIcon } from '../constants';
import { Loader } from './Loader';

type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'error';

export const Updater: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [currentVersion] = useState('1.0.0');
  const [latestVersion] = useState('1.1.0');

  const handleCheckForUpdates = () => {
    setStatus('checking');
    // Simulate an API call
    setTimeout(() => {
      // Simulate a random outcome for demonstration
      const randomOutcome = Math.random();
      if (randomOutcome < 0.2) {
        setStatus('error');
      } else if (currentVersion === latestVersion) {
        setStatus('uptodate');
      } else {
        setStatus('available');
      }
    }, 2000);
  };

  const renderStatus = () => {
    switch (status) {
      case 'checking':
        return (
          <div className="flex items-center space-x-3">
            <Loader />
            <span className="text-slate-300">Checking for updates...</span>
          </div>
        );
      case 'uptodate':
        return (
          <div className="flex items-center space-x-3 text-green-400">
            <CheckCircleIcon className="w-8 h-8" />
            <div>
              <p className="font-semibold">You are up to date!</p>
              <p className="text-sm text-slate-400">Panel version {currentVersion} is the latest version.</p>
            </div>
          </div>
        );
      case 'available':
        return (
          <div className="flex items-center space-x-3 text-cyan-400">
            <CloudArrowUpIcon className="w-8 h-8" />
            <div>
              <p className="font-semibold">Update available!</p>
              <p className="text-sm text-slate-400">Version {latestVersion} is ready to be installed.</p>
            </div>
          </div>
        );
       case 'error':
        return (
          <div className="flex items-center space-x-3 text-red-400">
            <ExclamationTriangleIcon className="w-8 h-8" />
            <div>
              <p className="font-semibold">Could not check for updates.</p>
              <p className="text-sm text-slate-400">Please check your internet connection and try again.</p>
            </div>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="flex items-center space-x-3">
             <UpdateIcon className="w-8 h-8 text-slate-500" />
             <div>
                <p className="text-slate-400">Check for the latest version of the panel.</p>
                <p className="text-xs text-slate-500">Current version: {currentVersion}</p>
             </div>
          </div>
        );
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Panel Updater</h2>
        <div className="bg-slate-900/50 p-6 rounded-lg min-h-[100px] flex items-center justify-center">
            {renderStatus()}
        </div>
        <div className="mt-6 flex justify-end space-x-4">
             {status === 'available' && (
                <button
                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    Install Update
                </button>
             )}
            <button
                onClick={handleCheckForUpdates}
                disabled={status === 'checking'}
                className="bg-orange-600 hover:bg-orange-500 disabled:bg-orange-800 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
                {status === 'checking' ? 'Checking...' : 'Check for Updates'}
            </button>
        </div>
      </div>
    </div>
  );
};
