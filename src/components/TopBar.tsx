import React, { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { RouterConfigWithId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { CogIcon, PowerIcon, RouterIcon } from '../constants';

interface TopBarProps {
  routers: RouterConfigWithId[];
  selectedRouter: RouterConfigWithId | null;
  onSelectRouter: (router: RouterConfigWithId | null) => void;
  routersLoading: boolean;
  toggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  routers,
  selectedRouter,
  onSelectRouter,
  routersLoading,
  toggleSidebar,
}) => {
  const { user, logout } = useAuth();

  return (
    <header className="z-30 flex h-16 items-center justify-between bg-white px-4 shadow-md dark:bg-slate-800">
        <div className="flex items-center">
            <button onClick={toggleSidebar} className="rounded-full p-2 hover:bg-slate-200 dark:hover:bg-slate-700">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
            </button>
        </div>

      <div className="flex items-center space-x-4">
        <div className="relative">
          <Menu as="div" className="relative inline-block text-left">
            <div>
              <Menu.Button className="inline-flex w-full justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">
                <RouterIcon className="mr-2 h-5 w-5" />
                {routersLoading ? 'Loading...' : selectedRouter ? selectedRouter.name : 'Select a router'}
                <svg className="-mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </Menu.Button>
            </div>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right divide-y divide-slate-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:divide-slate-600 dark:bg-slate-700">
                <div className="px-1 py-1 ">
                  {routers.map((router) => (
                    <Menu.Item key={router.id}>
                      {({ active }) => (
                        <button
                          onClick={() => onSelectRouter(router)}
                          className={`${
                            active || selectedRouter?.id === router.id ? 'bg-slate-100 dark:bg-slate-600' : ''
                          } group flex w-full items-center rounded-md px-2 py-2 text-sm text-slate-900 dark:text-slate-100`}
                        >
                          {router.name}
                        </button>
                      )}
                    </Menu.Item>
                  ))}
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>

        <div className="relative">
           <Menu as="div" className="relative inline-block text-left">
            <div>
              <Menu.Button className="flex items-center space-x-2 rounded-full p-2 hover:bg-slate-200 dark:hover:bg-slate-700">
                <span className="font-medium">{user?.username}</span>
                <CogIcon className="h-5 w-5"/>
              </Menu.Button>
            </div>
             <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right divide-y divide-slate-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:divide-slate-600 dark:bg-slate-700">
                 <div className="px-1 py-1 ">
                    <Menu.Item>
                       {({ active }) => (
                        <button
                          onClick={logout}
                          className={`${
                            active ? 'bg-slate-100 dark:bg-slate-600' : ''
                          } group flex w-full items-center rounded-md px-2 py-2 text-sm text-slate-900 dark:text-slate-100`}
                        >
                          <PowerIcon className="mr-2 h-5 w-5" />
                          Logout
                        </button>
                      )}
                    </Menu.Item>
                 </div>
              </Menu.Items>
             </Transition>
          </Menu>
        </div>
      </div>
    </header>
  );
};
