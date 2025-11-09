import React, { useState, useEffect } from 'react';
import { getInventory, getSales, addSale } from '../utils/storage';
import './Sales.css';

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '',
    gstPaid: false,
    gstRate: 18,
    items: []
  });
  const [currentItem, setCurrentItem] = useState({
    itemId: '',
    quantity: '',
    unitPrice: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setSales(getSales());
    setInventory(getInventory());
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleItemInputChange = (e) => {
    const { name, value } = e.target;
    setCurrentItem(prev => ({
      ...prev,
      [name]: value
    }));

    // Auto-fill unit price when item is selected
    if (name === 'itemId' && value) {
      const selectedItem = inventory.find(item => item.id === value);
      if (selectedItem) {
        setCurrentItem(prev => ({
          ...prev,
          unitPrice: selectedItem.unitPrice || ''
        }));
      }
    }
  };

  const addItemToSale = () => {
    if (!currentItem.itemId || !currentItem.quantity) {
      alert('Please select an item and enter quantity');
      return;
    }

    const selectedInventoryItem = inventory.find(item => item.id === currentItem.itemId);
    if (!selectedInventoryItem) {
      alert('Item not found');
      return;
    }

    const quantity = parseFloat(currentItem.quantity);
    if (quantity > selectedInventoryItem.quantity) {
      alert(`Insufficient stock. Available: ${selectedInventoryItem.quantity}`);
      return;
    }

    const unitPrice = parseFloat(currentItem.unitPrice) || selectedInventoryItem.unitPrice;
    const subtotal = quantity * unitPrice;

    const newItem = {
      itemId: currentItem.itemId,
      itemName: selectedInventoryItem.name,
      quantity: quantity,
      unitPrice: unitPrice,
      subtotal: subtotal
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));

    setCurrentItem({
      itemId: '',
      quantity: '',
      unitPrice: ''
    });
  };

  const removeItemFromSale = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const calculateTotal = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.subtotal, 0);
    if (formData.gstPaid) {
      const gstRate = parseFloat(formData.gstRate) || 0;
      const gstAmount = (subtotal * gstRate) / 100;
      return {
        subtotal,
        gstAmount,
        total: subtotal + gstAmount
      };
    }
    return {
      subtotal,
      gstAmount: 0,
      total: subtotal
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      alert('Please add at least one item to the sale');
      return;
    }

    const totals = calculateTotal();
    const saleData = {
      customerName: formData.customerName || 'Walk-in Customer',
      gstPaid: formData.gstPaid,
      gstRate: formData.gstPaid ? parseFloat(formData.gstRate) : 0,
      items: formData.items,
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      totalAmount: totals.total
    };

    addSale(saleData);
    resetForm();
    loadData();
    alert('Sale recorded successfully!');
  };

  const resetForm = () => {
    setFormData({
      customerName: '',
      gstPaid: false,
      gstRate: 18,
      items: []
    });
    setCurrentItem({
      itemId: '',
      quantity: '',
      unitPrice: ''
    });
    setShowForm(false);
  };

  const totals = calculateTotal();

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN') + ' ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="sales-container">
      <div className="sales-header">
        <h2>Sales Management</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Sale'}
        </button>
      </div>

      {showForm && (
        <div className="sales-form">
          <h3>Create New Sale</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Customer Name</label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleInputChange}
                placeholder="Leave empty for walk-in customer"
              />
            </div>

            <div className="form-row">
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="gstPaid"
                    checked={formData.gstPaid}
                    onChange={handleInputChange}
                  />
                  GST Paid
                </label>
              </div>
              {formData.gstPaid && (
                <div className="form-group">
                  <label>GST Rate (%)</label>
                  <input
                    type="number"
                    name="gstRate"
                    value={formData.gstRate}
                    onChange={handleInputChange}
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>
              )}
            </div>

            <div className="add-item-section">
              <h4>Add Items</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Item</label>
                  <select
                    name="itemId"
                    value={currentItem.itemId}
                    onChange={handleItemInputChange}
                  >
                    <option value="">Select Item</option>
                    {inventory.filter(item => item.quantity > 0).map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} (Stock: {item.quantity})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    type="number"
                    name="quantity"
                    value={currentItem.quantity}
                    onChange={handleItemInputChange}
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Unit Price (₹)</label>
                  <input
                    type="number"
                    name="unitPrice"
                    value={currentItem.unitPrice}
                    onChange={handleItemInputChange}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>&nbsp;</label>
                  <button type="button" className="btn btn-secondary" onClick={addItemToSale}>
                    Add Item
                  </button>
                </div>
              </div>
            </div>

            {formData.items.length > 0 && (
              <div className="sale-items-list">
                <h4>Sale Items</h4>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Subtotal</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item, index) => (
                      <tr key={index}>
                        <td>{item.itemName}</td>
                        <td>{item.quantity}</td>
                        <td>₹{item.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>₹{item.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>
                          <button type="button" className="btn btn-sm btn-delete" onClick={() => removeItemFromSale(index)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="sale-totals">
                  <div className="total-row">
                    <span>Subtotal:</span>
                    <span>₹{totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {formData.gstPaid && (
                    <div className="total-row">
                      <span>GST ({formData.gstRate}%):</span>
                      <span>₹{totals.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="total-row total-final">
                    <span>Total:</span>
                    <span>₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={formData.items.length === 0}>
                Record Sale
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="sales-list">
        <h3>Sales History</h3>
        {sales.length === 0 ? (
          <p className="empty-state">No sales recorded yet</p>
        ) : (
          <div className="sales-table-container">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>GST Status</th>
                  <th>Subtotal</th>
                  <th>GST</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr key={sale.id}>
                    <td>{formatDate(sale.date)}</td>
                    <td>{sale.customerName}</td>
                    <td>{sale.items.length} item(s)</td>
                    <td>
                      <span className={`gst-badge ${sale.gstPaid ? 'gst-paid' : 'gst-not-paid'}`}>
                        {sale.gstPaid ? `Paid (${sale.gstRate}%)` : 'Not Paid'}
                      </span>
                    </td>
                    <td>₹{sale.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>₹{sale.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>₹{sale.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sales;

