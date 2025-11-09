import React, { useState, useEffect } from 'react';
import { getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } from '../utils/storage';
import './Inventory.css';

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    quantity: '',
    unitPrice: '',
    category: ''
  });

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = () => {
    setInventory(getInventory());
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const itemData = {
      name: formData.name,
      description: formData.description,
      quantity: parseFloat(formData.quantity) || 0,
      unitPrice: parseFloat(formData.unitPrice) || 0,
      category: formData.category
    };

    if (editingItem) {
      updateInventoryItem(editingItem.id, itemData);
      setEditingItem(null);
    } else {
      addInventoryItem(itemData);
    }

    resetForm();
    loadInventory();
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      description: item.description || '',
      quantity: item.quantity || '',
      unitPrice: item.unitPrice || '',
      category: item.category || ''
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      deleteInventoryItem(id);
      loadInventory();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      quantity: '',
      unitPrice: '',
      category: ''
    });
    setShowForm(false);
    setEditingItem(null);
  };

  const totalValue = inventory.reduce((sum, item) => {
    return sum + (item.quantity * item.unitPrice);
  }, 0);

  return (
    <div className="inventory-container">
      <div className="inventory-header">
        <h2>Inventory Management</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add New Item'}
        </button>
      </div>

      {showForm && (
        <div className="inventory-form">
          <h3>{editingItem ? 'Edit Item' : 'Add New Item'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Item Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="3"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div className="form-group">
                <label>Unit Price (₹) *</label>
                <input
                  type="number"
                  name="unitPrice"
                  value={formData.unitPrice}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  placeholder="e.g., Stone, Tile, etc."
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingItem ? 'Update Item' : 'Add Item'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="inventory-stats">
        <div className="stat-card">
          <h3>Total Items</h3>
          <p className="stat-value">{inventory.length}</p>
        </div>
        <div className="stat-card">
          <h3>Total Inventory Value</h3>
          <p className="stat-value">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="inventory-table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Category</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Total Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {inventory.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">No items in inventory</td>
              </tr>
            ) : (
              inventory.map(item => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.description || '-'}</td>
                  <td>{item.category || '-'}</td>
                  <td>{item.quantity}</td>
                  <td>₹{item.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>₹{(item.quantity * item.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>
                    <button className="btn btn-sm btn-edit" onClick={() => handleEdit(item)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-delete" onClick={() => handleDelete(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Inventory;

