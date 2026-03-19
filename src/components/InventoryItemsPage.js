import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getInventory } from '../utils/storage';
import { API_BASE_URL } from '../config/api';
import { handleApiResponse, getInventoryEndpoint } from '../utils/api';
import './Dashboard.css';

const ITEMS_PER_PAGE = 10;

const getPricePerUnitAfter = (item) => {
  return Number(parseFloat(item?.pricePerSqftAfter ?? item?.price_per_sqft_after ?? item?.pricePerSqft ?? item?.price_per_sqft ?? item?.pricePerUnit ?? item?.unitPrice ?? item?.price) || 0) || 0;
};

const exportToCSV = (data, filename, headers) => {
  const csvContent = [
    headers.join(','),
    ...data.map(row => Object.values(row).map(val => `"${val}"`).join(','))
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const initialFormData = {
  name: '',
  slug: '',
  product_type: '',
  price_per_sqft: '',
  total_sqft_stock: '',
  unit: '',
  hsn_number: '',
  primary_image_url: '',
  color: '',
  labour_charges: '',
  rto_fees: '',
  damage_expenses: '',
  others_expenses: '',
  transportation_charge: '',
  gst_charges: ''
};

const generateSlug = (text) => {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const InventoryItemsPage = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [showAddInventory, setShowAddInventory] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [categories, setCategories] = useState([]);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}${getInventoryEndpoint()}`, { method: 'GET', headers });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setInventory(Array.isArray(data) ? data : []);
      } else {
        try {
          const localInventory = getInventory();
          setInventory(localInventory || []);
        } catch {
          setInventory([]);
        }
      }
    } catch (err) {
      console.error('Error fetching inventory:', err);
      try {
        setInventory(getInventory() || []);
      } catch {
        setInventory([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const fetchCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken');
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/categories`, { headers });
      if (response.ok) {
        const data = await response.json();
        setCategories(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleDeleteInventory = useCallback(async (item) => {
    const id = item?.id ?? item?.inventoryId;
    if (id == null) {
      alert('Cannot delete: item has no id');
      return;
    }
    if (!window.confirm(`Delete "${item.name || 'this item'}"? This cannot be undone.`)) return;
    try {
      const token = localStorage.getItem('authToken');
      const headers = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
        method: 'DELETE',
        headers
      });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Delete failed (${response.status})`);
      }
      await fetchInventory();
    } catch (err) {
      console.error('Error deleting inventory:', err);
      alert(err.message || 'Failed to delete item');
    }
  }, [fetchInventory]);

  const calculatePricePerSqft = (data) => {
    const pricePerSqft = parseFloat(data.price_per_sqft) || 0;
    const totalSqftStock = parseFloat(data.total_sqft_stock) || 0;
    const labourCharges = parseFloat(data.labour_charges) || 0;
    const rtoFees = parseFloat(data.rto_fees) || 0;
    const damageExpenses = parseFloat(data.damage_expenses) || 0;
    const othersExpenses = parseFloat(data.others_expenses) || 0;
    const transportationCharge = parseFloat(data.transportation_charge) || 0;
    const gstCharges = parseFloat(data.gst_charges) || 0;
    const pricePerSqftBefore = pricePerSqft;
    const totalExpenses = labourCharges + rtoFees + damageExpenses + othersExpenses + transportationCharge + gstCharges;
    const pricePerSqftAfter = totalSqftStock > 0
      ? (pricePerSqft * totalSqftStock + totalExpenses) / totalSqftStock
      : pricePerSqft;
    return {
      pricePerSqftBefore: pricePerSqftBefore.toFixed(2),
      pricePerSqftAfter: pricePerSqftAfter.toFixed(2)
    };
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if (name === 'name') newData.slug = generateSlug(value);
      return newData;
    });
  };

  const handleAddInventory = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.product_type || !formData.price_per_sqft || !formData.total_sqft_stock || !formData.primary_image_url) {
      alert('Please fill all required fields');
      return;
    }
    const pricePerSqft = parseFloat(formData.price_per_sqft);
    const totalSqftStock = parseFloat(formData.total_sqft_stock);
    if (isNaN(pricePerSqft) || pricePerSqft < 0) {
      alert('Please enter a valid price per unit');
      return;
    }
    if (isNaN(totalSqftStock) || totalSqftStock < 0) {
      alert('Please enter a valid quantity/stock');
      return;
    }
    const trimmedName = formData.name.trim();
    const trimmedSlug = (formData.slug || generateSlug(formData.name)).trim();
    const trimmedProductType = formData.product_type.trim();
    const trimmedImageUrl = formData.primary_image_url.trim();
    const trimmedColor = (formData.color || '').trim();
    if (!trimmedName || !trimmedProductType || !trimmedImageUrl) {
      alert('Please fill all required fields (name, product type, and image URL cannot be empty)');
      return;
    }
    const trimmedUnit = (formData.unit || '').trim();
    const labourCharges = parseFloat(formData.labour_charges) || 0;
    const rtoFees = parseFloat(formData.rto_fees) || 0;
    const damageExpenses = parseFloat(formData.damage_expenses) || 0;
    const othersExpenses = parseFloat(formData.others_expenses) || 0;
    const transportationCharge = parseFloat(formData.transportation_charge) || 0;
    const gstCharges = parseFloat(formData.gst_charges) || 0;
    const totalExpenses = labourCharges + rtoFees + damageExpenses + othersExpenses + transportationCharge + gstCharges;
    const pricePerSqftAfter = totalSqftStock > 0
      ? (pricePerSqft * totalSqftStock + totalExpenses) / totalSqftStock
      : pricePerSqft;
    const itemData = {
      name: trimmedName,
      slug: trimmedSlug,
      productTypeString: trimmedProductType,
      pricePerSqft: pricePerSqft,
      totalSqftStock: totalSqftStock,
      unit: trimmedUnit || 'piece',
      hsnNumber: (formData.hsn_number || '').trim() || undefined,
      primaryImageUrl: trimmedImageUrl,
      color: trimmedColor,
      labourCharges,
      rtoFees,
      damageExpenses,
      othersExpenses,
      transportationCharge,
      gstCharges,
      pricePerSqftAfter: parseFloat(pricePerSqftAfter.toFixed(2))
    };
    try {
      const token = localStorage.getItem('authToken');
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const userRole = userData?.role || userData?.userRole || 'admin';
      const requestBody = { ...itemData, role: userRole, userRole: userRole };
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/inventory`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || 'Failed to add inventory item' };
        }
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }
      setFormData(initialFormData);
      setShowAddInventory(false);
      await fetchInventory();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to add inventory item');
    }
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  let filteredInventory = useMemo(() => {
    let list = inventory.filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const name = item.name?.toLowerCase() || '';
      const productType = (item.productType || item.product_type || item.category || '').toLowerCase();
      const color = (item.color || '').toLowerCase();
      const priceStr = (item.pricePerSqft ?? item.price_per_sqft ?? item.pricePerUnit ?? item.unitPrice ?? 0).toString();
      const stockStr = (item.totalSqftStock ?? item.total_sqft_stock ?? item.quantity ?? 0).toString();
      const slug = (item.slug || '').toLowerCase();
      return name.includes(q) || productType.includes(q) || color.includes(q) || priceStr.includes(q) || stockStr.includes(q) || slug.includes(q);
    });
    if (sortConfig.key) {
      list = [...list].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (sortConfig.key === 'productType') {
          aVal = a.productType || a.product_type || '';
          bVal = b.productType || b.product_type || '';
        } else if (sortConfig.key === 'pricePerSqft') {
          aVal = getPricePerUnitAfter(a);
          bVal = getPricePerUnitAfter(b);
        } else if (sortConfig.key === 'totalSqftStock') {
          aVal = a.totalSqftStock ?? a.total_sqft_stock ?? 0;
          bVal = b.totalSqftStock ?? b.total_sqft_stock ?? 0;
        } else if (sortConfig.key === 'name') {
          aVal = (a.name || '').toLowerCase();
          bVal = (b.name || '').toLowerCase();
        }
        if (typeof aVal === 'string') bVal = (bVal != null ? bVal : '').toString().toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [inventory, searchQuery, sortConfig]);

  const totalPages = Math.ceil(filteredInventory.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredInventory.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const totalValueSum = useMemo(() => {
    return filteredInventory.reduce((sum, item) => {
      const stock = item.totalSqftStock ?? item.total_sqft_stock ?? item.quantity ?? 0;
      return sum + (stock * getPricePerUnitAfter(item));
    }, 0);
  }, [filteredInventory]);

  const handleExportCSV = () => {
    const headers = ['Product Name', 'Product Type', 'Price/Unit (after expenses)', 'Quantity/Stock', 'Color', 'Total Value'];
    const csvData = filteredInventory.map(item => {
      const pricePerUnitAfter = getPricePerUnitAfter(item);
      const totalSqftStock = item.totalSqftStock ?? item.total_sqft_stock ?? item.quantity ?? 0;
      return {
        'Product Name': item.name || '',
        'Product Type': item.productType || item.product_type || '',
        'Price/Unit (after expenses)': pricePerUnitAfter,
        'Quantity/Stock': totalSqftStock,
        'Color': item.color || '',
        'Total Value': pricePerUnitAfter * totalSqftStock
      };
    });
    exportToCSV(csvData, `inventory_items_${new Date().toISOString().split('T')[0]}.csv`, headers);
  };

  if (loading && inventory.length === 0) {
    return (
      <div className="dashboard-section inventory-section" style={{ padding: '24px' }}>
        <p>Loading inventory...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-section inventory-section">
      <div className="section-header-enhanced">
        <div className="section-title-wrapper">
          <span className="section-icon">📦</span>
          <h3>Inventory Items</h3>
          <span className="sales-count">({filteredInventory.length})</span>
        </div>
        <div className="section-header-actions">
          {filteredInventory.length > 0 && (
            <>
              <div className="section-summary">
                <span className="summary-item">Total Value: ₹{totalValueSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <button type="button" className="btn btn-export" onClick={handleExportCSV} title="Export to CSV">📥 Export CSV</button>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setShowAddInventory(true)}>
            + Add Inventory
          </button>
        </div>
      </div>

      {inventory.length > 0 && (
        <div className="search-section">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search by product name, type, color, price, stock, or slug..."
              className="search-input"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); setCurrentPage(1); }} className="search-clear-btn" title="Clear">×</button>
            )}
          </div>
        </div>
      )}

      <div className="section-content">
        {inventory.length === 0 ? (
          <div className="empty-state-wrapper">
            <span className="empty-icon">📦</span>
            <p className="empty-state">No inventory items yet</p>
            <p className="empty-subtitle">Click &quot;+ Add Inventory&quot; to add your first item.</p>
            <button type="button" className="btn btn-primary" onClick={() => setShowAddInventory(true)}>+ Add Inventory</button>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="empty-state-wrapper">
            <span className="empty-icon">🔍</span>
            <p className="empty-state">No items match your search</p>
            <button type="button" onClick={() => { setSearchQuery(''); setCurrentPage(1); }} className="btn-filter-clear-inline">Clear Search</button>
          </div>
        ) : (
          <>
            <div className="sales-table-wrapper">
              <table className="data-table inventory-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('name')}>Product Name{sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}</th>
                    <th className="sortable" onClick={() => handleSort('productType')}>Product Type{sortConfig.key === 'productType' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}</th>
                    <th className="sortable" onClick={() => handleSort('pricePerSqft')} title="Per unit after expenses">Price/Unit (after expenses){sortConfig.key === 'pricePerSqft' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}</th>
                    <th className="sortable" onClick={() => handleSort('totalSqftStock')}>Quantity/Stock{sortConfig.key === 'totalSqftStock' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}</th>
                    <th>Color</th>
                    <th className="total-col">Total Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item, index) => {
                    const pricePerUnitAfter = getPricePerUnitAfter(item);
                    const totalSqftStock = item.totalSqftStock ?? item.total_sqft_stock ?? item.quantity ?? 0;
                    const productType = item.productType || item.product_type || item.category || '-';
                    const primaryImageUrl = item.primaryImageUrl || item.primary_image_url;
                    const totalValue = totalSqftStock * pricePerUnitAfter;
                    const isLowStock = totalSqftStock < 10;
                    return (
                      <tr key={`inv-${item.id ?? index}`} className={isLowStock ? 'low-stock-row' : ''}>
                        <td className="product-name-cell">
                          {primaryImageUrl ? (
                            <div className="product-with-image">
                              <img src={primaryImageUrl} alt={item.name} className="product-thumbnail" onError={(e) => { e.target.style.display = 'none'; }} />
                              <span className="product-name">{item.name}</span>
                            </div>
                          ) : (
                            <span className="product-name">{item.name}</span>
                          )}
                        </td>
                        <td><span className="product-type-badge">{productType}</span></td>
                        <td className="amount-cell">₹{pricePerUnitAfter.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className={isLowStock ? 'low-stock-cell' : 'stock-cell'}>
                          {isLowStock && <span className="low-stock-indicator">⚠️ </span>}
                          {totalSqftStock.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td>{item.color ? <span className="color-badge">{item.color}</span> : '-'}</td>
                        <td className="total-cell total-col"><span className="total-amount">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
                        <td className="actions-cell">
                          <button type="button" className="btn-icon btn-delete" title="Delete" onClick={() => handleDeleteInventory(item)}>🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination-wrapper">
                <div className="pagination-info">
                  Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredInventory.length)} of {filteredInventory.length}
                </div>
                <div className="pagination-controls">
                  <button type="button" className="pagination-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>← Previous</button>
                  <div className="pagination-numbers">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button key={page} type="button" className={`pagination-number ${currentPage === page ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>{page}</button>
                    ))}
                  </div>
                  <button type="button" className="pagination-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showAddInventory && (
        <div className="modal-overlay" onClick={() => setShowAddInventory(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Inventory Item</h3>
              <button className="modal-close" onClick={() => setShowAddInventory(false)}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddInventory}>
                <div className="form-group">
                  <label>Product Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    maxLength="200"
                    placeholder="e.g., Carrara White Marble"
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
                    maxLength="250"
                    placeholder="e.g., carrara-white-marble"
                    required
                  />
                  <small className="form-help">URL-friendly version (auto-generated from product name)</small>
                </div>
                <div className="form-group">
                  <label>Product Type / Category *</label>
                  <select
                    name="product_type"
                    value={formData.product_type}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.filter(c => c.is_active !== false).map((cat) => (
                      <option key={cat.id} value={cat.name || cat.category_type || ''}>
                        {cat.name || cat.category_type || 'Unnamed'}
                      </option>
                    ))}
                    {formData.product_type && !categories.some(c => (c.name || c.category_type) === formData.product_type) && (
                      <option value={formData.product_type}>{formData.product_type}</option>
                    )}
                    {categories.length === 0 && <option value="other">Other</option>}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Price Per Sqr Ft (Before Extra Expenses) (₹) *</label>
                    <input
                      type="number"
                      name="price_per_sqft"
                      value={formData.price_per_sqft}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 180.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity/Stock *</label>
                    <input
                      type="number"
                      name="total_sqft_stock"
                      value={formData.total_sqft_stock}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 150.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      maxLength="20"
                      placeholder="e.g., piece, sqr ft, kg, meter"
                    />
                  </div>
                  <div className="form-group">
                    <label>HSN Number (optional)</label>
                    <input
                      type="text"
                      name="hsn_number"
                      value={formData.hsn_number}
                      onChange={handleInputChange}
                      maxLength="10"
                      placeholder="e.g., 2515, 6802"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Primary Image URL *</label>
                  <input
                    type="url"
                    name="primary_image_url"
                    value={formData.primary_image_url}
                    onChange={handleInputChange}
                    maxLength="500"
                    placeholder="https://example.com/image.jpg"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Color</label>
                  <input
                    type="text"
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    maxLength="50"
                    placeholder="e.g., white, black, beige, multi"
                  />
                </div>
                <div className="form-section-divider">
                  <h4>Extra Expenses</h4>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Labour Charges (₹)</label>
                    <input
                      type="number"
                      name="labour_charges"
                      value={formData.labour_charges}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>RTO Fees (₹)</label>
                    <input
                      type="number"
                      name="rto_fees"
                      value={formData.rto_fees}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Damage Expenses (₹)</label>
                    <input
                      type="number"
                      name="damage_expenses"
                      value={formData.damage_expenses}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Others Expenses (₹)</label>
                    <input
                      type="number"
                      name="others_expenses"
                      value={formData.others_expenses}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Transportation Charge (₹)</label>
                    <input
                      type="number"
                      name="transportation_charge"
                      value={formData.transportation_charge}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>GST Charges (₹)</label>
                    <input
                      type="number"
                      name="gst_charges"
                      value={formData.gst_charges}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="form-section-divider">
                  <h4>Price Per Sqr Ft Calculation</h4>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Price Per Sqr Ft (Before Extra Expenses)</label>
                    <input
                      type="text"
                      value={`₹${calculatePricePerSqft(formData).pricePerSqftBefore}`}
                      readOnly
                      className="readonly-field"
                      style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Price Per Sqr Ft (After Extra Expenses)</label>
                    <input
                      type="text"
                      value={`₹${calculatePricePerSqft(formData).pricePerSqftAfter}`}
                      readOnly
                      className="readonly-field"
                      style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed', fontWeight: 'bold', color: '#2c3e50' }}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">Add Item</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddInventory(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryItemsPage;
