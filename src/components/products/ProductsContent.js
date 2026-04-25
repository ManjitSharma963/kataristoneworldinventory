import React from 'react';
import ProductCard from './ProductCard';

const EmptyState = ({ icon, title, subtitle }) => (
  <div className="no-products">
    <i className={icon} style={{ fontSize: '3rem', color: '#999', marginBottom: '1rem' }} />
    <h4>{title}</h4>
    <p>{subtitle}</p>
  </div>
);

const ProductsContent = ({ loading, products, filteredProducts, onAddToCart }) => {
  if (loading) {
    return (
      <div className="products-loading">
        <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem', color: '#667eea' }} />
        <p>Loading products...</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon="pi pi-inbox"
        title="No products found"
        subtitle="No products are available at the moment."
      />
    );
  }

  if (filteredProducts.length === 0) {
    return (
      <EmptyState
        icon="pi pi-search-minus"
        title="No matching products"
        subtitle="Try a different search term (name, type or color)."
      />
    );
  }

  return (
    <div className="products-grid">
      {filteredProducts.map((product) => (
        <ProductCard
          key={product.id || `product-${product.name || product.title || 'unknown'}`}
          product={product}
          onAddToCart={onAddToCart}
        />
      ))}
    </div>
  );
};

export default ProductsContent;

