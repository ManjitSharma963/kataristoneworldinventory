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

const InventoryItemsPage = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

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
          <button type="button" className="btn btn-primary" onClick={() => alert('Go to Dashboard → Inventory to add or edit items.')}>
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
            <p className="empty-subtitle">Use Dashboard → Inventory to add items, or add here when available.</p>
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
                          <button type="button" className="btn-icon btn-edit" title="Edit (use Dashboard → Inventory)">✏️</button>
                          <button type="button" className="btn-icon btn-delete" title="Delete (use Dashboard → Inventory)">🗑️</button>
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
    </div>
  );
};

export default InventoryItemsPage;
