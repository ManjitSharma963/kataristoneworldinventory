import React, { useState, useEffect } from 'react';
import CustomSelect from './CustomSelect';
import { API_BASE_URL } from '../config/api';
import './Auth.css';

const Register = ({ onRegisterSuccess, onSwitchToLogin, initialError = '' }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    location: ''
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

  const locations = ['Bhondsi', 'Tapugada'];

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
      // Call backend directly at http://localhost:8080 (no proxy)
      // Role defaults to 'user' on backend if not provided
      // Only admins should be able to create admin accounts (handled by backend)
      const requestBody = {
        ...formData
        // role will default to 'user' on backend
      };
      
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || 'Registration failed' };
        }
        throw new Error(errorData.message || `Registration failed: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.token) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user || {}));
        onRegisterSuccess(data.user);
      } else {
        setError('Registration failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Sign up</h1>
        
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="Name"
            className="auth-input"
          />

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
              minLength={6}
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

          <CustomSelect
            name="location"
            value={formData.location}
            onChange={handleChange}
            placeholder="Select Location"
            required
            options={locations.map(loc => ({ value: loc, label: loc }))}
          />

          <button type="submit" className="auth-btn-primary" disabled={loading}>
            <span className="btn-icon">🔒</span>
            <span>{loading ? 'Registering...' : 'Sign up'}</span>
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <button type="button" onClick={onSwitchToLogin} className="auth-link">
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;

