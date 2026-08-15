import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const MainLayout: React.FC = () => {
  return (
    <div className="zine-app-shell">
      <Sidebar />
      <main className="zine-main">
        <Outlet />
      </main>
    </div>
  );
};
