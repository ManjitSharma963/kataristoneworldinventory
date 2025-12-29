import React, { useEffect, useState } from 'react';
import { getCart, removeFromCart, updateCartItemQuantity, clearCart, getCartCount, getCartTotal } from '../utils/cart';
import { API_BASE_URL } from '../config/api';
import { handleApiResponse } from '../utils/api';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';
import 'primereact/resources/themes/lara-light-cyan/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import './CartModal.css';

export default function CartModal({ isOpen, onClose, onBillCreated }) {
  const [cart, setCart] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [taxRate, setTaxRate] = useState(() => {
    const saved = localStorage.getItem('cartTaxRate');
    return saved ? parseFloat(saved) : 5;
  });
  const [discountAmount, setDiscountAmount] = useState(() => {
    const saved = localStorage.getItem('cartDiscountAmount');
    return saved ? parseFloat(saved) : 0;
  });
  const [mobileNumber, setMobileNumber] = useState(() => {
    const saved = localStorage.getItem('cartMobileNumber');
    return saved || '';
  });
  const [customerName, setCustomerName] = useState(() => {
    const saved = localStorage.getItem('cartCustomerName');
    return saved || '';
  });
  const [addressLine1, setAddressLine1] = useState(() => {
    const saved = localStorage.getItem('cartAddressLine1');
    return saved || '';
  });
  const [city, setCity] = useState(() => {
    const saved = localStorage.getItem('cartCity');
    return saved || '';
  });
  const [state, setState] = useState(() => {
    const saved = localStorage.getItem('cartState');
    return saved || '';
  });
  const [pincode, setPincode] = useState(() => {
    const saved = localStorage.getItem('cartPincode');
    return saved || '';
  });
  const [gstin, setGstin] = useState(() => {
    const saved = localStorage.getItem('cartGstin');
    return saved || '';
  });
  const [email, setEmail] = useState(() => {
    const saved = localStorage.getItem('cartEmail');
    return saved || '';
  });
  const [billType, setBillType] = useState(() => {
    const saved = localStorage.getItem('cartBillType');
    return saved || 'NON-GST';
  });
  const [labourCharge, setLabourCharge] = useState(() => {
    const saved = localStorage.getItem('cartLabourCharge');
    return saved ? parseFloat(saved) : 0;
  });
  const [transportationCharge, setTransportationCharge] = useState(() => {
    const saved = localStorage.getItem('cartTransportationCharge');
    return saved ? parseFloat(saved) : 0;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const toast = React.useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      loadCart();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('cartTaxRate', taxRate.toString());
  }, [taxRate]);

  useEffect(() => {
    localStorage.setItem('cartDiscountAmount', discountAmount.toString());
  }, [discountAmount]);

  useEffect(() => {
    localStorage.setItem('cartMobileNumber', mobileNumber);
  }, [mobileNumber]);

  useEffect(() => {
    localStorage.setItem('cartCustomerName', customerName);
  }, [customerName]);

  useEffect(() => {
    localStorage.setItem('cartAddressLine1', addressLine1);
  }, [addressLine1]);

  useEffect(() => {
    localStorage.setItem('cartCity', city);
  }, [city]);

  useEffect(() => {
    localStorage.setItem('cartState', state);
  }, [state]);

  useEffect(() => {
    localStorage.setItem('cartPincode', pincode);
  }, [pincode]);

  useEffect(() => {
    localStorage.setItem('cartGstin', gstin);
  }, [gstin]);

  useEffect(() => {
    localStorage.setItem('cartEmail', email);
  }, [email]);

  useEffect(() => {
    localStorage.setItem('cartBillType', billType);
  }, [billType]);

  useEffect(() => {
    localStorage.setItem('cartLabourCharge', labourCharge.toString());
  }, [labourCharge]);

  useEffect(() => {
    localStorage.setItem('cartTransportationCharge', transportationCharge.toString());
  }, [transportationCharge]);

  const loadCart = () => {
    const cartItems = getCart();
    setCart(cartItems);
    setCartCount(getCartCount());
  };

  const handleRemoveFromCart = (productId) => {
    removeFromCart(productId);
    loadCart();
    if (toast.current) {
      toast.current.show({
        severity: 'info',
        summary: 'Removed',
        detail: 'Item removed from cart',
        life: 2000
      });
    }
  };

  const handleUpdateQuantity = (productId, quantity) => {
    updateCartItemQuantity(productId, quantity);
    loadCart();
  };

  const handleIncreaseQuantity = (item) => {
    const maxQuantity = item.totalSqft || 999999;
    if ((item.quantity || 1) < maxQuantity) {
      handleUpdateQuantity(item.id, (item.quantity || 1) + 1);
    }
  };

  const handleDecreaseQuantity = (item) => {
    if ((item.quantity || 1) > 1) {
      handleUpdateQuantity(item.id, (item.quantity || 1) - 1);
    }
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (cartCount === 0) {
    return (
      <div className="cart-modal-overlay" onClick={handleOverlayClick}>
        <div className="cart-modal" onClick={(e) => e.stopPropagation()}>
          <div className="cart-modal-header">
            <button className="cart-modal-close" onClick={onClose}>
              <i className="pi pi-times"></i>
            </button>
            <h2 className="cart-modal-title">My Cart (0)</h2>
          </div>
          <div className="cart-modal-content-empty">
            <i className="pi pi-shopping-cart" style={{ fontSize: '4rem', color: '#ccc', marginBottom: '20px' }}></i>
            <h3>Your cart is empty</h3>
            <p>Start adding items to your cart to see them here.</p>
            <Button
              label="Continue Shopping"
              icon="pi pi-arrow-left"
              onClick={onClose}
              className="cart-continue-btn"
            />
          </div>
        </div>
      </div>
    );
  }

  const subtotal = cart.reduce((sum, item) => {
    // Use pricePerSqftAfter as the final price after all expenses
    const price = item.pricePerSqftAfter || item.price || 0;
    return sum + (price * (item.quantity || 0));
  }, 0);

  const taxRateNum = taxRate === '' ? 0 : (typeof taxRate === 'number' ? taxRate : parseFloat(taxRate) || 0);
  const tax = (subtotal * taxRateNum) / 100;
  const total = Math.max(0, subtotal + tax - (discountAmount || 0));
  const labourChargeNum = typeof labourCharge === 'number' ? labourCharge : (parseFloat(labourCharge) || 0);
  const transportationChargeNum = typeof transportationCharge === 'number' ? transportationCharge : (parseFloat(transportationCharge) || 0);
  const grandTotal = total + labourChargeNum + transportationChargeNum;

  const formatCartItemsForBilling = (cartItems) => {
    return cartItems.map(item => {
      // Use pricePerSqftAfter as the final price after all expenses
      // Ensure price is a valid number and greater than 0
      let price = item.pricePerSqftAfter || item.price || 0;
      // Convert to number if it's a string
      price = typeof price === 'string' ? parseFloat(price) : price;
      // Ensure it's a valid positive number
      if (typeof price !== 'number' || isNaN(price) || price <= 0) {
        console.error('Invalid price for item:', item, 'price:', price);
        throw new Error(`Item "${item.title || item.name || 'Unknown'}" has an invalid price. Please remove it from cart and add it again.`);
      }
      
      const formattedItem = {
        itemName: item.title || item.name || item.productName || 'Unknown Product',
        category: item.type || item.category || '',
        pricePerUnit: price, // Backend expects 'pricePerUnit' field name, must be > 0
        quantity: item.quantity || item.sqftOrdered || 1
      };
      // Add productId if available (optional field)
      if (item.productId || item.id) {
        formattedItem.productId = item.productId || item.id;
      }
      return formattedItem;
    });
  };

  const handleCheckout = async () => {
    // Validate required fields
    if (!customerName || customerName.trim() === '') {
      setSubmitError('Please enter customer name');
      return;
    }

    if (!mobileNumber || mobileNumber.length !== 10) {
      setSubmitError('Please enter a valid mobile number (exactly 10 digits)');
      return;
    }

    if (!addressLine1 || addressLine1.trim() === '') {
      setSubmitError('Please enter address line 1');
      return;
    }

    if (!city || city.trim() === '') {
      setSubmitError('Please enter city');
      return;
    }

    if (!state || state.trim() === '') {
      setSubmitError('Please enter state');
      return;
    }

    if (!pincode || pincode.length !== 6) {
      setSubmitError('Please enter a valid 6-digit pincode');
      return;
    }

    // Validate cart items
    if (!cart || cart.length === 0) {
      setSubmitError('Cart is empty. Please add items to create a bill.');
      return;
    }

    // Validate each item has required fields
    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      if (!item.title && !item.name && !item.productName) {
        setSubmitError(`Item ${i + 1}: Item name is required`);
        return;
      }
      // Check pricePerSqftAfter first, then fallback to price
      let itemPrice = item.pricePerSqftAfter || item.price || 0;
      // Convert to number if it's a string
      itemPrice = typeof itemPrice === 'string' ? parseFloat(itemPrice) : itemPrice;
      // Ensure it's a valid positive number
      if (typeof itemPrice !== 'number' || isNaN(itemPrice) || itemPrice <= 0) {
        setSubmitError(`Item ${i + 1}: Price per unit is required and must be greater than 0`);
        return;
      }
      if (!item.type && !item.category) {
        setSubmitError(`Item ${i + 1}: Category is required`);
        return;
      }
    }

    // Validate tax percentage
    if (taxRate === '' || taxRate === null || taxRate === undefined) {
      setSubmitError('Tax percentage is required');
      return;
    }

    setSubmitError('');

    // Format address
    const address = `${addressLine1}, ${city}, ${state} - ${pincode}`;

    // Determine if GST bill based on GSTIN presence
    const isGST = billType === 'GST' || (gstin && gstin.trim() !== '');
    const finalBillType = isGST ? 'GST' : 'NON-GST';
    const gstRate = isGST ? (taxRateNum > 0 ? taxRateNum : 18) : 0;

    // Prepare bill data - matching backend API structure
    const billData = {
      customerMobileNumber: mobileNumber,
      customerName: customerName.trim(),
      address: address, // Backend expects 'address', not 'customerAddress'
      gstin: gstin.trim() || null,
      customerEmail: email.trim() || null,
      items: formatCartItemsForBilling(cart),
      taxPercentage: taxRateNum,
      discountAmount: discountAmount || 0,
      totalAmount: total,
      labourCharge: labourChargeNum || 0,
      transportationCharge: transportationChargeNum || 0,
      grandTotal: grandTotal
      // Note: subtotal, taxAmount, billType, gstRate are calculated on backend if needed
    };

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/bills`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(billData)
      });

      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to create bill: ${response.status}`;
        
        // Try to parse validation errors from backend
        try {
          const errorJson = JSON.parse(errorText);
          if (typeof errorJson === 'object' && errorJson !== null) {
            // If it's a validation error object with field-specific errors
            const validationErrors = Object.entries(errorJson)
              .map(([field, message]) => `${field}: ${message}`)
              .join('\n');
            if (validationErrors) {
              errorMessage = `Validation errors:\n${validationErrors}`;
            } else if (errorJson.message) {
              errorMessage = errorJson.message;
            }
          } else if (typeof errorJson === 'string') {
            errorMessage = errorJson;
          }
        } catch (e) {
          // If not JSON, use the text as is
          if (errorText) {
            errorMessage = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText;
          }
        }
        
        throw new Error(errorMessage);
      }

      const createdBill = await response.json();

      // Success - clear all inputs and cart
      setCustomerName('');
      setMobileNumber('');
      setEmail('');
      setAddressLine1('');
      setCity('');
      setState('');
      setPincode('');
      setGstin('');
      setTaxRate(5);
      setDiscountAmount(0);
      setBillType('NON-GST');
      setLabourCharge(0);
      setTransportationCharge(0);
      clearCart();
      loadCart();

      if (toast.current) {
        toast.current.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Bill created successfully!',
          life: 3000
        });
      }

      // Call callback if provided
      if (onBillCreated) {
        onBillCreated(createdBill);
      }

      // Close modal after a short delay
      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (error) {
      console.error('Error creating bill:', error);
      setSubmitError(error.message || 'Failed to create bill. Please try again.');
      if (toast.current) {
        toast.current.show({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to create bill',
          life: 5000
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cart-modal-overlay" onClick={handleOverlayClick}>
      <Toast ref={toast} />
      <div className="cart-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cart-modal-header">
          <button className="cart-modal-close" onClick={onClose}>
            <i className="pi pi-times"></i>
          </button>
          <h2 className="cart-modal-title">My Cart ({cartCount})</h2>
          <button className="cart-modal-clear" onClick={() => {
            if (window.confirm('Are you sure you want to clear the cart?')) {
              clearCart();
              loadCart();
            }
          }}>
            <i className="pi pi-trash"></i>
          </button>
        </div>

        <div className="cart-modal-content">
          <div className="cart-items-list">
            {cart.map((item) => (
              <div key={item.id} className="cart-item-card">
                <button
                  className="cart-item-remove"
                  onClick={() => handleRemoveFromCart(item.id)}
                  title="Remove Item"
                >
                  <i className="pi pi-times"></i>
                </button>
                {item.img ? (
                  <img src={item.img} alt={item.title} className="cart-item-image" />
                ) : (
                  <div className="cart-item-image-placeholder">
                    <i className="pi pi-image"></i>
                  </div>
                )}
                <div className="cart-item-info">
                  <h3 className="cart-item-name">{item.title}</h3>
                  {item.type && <p className="cart-item-category">{item.type}</p>}
                  <div className="cart-item-pricing">
                    {/* Use pricePerSqftAfter as the final price after all expenses */}
                    {(() => {
                      const price = item.pricePerSqftAfter || item.price || 0;
                      return (
                        <>
                          <span className="cart-item-price">₹ {(price * (item.quantity || 0)).toLocaleString('en-IN')}</span>
                          <span className="cart-item-unit-price">₹ {price.toLocaleString('en-IN')} / {item.unit || 'sqft'}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="cart-item-qty">
                  <button
                    className="qty-btn minus"
                    onClick={() => handleDecreaseQuantity(item)}
                    disabled={(item.quantity || 1) <= 1}
                  >
                    <i className="pi pi-minus"></i>
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={item.totalSqft || 999999}
                    value={item.quantity || 1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      const maxQty = item.totalSqft || 999999;
                      handleUpdateQuantity(item.id, Math.min(Math.max(1, val), maxQty));
                    }}
                    className="qty-input"
                  />
                  <button
                    className="qty-btn plus"
                    onClick={() => handleIncreaseQuantity(item)}
                    disabled={(item.quantity || 1) >= (item.totalSqft || 999999)}
                  >
                    <i className="pi pi-plus"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Section */}
          <div className="cart-summary">
            <div className="summary-row">
              <span className="summary-label">Subtotal</span>
              <span className="summary-value">₹ {subtotal.toLocaleString('en-IN')}</span>
            </div>

            <div className="summary-row editable-tax">
              <span className="summary-label">Tax (%):</span>
              <div className="tax-input-wrapper">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || val === null || val === undefined) {
                      setTaxRate('');
                      return;
                    }
                    const parsed = parseFloat(val);
                    if (!isNaN(parsed)) {
                      setTaxRate(Math.max(0, Math.min(100, parsed)));
                    } else {
                      setTaxRate('');
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val === '' || val === null || val === undefined) {
                      setTaxRate(0);
                      return;
                    }
                    let cleaned = val.replace(/^0+/, '');
                    if (cleaned === '') {
                      cleaned = '0';
                    }
                    const parsed = parseFloat(cleaned);
                    if (!isNaN(parsed)) {
                      setTaxRate(Math.max(0, Math.min(100, parsed)));
                    } else {
                      setTaxRate(0);
                    }
                  }}
                  className="tax-input"
                />
                <span className="summary-value tax-amount">₹ {tax.toFixed(2)}</span>
              </div>
            </div>

            <div className="summary-row editable-discount">
              <span className="summary-label">Discount Amount:</span>
              <div className="discount-input-wrapper">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="discount-input"
                />
                <span className="summary-value discount-amount" style={{ color: '#10b981' }}>- ₹ {(discountAmount || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="summary-row editable-field">
              <span className="summary-label">Bill Type:</span>
              <select
                value={billType}
                onChange={(e) => setBillType(e.target.value)}
                className="bill-type-select"
              >
                <option value="NON-GST">NON-GST</option>
                <option value="GST">GST</option>
              </select>
            </div>

            <div className="summary-row editable-field">
              <span className="summary-label">Mobile Number:</span>
              <input
                type="tel"
                placeholder="Enter mobile (10 digits)"
                value={mobileNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setMobileNumber(value);
                }}
                className="mobile-input"
                maxLength={10}
              />
            </div>

            <div className="summary-row editable-discount">
              <span className="summary-label">Labour Charge:</span>
              <div className="discount-input-wrapper">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={labourCharge}
                  onChange={(e) => setLabourCharge(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="discount-input"
                  placeholder="0"
                />
                <span className="summary-value">₹ {(labourChargeNum || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="summary-row editable-discount">
              <span className="summary-label">Transportation Charge:</span>
              <div className="discount-input-wrapper">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={transportationCharge}
                  onChange={(e) => setTransportationCharge(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="discount-input"
                  placeholder="0"
                />
                <span className="summary-value">₹ {(transportationChargeNum || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Customer Information Section */}
          <div className="customer-info-section">
            <h3>Customer Information</h3>
            <div className="customer-form">
              <div className="form-row">
                <label>Name: *</label>
                <InputText
                  placeholder="Enter name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value.slice(0, 100))}
                  className="customer-input"
                />
              </div>

              <div className="form-row">
                <label>Email:</label>
                <InputText
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="customer-input"
                />
              </div>

              <div className="form-row">
                <label>Address: *</label>
                <InputText
                  placeholder="Enter address line 1"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="customer-input"
                />
              </div>

              <div className="form-row-group">
                <div className="form-row">
                  <label>City: *</label>
                  <InputText
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="customer-input"
                  />
                </div>
                <div className="form-row">
                  <label>State: *</label>
                  <InputText
                    placeholder="State"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="customer-input"
                  />
                </div>
              </div>

              <div className="form-row-group">
                <div className="form-row">
                  <label>Pincode: *</label>
                  <InputText
                    placeholder="Pincode"
                    value={pincode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setPincode(value);
                    }}
                    className="customer-input"
                    maxLength={6}
                  />
                </div>
                <div className="form-row">
                  <label>GSTIN:</label>
                  <InputText
                    placeholder="GSTIN (optional)"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.slice(0, 20))}
                    className="customer-input"
                    maxLength={20}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="summary-total">
            <span className="total-label">Total (After Tax & Discount)</span>
            <span className="total-value">₹ {total.toFixed(2)}</span>
          </div>

          <div className="summary-total" style={{ marginTop: '8px', borderTop: '2px solid #e5e7eb', paddingTop: '8px' }}>
            <span className="total-label">Grand Total</span>
            <span className="total-value" style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#2563eb' }}>₹ {grandTotal.toFixed(2)}</span>
          </div>

          {/* Checkout Button */}
          <Button
            label={isSubmitting ? 'Creating Bill...' : 'Create Bill'}
            icon={isSubmitting ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
            onClick={handleCheckout}
            className="cart-checkout-btn"
            disabled={isSubmitting || cart.length === 0}
            style={{ width: '100%', marginTop: '16px' }}
          />

          {submitError && (
            <div className="error-message">
              <i className="pi pi-exclamation-triangle"></i>
              <span>{submitError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

