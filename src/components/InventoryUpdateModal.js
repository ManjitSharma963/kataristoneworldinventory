import React from 'react';

/**
 * Same fields as Add inventory — loads product by id and PUTs full payload.
 */
export default function InventoryUpdateModal({
  onClose,
  categories,
  inventory,
  selectedUpdateProductId,
  setSelectedUpdateProductId,
  updateFormLoading,
  updateFormData,
  updateStockBaseline,
  updatePricingFormData,
  handleUpdateInputChange,
  updateAuditNotes,
  setUpdateAuditNotes,
  onSubmit,
  calculatePricePerSqft
}) {
  const pricing = updatePricingFormData || updateFormData;
  const resultingStock =
    (updateStockBaseline ?? 0) + (parseFloat(updateFormData.stock_quantity_to_add) || 0);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-inventory-detail modal-inventory-update-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Update inventory</h3>
            <p className="inventory-history-modal-subtitle">Edit all fields like adding a product — changes are saved with full audit history.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="inv-update-product-select">Select product *</label>
            <select
              id="inv-update-product-select"
              value={selectedUpdateProductId}
              onChange={(e) => setSelectedUpdateProductId(e.target.value)}
            >
              <option value="">Choose a product…</option>
              {inventory.map((it) => (
                <option key={it.id} value={String(it.id)}>
                  {it.name} (id {it.id})
                </option>
              ))}
            </select>
          </div>
          {updateFormLoading && <p className="inventory-history-loading">Loading product…</p>}
          {selectedUpdateProductId && !updateFormLoading && (
            <form onSubmit={onSubmit}>
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  name="name"
                  value={updateFormData.name}
                  onChange={handleUpdateInputChange}
                  maxLength="200"
                  placeholder="e.g., Carrara White Marble"
                  required
                />
              </div>
              <div className="form-group">
                <label>Slug *</label>
                <input
                  type="text"
                  name="slug"
                  value={updateFormData.slug}
                  onChange={handleUpdateInputChange}
                  maxLength="250"
                  placeholder="e.g., carrara-white-marble"
                  required
                />
                <small className="form-help">URL-friendly version (auto-generated from product name)</small>
              </div>
              <div className="form-group">
                <label>Product Type / Category *</label>
                <select
                  name="product_type"
                  value={updateFormData.product_type}
                  onChange={handleUpdateInputChange}
                  required
                >
                  <option value="">Select Category</option>
                  {categories.filter((c) => c.is_active !== false).map((cat) => (
                    <option key={cat.id} value={cat.name || cat.category_type || ''}>
                      {cat.name || cat.category_type || 'Unnamed'}
                    </option>
                  ))}
                  {updateFormData.product_type &&
                    !categories.some((c) => (c.name || c.category_type) === updateFormData.product_type) && (
                      <option value={updateFormData.product_type}>{updateFormData.product_type}</option>
                    )}
                  {categories.length === 0 && <option value="other">Other</option>}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Price Per Sqr Ft (Before Extra Expenses) (₹) *</label>
                  <input
                    type="number"
                    name="price_per_sqft"
                    value={updateFormData.price_per_sqft}
                    onChange={handleUpdateInputChange}
                    min="0"
                    step="0.01"
                    placeholder="e.g., 180.00"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Current stock on hand</label>
                  <input
                    type="text"
                    readOnly
                    className="readonly-field"
                    style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                    value={
                      updateStockBaseline != null
                        ? Number(updateStockBaseline).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })
                        : '—'
                    }
                  />
                  <small className="form-help">Loaded from inventory — not replaced by the field below</small>
                </div>
                <div className="form-group">
                  <label>Quantity to add *</label>
                  <input
                    type="number"
                    name="stock_quantity_to_add"
                    value={updateFormData.stock_quantity_to_add}
                    onChange={handleUpdateInputChange}
                    step="0.01"
                    placeholder="0 — leave 0 to keep stock unchanged"
                  />
                  <small className="form-help">
                    New saved stock = current + this amount (use a negative number to reduce stock without a sale)
                  </small>
                </div>
                <div className="form-group">
                  <label>Resulting stock (after save)</label>
                  <input
                    type="text"
                    readOnly
                    className="readonly-field"
                    style={{ backgroundColor: '#e8f4fd', cursor: 'not-allowed', fontWeight: 600 }}
                    value={Number(resultingStock).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <input
                    type="text"
                    name="unit"
                    value={updateFormData.unit}
                    onChange={handleUpdateInputChange}
                    maxLength="20"
                    placeholder="e.g., piece, sqr ft, kg, meter"
                  />
                </div>
                <div className="form-group">
                  <label>HSN Number (optional)</label>
                  <input
                    type="text"
                    name="hsn_number"
                    value={updateFormData.hsn_number}
                    onChange={handleUpdateInputChange}
                    maxLength="10"
                    placeholder="e.g., 2515, 6802"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Primary Image URL *</label>
                <input
                  type="url"
                  name="primary_image_url"
                  value={updateFormData.primary_image_url}
                  onChange={handleUpdateInputChange}
                  maxLength="500"
                  placeholder="https://example.com/image.jpg"
                  required
                />
              </div>
              <div className="form-group">
                <label>Color</label>
                <input
                  type="text"
                  name="color"
                  value={updateFormData.color}
                  onChange={handleUpdateInputChange}
                  maxLength="50"
                  placeholder="e.g., white, black, beige, multi"
                />
              </div>
              <div className="form-section-divider">
                <h4>Extra Expenses</h4>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Labour Charges (₹)</label>
                  <input
                    type="number"
                    name="labour_charges"
                    value={updateFormData.labour_charges}
                    onChange={handleUpdateInputChange}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>RTO Fees (₹)</label>
                  <input
                    type="number"
                    name="rto_fees"
                    value={updateFormData.rto_fees}
                    onChange={handleUpdateInputChange}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Damage Expenses (₹)</label>
                  <input
                    type="number"
                    name="damage_expenses"
                    value={updateFormData.damage_expenses}
                    onChange={handleUpdateInputChange}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Others Expenses (₹)</label>
                  <input
                    type="number"
                    name="others_expenses"
                    value={updateFormData.others_expenses}
                    onChange={handleUpdateInputChange}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Transportation Charge (₹)</label>
                  <input
                    type="number"
                    name="transportation_charge"
                    value={updateFormData.transportation_charge}
                    onChange={handleUpdateInputChange}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>GST Charges (₹)</label>
                  <input
                    type="number"
                    name="gst_charges"
                    value={updateFormData.gst_charges}
                    onChange={handleUpdateInputChange}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="form-section-divider">
                <h4>Price Per Sqr Ft Calculation</h4>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Price Per Sqr Ft (Before Extra Expenses)</label>
                  <input
                    type="text"
                    value={`₹${calculatePricePerSqft(updateFormData).pricePerSqftBefore}`}
                    readOnly
                    className="readonly-field"
                    style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                  />
                </div>
                <div className="form-group">
                  <label>Price Per Sqr Ft (After Extra Expenses)</label>
                  <input
                    type="text"
                    value={`₹${calculatePricePerSqft(pricing).pricePerSqftAfter}`}
                    readOnly
                    className="readonly-field"
                    style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed', fontWeight: 'bold', color: '#2c3e50' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Audit note (optional)</label>
                <input
                  type="text"
                  value={updateAuditNotes}
                  onChange={(e) => setUpdateAuditNotes(e.target.value)}
                  placeholder="e.g. GST slab change, supplier price revision"
                  maxLength="500"
                />
                <small className="form-help">Stored with this change in product history</small>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  Save changes
                </button>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
