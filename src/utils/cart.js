// Simple cart utility using localStorage
const CART_STORAGE_KEY = 'inventory_cart';

export const MIN_CART_QTY = 0.01;

/** Max quantity when stock is unknown (legacy cart lines without totalSqft). */
const UNLIMITED_MAX_QTY = 999999;

/**
 * Resolved on-hand stock from product API fields. Returns null if not provided (do not cap).
 */
export const resolveProductStock = (product) => {
  if (!product) return null;
  // Keep in sync with Products.js / inventory table: API often sends on-hand qty as `quantity`.
  const v =
    product.totalSqftStock ??
    product.total_sqft_stock ??
    product.quantity ??
    product.totalSqft ??
    product.total_sqft;
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
};

/** Stock cap from a cart line (totalSqft). Null = unknown / not capped. */
export const getCartItemStockCap = (item) => {
  if (item == null) return null;
  const raw = item.totalSqft;
  if (raw === undefined || raw === null || raw === '') return null;
  const s = Number(raw);
  if (!Number.isFinite(s)) return null;
  return Math.round(s * 100) / 100;
};

/** Upper bound for cart quantity for this line (respects MIN_CART_QTY when stock &gt; 0). */
export const getCartItemMaxQuantity = (item) => {
  const cap = getCartItemStockCap(item);
  if (cap === null) return UNLIMITED_MAX_QTY;
  if (cap <= 0) return 0;
  return Math.max(MIN_CART_QTY, cap);
};

export const getCart = () => {
  try {
    const cart = localStorage.getItem(CART_STORAGE_KEY);
    return cart ? JSON.parse(cart) : [];
  } catch (error) {
    console.error('Error reading cart from localStorage:', error);
    return [];
  }
};

export const saveCart = (cart) => {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (error) {
    console.error('Error saving cart to localStorage:', error);
  }
};

const normalizeQuantity = (q) => {
  const n = typeof q === 'number' ? q : parseFloat(String(q).replace(/^0+(?=\d)/, ''));
  const num = Number(n);
  return isNaN(num) || num < MIN_CART_QTY ? MIN_CART_QTY : Math.round(num * 100) / 100;
};

export const addToCart = (product, quantity = 1) => {
  const cart = getCart();
  const existingItem = cart.find(item => item.id === product.id);
  const qty = normalizeQuantity(quantity);
  const stockCap = resolveProductStock(product);

  if (existingItem) {
    if (stockCap !== null) {
      existingItem.totalSqft = stockCap;
    }
    existingItem.quantity = normalizeQuantity((existingItem.quantity || 0) + qty);
    existingItem.sqftOrdered = existingItem.quantity;
    const maxQ = getCartItemMaxQuantity(existingItem);
    if (maxQ === 0) {
      existingItem.quantity = 0;
      existingItem.sqftOrdered = 0;
    } else if (existingItem.quantity > maxQ) {
      existingItem.quantity = maxQ;
      existingItem.sqftOrdered = maxQ;
    }
  } else {
    const unit = product.unit || 'sqft';
    // Use pricePerSqftAfter as the final price after all expenses
    const price = product.pricePerSqftAfter || product.pricePerSqft || product.pricePerUnit || product.price_per_sqft || 0;
    const line = {
      id: product.id,
      title: product.name || product.title || 'Unnamed Product',
      img: product.primaryImageUrl || product.primary_image_url || product.img || product.image_url || '',
      price: price,
      pricePerSqftAfter: price, // Store for reference
      quantity: qty,
      sqftOrdered: qty, // For compatibility
      unit: unit,
      type: product.productType || product.product_type || product.productTypeString || 'other',
      productId: product.id
    };
    if (stockCap !== null) {
      line.totalSqft = stockCap;
    }
    const maxQ = getCartItemMaxQuantity(line);
    if (maxQ === 0) {
      line.quantity = 0;
      line.sqftOrdered = 0;
    } else if (line.quantity > maxQ) {
      line.quantity = maxQ;
      line.sqftOrdered = maxQ;
    }
    cart.push(line);
  }

  saveCart(cart);
  return cart;
};

export const removeFromCart = (productId) => {
  const cart = getCart();
  const filtered = cart.filter(item => item.id !== productId);
  saveCart(filtered);
  return filtered;
};

export const updateCartItemQuantity = (productId, quantity) => {
  const cart = getCart();
  const item = cart.find(item => item.id === productId);
  if (item) {
    const maxQuantity = getCartItemMaxQuantity(item);
    const num = typeof quantity === 'number' ? quantity : parseFloat(String(quantity).replace(/^0+(?=\d)/, ''));
    let clamped;
    if (maxQuantity === 0) {
      clamped = 0;
    } else if (isNaN(num) || num < MIN_CART_QTY) {
      clamped = MIN_CART_QTY;
    } else {
      clamped = Math.min(num, maxQuantity);
    }
    item.quantity = Math.round(clamped * 100) / 100; // allow decimals, 2 places
    item.sqftOrdered = item.quantity; // For compatibility
    saveCart(cart);
  }
  return cart;
};

export const clearCart = () => {
  saveCart([]);
  return [];
};

export const getCartCount = () => {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
};

export const getCartTotal = () => {
  const cart = getCart();
  return cart.reduce((sum, item) => {
    // Use pricePerSqftAfter as the final price after all expenses
    const price = item.pricePerSqftAfter || item.price || 0;
    return sum + (price * (item.quantity || 0));
  }, 0);
};

