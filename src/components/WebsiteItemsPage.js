import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { handleApiResponse } from '../utils/api';
import './Dashboard.css';
import './WebsiteItemsPage.css';

const WebsiteItemsPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    primaryImageUrl: '',
    isActive: true
  });

  const fetchWebsiteProducts = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/website-products`, { method: 'GET', headers });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setItems(Array.isArray(data) ? data : []);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error('Error fetching website products:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebsiteProducts();
  }, [fetchWebsiteProducts]);

  const generateSlug = (name) => {
    return (name || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'name') next.slug = generateSlug(value);
      return next;
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      primaryImageUrl: '',
      isActive: true
    });
    setShowAddModal(false);
  };

  const handleDelete = async (item) => {
    const id = item.id;
    if (id == null) {
      alert('Cannot delete: item has no id.');
      return;
    }
    const name = item.name || 'this item';
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const token = localStorage.getItem('authToken');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/website-products/${id}`, {
        method: 'DELETE',
        headers
      });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        let msg = 'Failed to delete website item';
        try {
          const j = JSON.parse(text);
          msg = j.message || j.error || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      await fetchWebsiteProducts();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to delete website item');
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const { name, slug, description, primaryImageUrl, isActive } = formData;
    if (!name || !slug.trim()) {
      alert('Name and slug are required.');
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('authToken');
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const body = JSON.stringify({
        name: name.trim(),
        slug: slug.trim(),
        description: (description || '').trim(),
        primaryImageUrl: (primaryImageUrl || '').trim() || undefined,
        isActive: !!isActive
      });
      const response = await fetch(`${API_BASE_URL}/website-products`, {
        method: 'POST',
        headers,
        body
      });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        let msg = 'Failed to add website item';
        try {
          const j = JSON.parse(text);
          msg = j.message || j.error || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      resetForm();
      await fetchWebsiteProducts();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to add website item');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="dashboard-section website-items-section" style={{ padding: '24px' }}>
        <p>Loading website items...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-section website-items-section">
      <div className="section-header-enhanced">
        <div className="section-title-wrapper">
          <span className="section-icon">🌐</span>
          <h3>Website items</h3>
          <span className="sales-count">({items.length})</span>
        </div>
        <div className="section-header-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add website items
          </button>
        </div>
      </div>

      <div className="section-content">
        {items.length === 0 ? (
          <div className="empty-state-wrapper">
            <span className="empty-icon">🌐</span>
            <p className="empty-state">No website items yet</p>
            <p className="empty-subtitle">Click &quot;Add website items&quot; to add your first item.</p>
            <button type="button" className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              + Add website items
            </button>
          </div>
        ) : (
          <div className="sales-table-wrapper">
            <table className="data-table inventory-table website-items-table">
              <thead>
                <tr>
                  <th>Product name</th>
                  <th>Slug</th>
                  <th>Description</th>
                  <th>Image</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const imgUrl = item.primaryImageUrl || item.primary_image_url || item.imageUrl || '';
                  const name = item.name || '—';
                  const slug = item.slug || '—';
                  const desc = item.description || '—';
                  const isActive = item.isActive !== false && item.is_active !== false;
                  return (
                    <tr key={item.id != null ? item.id : `wi-${index}`}>
                      <td className="product-name-cell">
                        {imgUrl ? (
                          <div className="product-with-image">
                            <img
                              src={imgUrl}
                              alt={name}
                              className="product-thumbnail"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <span className="product-name">{name}</span>
                          </div>
                        ) : (
                          <span className="product-name">{name}</span>
                        )}
                      </td>
                      <td><span className="slug-cell">{slug}</span></td>
                      <td className="description-cell">{desc}</td>
                      <td>
                        {imgUrl ? (
                          <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="image-link">View</a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className={`product-type-badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>
                          {isActive ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button type="button" className="btn-icon btn-edit" title="Edit">✏️</button>
                        <button type="button" className="btn-icon btn-delete" title="Delete" onClick={() => handleDelete(item)}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content website-items-modal" onClick={e => e.stopPropagation()}>
            <h3>Add website item</h3>
            <button type="button" className="modal-close" onClick={resetForm} aria-label="Close">×</button>
            <form onSubmit={handleAddSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Marble Tile"
                  required
                />
              </div>
              <div className="form-group">
                <label>Slug *</label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={handleInputChange}
                  placeholder="e.g. marble-tile"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="e.g. Premium marble"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Primary image URL</label>
                <input
                  type="url"
                  name="primaryImageUrl"
                  value={formData.primaryImageUrl}
                  onChange={handleInputChange}
                  placeholder="https://example.com/img.jpg"
                />
              </div>
              <div className="form-group form-group-checkbox">
                <label>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  {' '}Active
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add item'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebsiteItemsPage;
