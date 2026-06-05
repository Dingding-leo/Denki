import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const MainLayout: React.FC = () => {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', background: '#000000' }}>
      
      {/* Background Glowing meshes */}
      <div className="bg-glow-container">
        <div className="bg-glow-1" />
        <div className="bg-glow-2" />
        <div className="bg-glow-3" />
        <div className="bg-glow-4" />
      </div>

      <Sidebar />

      {/* MAIN SCREEN WORKSPACE */}
      <main style={{
        flex: 1,
        padding: '40px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}>
        <Outlet />
      </main>

    </div>
  );
};
