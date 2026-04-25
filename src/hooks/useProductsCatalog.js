import { useEffect, useMemo, useState } from 'react';
import { addToCart, getCartCount } from '../utils/cart';
import { isAdmin } from '../utils/api';
import { fetchProductsCatalog } from '../api/productsApi';

const getProductName = (product) => product.name || product.title || '';
const getProductType = (product) =>
  (product.productType || product.product_type || product.productTypeString || '').toLowerCase() || 'other';
const getProductColor = (product) => (product.color || '').toLowerCase() || 'multi';

export const useProductsCatalog = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);

  const refreshCartCount = () => {
    setCartCount(getCartCount());
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const list = await fetchProductsCatalog();
      setProducts(list);
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    refreshCartCount();
    const interval = setInterval(refreshCartCount, 1000);
    return () => clearInterval(interval);
  }, []);

  const addProductToCart = (product) => {
    const productForCart = isAdmin()
      ? product
      : { ...product, pricePerSqftAfter: 0, pricePerSqft: 0, price: 0 };
    addToCart(productForCart, 1);
    refreshCartCount();
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      const name = getProductName(product).toLowerCase();
      const type = getProductType(product);
      const color = getProductColor(product);
      return name.includes(q) || type.includes(q) || color.includes(q);
    });
  }, [products, searchQuery]);

  return {
    products,
    filteredProducts,
    loading,
    searchQuery,
    setSearchQuery,
    cartCount,
    refreshCartCount,
    loadProducts,
    addProductToCart,
  };
};

