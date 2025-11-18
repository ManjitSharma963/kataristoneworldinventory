import React, { useState, useEffect } from 'react';
import './Invoice.css';

const Invoice = ({ bill, onClose }) => {
  const [invoiceNumber, setInvoiceNumber] = useState('');

  useEffect(() => {
    // Generate invoice number
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setInvoiceNumber(`INV-${year}${month}${day}-${random}`);
  }, []);

  if (!bill) return null;

  // Helper function to safely convert to number
  const safeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  };

  // Helper function to safely format number
  const formatCurrency = (value) => {
    const num = safeNumber(value);
    try {
      return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      return '0.00';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const calculateTotal = () => {
    if (!bill.items || !Array.isArray(bill.items) || bill.items.length === 0) {
      // If no items, try to use bill totals directly
      const subtotal = safeNumber(bill?.subtotal);
      const totalAmount = safeNumber(bill?.totalAmount);
      if (subtotal > 0) return subtotal;
      if (totalAmount > 0) return totalAmount;
      return 0;
    }
    const total = bill.items.reduce((sum, item) => {
      const quantity = safeNumber(item?.quantity);
      const price = safeNumber(item?.price);
      const itemTotal = safeNumber(quantity * price);
      return safeNumber(sum) + itemTotal;
    }, 0);
    return safeNumber(total);
  };

  const calculateTax = () => {
    if (bill?.billType === 'GST') {
      // Try to use bill's tax amount first, otherwise calculate
      const billTax = safeNumber(bill?.taxAmount);
      if (billTax > 0) {
        return billTax;
      }
      const total = calculateTotal();
      const tax = safeNumber(total * 0.18); // 18% GST
      return tax;
    }
    return 0;
  };

  const calculateGrandTotal = () => {
    // Try to use bill's total amount first
    const billTotal = safeNumber(bill?.totalAmount);
    if (billTotal > 0) {
      return billTotal;
    }
    const total = calculateTotal();
    const tax = calculateTax();
    const grandTotal = safeNumber(total + tax);
    return grandTotal;
  };

  return (
    <div className="invoice-overlay" onClick={onClose}>
      <div className="invoice-container" onClick={(e) => e.stopPropagation()}>
        <div className="invoice-header">
          <h2>Invoice</h2>
          <div className="invoice-actions">
            <button className="btn btn-primary" onClick={handlePrint}>
              🖨️ Print
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="invoice-content">
          {/* Company Header */}
          <div className="invoice-company-header">
            <div className="company-info">
              <h1>Katarai Stone World</h1>
              <p>Stone Supplier & Manufacturer</p>
              <p>Address: [Your Company Address]</p>
              <p>Phone: [Your Phone Number]</p>
              <p>Email: [Your Email]</p>
              {bill.billType === 'GST' && <p>GSTIN: [Your GSTIN]</p>}
            </div>
            <div className="invoice-details">
              <h3>INVOICE</h3>
              <div className="invoice-meta">
                <p><strong>Invoice No:</strong> {invoiceNumber}</p>
                <p><strong>Date:</strong> {new Date(bill.billDate || bill.date).toLocaleDateString('en-IN', { 
                  day: '2-digit', 
                  month: 'long', 
                  year: 'numeric' 
                })}</p>
                {bill.billNumber && <p><strong>Bill No:</strong> {bill.billNumber}</p>}
                <p><strong>Type:</strong> {bill.billType || 'NON-GST'}</p>
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="invoice-customer">
            <h4>Bill To:</h4>
            <div className="customer-details">
              <p><strong>Name:</strong> {bill.customerName || 'N/A'}</p>
              {bill.customerMobileNumber && (
                <p><strong>Phone:</strong> {bill.customerMobileNumber}</p>
              )}
              {bill.customerAddress && (
                <p><strong>Address:</strong> {bill.customerAddress}</p>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="invoice-items">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Sr. No.</th>
                  <th>Item Description</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {bill.items && Array.isArray(bill.items) && bill.items.length > 0 ? (
                  bill.items.map((item, index) => {
                    const quantity = safeNumber(item?.quantity);
                    const price = safeNumber(item?.price);
                    const total = safeNumber(quantity * price);
                    return (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{item?.name || item?.description || item?.productName || 'N/A'}</td>
                        <td>{quantity} {item?.unit || 'sqft'}</td>
                        <td>₹{formatCurrency(price)}</td>
                        <td>₹{formatCurrency(total)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                      No items found. Using bill totals.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="invoice-totals">
            <div className="totals-row">
              <span className="total-label">Subtotal:</span>
              <span className="total-value">
                ₹{formatCurrency(calculateTotal())}
              </span>
            </div>
            {bill?.billType === 'GST' && (
              <>
                <div className="totals-row">
                  <span className="total-label">CGST (9%):</span>
                  <span className="total-value">
                    ₹{formatCurrency(calculateTax() / 2)}
                  </span>
                </div>
                <div className="totals-row">
                  <span className="total-label">SGST (9%):</span>
                  <span className="total-value">
                    ₹{formatCurrency(calculateTax() / 2)}
                  </span>
                </div>
                <div className="totals-row">
                  <span className="total-label">GST (18%):</span>
                  <span className="total-value">
                    ₹{formatCurrency(calculateTax())}
                  </span>
                </div>
              </>
            )}
            <div className="totals-row grand-total">
              <span className="total-label">Grand Total:</span>
              <span className="total-value">
                ₹{formatCurrency(calculateGrandTotal())}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="invoice-footer">
            <p>Thank you for your business!</p>
            <p>Terms & Conditions: Payment due within 30 days</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Invoice;

