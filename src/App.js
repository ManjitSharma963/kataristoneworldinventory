import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('dashboard');

  return (
    <div className="App">
      <div className="app-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <div className="profile-picture">
              <img src="https://via.placeholder.com/60" alt="Profile" />
            </div>
          </div>
          <nav className="sidebar-nav">
            <button 
              className={`nav-item ${activeNav === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveNav('dashboard')}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-label">Dashboard</span>
            </button>
            <button 
              className={`nav-item ${activeNav === 'sales' ? 'active' : ''}`}
              onClick={() => setActiveNav('sales')}
            >
              <span className="nav-icon">💰</span>
              <span className="nav-label">Sales</span>
            </button>
            <button 
              className={`nav-item ${activeNav === 'inventory' ? 'active' : ''}`}
              onClick={() => setActiveNav('inventory')}
            >
              <span className="nav-icon">📦</span>
              <span className="nav-label">Inventory</span>
            </button>
            <button 
              className={`nav-item ${activeNav === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveNav('expenses')}
            >
              <span className="nav-icon">💵</span>
              <span className="nav-label">Expenses</span>
            </button>
          </nav>
          <div className="sidebar-footer">
            <button className="visit-site-btn">
              <span>Visit site</span>
              <span className="arrow">→</span>
            </button>
          </div>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '←' : '→'}
          </button>
        </aside>

        {/* Main Content Area */}
        <div className="main-content">
          {/* Mobile Menu Overlay */}
          {mobileMenuOpen && (
            <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
              <aside className={`sidebar mobile ${mobileMenuOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="sidebar-header">
                  <div className="profile-picture">
                    <img src="https://via.placeholder.com/60" alt="Profile" />
                  </div>
                  <button className="mobile-close-btn" onClick={() => setMobileMenuOpen(false)}>×</button>
                </div>
                <nav className="sidebar-nav">
                  <button 
                    className={`nav-item ${activeNav === 'dashboard' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveNav('dashboard');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="nav-icon">📊</span>
                    <span className="nav-label">Dashboard</span>
                  </button>
                  <button 
                    className={`nav-item ${activeNav === 'sales' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveNav('sales');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="nav-icon">💰</span>
                    <span className="nav-label">Sales</span>
                  </button>
                  <button 
                    className={`nav-item ${activeNav === 'inventory' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveNav('inventory');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="nav-icon">📦</span>
                    <span className="nav-label">Inventory</span>
                  </button>
                  <button 
                    className={`nav-item ${activeNav === 'expenses' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveNav('expenses');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="nav-icon">💵</span>
                    <span className="nav-label">Expenses</span>
                  </button>
                </nav>
                <div className="sidebar-footer">
                  <button className="visit-site-btn">
                    <span>Visit site</span>
                    <span className="arrow">→</span>
                  </button>
                </div>
              </aside>
            </div>
          )}

          {/* Dashboard Content */}
          <main className="dashboard-main">
            <Dashboard activeNav={activeNav} setActiveNav={setActiveNav} />
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
