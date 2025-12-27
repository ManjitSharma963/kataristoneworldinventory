import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { handleApiResponse } from '../utils/api';
import { addToCart, getCartCount } from '../utils/cart';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import CartModal from './CartModal';
import 'primereact/resources/themes/lara-light-cyan/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import './Products.css';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [showCartModal, setShowCartModal] = useState(false);
  const toast = React.useRef(null);

  useEffect(() => {
    loadProducts();
    updateCartCount();
    // Listen for cart updates
    const interval = setInterval(updateCartCount, 1000);
    return () => clearInterval(interval);
  }, []);

  const updateCartCount = () => {
    setCartCount(getCartCount());
  };

  const handleAddToCart = (product) => {
    try {
      addToCart(product, 1);
      updateCartCount();
      if (toast.current) {
        toast.current.show({
          severity: 'success',
          summary: 'Added to Cart',
          detail: `${product.name || 'Product'} added to cart`,
          life: 3000
        });
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      if (toast.current) {
        toast.current.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to add product to cart',
          life: 3000
        });
      }
    }
  };

  const handleBillCreated = () => {
    updateCartCount();
    // Reload products to update stock after bill creation
    loadProducts();
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_BASE_URL}/inventory`, {
        method: 'GET',
        headers: headers
      });
      
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setProducts(Array.isArray(data) ? data : []);
      } else {
        console.error('Failed to fetch products:', response.status);
        setProducts([]);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get product type
  const getProductType = (product) => {
    return (product.productType || product.product_type || product.productTypeString || '').toLowerCase() || 'other';
  };

  // Helper function to get product color
  const getProductColor = (product) => {
    return (product.color || '').toLowerCase() || 'multi';
  };

  // Helper function to get product unit
  const getProductUnit = (product) => {
    return product.unit || 'sqft';
  };

  return (
    <div className="products-container">
      <Toast ref={toast} />
      <div className="products-header">
        <h2>Products to Buy</h2>
        <Button
          icon="pi pi-shopping-cart"
          label={cartCount > 0 ? `Cart (${cartCount})` : 'Cart'}
          onClick={() => setShowCartModal(true)}
          className="cart-header-btn"
          badge={cartCount > 0 ? cartCount.toString() : null}
          badgeClassName="cart-badge-count"
        />
      </div>

      <div className="products-section">
        {loading ? (
          <div className="products-loading">
            <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem', color: '#667eea' }}></i>
            <p>Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="no-products">
            <i className="pi pi-inbox" style={{ fontSize: '3rem', color: '#999', marginBottom: '1rem' }}></i>
            <h4>No products found</h4>
            <p>No products are available at the moment.</p>
          </div>
        ) : (
          <div className="products-grid">
            {products.map((product) => {
              const productType = getProductType(product);
              const productColor = getProductColor(product);
              const unit = getProductUnit(product);
              const price = product.pricePerSqftAfter || product.pricePerSqftAfter || product.pricePerSqftAfter || 0;
              const stock = product.totalSqftStock || product.quantity || product.total_sqft_stock || 0;
              const imageUrl = product.primaryImageUrl || product.primary_image_url || product.img || product.image_url || '';
              const productName = product.name || product.title || 'Unnamed Product';

              return (
                <div key={product.id || `product-${product.name}`} className="product-card">
                  <div className="product-image-wrapper">
                    {imageUrl ? (
                      <img src={imageUrl} alt={productName} className="product-image" />
                    ) : (
                      <div className="product-image-placeholder">
                        <i className="pi pi-image" style={{ fontSize: '3rem', color: '#ccc' }}></i>
                      </div>
                    )}
                    <div className="product-badge">{productType}</div>
                  </div>
                  <div className="product-content">
                    <h4 className="product-name">{productName}</h4>
                    <div className="product-meta">
                      <span style={{ textTransform: 'capitalize' }}>{productType}</span>
                      {productColor && productColor !== 'multi' && (
                        <span style={{ textTransform: 'capitalize' }}>{productColor}</span>
                      )}
                    </div>
                    <div className="product-price">
                      ₹{price.toLocaleString('en-IN')}
                      <span className="price-unit">/ {unit}</span>
                    </div>
                    {stock > 0 && (
                      <div className="product-stock">
                        <i className="pi pi-warehouse"></i>
                        {stock} {unit} in stock
                      </div>
                    )}
                    <Button
                      label="Add to Cart"
                      icon="pi pi-shopping-cart"
                      onClick={() => handleAddToCart(product)}
                      className="product-add-to-cart-btn"
                      disabled={stock === 0}
                      style={{ width: '100%', marginTop: '12px' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CartModal
        isOpen={showCartModal}
        onClose={() => {
          setShowCartModal(false);
          updateCartCount();
        }}
        onBillCreated={handleBillCreated}
      />
    </div>
  );
};

export default Products;

