import React, { useState, useEffect, useCallback } from 'react';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import CartModal from './CartModal';
import ProductsContent from './products/ProductsContent';
import { useProductsCatalog } from '../hooks/useProductsCatalog';
import { SUPPLEMENTARY_BILL_CHECKOUT_STORAGE_KEY } from '../constants/supplementaryBillCheckout';
import 'primereact/resources/themes/lara-light-cyan/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import './Products.css';

const Products = () => {
  const [showCartModal, setShowCartModal] = useState(false);
  const [cartSupplementaryParent, setCartSupplementaryParent] = useState(null);
  const toast = React.useRef(null);
  const {
    products,
    filteredProducts,
    loading,
    searchQuery,
    setSearchQuery,
    cartCount,
    refreshCartCount,
    loadProducts,
    addProductToCart,
  } = useProductsCatalog();

  const clearSupplementaryCheckoutContext = useCallback(() => {
    try {
      sessionStorage.removeItem(SUPPLEMENTARY_BILL_CHECKOUT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setCartSupplementaryParent(null);
    setShowCartModal(false);
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SUPPLEMENTARY_BILL_CHECKOUT_STORAGE_KEY);
      if (!raw) return;
      const ctx = JSON.parse(raw);
      if (ctx && ctx.parentBillId != null && ctx.parentBillType) {
        setCartSupplementaryParent(ctx);
        setShowCartModal(true);
      }
    } catch (e) {
      console.warn('[Products] supplementary checkout context', e);
    }
  }, []);

  const handleAddToCart = (product) => {
    try {
      addProductToCart(product);
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
    refreshCartCount();
    // Reload products to update stock after bill creation
    loadProducts();
  };

  return (
    <div className="products-container">
      <Toast ref={toast} />
      <div className="products-header">
        <h2>Products to Buy</h2>
        {cartSupplementaryParent ? (
          <div
            style={{
              flex: '1 1 280px',
              maxWidth: '560px',
              margin: '0 12px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              fontSize: '13px',
              color: '#78350f',
              lineHeight: 1.4,
            }}
          >
            <strong>Exchange / supplementary mode</strong> — billing for parent invoice{' '}
            <strong>#{cartSupplementaryParent.parentBillNumber || cartSupplementaryParent.parentBillId}</strong>. Add
            items, then checkout.
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: '10px', padding: '4px 10px', fontSize: '12px' }}
              onClick={clearSupplementaryCheckoutContext}
            >
              Cancel
            </button>
          </div>
        ) : null}
        <div className="products-search-wrap">
          <i className="pi pi-search products-search-icon" aria-hidden />
          <input
            type="text"
            placeholder="Search products by name, type or color..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="products-search-input"
          />
        </div>
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
        <ProductsContent
          loading={loading}
          products={products}
          filteredProducts={filteredProducts}
          onAddToCart={handleAddToCart}
        />
      </div>

      <CartModal
        isOpen={showCartModal}
        onClose={() => {
          setShowCartModal(false);
          refreshCartCount();
        }}
        onBillCreated={handleBillCreated}
        supplementaryParent={cartSupplementaryParent}
        onSupplementaryCheckoutComplete={clearSupplementaryCheckoutContext}
      />
    </div>
  );
};

export default Products;

