import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  computeGstSplit,
  resolveDeliveryState,
  SELLER_STATE,
} from '../utils/gst';
import {
  getCart,
  saveCart,
  removeFromCart,
  resetCartSession,
  getCartCount,
  getCartItemStockCap,
  getCartItemMaxQuantity,
  MIN_CART_QTY
} from '../utils/cart';
import { API_BASE_URL } from '../config/api';
import { handleApiResponse, isAdmin, fetchCustomerByPhone, fetchCustomerAdvanceSummary } from '../utils/api';
import { formatCompositeAddress, mergeAddressFromSources } from '../utils/addressUtils';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';
import 'primereact/resources/themes/lara-light-cyan/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import './CartModal.css';

const parsePayInput = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(parseFloat(String(v).replace(/[^\d.]/g, '')));
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100) / 100;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const RUPEE = '\u20B9';

/** Strip leading zeros from numeric string input (e.g. "00001" ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "1"). */
const stripLeadingZeros = (str) => {
  if (str === '' || str === null || str === undefined) return str;
  const s = String(str).trim();
  let out = s.replace(/^0+(?=\d)|^0+(?=\.\d)/, '');
  if (out.startsWith('.')) out = '0' + out;
  return out === '' ? '0' : out;
};

/** Discount field: keep user text (e.g. "0.", "0.10"); digits + one dot + max 2 decimals. */
const sanitizeDiscountInput = (raw) => {
  let s = String(raw || '').replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    const [whole, frac] = s.split('.');
    if (frac != null && frac.length > 2) s = `${whole}.${frac.slice(0, 2)}`;
  }
  if (s === '') return '';
  return stripLeadingZeros(s);
};

/** Parse discount string for totals / API (incomplete "0." ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 0 until more digits). */
const discountInputToNumber = (s) => {
  if (s === '' || s === null || s === undefined) return 0;
  const t = String(s).trim();
  if (t === '.' || t.endsWith('.')) {
    const n = parseFloat(t.slice(0, -1));
    return isNaN(n) ? 0 : Math.max(0, n);
  }
  const n = parseFloat(t);
  return isNaN(n) ? 0 : Math.max(0, n);
};

/** Single source for cart totals (items + tax/discount + charges + advance cap). */
function computeCartFinancials(
  cart,
  taxRate,
  discountAmount,
  labourCharge,
  transportationCharge,
  otherExpense,
  advanceRemaining
) {
  const subtotal = cart.reduce((sum, item) => {
    const price = item.pricePerSqftAfter || item.price || 0;
    return sum + (price * (item.quantity || 0));
  }, 0);
  const taxRateNum = taxRate === '' ? 0 : typeof taxRate === 'number' ? taxRate : parseFloat(taxRate) || 0;
  const tax = (subtotal * taxRateNum) / 100;
  const total = Math.max(0, subtotal + tax - (discountAmount || 0));
  const labourChargeNum = typeof labourCharge === 'number' ? labourCharge : parseFloat(labourCharge) || 0;
  const transportationChargeNum =
    typeof transportationCharge === 'number' ? transportationCharge : parseFloat(transportationCharge) || 0;
  const otherExpenseNum = typeof otherExpense === 'number' ? otherExpense : parseFloat(otherExpense) || 0;
  const itemsPlusCharges =
    subtotal + labourChargeNum + transportationChargeNum + otherExpenseNum;
  const grandTotal = total + labourChargeNum + transportationChargeNum + otherExpenseNum;
  const advanceWillApply =
    advanceRemaining != null && advanceRemaining > 0
      ? Math.round(Math.min(advanceRemaining, grandTotal) * 100) / 100
      : 0;
  const netDueAfterAdvance = Math.round(Math.max(0, grandTotal - advanceWillApply) * 100) / 100;
  return {
    subtotal,
    itemsPlusCharges,
    taxRateNum,
    tax,
    total,
    labourChargeNum,
    transportationChargeNum,
    otherExpenseNum,
    grandTotal,
    advanceWillApply,
    netDueAfterAdvance
  };
}

