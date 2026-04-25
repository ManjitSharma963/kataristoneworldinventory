import React, { useState, useEffect } from 'react';
import { login } from '../utils/api';
import './Auth.css';

const Login = ({ onLoginSuccess, onSwitchToRegister, initialError = '' }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState(initialError || '');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Update error when initialError prop changes
  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login({
        email: String(formData.email || '').trim(),
        password: String(formData.password || '').trim()
      });

      // Support both shapes:
      // 1) { token, user }
      // 2) { success, data: { token, user } }
      const auth = response?.data && typeof response.data === 'object' ? response.data : response;
      const token = auth?.token;
      const user = auth?.user || {};

      if (token) {
        localStorage.setItem('authToken', token);
        localStorage.setItem('user', JSON.stringify(user));
        onLoginSuccess(user);
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      const fieldErrors = err?.responseBody?.error;
      if (fieldErrors && typeof fieldErrors === 'object') {
        const first = Object.values(fieldErrors).find(Boolean);
        setError(first || err.message || 'Login failed. Please try again.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Log in</h1>
        
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="Email Address"
            className="auth-input"
          />

          <div className="password-input-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Password"
              className="auth-input"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "👁️" : "👁️‍🗨️"}
            </button>
          </div>

          <button type="submit" className="auth-btn-primary" disabled={loading}>
            <span className="btn-icon">🔒</span>
            <span>{loading ? 'Logging in...' : 'Log in'}</span>
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <button type="button" onClick={onSwitchToRegister} className="auth-link">
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

