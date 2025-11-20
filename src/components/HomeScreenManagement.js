import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { handleApiResponse } from '../utils/api';
import './HomeScreenManagement.css';

const HomeScreenManagement = () => {
  const [activeTab, setActiveTab] = useState('hero'); // 'hero' or 'categories'
  const [heroSlides, setHeroSlides] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHeroForm, setShowHeroForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingHero, setEditingHero] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [toast, setToast] = useState(null);

  // Hero slide form data
  const [heroFormData, setHeroFormData] = useState({
    image_url: '',
    title: '',
    subtitle: '',
    display_order: 0,
    is_active: true
  });

  // Category form data
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    image_url: '',
    category_type: '',
    description: '',
    display_order: 0,
    is_active: true
  });

  // Show toast message
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch hero slides (Public - no auth required)
  const fetchHeroSlides = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/heroes`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setHeroSlides(data || []);
      }
    } catch (error) {
      console.error('Error fetching hero slides:', error);
      showToast('Failed to load hero slides', 'error');
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setCategories(data || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      showToast('Failed to load categories', 'error');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchHeroSlides(), fetchCategories()]);
      setLoading(false);
    };
    loadData();
  }, []);

  // Handle hero slide form input
  const handleHeroInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setHeroFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle category form input
  const handleCategoryInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCategoryFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Submit hero slide (POST/PUT - Admin auth required)
  const handleHeroSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        showToast('Authentication required. Please login.', 'error');
        return;
      }

      const url = editingHero 
        ? `${API_BASE_URL}/heroes/${editingHero.id}`
        : `${API_BASE_URL}/heroes`;
      
      const method = editingHero ? 'PUT' : 'POST';
      
      // Prepare request body matching curl format
      const requestBody = {
        title: heroFormData.title,
        image_url: heroFormData.image_url,
        subtitle: heroFormData.subtitle,
        display_order: parseInt(heroFormData.display_order) || 0,
        is_active: heroFormData.is_active
      };
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (response.ok) {
        showToast(editingHero ? 'Hero slide updated successfully!' : 'Hero slide added successfully!', 'success');
        setShowHeroForm(false);
        setEditingHero(null);
        setHeroFormData({
          image_url: '',
          title: '',
          subtitle: '',
          display_order: 0,
          is_active: true
        });
        await fetchHeroSlides();
      } else {
        const errorText = await response.text();
        let errorMessage = errorText;
        
        // Handle unauthorized access
        if (response.status === 401 || response.status === 403) {
          errorMessage = 'Access denied: Admin privileges required';
        }
        
        showToast(`Error: ${errorMessage}`, 'error');
      }
    } catch (error) {
      console.error('Error saving hero slide:', error);
      showToast('Failed to save hero slide', 'error');
    }
  };

  // Submit category
  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('authToken');
      const url = editingCategory 
        ? `${API_BASE_URL}/categories/${editingCategory.id}`
        : `${API_BASE_URL}/categories`;
      
      const method = editingCategory ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(categoryFormData)
      });

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (response.ok) {
        showToast(editingCategory ? 'Category updated successfully!' : 'Category added successfully!', 'success');
        setShowCategoryForm(false);
        setEditingCategory(null);
        setCategoryFormData({
          name: '',
          image_url: '',
          category_type: '',
          description: '',
          display_order: 0,
          is_active: true
        });
        await fetchCategories();
      } else {
        const errorText = await response.text();
        showToast(`Error: ${errorText}`, 'error');
      }
    } catch (error) {
      console.error('Error saving category:', error);
      showToast('Failed to save category', 'error');
    }
  };

  // Edit hero slide
  const handleEditHero = (hero) => {
    setEditingHero(hero);
    setHeroFormData({
      image_url: hero.image_url || '',
      title: hero.title || '',
      subtitle: hero.subtitle || '',
      display_order: hero.display_order || 0,
      is_active: hero.is_active !== undefined ? hero.is_active : true
    });
    setShowHeroForm(true);
  };

  // Edit category
  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryFormData({
      name: category.name || '',
      image_url: category.image_url || '',
      category_type: category.category_type || '',
      description: category.description || '',
      display_order: category.display_order || 0,
      is_active: category.is_active !== undefined ? category.is_active : true
    });
    setShowCategoryForm(true);
  };

  // Delete hero slide (DELETE - Admin auth required)
  const handleDeleteHero = async (id) => {
    if (!window.confirm('Are you sure you want to delete this hero slide?')) return;
    
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        showToast('Authentication required. Please login.', 'error');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/heroes/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (response.ok) {
        showToast('Hero slide deleted successfully!', 'success');
        await fetchHeroSlides();
      } else {
        const errorText = await response.text();
        let errorMessage = 'Failed to delete hero slide';
        
        // Handle unauthorized access
        if (response.status === 401 || response.status === 403) {
          errorMessage = 'Access denied: Admin privileges required';
        } else if (errorText) {
          errorMessage = errorText;
        }
        
        showToast(errorMessage, 'error');
      }
    } catch (error) {
      console.error('Error deleting hero slide:', error);
      showToast('Failed to delete hero slide', 'error');
    }
  };

  // Delete category
  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (response.ok) {
        showToast('Category deleted successfully!', 'success');
        await fetchCategories();
      } else {
        showToast('Failed to delete category', 'error');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      showToast('Failed to delete category', 'error');
    }
  };

  // Toggle hero slide active status (PUT - Admin auth required)
  const handleToggleHeroActive = async (hero) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        showToast('Authentication required. Please login.', 'error');
        return;
      }

      // Prepare request body matching curl format
      const requestBody = {
        title: hero.title,
        image_url: hero.image_url,
        subtitle: hero.subtitle,
        display_order: hero.display_order || 0,
        is_active: !hero.is_active
      };

      const response = await fetch(`${API_BASE_URL}/heroes/${hero.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (response.ok) {
        showToast(`Hero slide ${!hero.is_active ? 'activated' : 'deactivated'} successfully!`, 'success');
        await fetchHeroSlides();
      } else {
        const errorText = await response.text();
        let errorMessage = 'Failed to update hero slide status';
        
        // Handle unauthorized access
        if (response.status === 401 || response.status === 403) {
          errorMessage = 'Access denied: Admin privileges required';
        } else if (errorText) {
          errorMessage = errorText;
        }
        
        showToast(errorMessage, 'error');
      }
    } catch (error) {
      console.error('Error toggling hero slide status:', error);
      showToast('Failed to update hero slide status', 'error');
    }
  };

  // Toggle category active status
  const handleToggleCategoryActive = async (category) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/categories/${category.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...category,
          is_active: !category.is_active
        })
      });

      // Check for session expiry (401)
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (response.ok) {
        showToast(`Category ${!category.is_active ? 'activated' : 'deactivated'} successfully!`, 'success');
        await fetchCategories();
      }
    } catch (error) {
      console.error('Error toggling category status:', error);
      showToast('Failed to update category status', 'error');
    }
  };

  // Sort hero slides by display_order
  const sortedHeroSlides = [...heroSlides].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const sortedCategories = [...categories].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  if (loading) {
    return (
      <div className="home-screen-management">
        <div className="loading-state">Loading...</div>
      </div>
    );
  }

  return (
    <div className="home-screen-management">
      <div className="home-screen-header">
        <h2>🏠 Home Screen Management</h2>
        <p>Manage hero slides and categories for your homepage</p>
      </div>

      {/* Tab Navigation */}
      <div className="home-screen-tabs">
        <button
          className={`home-screen-tab ${activeTab === 'hero' ? 'active' : ''}`}
          onClick={() => setActiveTab('hero')}
        >
          🖼️ Hero Slides
        </button>
        <button
          className={`home-screen-tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          📁 Categories
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Hero Slides Section */}
      {activeTab === 'hero' && (
        <div className="home-screen-section">
          <div className="section-header">
            <h3>Hero Slides</h3>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingHero(null);
                setHeroFormData({
                  image_url: '',
                  title: '',
                  subtitle: '',
                  display_order: sortedHeroSlides.length > 0 ? Math.max(...sortedHeroSlides.map(h => h.display_order || 0)) + 1 : 0,
                  is_active: true
                });
                setShowHeroForm(true);
              }}
            >
              + Add Hero Slide
            </button>
          </div>

          {/* Hero Slides Form */}
          {showHeroForm && (
            <div className="form-modal">
              <div className="form-modal-content">
                <div className="form-modal-header">
                  <h3>{editingHero ? 'Edit Hero Slide' : 'Add Hero Slide'}</h3>
                  <button className="close-btn" onClick={() => {
                    setShowHeroForm(false);
                    setEditingHero(null);
                  }}>×</button>
                </div>
                <form onSubmit={handleHeroSubmit}>
                  <div className="form-group">
                    <label>Image URL *</label>
                    <input
                      type="url"
                      name="image_url"
                      value={heroFormData.image_url}
                      onChange={handleHeroInputChange}
                      required
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>
                  <div className="form-group">
                    <label>Title *</label>
                    <input
                      type="text"
                      name="title"
                      value={heroFormData.title}
                      onChange={handleHeroInputChange}
                      required
                      placeholder="Enter title"
                    />
                  </div>
                  <div className="form-group">
                    <label>Subtitle</label>
                    <input
                      type="text"
                      name="subtitle"
                      value={heroFormData.subtitle}
                      onChange={handleHeroInputChange}
                      placeholder="Enter subtitle"
                    />
                  </div>
                  <div className="form-group">
                    <label>Display Order</label>
                    <input
                      type="number"
                      name="display_order"
                      value={heroFormData.display_order}
                      onChange={handleHeroInputChange}
                      min="0"
                    />
                  </div>
                  <div className="form-group checkbox-group">
                    <label>
                      <input
                        type="checkbox"
                        name="is_active"
                        checked={heroFormData.is_active}
                        onChange={handleHeroInputChange}
                      />
                      Active
                    </label>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      {editingHero ? 'Update' : 'Add'} Hero Slide
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowHeroForm(false);
                        setEditingHero(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Hero Slides List */}
          <div className="items-grid">
            {sortedHeroSlides.length === 0 ? (
              <div className="empty-state">
                <p>No hero slides found. Add your first hero slide!</p>
              </div>
            ) : (
              sortedHeroSlides.map((hero) => (
                <div key={hero.id} className={`item-card ${!hero.is_active ? 'inactive' : ''}`}>
                  <div className="item-card-image">
                    {hero.image_url && (
                      <img src={hero.image_url} alt={hero.title} onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                  </div>
                  <div className="item-card-content">
                    <h4>{hero.title}</h4>
                    {hero.subtitle && <p className="subtitle">{hero.subtitle}</p>}
                    <div className="item-card-meta">
                      <span>Order: {hero.display_order || 0}</span>
                      <span className={`status-badge ${hero.is_active ? 'active' : 'inactive'}`}>
                        {hero.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="item-card-actions">
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => handleEditHero(hero)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon btn-toggle"
                      onClick={() => handleToggleHeroActive(hero)}
                      title={hero.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {hero.is_active ? '👁️' : '👁️‍🗨️'}
                    </button>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => handleDeleteHero(hero.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Categories Section */}
      {activeTab === 'categories' && (
        <div className="home-screen-section">
          <div className="section-header">
            <h3>Categories</h3>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingCategory(null);
                setCategoryFormData({
                  name: '',
                  image_url: '',
                  category_type: '',
                  description: '',
                  display_order: sortedCategories.length > 0 ? Math.max(...sortedCategories.map(c => c.display_order || 0)) + 1 : 0,
                  is_active: true
                });
                setShowCategoryForm(true);
              }}
            >
              + Add Category
            </button>
          </div>

          {/* Category Form */}
          {showCategoryForm && (
            <div className="form-modal">
              <div className="form-modal-content">
                <div className="form-modal-header">
                  <h3>{editingCategory ? 'Edit Category' : 'Add Category'}</h3>
                  <button className="close-btn" onClick={() => {
                    setShowCategoryForm(false);
                    setEditingCategory(null);
                  }}>×</button>
                </div>
                <form onSubmit={handleCategorySubmit}>
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={categoryFormData.name}
                      onChange={handleCategoryInputChange}
                      required
                      placeholder="Enter category name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Image URL *</label>
                    <input
                      type="url"
                      name="image_url"
                      value={categoryFormData.image_url}
                      onChange={handleCategoryInputChange}
                      required
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>
                  <div className="form-group">
                    <label>Category Type *</label>
                    <input
                      type="text"
                      name="category_type"
                      value={categoryFormData.category_type}
                      onChange={handleCategoryInputChange}
                      required
                      placeholder="e.g., Marble, Granite, Tiles"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      name="description"
                      value={categoryFormData.description}
                      onChange={handleCategoryInputChange}
                      rows="3"
                      placeholder="Enter category description"
                    />
                  </div>
                  <div className="form-group">
                    <label>Display Order</label>
                    <input
                      type="number"
                      name="display_order"
                      value={categoryFormData.display_order}
                      onChange={handleCategoryInputChange}
                      min="0"
                    />
                  </div>
                  <div className="form-group checkbox-group">
                    <label>
                      <input
                        type="checkbox"
                        name="is_active"
                        checked={categoryFormData.is_active}
                        onChange={handleCategoryInputChange}
                      />
                      Active
                    </label>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      {editingCategory ? 'Update' : 'Add'} Category
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowCategoryForm(false);
                        setEditingCategory(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Categories List */}
          <div className="items-grid">
            {sortedCategories.length === 0 ? (
              <div className="empty-state">
                <p>No categories found. Add your first category!</p>
              </div>
            ) : (
              sortedCategories.map((category) => (
                <div key={category.id} className={`item-card ${!category.is_active ? 'inactive' : ''}`}>
                  <div className="item-card-image">
                    {category.image_url && (
                      <img src={category.image_url} alt={category.name} onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                  </div>
                  <div className="item-card-content">
                    <h4>{category.name}</h4>
                    <p className="category-type">Type: {category.category_type}</p>
                    {category.description && <p className="description">{category.description}</p>}
                    <div className="item-card-meta">
                      <span>Order: {category.display_order || 0}</span>
                      <span className={`status-badge ${category.is_active ? 'active' : 'inactive'}`}>
                        {category.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="item-card-actions">
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => handleEditCategory(category)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon btn-toggle"
                      onClick={() => handleToggleCategoryActive(category)}
                      title={category.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {category.is_active ? '👁️' : '👁️‍🗨️'}
                    </button>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => handleDeleteCategory(category.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreenManagement;

