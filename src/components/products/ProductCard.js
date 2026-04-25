import React from 'react';
import { Button } from 'primereact/button';
import { isAdmin } from '../../utils/api';

const getProductType = (product) =>
  (product.productType || product.product_type || product.productTypeString || '').toLowerCase() || 'other';
const getProductColor = (product) => (product.color || '').toLowerCase() || 'multi';
const getProductUnit = (product) => product.unit || 'sqft';

const ProductCard = ({ product, onAddToCart }) => {
  const productType = getProductType(product);
  const productColor = getProductColor(product);
  const unit = getProductUnit(product);
  const price = product.pricePerSqftAfter || product.pricePerSqftAfter || product.pricePerSqftAfter || 0;
  const stock = product.totalSqftStock || product.quantity || product.total_sqft_stock || 0;
  const imageUrl = product.primaryImageUrl || product.primary_image_url || product.img || product.image_url || '';
  const productName = product.name || product.title || 'Unnamed Product';

  return (
    <div className="product-card">
      <div className="product-image-wrapper">
        {imageUrl ? (
          <img src={imageUrl} alt={productName} title={productName} className="product-image" />
        ) : (
          <div className="product-image-placeholder">
            <i className="pi pi-image" style={{ fontSize: '3rem', color: '#ccc' }} />
          </div>
        )}
        <div className="product-badge">{productType}</div>
      </div>
      <div className="product-content">
        <h4 className="product-name" title={productName}>
          {productName}
        </h4>
        <div className="product-meta">
          <span style={{ textTransform: 'capitalize' }}>{productType}</span>
          {productColor && productColor !== 'multi' && (
            <span style={{ textTransform: 'capitalize' }}>{productColor}</span>
          )}
        </div>
        {isAdmin() && (
          <div className="product-price">
            ₹{price.toLocaleString('en-IN')}
            <span className="price-unit">/ {unit}</span>
          </div>
        )}
        {stock > 0 && (
          <div className="product-stock">
            <i className="pi pi-warehouse" />
            {stock} {unit} in stock
          </div>
        )}
        <Button
          label="Add to Cart"
          icon="pi pi-shopping-cart"
          onClick={() => onAddToCart(product)}
          className="product-add-to-cart-btn"
          disabled={stock === 0}
          style={{ width: '100%', marginTop: '12px' }}
        />
      </div>
    </div>
  );
};

export default ProductCard;