export default function CartModal({
  isOpen,
  onClose,
  onBillCreated,
  supplementaryParent = null,
  onSupplementaryCheckoutComplete,
}) {
  const [cart, setCart] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [taxRate, setTaxRate] = useState(18);
  const [discountInput, setDiscountInput] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [billType, setBillType] = useState('GST');
  const [payCash, setPayCash] = useState('');
  const [payUpi, setPayUpi] = useState('');
  const [payBank, setPayBank] = useState('');
  const [payCheque, setPayCheque] = useState('');
  const [labourCharge, setLabourCharge] = useState(0);
  const [transportationCharge, setTransportationCharge] = useState(0);
  const [otherExpense, setOtherExpense] = useState(0);
  const [gstVehicleNo, setGstVehicleNo] = useState('');
  const [gstDeliveryAddress, setGstDeliveryAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createBillNote, setCreateBillNote] = useState('');
  const [editingPriceItemId, setEditingPriceItemId] = useState(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const [editingQtyItemId, setEditingQtyItemId] = useState(null);
  const [editingQtyValue, setEditingQtyValue] = useState('');
  const [customerSectionCollapsed, setCustomerSectionCollapsed] = useState(false);
  /** Remaining advance for current mobile (null = unknown / not loaded). */
  const [advanceRemaining, setAdvanceRemaining] = useState(null);
  const [oldBillPendingAmount, setOldBillPendingAmount] = useState(0);
  const toast = React.useRef(null);

  const supplementaryCheckoutKey = supplementaryParent?.parentBillId
    ? `${supplementaryParent.parentBillId}:${supplementaryParent.parentBillType || ''}`
    : '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const digits = String(mobileNumber || '').replace(/\D/g, '');
      if (digits.length !== 10) {
        setAdvanceRemaining(null);
        setOldBillPendingAmount(0);
        return;
      }
      try {
        const rawCustomer = await fetchCustomerByPhone(digits);
        const cust = rawCustomer && typeof rawCustomer === 'object' && rawCustomer.data
          ? rawCustomer.data
          : rawCustomer;
        if (cancelled) return;
        if (cust && typeof cust === 'object') {
          setCustomerName(String(cust.customerName || cust.name || ''));
          setEmail(String(cust.email || ''));
          const merged = mergeAddressFromSources({
            storedAddress: cust.address,
            city: cust.city || cust.location,
            state: cust.state,
            pincode: cust.pincode,
          });
          setAddressLine1(merged.line1);
          setCity(merged.city);
          setState(merged.state);
          setPincode(merged.pincode);
          setGstin(String(cust.gstin || ''));
        }
        if (cancelled) return;
        const rawSummary = await fetchCustomerAdvanceSummary(cust.id);
        const sum = rawSummary && typeof rawSummary === 'object' && rawSummary.data
          ? rawSummary.data
          : rawSummary;
        if (cancelled) return;
        setAdvanceRemaining(Number(sum.remaining) || 0);
        setOldBillPendingAmount(Number(sum.oldBillPendingAmount) || 0);
      } catch {
        if (!cancelled) {
          setAdvanceRemaining(0);
          setOldBillPendingAmount(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mobileNumber]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      loadCart();
    } else {
      document.body.style.overflow = '';
      setEditingPriceItemId(null);
      setEditingPriceValue('');
      setEditingQtyItemId(null);
      setEditingQtyValue('');
      setCustomerSectionCollapsed(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  /** Prefill customer / tax when opening checkout for a supplementary (exchange) bill. */
  useEffect(() => {
    if (!isOpen || !supplementaryCheckoutKey || !supplementaryParent?.parentBillId) return;
    const p = supplementaryParent;
    const digits = String(p.customerMobileNumber || '').replace(/\D/g, '').slice(-10);
    if (digits.length === 10) {
      setMobileNumber(digits);
    }
    if (p.customerName) setCustomerName(String(p.customerName).trim());
    if (p.customerEmail) setEmail(String(p.customerEmail).trim());
    if (p.gstin) setGstin(String(p.gstin).trim());
    if (p.customerAddress) {
      const merged = mergeAddressFromSources({ storedAddress: p.customerAddress });
      setAddressLine1(merged.line1);
      setCity(merged.city);
      setState(merged.state);
      setPincode(merged.pincode);
    }
    setBillType(p.parentBillType === 'GST' ? 'GST' : 'NON-GST');
    const tp = p.defaultTaxPercentage;
    if (typeof tp === 'number' && !Number.isNaN(tp) && tp >= 0) {
      setTaxRate(p.parentBillType === 'GST' ? (tp > 0 ? tp : 18) : 0);
    }
    if (p.supplementaryReason) {
      setCreateBillNote(String(p.supplementaryReason).trim().slice(0, 2000));
    }
  }, [isOpen, supplementaryCheckoutKey, supplementaryParent]);

  // Keep defaults aligned: GST => default tax 18%, Non-GST => tax 0%.
  useEffect(() => {
    if (billType === 'GST') {
      setTaxRate((prev) => {
        const n = typeof prev === 'number' ? prev : parseFloat(prev);
        return Number.isFinite(n) && n > 0 ? n : 18;
      });
    } else {
      setTaxRate(0);
    }
  }, [billType]);

  const discountAmountNum = useMemo(() => discountInputToNumber(discountInput), [discountInput]);

  const resetCheckoutFormState = useCallback(() => {
    setCustomerName('');
    setMobileNumber('');
    setEmail('');
    setAddressLine1('');
    setCity('');
    setState('');
    setPincode('');
    setGstin('');
    setTaxRate(18);
    setDiscountInput('');
    setBillType('GST');
    setPayCash('');
    setPayUpi('');
    setPayBank('');
    setPayCheque('');
    setGstVehicleNo('');
    setGstDeliveryAddress('');
    setLabourCharge(0);
    setTransportationCharge(0);
    setOtherExpense(0);
    setCreateBillNote('');
    setAdvanceRemaining(null);
    setOldBillPendingAmount(0);
    setSubmitError('');
    setEditingPriceItemId(null);
    setEditingPriceValue('');
    setEditingQtyItemId(null);
    setEditingQtyValue('');
    setCustomerSectionCollapsed(false);
  }, []);

  const clearCartAndSession = useCallback(() => {
    resetCartSession();
    resetCheckoutFormState();
    setCart([]);
    setCartCount(0);
  }, [resetCheckoutFormState]);

  const fin = useMemo(
    () =>
      computeCartFinancials(
        cart,
        taxRate,
        discountAmountNum,
        labourCharge,
        transportationCharge,
        otherExpense,
        advanceRemaining
      ),
    [
      cart,
      taxRate,
      discountAmountNum,
      labourCharge,
      transportationCharge,
      otherExpense,
      advanceRemaining
    ]
  );

  const totalPaidNow = useMemo(
    () =>
      round2(
        parsePayInput(payCash) +
          parsePayInput(payUpi) +
          parsePayInput(payBank) +
          parsePayInput(payCheque)
      ),
    [payCash, payUpi, payBank, payCheque]
  );

  const paymentRemaining = useMemo(
    () => round2(Math.max(0, fin.netDueAfterAdvance - totalPaidNow)),
    [fin.netDueAfterAdvance, totalPaidNow]
  );

  const handlePaymentFieldChange = useCallback(
    (field) => (e) => {
      const raw = stripLeadingZeros(e.target.value.replace(/[^\d.]/g, ''));
      const newAmount = parsePayInput(raw);
      const cap = round2(Math.max(0, fin.netDueAfterAdvance));
      const others = round2(
        (field !== 'cash' ? parsePayInput(payCash) : 0) +
          (field !== 'upi' ? parsePayInput(payUpi) : 0) +
          (field !== 'bank' ? parsePayInput(payBank) : 0) +
          (field !== 'cheque' ? parsePayInput(payCheque) : 0)
      );
      const maxForThis = round2(Math.max(0, cap - others));
      const clamped = Math.min(newAmount, maxForThis);
      const str = clamped === 0 ? '' : stripLeadingZeros(String(clamped));
      if (field === 'cash') setPayCash(str);
      else if (field === 'upi') setPayUpi(str);
      else if (field === 'bank') setPayBank(str);
      else setPayCheque(str);
    },
    [fin.netDueAfterAdvance, payCash, payUpi, payBank, payCheque]
  );

  /** If amount due drops (charges/discount/tax), scale payments down so total paid never exceeds due. */
  useEffect(() => {
    if (!isOpen || cart.length === 0) return;
    const cap = round2(Math.max(0, fin.netDueAfterAdvance));
    const c = parsePayInput(payCash);
    const u = parsePayInput(payUpi);
    const b = parsePayInput(payBank);
    const ch = parsePayInput(payCheque);
    const sum = round2(c + u + b + ch);
    if (sum <= cap + 0.009) return;
    if (cap <= 0) {
      if (sum > 0) {
        setPayCash('');
        setPayUpi('');
        setPayBank('');
        setPayCheque('');
      }
      return;
    }
    const scale = cap / sum;
    setPayCash(c * scale < 0.005 ? '' : String(round2(c * scale)));
    setPayUpi(u * scale < 0.005 ? '' : String(round2(u * scale)));
    setPayBank(b * scale < 0.005 ? '' : String(round2(b * scale)));
    setPayCheque(ch * scale < 0.005 ? '' : String(round2(ch * scale)));
  }, [isOpen, cart.length, fin.netDueAfterAdvance, payCash, payUpi, payBank, payCheque]);

  const loadCart = () => {
    let cartItems = getCart();
    // Normalize quantity and clamp to on-hand stock (totalSqft) when known
    cartItems = cartItems.map((item) => {
      const rawQ = Number(parseFloat(item.quantity));
      const maxQ = getCartItemMaxQuantity(item);
      let qty = Number.isFinite(rawQ) ? rawQ : 1;
      if (maxQ === 0) {
        qty = 0;
      } else {
        qty = Math.min(Math.max(MIN_CART_QTY, qty), maxQ);
      }
      qty = Math.round(qty * 100) / 100;
      const next = { ...item, quantity: qty, sqftOrdered: qty };
      if (!isAdmin()) {
        next.pricePerSqftAfter = 0;
        next.price = 0;
      }
      return next;
    });
    saveCart(cartItems);
    setCart(cartItems);
    setCartCount(getCartCount());
  };

  const handleRemoveFromCart = (productId) => {
    removeFromCart(productId);
    if (getCart().length === 0) {
      clearCartAndSession();
    } else {
      loadCart();
    }
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
    setCart((prev) => {
      const updatedCart = prev.map((item) => {
        if (item.id !== productId) return item;
        const maxQ = getCartItemMaxQuantity(item);
        const numQty = Number(parseFloat(quantity));
        if (maxQ === 0) {
          return { ...item, quantity: 0, sqftOrdered: 0 };
        }
        let normalizedQty = isNaN(numQty) || numQty < MIN_CART_QTY ? MIN_CART_QTY : numQty;
        normalizedQty = Math.min(normalizedQty, maxQ);
        normalizedQty = Math.round(normalizedQty * 100) / 100;
        return { ...item, quantity: normalizedQty, sqftOrdered: normalizedQty };
      });
      saveCart(updatedCart);
      return updatedCart;
    });
  };

  const STEP = 0.5; // decimal step for +/- buttons (e.g. 0.5 sqft)

  const handleIncreaseQuantity = (item) => {
    const maxQuantity = getCartItemMaxQuantity(item);
    if (maxQuantity === 0) return;
    const current = parseFloat(item.quantity) || MIN_CART_QTY;
    if (current < maxQuantity - 1e-9) {
      const next = Math.round((current + STEP) * 100) / 100;
      handleUpdateQuantity(item.id, Math.min(next, maxQuantity));
    }
  };

  const handleDecreaseQuantity = (item) => {
    const maxQuantity = getCartItemMaxQuantity(item);
    if (maxQuantity === 0) return;
    const current = parseFloat(item.quantity) || MIN_CART_QTY;
    if (current > MIN_CART_QTY + 1e-9) {
      const next = Math.round((current - STEP) * 100) / 100;
      handleUpdateQuantity(item.id, Math.max(MIN_CART_QTY, next));
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

  // Display number as string with no leading zeros (so input never shows "00001")
  const toDisplayNumber = (num, fallback = '') => {
    if (num === '' || num === null || num === undefined) return fallback;
    const n = Number(parseFloat(num));
    if (isNaN(n)) return fallback;
    return n.toString();
  };

  // Display price with exactly 2 decimal places (e.g. 59 -> "59.00")
  const toDisplayPrice = (num, fallback = '') => {
    if (num === '' || num === null || num === undefined) return fallback;
    const n = Number(parseFloat(num));
    if (isNaN(n)) return fallback;
    return n.toFixed(2);
  };

  // Display quantity with 2 decimal places (default 1.00) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â for editing (no grouping)
  const toDisplayQuantity = (num, fallback = '1.00') => {
    if (num === '' || num === null || num === undefined) return fallback;
    const n = Number(parseFloat(num));
    if (isNaN(n)) return fallback;
    return (Math.max(MIN_CART_QTY, n)).toFixed(2);
  };

  /** Quantity shown in cart (grouped), aligned with ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œIn stockÃƒÂ¢Ã¢â€šÂ¬Ã‚Â line */
  const formatQuantityInCart = (num, fallback = '0.00') => {
    if (num === '' || num === null || num === undefined) return fallback;
    const n = Number(parseFloat(num));
    if (isNaN(n)) return fallback;
    const v = Math.max(0, n);
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Show number without leading zeros (e.g. 1200 not 01200)
  const chargeDisplayValue = (val) => {
    if (val === '' || val === null || val === undefined) return '';
    const n = parseFloat(val);
    return isNaN(n) ? val : n;
  };

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
      const itemLabel = item.title || item.name || item.productName || `Item ${i + 1}`;
      const qOrdered = Number(parseFloat(item.quantity));
      if (!Number.isFinite(qOrdered) || qOrdered <= 0) {
        setSubmitError(`${itemLabel}: quantity must be greater than 0 (or remove the line).`);
        return;
      }
      const cap = getCartItemStockCap(item);
      const maxQ = getCartItemMaxQuantity(item);
      if (cap !== null) {
        if (maxQ === 0) {
          setSubmitError(`${itemLabel} is out of stock ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â remove it from the cart.`);
          return;
        }
        if (qOrdered > maxQ + 1e-6) {
          setSubmitError(
            `${itemLabel}: quantity (${qOrdered.toFixed(2)}) cannot exceed stock (${cap.toFixed(2)} ${item.unit || 'units'}).`
          );
          return;
        }
      }
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

    const finCo = computeCartFinancials(
      cart,
      taxRate,
      discountAmountNum,
      labourCharge,
      transportationCharge,
      otherExpense,
      advanceRemaining
    );
    const taxRateNum = finCo.taxRateNum;
    const totalCheckout = finCo.total;
    const labourChargeNum = finCo.labourChargeNum;
    const transportationChargeNum = finCo.transportationChargeNum;
    const otherExpenseNum = finCo.otherExpenseNum;
    const grandTotalCheckout = finCo.grandTotal;
    const netDueCheckout = finCo.netDueAfterAdvance;

    const cashAmt = parsePayInput(payCash);
    const upiAmt = parsePayInput(payUpi);
    const bankAmt = parsePayInput(payBank);
    const chequeAmt = parsePayInput(payCheque);
    const paidSum = round2(cashAmt + upiAmt + bankAmt + chequeAmt);
    if (paidSum - netDueCheckout > 0.015) {
      setSubmitError(
        `Total paid (${RUPEE}${paidSum.toFixed(2)}) cannot exceed amount due after advance (${RUPEE}${netDueCheckout.toFixed(2)}; final amount incl. charges ${RUPEE}${grandTotalCheckout.toFixed(2)})`
      );
      return;
    }

    const payments = [];
    if (cashAmt > 0) payments.push({ amount: cashAmt, paymentMode: 'CASH' });
    if (upiAmt > 0) payments.push({ amount: upiAmt, paymentMode: 'UPI' });
    if (bankAmt > 0) payments.push({ amount: bankAmt, paymentMode: 'BANK_TRANSFER' });
    if (chequeAmt > 0) payments.push({ amount: chequeAmt, paymentMode: 'CHEQUE' });

    const address = formatCompositeAddress({
      line1: addressLine1,
      city,
      state,
      pincode,
    });
    const isGST = billType === 'GST';
    const finalBillType = isGST ? 'GST' : 'NON-GST';

    // For GST bills, compute the intra/inter-state split so the bill payload
    // carries CGST/SGST/IGST alongside the existing taxPercentage. The total
    // tax amount (subtotal * rate) stays the same; only how it's reported.
    const taxAmountForBill = Number(finCo.tax) || 0;
    const gstSplit = isGST
      ? computeGstSplit({
          taxAmount: taxAmountForBill,
          taxRatePct: taxRateNum,
          deliveryState: resolveDeliveryState({
            deliveryAddress: gstDeliveryAddress,
            customerState: state,
            customerAddress: address,
          }),
        })
      : null;

    const supParentId = supplementaryParent?.parentBillId;
    const isSupplementaryCheckout = supParentId != null;
    const parentKindForUrl = supplementaryParent?.parentBillType === 'GST' ? 'GST' : 'NON_GST';
    const urlType = String(parentKindForUrl).replace('_', '-');
    const postUrl = isSupplementaryCheckout
      ? `${API_BASE_URL}/bills/${encodeURIComponent(urlType)}/${encodeURIComponent(supParentId)}/supplementary`
      : `${API_BASE_URL}/bills`;

    const billData = {
      billType: finalBillType,
      customerMobileNumber: mobileNumber,
      customerName: customerName.trim(),
      address,
      gstin: isGST ? (gstin.trim() || null) : null,
      customerEmail: email.trim() || null,
      items: formatCartItemsForBilling(cart),
      taxPercentage: taxRateNum,
      discountAmount: discountAmountNum,
      totalAmount: totalCheckout,
      labourCharge: labourChargeNum || 0,
      transportationCharge: transportationChargeNum || 0,
      otherExpenses: otherExpenseNum || 0,
      grandTotal: grandTotalCheckout,
      payments,
      ...(isSupplementaryCheckout && {
        supplementaryReason: String(
          supplementaryParent.supplementaryReason || 'Supplementary / exchange adjustment'
        ).slice(0, 500),
      }),
      ...(createBillNote.trim() ? { notes: createBillNote.trim().slice(0, 2000) } : {}),
      ...(billType === 'GST' && {
        vehicleNo: gstVehicleNo.trim() || null,
        deliveryAddress: gstDeliveryAddress.trim() || null,
        // Place-of-supply split. Backend can read these or recompute from
        // taxPercentage + deliveryAddress; they are duplicated for clarity
        // and for any reports that don't want to re-run the split logic.
        interState: !!(gstSplit && gstSplit.isInterState),
        placeOfSupplyState: gstSplit ? gstSplit.resolvedState : null,
        cgstRate: gstSplit ? gstSplit.cgstRate : 0,
        sgstRate: gstSplit ? gstSplit.sgstRate : 0,
        igstRate: gstSplit ? gstSplit.igstRate : 0,
        cgstAmount: gstSplit ? gstSplit.cgstAmount : 0,
        sgstAmount: gstSplit ? gstSplit.sgstAmount : 0,
        igstAmount: gstSplit ? gstSplit.igstAmount : 0,
      })
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

      const response = await fetch(postUrl, {
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
            } else if (errorJson.error) {
              errorMessage = errorJson.error;
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

      if (isSupplementaryCheckout && typeof onSupplementaryCheckoutComplete === 'function') {
        onSupplementaryCheckoutComplete();
      }

      // Success — wipe cart + all saved checkout session data
      clearCartAndSession();

      if (toast.current) {
        const adv = createdBill && (Number(createdBill.advanceUsed) || 0);
        toast.current.show({
          severity: 'success',
          summary: 'Success',
          detail:
            isSupplementaryCheckout
              ? `Supplementary bill ${createdBill?.billNumber ? `#${createdBill.billNumber}` : ''} created.` +
                  (adv > 0 ? ` Advance applied: ${RUPEE}${adv.toFixed(2)}` : '')
              : adv > 0
                ? `Bill created. Advance applied: ${RUPEE}${adv.toFixed(2)}`
                : 'Bill created successfully!',
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
            if (window.confirm('Clear the cart and reset customer & payment details?')) {
              clearCartAndSession();
            }
          }}>
            <i className="pi pi-trash"></i>
          </button>
        </div>

        {supplementaryParent?.parentBillId ? (
          <div
            style={{
              margin: '0 16px 12px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              fontSize: '13px',
              color: '#1e3a8a',
              lineHeight: 1.45,
            }}
          >
            <strong>Supplementary / exchange checkout</strong> — new lines post as a separate bill linked to parent{' '}
            <strong>#{supplementaryParent.parentBillNumber || supplementaryParent.parentBillId}</strong>. Original
            invoice and payments are not overwritten; record returns from Sales separately, then collect payment here
            for the new amount (ledger IN as a normal bill).
          </div>
        ) : null}

        <div className="cart-modal-content">
        <div className="cart-top-gst-toggle">
          <div className="summary-row editable-field cart-bill-type-toggle">
            <span className="summary-label">GST / Non-GST:</span>
            <div className="cart-bill-type-btns" role="group" aria-label="GST or Non-GST toggle (default GST)">
              <button
                type="button"
                className={`cart-bill-type-btn ${billType === 'GST' ? 'cart-bill-type-btn--on' : ''}`}
                aria-pressed={billType === 'GST'}
                onClick={() => setBillType('GST')}
              >
                <i className="pi pi-file-invoice" aria-hidden />
                GST
              </button>
              <button
                type="button"
                className={`cart-bill-type-btn ${billType !== 'GST' ? 'cart-bill-type-btn--on' : ''}`}
                aria-pressed={billType !== 'GST'}
                onClick={() => setBillType('NON-GST')}
              >
                <i className="pi pi-minus-circle" aria-hidden />
                Non-GST
              </button>
            </div>
          </div>
        </div>
          <div className="cart-items-list">
            {cart.map((item) => {
              const maxQty = getCartItemMaxQuantity(item);
              const stockCap = getCartItemStockCap(item);
              const unitLabel = item.unit || 'sqft';
              return (
              <div key={item.id} className="cart-item-card">
                <button
                  type="button"
                  className="cart-item-remove"
                  onClick={() => handleRemoveFromCart(item.id)}
                  title="Remove item"
                >
                  <i className="pi pi-times"></i>
                </button>

                <div className="cart-item-body">
                  <div className="cart-item-media">
                    {item.img ? (
                      <img src={item.img} alt="" className="cart-item-image" />
                    ) : (
                      <div className="cart-item-image-placeholder" aria-hidden>
                        <i className="pi pi-image"></i>
                      </div>
                    )}
                  </div>

                  <div className="cart-item-details">
                    <h3 className="cart-item-name">{item.title}</h3>
                    {item.type ? <p className="cart-item-category">{item.type}</p> : null}
                    <div className="cart-item-price-block">
                      <span className="cart-item-field-label">Unit price</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Unit price"
                        value={editingPriceItemId === item.id
                          ? editingPriceValue
                          : ((item.pricePerSqftAfter ?? item.price) === 0 ? '' : toDisplayPrice(item.pricePerSqftAfter ?? item.price ?? 0, ''))}
                        onFocus={() => {
                          setEditingPriceItemId(item.id);
                          setEditingPriceValue((item.pricePerSqftAfter ?? item.price) === 0 ? '' : toDisplayPrice(item.pricePerSqftAfter ?? item.price ?? 0, ''));
                        }}
                        onChange={(e) => {
                          const raw = stripLeadingZeros(e.target.value.replace(/[^\d.]/g, ''));
                          setEditingPriceValue(raw);
                          const updatedPrice = parseFloat(raw) || 0;
                          const updatedCart = cart.map((cartItem) => {
                            if (cartItem.id === item.id) {
                              return { ...cartItem, pricePerSqftAfter: updatedPrice, price: updatedPrice };
                            }
                            return cartItem;
                          });
                          setCart(updatedCart);
                          if (!isAdmin()) saveCart(updatedCart);
                        }}
                        onBlur={() => {
                          const parsed = parseFloat(editingPriceValue);
                          const rounded = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
                          const updatedCart = cart.map((cartItem) => {
                            if (cartItem.id === item.id) {
                              return { ...cartItem, pricePerSqftAfter: rounded, price: rounded };
                            }
                            return cartItem;
                          });
                          setCart(updatedCart);
                          if (!isAdmin()) saveCart(updatedCart);
                          setEditingPriceItemId(null);
                          setEditingPriceValue('');
                        }}
                        className="price-input styled-input cart-item-price-input"
                        placeholder="0.00"
                      />
                      <span className="cart-item-unit-price">
                        {RUPEE} {(Number(item.pricePerSqftAfter ?? item.price ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {unitLabel}
                      </span>
                    </div>
                  </div>

                  <div className="cart-item-qty-column">
                    <span className="cart-item-field-label">Quantity</span>
                    <div className="cart-item-qty">
                      <button
                        type="button"
                        className="qty-btn minus"
                        onClick={() => handleDecreaseQuantity(item)}
                        disabled={maxQty === 0 || (parseFloat(item.quantity) || 0) <= MIN_CART_QTY + 1e-9}
                        aria-label="Decrease quantity"
                      >
                        <i className="pi pi-minus"></i>
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Quantity"
                        min={MIN_CART_QTY}
                        step="0.01"
                        max={maxQty}
                        value={editingQtyItemId === item.id
                          ? editingQtyValue
                          : maxQty === 0
                            ? formatQuantityInCart(0)
                            : formatQuantityInCart(Number(parseFloat(item.quantity)) || MIN_CART_QTY)}
                        onFocus={() => {
                          setEditingQtyItemId(item.id);
                          setEditingQtyValue(
                            maxQty === 0
                              ? '0.00'
                              : toDisplayQuantity(Number(parseFloat(item.quantity)) || MIN_CART_QTY, '1.00')
                          );
                        }}
                        onChange={(e) => {
                          const raw = stripLeadingZeros(e.target.value.replace(/[^\d.]/g, ''));
                          setEditingQtyValue(raw === '' ? '' : raw);
                          if (maxQty === 0) {
                            handleUpdateQuantity(item.id, 0);
                            return;
                          }
                          if (raw === '' || raw === '0') {
                            handleUpdateQuantity(item.id, MIN_CART_QTY);
                            return;
                          }
                          const val = parseFloat(raw);
                          if (!isNaN(val)) {
                            const clamped = Math.min(Math.max(MIN_CART_QTY, val), maxQty);
                            handleUpdateQuantity(item.id, Math.round(clamped * 100) / 100);
                          }
                        }}
                        onBlur={() => {
                          const raw = editingQtyValue.trim();
                          if (maxQty === 0) {
                            handleUpdateQuantity(item.id, 0);
                          } else if (raw === '' || raw === '0') {
                            handleUpdateQuantity(item.id, MIN_CART_QTY);
                          } else {
                            const parsed = parseFloat(raw);
                            const rounded = isNaN(parsed)
                              ? MIN_CART_QTY
                              : Math.round(Math.min(Math.max(MIN_CART_QTY, parsed), maxQty) * 100) / 100;
                            handleUpdateQuantity(item.id, rounded);
                          }
                          setEditingQtyItemId(null);
                          setEditingQtyValue('');
                        }}
                        className="qty-input"
                        placeholder="0.00"
                        disabled={maxQty === 0}
                      />
                      <button
                        type="button"
                        className="qty-btn plus"
                        onClick={() => handleIncreaseQuantity(item)}
                        disabled={maxQty === 0 || (parseFloat(item.quantity) || 0) >= maxQty - 1e-9}
                        aria-label="Increase quantity"
                      >
                        <i className="pi pi-plus"></i>
                      </button>
                    </div>
                    {stockCap !== null && stockCap > 0 ? (
                      <span className="cart-item-qty-hint">Max {formatQuantityInCart(stockCap)} {unitLabel}</span>
                    ) : null}
                  </div>
                </div>

                <div className="cart-item-footer">
                  <div className="cart-item-stock-pill" role="status">
                    {stockCap === null ? (
                      <span className="cart-item-stock cart-item-stock-unknown">
                        <i className="pi pi-info-circle" aria-hidden /> Stock not on file - check inventory
                      </span>
                    ) : stockCap <= 0 ? (
                      <span className="cart-item-stock cart-item-stock-out">
                        <i className="pi pi-times-circle" aria-hidden /> Out of stock
                      </span>
                    ) : (
                      <span className="cart-item-stock cart-item-stock-ok">
                        <span className="cart-item-stock-label">In stock</span>
                        <span className="cart-item-stock-value">
                          {stockCap.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                          <span className="cart-item-stock-unit">{unitLabel}</span>
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="cart-item-total-box">
                    <span className="cart-item-total-label">Line total</span>
                    <span className="cart-item-total-value">
                      {RUPEE}{' '}
                      {((Number(item.pricePerSqftAfter ?? item.price ?? 0)) * (Number(parseFloat(item.quantity)) || 0)).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
            })}
          </div>

          {/* Additional Charges Card - under items */}
          <div className="cart-charges-card">
            <h3 className="cart-charges-card-title">Additional Charges</h3>
            <div className="summary-row editable-discount">
              <span className="summary-label">Labour Charge:</span>
              <div className="discount-input-wrapper">
                <input
                  type="text"
                  inputMode="decimal"
                  value={labourCharge === '' || labourCharge === 0 ? '' : toDisplayNumber(labourCharge, '')}
                  onChange={(e) => {
                    const raw = stripLeadingZeros(e.target.value.replace(/[^\d.]/g, ''));
                    if (raw === '') setLabourCharge('');
                    else setLabourCharge(Math.max(0, parseFloat(raw) || 0));
                  }}
                  className="discount-input"
                  placeholder="0"
                />
                <span className="summary-value">{RUPEE} {(fin.labourChargeNum || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="summary-row editable-discount">
              <span className="summary-label">Transportation Charge:</span>
              <div className="discount-input-wrapper">
                <input
                  type="text"
                  inputMode="decimal"
                  value={transportationCharge === '' || transportationCharge === 0 ? '' : toDisplayNumber(transportationCharge, '')}
                  onChange={(e) => {
                    const raw = stripLeadingZeros(e.target.value.replace(/[^\d.]/g, ''));
                    if (raw === '') setTransportationCharge('');
                    else setTransportationCharge(Math.max(0, parseFloat(raw) || 0));
                  }}
                  className="discount-input"
                  placeholder="0"
                />
                <span className="summary-value">{RUPEE} {(fin.transportationChargeNum || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="summary-row editable-discount">
              <span className="summary-label">Other Expense:</span>
              <div className="discount-input-wrapper">
                <input
                  type="text"
                  inputMode="decimal"
                  value={otherExpense === '' || otherExpense === 0 ? '' : toDisplayNumber(otherExpense, '')}
                  onChange={(e) => {
                    const raw = stripLeadingZeros(e.target.value.replace(/[^\d.]/g, ''));
                    if (raw === '') setOtherExpense('');
                    else setOtherExpense(Math.max(0, parseFloat(raw) || 0));
                  }}
                  className="discount-input"
                  placeholder="0"
                />
                <span className="summary-value">{RUPEE} {(fin.otherExpenseNum || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="summary-row cart-charges-total-row">
              <span className="summary-label">Item Total</span>
              <span className="summary-value">
                {RUPEE}{' '}
                {fin.itemsPlusCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Customer Information Section - contains Name, Email, Mobile Number, Address, etc. */}
          <div className={`customer-info-section ${customerSectionCollapsed ? 'customer-section-collapsed' : ''}`}>
            <button
              type="button"
              className="customer-info-header"
              onClick={() => setCustomerSectionCollapsed((c) => !c)}
              aria-expanded={!customerSectionCollapsed}
            >
              <h3>Customer Information</h3>
              <i className={`pi ${customerSectionCollapsed ? 'pi-chevron-down' : 'pi-chevron-up'}`} aria-hidden />
            </button>
            {!customerSectionCollapsed && (
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
                <label>Mobile Number: *</label>
                <input
                  type="tel"
                  placeholder="Enter mobile (10 digits)"
                  value={mobileNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setMobileNumber(value);
                  }}
                  className="customer-input mobile-input"
                  maxLength={10}
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
                {billType === 'GST' && (
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
                )}
              </div>
            </div>
            )}
          </div>

          {/* Summary Section - Tax & Bill Type only */}
          <div className="cart-summary">
            <div className="summary-row editable-tax">
              <span className="summary-label">Tax (%):</span>
              <div className="tax-input-wrapper">
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxRate === '' || taxRate === null || taxRate === undefined ? '' : toDisplayNumber(taxRate, '')}
                  onChange={(e) => {
                    const raw = stripLeadingZeros(e.target.value.replace(/[^\d.]/g, ''));
                    if (raw === '' || raw === null || raw === undefined) {
                      setTaxRate('');
                      return;
                    }
                    const parsed = parseFloat(raw);
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
                    const cleaned = stripLeadingZeros(val.replace(/[^\d.]/g, ''));
                    const parsed = parseFloat(cleaned);
                    if (!isNaN(parsed)) {
                      setTaxRate(Math.max(0, Math.min(100, parsed)));
                    } else {
                      setTaxRate(0);
                    }
                  }}
                  className="tax-input"
                  placeholder="0"
                />
                <span className="summary-value tax-amount">{RUPEE} {fin.tax.toFixed(2)}</span>
              </div>
            </div>

            {billType === 'GST' && fin.tax > 0 && (() => {
              const deliveryState = resolveDeliveryState({
                deliveryAddress: gstDeliveryAddress,
                customerState: state,
                customerAddress: formatCompositeAddress({
                  line1: addressLine1,
                  city,
                  state,
                  pincode,
                }),
              });
              const split = computeGstSplit({
                taxAmount: fin.tax,
                taxRatePct: fin.taxRateNum,
                deliveryState,
              });
              return (
                <>
                  {split.isInterState ? (
                    <div className="summary-row">
                      <span className="summary-label">
                        IGST ({split.igstRate}%)
                      </span>
                      <span className="summary-value">{RUPEE} {split.igstAmount.toFixed(2)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="summary-row">
                        <span className="summary-label">CGST ({split.cgstRate}%)</span>
                        <span className="summary-value">{RUPEE} {split.cgstAmount.toFixed(2)}</span>
                      </div>
                      <div className="summary-row">
                        <span className="summary-label">SGST ({split.sgstRate}%)</span>
                        <span className="summary-value">{RUPEE} {split.sgstAmount.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div
                    className="summary-row"
                    style={{ fontSize: '0.72rem', color: '#64748b' }}
                  >
                    <span className="summary-label">
                      {split.isInterState ? 'Inter-state supply' : 'Intra-state supply'}
                      {split.resolvedState ? ` · ${split.resolvedState}` : ' · state unknown'}
                    </span>
                    <span className="summary-value">seller: {SELLER_STATE}</span>
                  </div>
                </>
              );
            })()}

            <div className="summary-row editable-field">
              <span className="summary-label">Bill Type:</span>
              <span className="summary-value">{billType}</span>
            </div>

            <div className="cart-payment-split" role="group" aria-label="Split payment amounts">
              <div className="summary-row cart-payment-split-title">
                <span className="summary-label">Payments ({RUPEE})</span>
              </div>
              {[
                ['Cash', payCash, 'cash'],
                ['UPI', payUpi, 'upi'],
                ['Bank transfer', payBank, 'bank'],
                ['Cheque', payCheque, 'cheque']
              ].map(([label, val, field]) => (
                <div key={label} className="summary-row editable-field cart-payment-row">
                  <span className="summary-label">{label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="bill-type-select cart-payment-input"
                    placeholder="0"
                    value={val}
                    onChange={handlePaymentFieldChange(field)}
                  />
                </div>
              ))}
              <div className="summary-row cart-payment-totals">
                <span className="summary-label">Total paid</span>
                <span className="summary-value">{RUPEE} {totalPaidNow.toFixed(2)}</span>
              </div>
              <div className="summary-row cart-payment-totals">
                <span className="summary-label">Remaining</span>
                <span className={`summary-value${paymentRemaining > 0.009 ? ' cart-payment-due' : ''}`}>
                  {RUPEE} {paymentRemaining.toFixed(2)}
                </span>
              </div>
              <p className="cart-payment-hint">
                Leave fields empty or zero for credit (due). Customer advance applies before split payments. Total paid
                cannot exceed Grand Total (After Advance) (max {RUPEE}{fin.netDueAfterAdvance.toFixed(2)}).
                {paymentRemaining > 0.009 ? ' Partial payment means bill is not fully paid yet.' : ''}
              </p>
            </div>
          </div>

          {billType === 'GST' && (
            <div className="gst-bill-details-card">
              <h3 className="gst-bill-details-title">GST invoice details</h3>
              <div className="customer-form">
                <div className="form-row">
                  <label>Vehicle No</label>
                  <InputText
                    placeholder="Enter vehicle number"
                    value={gstVehicleNo}
                    onChange={(e) => setGstVehicleNo(e.target.value.slice(0, 32))}
                    className="customer-input"
                  />
                </div>
                <div className="form-row">
                  <label>Delivery Address</label>
                  <InputText
                    placeholder="Enter delivery address"
                    value={gstDeliveryAddress}
                    onChange={(e) => setGstDeliveryAddress(e.target.value.slice(0, 500))}
                    className="customer-input"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="neumorphic-card discount-section" style={{ marginTop: '1rem' }}>
            <div className="summary-row editable-discount">
              <span className="summary-label">Discount Amount:</span>
              <div className="discount-input-wrapper">
                <input
                  type="text"
                  inputMode="decimal"
                  min="0"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(sanitizeDiscountInput(e.target.value))}
                  className="discount-input"
                  placeholder="0"
                />
                <span className="summary-value discount-amount" style={{ color: '#10b981' }}>
                  - {RUPEE}{' '}
                  {discountAmountNum.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="summary-total">
            <span className="total-label">Final Amount (Incl. Labour/Transport/Other)</span>
            <span className="total-value">{'\u20B9'} {fin.grandTotal.toFixed(2)}</span>
          </div>

          <div className="summary-total summary-total-compact" style={{ marginTop: '8px' }}>
            <span className="total-label">Customer Advance Balance</span>
            <span className="total-value" style={{ color: '#0d9488' }}>
              {'\u20B9'} {Number(advanceRemaining || 0).toFixed(2)}
            </span>
          </div>

          <div className="summary-total summary-total-compact" style={{ marginTop: '8px' }}>
            <span className="total-label">Old Pending Amount</span>
            <span className="total-value" style={{ color: '#dc2626' }}>
              {'\u20B9'} {Number(oldBillPendingAmount || 0).toFixed(2)}
            </span>
          </div>

          {fin.advanceWillApply > 0 && (
            <div className="summary-total summary-total-compact" style={{ marginTop: '8px' }}>
              <span className="total-label" style={{ color: '#0d9488' }}>Advance (auto)</span>
              <span className="total-value" style={{ color: '#0d9488' }}>- {'\u20B9'} {fin.advanceWillApply.toFixed(2)}</span>
            </div>
          )}

          <div className="summary-total summary-total-compact" style={{ marginTop: '8px', borderTop: '2px solid #e5e7eb', paddingTop: '8px' }}>
            <span className="total-label">Grand Total (After Advance)</span>
            <span className="total-value" style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#2563eb' }}>{'\u20B9'} {fin.netDueAfterAdvance.toFixed(2)}</span>
          </div>

          <div className="form-row" style={{ marginTop: '12px' }}>
            <label htmlFor="create-bill-note" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              Note (optional)
            </label>
            <textarea
              id="create-bill-note"
              className="customer-input"
              rows={2}
              maxLength={2000}
              placeholder="Why this bill / internal note - stored on the bill"
              value={createBillNote}
              onChange={(e) => setCreateBillNote(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
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

