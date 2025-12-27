// Simple cart utility using localStorage
const CART_STORAGE_KEY = 'inventory_cart';

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

export const addToCart = (product, quantity = 1) => {
  const cart = getCart();
  const existingItem = cart.find(item => item.id === product.id);
  
  if (existingItem) {
    existingItem.quantity = (existingItem.quantity || 0) + quantity;
    existingItem.sqftOrdered = existingItem.quantity; // For compatibility
  } else {
    const unit = product.unit || 'sqft';
    // Use pricePerSqftAfter as the final price after all expenses
    const price = product.pricePerSqftAfter || product.pricePerSqft || product.pricePerUnit || product.price_per_sqft || 0;
    const stock = product.totalSqftStock || product.quantity || product.total_sqft_stock || 0;
    
    cart.push({
      id: product.id,
      title: product.name || product.title || 'Unnamed Product',
      img: product.primaryImageUrl || product.primary_image_url || product.img || product.image_url || '',
      price: price,
      pricePerSqftAfter: price, // Store for reference
      quantity: quantity,
      sqftOrdered: quantity, // For compatibility
      unit: unit,
      totalSqft: stock,
      type: product.productType || product.product_type || product.productTypeString || 'other',
      productId: product.id
    });
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
    const maxQuantity = item.totalSqft || 999999;
    item.quantity = Math.min(Math.max(1, quantity), maxQuantity);
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

