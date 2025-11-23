import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import Reports from './components/Reports';
import Sales from './components/Sales';
import Login from './components/Login';
import Register from './components/Register';
import { isAuthenticated, getCurrentUser, logout, setSessionExpiryHandler } from './utils/api';
import './App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [authenticated, setAuthenticated] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState('');

  // Check for stored error message on mount
  useEffect(() => {
    const storedError = localStorage.getItem('authError');
    if (storedError) {
      setAuthError(storedError);
    }
  }, []);

  // Handle automatic logout on session expiry
  useEffect(() => {
    // Set up session expiry handler
    const handleSessionExpiry = () => {
      setAuthenticated(false);
      setUser(null);
      setActiveNav('dashboard');
      setShowRegister(false);
      setAuthError('Session expired. Please login again.');
      localStorage.setItem('authError', 'Session expired. Please login again.');
    };

    setSessionExpiryHandler(handleSessionExpiry);

    // Also listen for session expired event (fallback)
    const handleSessionExpiredEvent = () => {
      handleSessionExpiry();
    };

    window.addEventListener('sessionExpired', handleSessionExpiredEvent);

    return () => {
      window.removeEventListener('sessionExpired', handleSessionExpiredEvent);
      setSessionExpiryHandler(null);
    };
  }, []);

  useEffect(() => {
    // Check if user is already authenticated on app load
    const checkAuthentication = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const userData = getCurrentUser();
        
        // Only set authenticated if we have both token and user data AND user is admin
        if (token && userData) {
          // Check if user has admin role
          const userRole = userData.role || userData.userRole || '';
          if (userRole.toLowerCase() === 'admin') {
            setAuthenticated(true);
            setUser(userData);
          } else {
            // User is not admin - clear auth and show login with error
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            setAuthenticated(false);
            setUser(null);
            // Set error message to show on login page
            localStorage.setItem('authError', 'Admin can access this app');
          }
        } else {
          // Clear any invalid/stale data
          if (token) {
            localStorage.removeItem('authToken');
          }
          if (userData) {
            localStorage.removeItem('user');
          }
          setAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        // On error, clear auth and show login
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        setAuthenticated(false);
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuthentication();
  }, []);

  const handleLoginSuccess = (userData) => {
    // Check if user is admin
    const userRole = userData.role || userData.userRole || '';
    if (userRole.toLowerCase() === 'admin') {
      setAuthenticated(true);
      setUser(userData);
      setShowRegister(false);
      setAuthError('');
      localStorage.removeItem('authError');
    } else {
      // User is not admin - show error and stay on login
      setAuthenticated(false);
      setUser(null);
      setAuthError('Admin can access this app');
      localStorage.setItem('authError', 'Admin can access this app');
      // Clear auth data
      logout();
    }
  };

  const handleRegisterSuccess = (userData) => {
    // Check if user is admin
    const userRole = userData.role || userData.userRole || '';
    if (userRole.toLowerCase() === 'admin') {
      setAuthenticated(true);
      setUser(userData);
      setShowRegister(false);
      setAuthError('');
      localStorage.removeItem('authError');
    } else {
      // User is not admin - show error and stay on register
      setAuthenticated(false);
      setUser(null);
      setAuthError('Admin can access this app');
      localStorage.setItem('authError', 'Admin can access this app');
      // Clear auth data
      logout();
    }
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    setUser(null);
    setActiveNav('dashboard');
    // Ensure we go back to login screen after logout
    setShowRegister(false);
  };

  // Show loading state while checking authentication
  if (checkingAuth) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  // Show login/register if not authenticated
  // This ensures login is ALWAYS the first screen if user is not authenticated
  if (!authenticated) {
    return showRegister ? (
      <Register 
        onRegisterSuccess={handleRegisterSuccess}
        onSwitchToLogin={() => {
          setShowRegister(false);
          setAuthError('');
          localStorage.removeItem('authError');
        }}
        initialError={authError}
      />
    ) : (
      <Login 
        onLoginSuccess={handleLoginSuccess}
        onSwitchToRegister={() => {
          setShowRegister(true);
          setAuthError('');
          localStorage.removeItem('authError');
        }}
        initialError={authError}
      />
    );
  }

  // Double-check user is admin before rendering dashboard
  // This is a safety check in case user data changes
  const userRole = user?.role || user?.userRole || '';
  if (authenticated && userRole.toLowerCase() !== 'admin') {
    // User somehow got authenticated but is not admin - redirect to login
    logout();
    setAuthenticated(false);
    setUser(null);
    setAuthError('Admin can access this app');
    localStorage.setItem('authError', 'Admin can access this app');
    return showRegister ? (
      <Register 
        onRegisterSuccess={handleRegisterSuccess}
        onSwitchToLogin={() => {
          setShowRegister(false);
          setAuthError('');
          localStorage.removeItem('authError');
        }}
        initialError={authError}
      />
    ) : (
      <Login 
        onLoginSuccess={handleLoginSuccess}
        onSwitchToRegister={() => {
          setShowRegister(true);
          setAuthError('');
          localStorage.removeItem('authError');
        }}
        initialError={authError}
      />
    );
  }

  return (
    <div className="App">
      <div className="app-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <div className="profile-picture">
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23ddd'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='24'%3E👤%3C/text%3E%3C/svg%3E" alt="Profile" />
            </div>
            {user && (
              <div className="user-info">
                <div className="user-name">{user.name || 'User'}</div>
                <div className="user-location">{user.location || ''}</div>
              </div>
            )}
            <button className="logout-btn" onClick={handleLogout} title="Logout">
              🚪
            </button>
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
            <button
              className={`nav-item ${activeNav === 'home-screen' ? 'active' : ''}`}
              onClick={() => setActiveNav('home-screen')}
            >
              <span className="nav-icon">🏠</span>
              <span className="nav-label">Management</span>
            </button>
            <button 
              className={`nav-item ${activeNav === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveNav('customers')}
            >
              <span className="nav-icon">👥</span>
              <span className="nav-label">Customers</span>
            </button>
            <button 
              className={`nav-item ${activeNav === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveNav('reports')}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-label">Reports</span>
            </button>
          </nav>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '←' : '→'}
          </button>
        </aside>

        {/* Main Content Area */}
        <div className="main-content">
          {/* Mobile Menu Button - Floating */}
          <button 
            className="mobile-menu-btn floating-menu-btn" 
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          {/* Mobile Menu Overlay */}
          {mobileMenuOpen && (
            <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
              <aside className={`sidebar mobile ${mobileMenuOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="sidebar-header">
                  <div className="profile-picture">
                    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23ddd'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='24'%3E👤%3C/text%3E%3C/svg%3E" alt="Profile" />
                  </div>
                  {user && (
                    <div className="user-info">
                      <div className="user-name">{user.name || 'User'}</div>
                      <div className="user-location">{user.location || ''}</div>
                    </div>
                  )}
                  <button className="logout-btn" onClick={handleLogout} title="Logout">
                    🚪
                  </button>
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
                  <button 
                    className={`nav-item ${activeNav === 'home-screen' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveNav('home-screen');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="nav-icon">🏠</span>
                    <span className="nav-label">Home Screen</span>
                  </button>
                  <button 
                    className={`nav-item ${activeNav === 'customers' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveNav('customers');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="nav-icon">👥</span>
                    <span className="nav-label">Customers</span>
                  </button>
                  <button 
                    className={`nav-item ${activeNav === 'reports' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveNav('reports');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="nav-icon">📊</span>
                    <span className="nav-label">Reports</span>
                  </button>
                </nav>
              </aside>
            </div>
          )}

          {/* Dashboard Content */}
          <main className="dashboard-main">
            {activeNav === 'customers' ? (
              <Customers />
            ) : activeNav === 'reports' ? (
              <Reports />
            ) : activeNav === 'sales' ? (
              <Sales />
            ) : (
              <Dashboard activeNav={activeNav} setActiveNav={setActiveNav} />
            )}
          </main>
        </div>

        {/* Bottom Navigation Bar - Mobile Only */}
        <nav className="bottom-nav">
          <button 
            className={`bottom-nav-item ${activeNav === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveNav('dashboard')}
          >
            <span className="bottom-nav-icon">📊</span>
            <span className="bottom-nav-label">Dashboard</span>
          </button>
          <button 
            className={`bottom-nav-item ${activeNav === 'sales' ? 'active' : ''}`}
            onClick={() => setActiveNav('sales')}
          >
            <span className="bottom-nav-icon">💰</span>
            <span className="bottom-nav-label">Sales</span>
          </button>
          <button 
            className={`bottom-nav-item ${activeNav === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveNav('inventory')}
          >
            <span className="bottom-nav-icon">📦</span>
            <span className="bottom-nav-label">Inventory</span>
          </button>
          <button 
            className={`bottom-nav-item ${activeNav === 'expenses' ? 'active' : ''}`}
            onClick={() => setActiveNav('expenses')}
          >
            <span className="bottom-nav-icon">💵</span>
            <span className="bottom-nav-label">Expenses</span>
          </button>
          <button 
            className={`bottom-nav-item ${activeNav === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveNav('customers')}
          >
            <span className="bottom-nav-icon">👥</span>
            <span className="bottom-nav-label">Customers</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

export default App;
