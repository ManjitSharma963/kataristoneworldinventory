import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getInventory } from '../utils/storage';
import { API_BASE_URL } from '../config/api';
import {
  handleApiResponse,
  getInventoryEndpoint,
  fetchInventoryHistory,
  fetchProductById,
  fetchProductChangeHistory,
  updateInventoryProduct,
  isAdmin,
  fetchSuppliers,
  fetchDealers,
  createSupplier,
  createDealer
} from '../utils/api';
import './Dashboard.css';
import InventoryUpdateModal from './InventoryUpdateModal';

const ITEMS_PER_PAGE = 10;

const getPricePerUnitAfter = (item) => {
  return Number(parseFloat(item?.pricePerSqftAfter ?? item?.price_per_sqft_after ?? item?.pricePerSqft ?? item?.price_per_sqft ?? item?.pricePerUnit ?? item?.unitPrice ?? item?.price) || 0) || 0;
};

const exportToCSV = (data, filename, headers) => {
  const csvContent = [
    headers.join(','),
    ...data.map(row => Object.values(row).map(val => `"${val}"`).join(','))
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const initialFormData = {
  name: '',
  slug: '',
  product_type: '',
  price_per_sqft: '',
  total_sqft_stock: '',
  /** Update-inventory only: added to current on-hand stock (not sent as raw total). */
  stock_quantity_to_add: '0',
  unit: '',
  hsn_number: '',
  primary_image_url: '',
  color: '',
  labour_charges: '',
  rto_fees: '',
  damage_expenses: '',
  others_expenses: '',
  transportation_charge: '',
  gst_charges: '',
  supplier_id: '',
  dealer_id: ''
};

const generateSlug = (text) => {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

function formatHistoryDate(v) {
  if (v == null) return '—';
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString('en-IN');
  }
  if (Array.isArray(v) && v.length >= 3) {
    const y = v[0];
    const mo = v[1];
    const d = v[2];
    const h = v[3] ?? 0;
    const mi = v[4] ?? 0;
    const s = v[5] ?? 0;
    return new Date(y, mo - 1, d, h, mi, s).toLocaleString('en-IN');
  }
  return String(v);
}

function formatActionLabel(action) {
  if (!action) return '—';
  const u = String(action).toUpperCase();
  if (u === 'SALE') return 'Sale';
  if (u === 'ADD') return 'Add';
  if (u === 'UPDATE') return 'Update';
  if (u === 'ADJUST') return 'Adjust';
  return action;
}

function productToFormData(p) {
  if (!p) return { ...initialFormData };
  const n = (v) => (v == null || v === '' ? '' : String(v));
  return {
    name: p.name || '',
    slug: p.slug || '',
    product_type: p.productType || p.product_type || '',
    price_per_sqft: n(p.pricePerUnit ?? p.price_per_sqft),
    total_sqft_stock: n(p.quantity ?? p.totalSqftStock ?? p.total_sqft_stock),
    unit: p.unit || '',
    hsn_number: p.hsnNumber || p.hsn_number || '',
    primary_image_url: p.primaryImageUrl || p.primary_image_url || '',
    color: p.color || '',
    labour_charges: n(p.labourCharges ?? p.labour_charges),
    rto_fees: n(p.rtoFees ?? p.rto_fees),
    damage_expenses: n(p.damageExpenses ?? p.damage_expenses),
    others_expenses: n(p.othersExpenses ?? p.others_expenses),
    transportation_charge: n(p.transportationCharge ?? p.transportation_charge),
    gst_charges: n(p.gstCharges ?? p.gst_charges),
    supplier_id:
      p.supplierId != null && p.supplierId !== ''
        ? String(p.supplierId)
        : p.supplier_id != null && p.supplier_id !== ''
          ? String(p.supplier_id)
          : '',
    dealer_id:
      p.dealerId != null && p.dealerId !== ''
        ? String(p.dealerId)
        : p.dealer_id != null && p.dealer_id !== ''
          ? String(p.dealer_id)
          : ''
  };
}

function historyTimeMs(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (Array.isArray(v) && v.length >= 3) {
    const y = v[0];
    const mo = v[1];
    const d = v[2];
    const h = v[3] ?? 0;
    const mi = v[4] ?? 0;
    const s = v[5] ?? 0;
    return new Date(y, mo - 1, d, h, mi, s).getTime();
  }
  return null;
}

function snapshotQuantity(snap) {
  if (!snap || typeof snap !== 'object') return null;
  const q = snap.quantity;
  return q != null && q !== '' ? Number(q) : null;
}

/** Pick inventory_history row written for the same product update (qty delta + close time). */
function findBestMatchingInventory(pc, historyRows) {
  const t = historyTimeMs(pc.createdAt);
  if (t == null) return null;
  const prevQ = snapshotQuantity(pc.previousSnapshot);
  const nextQ = snapshotQuantity(pc.newSnapshot);
  if (prevQ == null || nextQ == null) return null;
  const delta = nextQ - prevQ;
  if (Math.abs(delta) < 0.0001) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const h of historyRows) {
    const ht = historyTimeMs(h.createdAt);
    if (ht == null) continue;
    const timeDiff = Math.abs(ht - t);
    if (timeDiff > 12000) continue;
    const hDelta = h.quantityChanged != null ? Number(h.quantityChanged) : null;
    if (hDelta == null) continue;
    if (Math.abs(hDelta - delta) > 0.02) continue;
    if (timeDiff < bestDiff) {
      bestDiff = timeDiff;
      best = h;
    }
  }
  return best;
}

function snapNum(snap, key) {
  if (!snap || typeof snap !== 'object') return null;
  const v = snap[key];
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isLikelyInitialAddDuplicate(pc, h) {
  if (!pc || !h) return false;
  const action = String(h.actionType || '').toUpperCase();
  if (action !== 'ADD') return false;
  const tPc = historyTimeMs(pc.createdAt);
  const tH = historyTimeMs(h.createdAt);
  if (tPc == null || tH == null) return false;
  if (Math.abs(tPc - tH) > 20000) return false;
  const prev = h.previousQuantity != null ? Number(h.previousQuantity) : null;
  const next = h.newQuantity != null ? Number(h.newQuantity) : null;
  if (prev == null || next == null) return false;
  if (Math.abs(prev) > 0.02) return false;
  const snapNext = snapshotQuantity(pc.newSnapshot);
  if (snapNext == null) return false;
  if (Math.abs(next - snapNext) > 0.02) return false;
  return true;
}

function cellMoney(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cellText(snap, key) {
  if (!snap || typeof snap !== 'object') return '—';
  const v = snap[key];
  if (v == null || v === '') return '—';
  return String(v);
}

/**
 * Merges product_change_history with inventory_history: each product edit is one row with full pricing;
 * standalone stock rows (sales, manual add) stay without snapshot columns.
 */
function buildUnifiedInventoryHistory(productChangeRows, historyRows) {
  const changes = Array.isArray(productChangeRows) ? productChangeRows : [];
  const stock = Array.isArray(historyRows) ? historyRows : [];
  const matchedHistoryIds = new Set();
  const rowsFromChanges = changes.map((pc) => {
    const inv = findBestMatchingInventory(
      pc,
      stock.filter((h) => !matchedHistoryIds.has(h.id))
    );
    if (inv) matchedHistoryIds.add(inv.id);
    return { kind: 'change', pc, inv };
  });
  const rowsFromStock = stock
    .filter((h) => {
      if (matchedHistoryIds.has(h.id)) return false;
      // If this is the initial ADD for create, hide it when a creation snapshot row exists.
      return !changes.some((pc) => isLikelyInitialAddDuplicate(pc, h));
    })
    .map((h) => ({ kind: 'stock', h }));
  return [...rowsFromChanges, ...rowsFromStock].sort((a, b) => {
    const ta = a.kind === 'change' ? historyTimeMs(a.pc.createdAt) : historyTimeMs(a.h.createdAt);
    const tb = b.kind === 'change' ? historyTimeMs(b.pc.createdAt) : historyTimeMs(b.h.createdAt);
    return (tb || 0) - (ta || 0);
  });
}

const InventoryItemsPage = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [showAddInventory, setShowAddInventory] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [dealers, setDealers] = useState([]);
  /** { type: 'supplier'|'dealer', target: 'add'|'update' } */
  const [quickAddEntity, setQuickAddEntity] = useState(null);
  const [quickAddForm, setQuickAddForm] = useState({ name: '', contact_number: '', address: '' });
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);
  const [detailModalProduct, setDetailModalProduct] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [productChangeRows, setProductChangeRows] = useState([]);
  const [productChangeLoading, setProductChangeLoading] = useState(false);
  const [showUpdateInventoryModal, setShowUpdateInventoryModal] = useState(false);
  const [updateFormData, setUpdateFormData] = useState(() => ({ ...initialFormData }));
  const [updateAuditNotes, setUpdateAuditNotes] = useState('');
  const [selectedUpdateProductId, setSelectedUpdateProductId] = useState('');
  const [updateFormLoading, setUpdateFormLoading] = useState(false);
  /** On-hand qty when update form loaded; saved total = baseline + stock_quantity_to_add */
  const [updateStockBaseline, setUpdateStockBaseline] = useState(null);

  const updatePricingFormData = useMemo(
    () => ({
      ...updateFormData,
      total_sqft_stock: String(
        (updateStockBaseline ?? 0) + (parseFloat(updateFormData.stock_quantity_to_add) || 0)
      )
    }),
    [updateFormData, updateStockBaseline]
  );

  const unifiedHistoryRows = useMemo(
    () => buildUnifiedInventoryHistory(productChangeRows, historyRows),
    [productChangeRows, historyRows]
  );

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}${getInventoryEndpoint()}`, { method: 'GET', headers });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setInventory(Array.isArray(data) ? data : []);
      } else {
        // Do not fall back to local cache for authenticated inventory list;
        // stale local rows can belong to a different location and cause 404 on actions.
        setInventory([]);
      }
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const fetchCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken');
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/categories`, { headers });
      if (response.ok) {
        const data = await response.json();
        setCategories(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const loadSuppliersDealers = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([fetchSuppliers(), fetchDealers()]);
      setSuppliers(Array.isArray(s) ? s : []);
      setDealers(Array.isArray(d) ? d : []);
    } catch (err) {
      console.error(err);
      setSuppliers([]);
      setDealers([]);
    }
  }, []);

  useEffect(() => {
    loadSuppliersDealers();
  }, [loadSuppliersDealers]);

  const openQuickAdd = (type, target) => {
    setQuickAddForm({ name: '', contact_number: '', address: '' });
    setQuickAddEntity({ type, target });
  };

  const closeQuickAdd = () => {
    setQuickAddEntity(null);
    setQuickAddForm({ name: '', contact_number: '', address: '' });
  };

  const handleQuickAddSubmit = async (e) => {
    e.preventDefault();
    if (!quickAddEntity) return;
    const nm = (quickAddForm.name || '').trim();
    if (!nm) {
      window.alert('Name is required');
      return;
    }
    setQuickAddSubmitting(true);
    try {
      let created;
      if (quickAddEntity.type === 'supplier') {
        created = await createSupplier({
          name: nm,
          contact_number: quickAddForm.contact_number,
          address: quickAddForm.address
        });
      } else {
        created = await createDealer({
          name: nm,
          contact_number: quickAddForm.contact_number,
          address: quickAddForm.address
        });
      }
      await loadSuppliersDealers();
      const newId = created?.id != null ? String(created.id) : '';
      if (newId) {
        if (quickAddEntity.target === 'add') {
          setFormData((prev) =>
            quickAddEntity.type === 'supplier'
              ? { ...prev, supplier_id: newId }
              : { ...prev, dealer_id: newId }
          );
        } else {
          setUpdateFormData((prev) =>
            quickAddEntity.type === 'supplier'
              ? { ...prev, supplier_id: newId }
              : { ...prev, dealer_id: newId }
          );
        }
      }
      closeQuickAdd();
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Could not save');
    } finally {
      setQuickAddSubmitting(false);
    }
  };

  const loadDetailHistory = useCallback(async (productId) => {
    if (productId == null) return;
    setHistoryLoading(true);
    setProductChangeLoading(true);
    try {
      const [stock, changes] = await Promise.all([
        fetchInventoryHistory(productId),
        fetchProductChangeHistory(productId)
      ]);
      setHistoryRows(Array.isArray(stock) ? stock : []);
      setProductChangeRows(Array.isArray(changes) ? changes : []);
    } catch (err) {
      console.error(err);
      setHistoryRows([]);
      setProductChangeRows([]);
      window.alert(err.message || 'Could not load history');
    } finally {
      setHistoryLoading(false);
      setProductChangeLoading(false);
    }
  }, []);

  const openProductDetail = (item) => {
    setDetailModalProduct(item);
    loadDetailHistory(item.id);
  };

  const closeProductDetail = () => {
    setDetailModalProduct(null);
    setHistoryRows([]);
    setProductChangeRows([]);
  };

  useEffect(() => {
    if (!showUpdateInventoryModal || !selectedUpdateProductId) return;
    let cancelled = false;
    (async () => {
      setUpdateFormLoading(true);
      try {
        const p = await fetchProductById(selectedUpdateProductId);
        if (!cancelled) {
          const rawQ = parseFloat(p.quantity ?? p.totalSqftStock ?? p.total_sqft_stock);
          const baseline = Number.isNaN(rawQ) ? 0 : rawQ;
          setUpdateStockBaseline(baseline);
          setUpdateFormData({
            ...productToFormData(p),
            stock_quantity_to_add: '0',
            total_sqft_stock: ''
          });
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) window.alert(err.message || 'Could not load product');
      } finally {
        if (!cancelled) setUpdateFormLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUpdateProductId, showUpdateInventoryModal]);

  const openUpdateInventoryModal = () => {
    setShowUpdateInventoryModal(true);
    setSelectedUpdateProductId('');
    setUpdateStockBaseline(null);
    setUpdateFormData({ ...initialFormData });
    setUpdateAuditNotes('');
  };

  const closeUpdateInventoryModal = () => {
    setShowUpdateInventoryModal(false);
    setSelectedUpdateProductId('');
    setUpdateStockBaseline(null);
    setUpdateFormData({ ...initialFormData });
    setUpdateAuditNotes('');
  };

  const handleUpdateInputChange = (e) => {
    const { name, value } = e.target;
    setUpdateFormData((prev) => {
      const newData = { ...prev, [name]: value };
      if (name === 'name') newData.slug = generateSlug(value);
      return newData;
    });
  };

  const handleUpdateInventorySubmit = async (e) => {
    e.preventDefault();
    if (!selectedUpdateProductId) {
      window.alert('Select a product to edit');
      return;
    }
    if (!updateFormData.name || !updateFormData.product_type || !updateFormData.price_per_sqft || !updateFormData.primary_image_url) {
      window.alert('Please fill all required fields');
      return;
    }
    const pricePerSqft = parseFloat(updateFormData.price_per_sqft);
    const baseline = updateStockBaseline ?? 0;
    const addRaw = parseFloat(updateFormData.stock_quantity_to_add);
    const addQty = Number.isNaN(addRaw) ? 0 : addRaw;
    const totalSqftStock = baseline + addQty;
    if (Number.isNaN(pricePerSqft) || pricePerSqft < 0) {
      window.alert('Please enter a valid price per unit');
      return;
    }
    if (totalSqftStock < 0) {
      window.alert('Resulting stock cannot be negative — reduce the quantity to add (or use a negative amount to adjust).');
      return;
    }
    const trimmedName = updateFormData.name.trim();
    const trimmedSlug = (updateFormData.slug || generateSlug(updateFormData.name)).trim();
    const trimmedProductType = updateFormData.product_type.trim();
    const trimmedImageUrl = updateFormData.primary_image_url.trim();
    const trimmedColor = (updateFormData.color || '').trim();
    if (!trimmedName || !trimmedProductType || !trimmedImageUrl) {
      window.alert('Please fill all required fields (name, product type, and image URL cannot be empty)');
      return;
    }
    const trimmedUnit = (updateFormData.unit || '').trim();
    const labourCharges = parseFloat(updateFormData.labour_charges) || 0;
    const rtoFees = parseFloat(updateFormData.rto_fees) || 0;
    const damageExpenses = parseFloat(updateFormData.damage_expenses) || 0;
    const othersExpenses = parseFloat(updateFormData.others_expenses) || 0;
    const transportationCharge = parseFloat(updateFormData.transportation_charge) || 0;
    const gstCharges = parseFloat(updateFormData.gst_charges) || 0;
    const totalExpenses = labourCharges + rtoFees + damageExpenses + othersExpenses + transportationCharge + gstCharges;
    const pricePerSqftAfter = totalSqftStock > 0
      ? (pricePerSqft * totalSqftStock + totalExpenses) / totalSqftStock
      : pricePerSqft;
    const itemData = {
      name: trimmedName,
      slug: trimmedSlug,
      productTypeString: trimmedProductType,
      pricePerSqft: pricePerSqft,
      totalSqftStock: totalSqftStock,
      unit: trimmedUnit || 'piece',
      hsnNumber: (updateFormData.hsn_number || '').trim() || undefined,
      primaryImageUrl: trimmedImageUrl,
      color: trimmedColor,
      labourCharges,
      rtoFees,
      damageExpenses,
      othersExpenses,
      transportationCharge,
      gstCharges,
      pricePerSqftAfter: parseFloat(pricePerSqftAfter.toFixed(2))
    };
    const sidU = parseInt(updateFormData.supplier_id, 10);
    const didU = parseInt(updateFormData.dealer_id, 10);
    itemData.supplierId = Number.isFinite(sidU) && sidU > 0 ? sidU : 0;
    itemData.dealerId = Number.isFinite(didU) && didU > 0 ? didU : 0;
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const userRole = userData?.role || userData?.userRole || 'admin';
      const requestBody = {
        ...itemData,
        role: userRole,
        userRole: userRole,
        updateNotes: (updateAuditNotes || '').trim() || undefined
      };
      await updateInventoryProduct(selectedUpdateProductId, requestBody);
      await fetchInventory();
      if (detailModalProduct?.id != null && String(detailModalProduct.id) === String(selectedUpdateProductId)) {
        loadDetailHistory(detailModalProduct.id);
      }
      closeUpdateInventoryModal();
      window.alert('Inventory updated');
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Failed to update inventory');
    }
  };

  const handleDeleteInventory = useCallback(async (item) => {
    const id = item?.id ?? item?.inventoryId;
    if (id == null) {
      alert('Cannot delete: item has no id');
      return;
    }
    if (!window.confirm(`Delete "${item.name || 'this item'}"? This cannot be undone.`)) return;
    try {
      const token = localStorage.getItem('authToken');
      const headers = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
        method: 'DELETE',
        headers
      });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 404) {
          throw new Error('Item not found for your current location (or already deleted). Please refresh and try again.');
        }
        throw new Error(text || `Delete failed (${response.status})`);
      }
      await fetchInventory();
    } catch (err) {
      console.error('Error deleting inventory:', err);
      alert(err.message || 'Failed to delete item');
    }
  }, [fetchInventory]);

  const calculatePricePerSqft = (data) => {
    const pricePerSqft = parseFloat(data.price_per_sqft) || 0;
    const totalSqftStock = parseFloat(data.total_sqft_stock) || 0;
    const labourCharges = parseFloat(data.labour_charges) || 0;
    const rtoFees = parseFloat(data.rto_fees) || 0;
    const damageExpenses = parseFloat(data.damage_expenses) || 0;
    const othersExpenses = parseFloat(data.others_expenses) || 0;
    const transportationCharge = parseFloat(data.transportation_charge) || 0;
    const gstCharges = parseFloat(data.gst_charges) || 0;
    const pricePerSqftBefore = pricePerSqft;
    const totalExpenses = labourCharges + rtoFees + damageExpenses + othersExpenses + transportationCharge + gstCharges;
    const pricePerSqftAfter = totalSqftStock > 0
      ? (pricePerSqft * totalSqftStock + totalExpenses) / totalSqftStock
      : pricePerSqft;
    return {
      pricePerSqftBefore: pricePerSqftBefore.toFixed(2),
      pricePerSqftAfter: pricePerSqftAfter.toFixed(2)
    };
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if (name === 'name') newData.slug = generateSlug(value);
      return newData;
    });
  };

  const handleAddInventory = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.product_type || !formData.price_per_sqft || !formData.total_sqft_stock || !formData.primary_image_url) {
      alert('Please fill all required fields');
      return;
    }
    const pricePerSqft = parseFloat(formData.price_per_sqft);
    const totalSqftStock = parseFloat(formData.total_sqft_stock);
    if (isNaN(pricePerSqft) || pricePerSqft < 0) {
      alert('Please enter a valid price per unit');
      return;
    }
    if (isNaN(totalSqftStock) || totalSqftStock < 0) {
      alert('Please enter a valid quantity/stock');
      return;
    }
    const trimmedName = formData.name.trim();
    const trimmedSlug = (formData.slug || generateSlug(formData.name)).trim();
    const trimmedProductType = formData.product_type.trim();
    const trimmedImageUrl = formData.primary_image_url.trim();
    const trimmedColor = (formData.color || '').trim();
    if (!trimmedName || !trimmedProductType || !trimmedImageUrl) {
      alert('Please fill all required fields (name, product type, and image URL cannot be empty)');
      return;
    }
    const trimmedUnit = (formData.unit || '').trim();
    const labourCharges = parseFloat(formData.labour_charges) || 0;
    const rtoFees = parseFloat(formData.rto_fees) || 0;
    const damageExpenses = parseFloat(formData.damage_expenses) || 0;
    const othersExpenses = parseFloat(formData.others_expenses) || 0;
    const transportationCharge = parseFloat(formData.transportation_charge) || 0;
    const gstCharges = parseFloat(formData.gst_charges) || 0;
    const totalExpenses = labourCharges + rtoFees + damageExpenses + othersExpenses + transportationCharge + gstCharges;
    const pricePerSqftAfter = totalSqftStock > 0
      ? (pricePerSqft * totalSqftStock + totalExpenses) / totalSqftStock
      : pricePerSqft;
    const itemData = {
      name: trimmedName,
      slug: trimmedSlug,
      productTypeString: trimmedProductType,
      pricePerSqft: pricePerSqft,
      totalSqftStock: totalSqftStock,
      unit: trimmedUnit || 'piece',
      hsnNumber: (formData.hsn_number || '').trim() || undefined,
      primaryImageUrl: trimmedImageUrl,
      color: trimmedColor,
      labourCharges,
      rtoFees,
      damageExpenses,
      othersExpenses,
      transportationCharge,
      gstCharges,
      pricePerSqftAfter: parseFloat(pricePerSqftAfter.toFixed(2))
    };
    const sidA = parseInt(formData.supplier_id, 10);
    const didA = parseInt(formData.dealer_id, 10);
    if (Number.isFinite(sidA) && sidA > 0) {
      itemData.supplierId = sidA;
    }
    if (Number.isFinite(didA) && didA > 0) {
      itemData.dealerId = didA;
    }
    try {
      const token = localStorage.getItem('authToken');
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const userRole = userData?.role || userData?.userRole || 'admin';
      const requestBody = { ...itemData, role: userRole, userRole: userRole };
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/inventory`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      if (response.status === 401) {
        await handleApiResponse(response);
        return;
      }
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || 'Failed to add inventory item' };
        }
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }
      setFormData(initialFormData);
      setShowAddInventory(false);
      await fetchInventory();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to add inventory item');
    }
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  let filteredInventory = useMemo(() => {
    let list = inventory.filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const name = item.name?.toLowerCase() || '';
      const productType = (item.productType || item.product_type || item.category || '').toLowerCase();
      const color = (item.color || '').toLowerCase();
      const priceStr = (item.pricePerSqft ?? item.price_per_sqft ?? item.pricePerUnit ?? item.unitPrice ?? 0).toString();
      const stockStr = (item.totalSqftStock ?? item.total_sqft_stock ?? item.quantity ?? 0).toString();
      const slug = (item.slug || '').toLowerCase();
      const supplier = (item.supplierName || item.supplier_name || '').toLowerCase();
      const dealer = (item.dealerName || item.dealer_name || '').toLowerCase();
      return (
        name.includes(q) ||
        productType.includes(q) ||
        color.includes(q) ||
        priceStr.includes(q) ||
        stockStr.includes(q) ||
        slug.includes(q) ||
        supplier.includes(q) ||
        dealer.includes(q)
      );
    });
    if (sortConfig.key) {
      list = [...list].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (sortConfig.key === 'productType') {
          aVal = a.productType || a.product_type || '';
          bVal = b.productType || b.product_type || '';
        } else if (sortConfig.key === 'pricePerSqft') {
          aVal = getPricePerUnitAfter(a);
          bVal = getPricePerUnitAfter(b);
        } else if (sortConfig.key === 'totalSqftStock') {
          aVal = a.totalSqftStock ?? a.total_sqft_stock ?? 0;
          bVal = b.totalSqftStock ?? b.total_sqft_stock ?? 0;
        } else if (sortConfig.key === 'name') {
          aVal = (a.name || '').toLowerCase();
          bVal = (b.name || '').toLowerCase();
        }
        if (typeof aVal === 'string') bVal = (bVal != null ? bVal : '').toString().toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [inventory, searchQuery, sortConfig]);

  const totalPages = Math.ceil(filteredInventory.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredInventory.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const totalValueSum = useMemo(() => {
    return filteredInventory.reduce((sum, item) => {
      const stock = item.totalSqftStock ?? item.total_sqft_stock ?? item.quantity ?? 0;
      return sum + (stock * getPricePerUnitAfter(item));
    }, 0);
  }, [filteredInventory]);

  const handleExportCSV = () => {
    const headers = ['Product Name', 'Product Type', 'Price/Unit (after expenses)', 'Quantity/Stock', 'Color', 'Total Value'];
    const csvData = filteredInventory.map(item => {
      const pricePerUnitAfter = getPricePerUnitAfter(item);
      const totalSqftStock = item.totalSqftStock ?? item.total_sqft_stock ?? item.quantity ?? 0;
      return {
        'Product Name': item.name || '',
        'Product Type': item.productType || item.product_type || '',
        'Price/Unit (after expenses)': pricePerUnitAfter,
        'Quantity/Stock': totalSqftStock,
        'Color': item.color || '',
        'Total Value': pricePerUnitAfter * totalSqftStock
      };
    });
    exportToCSV(csvData, `inventory_items_${new Date().toISOString().split('T')[0]}.csv`, headers);
  };

  if (loading && inventory.length === 0) {
    return (
      <div className="dashboard-section inventory-section" style={{ padding: '24px' }}>
        <p>Loading inventory...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-section inventory-section">
      <div className="section-header-enhanced">
        <div className="section-title-wrapper">
          <span className="section-icon">📦</span>
          <h3>Inventory Items</h3>
          <span className="sales-count">({filteredInventory.length})</span>
        </div>
        <div className="section-header-actions">
          {filteredInventory.length > 0 && (
            <>
              <div className="section-summary">
                <span className="summary-item">Total Value: ₹{totalValueSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <button type="button" className="btn btn-export" onClick={handleExportCSV} title="Export to CSV">📥 Export CSV</button>
            </>
          )}
          {isAdmin() && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openUpdateInventoryModal}
              title="Edit product prices, GST, stock, and expenses"
            >
              Update inventory
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setShowAddInventory(true)}>
            Add inventory
          </button>
        </div>
      </div>

      {inventory.length > 0 && (
        <div className="search-section">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search by name, type, color, price, stock, slug, supplier, or dealer..."
              className="search-input"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); setCurrentPage(1); }} className="search-clear-btn" title="Clear">×</button>
            )}
          </div>
        </div>
      )}

      <div className="section-content">
        {inventory.length === 0 ? (
          <div className="empty-state-wrapper">
            <span className="empty-icon">📦</span>
            <p className="empty-state">No inventory items yet</p>
            <p className="empty-subtitle">Click &quot;Add inventory&quot; to add your first item.</p>
            <button type="button" className="btn btn-primary" onClick={() => setShowAddInventory(true)}>Add inventory</button>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="empty-state-wrapper">
            <span className="empty-icon">🔍</span>
            <p className="empty-state">No items match your search</p>
            <button type="button" onClick={() => { setSearchQuery(''); setCurrentPage(1); }} className="btn-filter-clear-inline">Clear Search</button>
          </div>
        ) : (
          <>
            <div className="sales-table-wrapper">
              <table className="data-table inventory-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('name')}>Product Name{sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}</th>
                    <th className="sortable" onClick={() => handleSort('productType')}>Product Type{sortConfig.key === 'productType' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}</th>
                    <th className="sortable" onClick={() => handleSort('pricePerSqft')} title="Per unit after expenses">Price/Unit (after expenses){sortConfig.key === 'pricePerSqft' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}</th>
                    <th className="sortable" onClick={() => handleSort('totalSqftStock')}>Quantity/Stock{sortConfig.key === 'totalSqftStock' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}</th>
                    <th>Color</th>
                    <th className="total-col">Total Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item, index) => {
                    const pricePerUnitAfter = getPricePerUnitAfter(item);
                    const totalSqftStock = item.totalSqftStock ?? item.total_sqft_stock ?? item.quantity ?? 0;
                    const productType = item.productType || item.product_type || item.category || '-';
                    const primaryImageUrl = item.primaryImageUrl || item.primary_image_url;
                    const totalValue = totalSqftStock * pricePerUnitAfter;
                    const isLowStock = totalSqftStock < 10;
                    return (
                      <tr
                        key={`inv-${item.id ?? index}`}
                        className={`inventory-row-clickable${isLowStock ? ' low-stock-row' : ''}`}
                        onClick={() => openProductDetail(item)}
                        title="View details and stock history"
                      >
                        <td className="product-name-cell">
                          {primaryImageUrl ? (
                            <div className="product-with-image">
                              <img
                                src={primaryImageUrl}
                                alt={item.name}
                                title={item.name}
                                className="product-thumbnail"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                              <span className="product-name" title={item.name}>{item.name}</span>
                            </div>
                          ) : (
                            <span className="product-name" title={item.name}>{item.name}</span>
                          )}
                        </td>
                        <td><span className="product-type-badge">{productType}</span></td>
                        <td className="amount-cell">₹{pricePerUnitAfter.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className={isLowStock ? 'low-stock-cell' : 'stock-cell'}>
                          {isLowStock && <span className="low-stock-indicator">⚠️ </span>}
                          {totalSqftStock.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td>{item.color ? <span className="color-badge">{item.color}</span> : '-'}</td>
                        <td className="total-cell total-col"><span className="total-amount">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
                        <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn-icon btn-view"
                            title="Details & history"
                            onClick={() => openProductDetail(item)}
                          >
                            👁️
                          </button>
                          <button type="button" className="btn-icon btn-delete" title="Delete" onClick={() => handleDeleteInventory(item)}>🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination-wrapper">
                <div className="pagination-info">
                  Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredInventory.length)} of {filteredInventory.length}
                </div>
                <div className="pagination-controls">
                  <button type="button" className="pagination-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>← Previous</button>
                  <div className="pagination-numbers">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button key={page} type="button" className={`pagination-number ${currentPage === page ? 'active' : ''}`} onClick={() => setCurrentPage(page)}>{page}</button>
                    ))}
                  </div>
                  <button type="button" className="pagination-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showAddInventory && (
        <div className="modal-overlay" onClick={() => setShowAddInventory(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add inventory</h3>
              <button className="modal-close" onClick={() => setShowAddInventory(false)}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddInventory}>
                <div className="form-group">
                  <label>Product Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
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
                    value={formData.slug}
                    onChange={handleInputChange}
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
                    value={formData.product_type}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.filter(c => c.is_active !== false).map((cat) => (
                      <option key={cat.id} value={cat.name || cat.category_type || ''}>
                        {cat.name || cat.category_type || 'Unnamed'}
                      </option>
                    ))}
                    {formData.product_type && !categories.some(c => (c.name || c.category_type) === formData.product_type) && (
                      <option value={formData.product_type}>{formData.product_type}</option>
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
                      value={formData.price_per_sqft}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 180.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity/Stock *</label>
                    <input
                      type="number"
                      name="total_sqft_stock"
                      value={formData.total_sqft_stock}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 150.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      maxLength="20"
                      placeholder="e.g., piece, sqr ft, kg, meter"
                    />
                  </div>
                  <div className="form-group">
                    <label>HSN Number (optional)</label>
                    <input
                      type="text"
                      name="hsn_number"
                      value={formData.hsn_number}
                      onChange={handleInputChange}
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
                    value={formData.primary_image_url}
                    onChange={handleInputChange}
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
                    value={formData.color}
                    onChange={handleInputChange}
                    maxLength="50"
                    placeholder="e.g., white, black, beige, multi"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Supplier (firm)</label>
                    <div className="form-inline-with-action">
                      <select
                        name="supplier_id"
                        value={formData.supplier_id}
                        onChange={handleInputChange}
                        className="form-select-grow"
                      >
                        <option value="">— None —</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {isAdmin() && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          onClick={() => openQuickAdd('supplier', 'add')}
                        >
                          Add new
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Dealer (middleman)</label>
                    <div className="form-inline-with-action">
                      <select
                        name="dealer_id"
                        value={formData.dealer_id}
                        onChange={handleInputChange}
                        className="form-select-grow"
                      >
                        <option value="">— None —</option>
                        {dealers.map((d) => (
                          <option key={d.id} value={String(d.id)}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      {isAdmin() && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          onClick={() => openQuickAdd('dealer', 'add')}
                        >
                          Add new
                        </button>
                      )}
                    </div>
                  </div>
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
                      value={formData.labour_charges}
                      onChange={handleInputChange}
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
                      value={formData.rto_fees}
                      onChange={handleInputChange}
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
                      value={formData.damage_expenses}
                      onChange={handleInputChange}
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
                      value={formData.others_expenses}
                      onChange={handleInputChange}
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
                      value={formData.transportation_charge}
                      onChange={handleInputChange}
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
                      value={formData.gst_charges}
                      onChange={handleInputChange}
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
                      value={`₹${calculatePricePerSqft(formData).pricePerSqftBefore}`}
                      readOnly
                      className="readonly-field"
                      style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Price Per Sqr Ft (After Extra Expenses)</label>
                    <input
                      type="text"
                      value={`₹${calculatePricePerSqft(formData).pricePerSqftAfter}`}
                      readOnly
                      className="readonly-field"
                      style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed', fontWeight: 'bold', color: '#2c3e50' }}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">Add inventory</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddInventory(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {detailModalProduct && (
        <div className="modal-overlay" onClick={closeProductDetail}>
          <div
            className="modal-content modal-inventory-detail modal-inventory-detail--full-history"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>{detailModalProduct.name}</h3>
                <p className="inventory-history-modal-subtitle">
                  Stock movements with pricing, GST, labour, and other fields after each product update; sales and manual
                  stock rows show quantity only.
                </p>
              </div>
              <button type="button" className="modal-close" onClick={closeProductDetail} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-body modal-body--history-only">
              <h4 className="inventory-history-section-title">Inventory history</h4>
              <p className="inventory-history-hint">
                Product edits include full snapshot columns (after-save values). Duplicate quantity-only lines from the same
                edit are merged into that row.
              </p>
              {historyLoading || productChangeLoading ? (
                <p className="inventory-history-loading">Loading…</p>
              ) : unifiedHistoryRows.length === 0 ? (
                <p className="inventory-history-empty">No history recorded yet.</p>
              ) : (
                <div className="inventory-history-table-wrap inventory-history-table-wrap--unified">
                  <table className="data-table inventory-history-table inventory-history-table--unified">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Event</th>
                        <th>Stock Δ</th>
                        <th>Previous</th>
                        <th>New</th>
                        <th>Price/unit</th>
                        <th>GST</th>
                        <th>Labour</th>
                        <th>RTO</th>
                        <th>Damage</th>
                        <th>Other</th>
                        <th>Transport</th>
                        <th>Price after exp.</th>
                        <th>HSN</th>
                        <th>Color</th>
                        <th>Unit</th>
                        <th>Supplier</th>
                        <th>Dealer</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unifiedHistoryRows.map((row) => {
                        if (row.kind === 'change') {
                          const { pc, inv } = row;
                          const after = pc.newSnapshot;
                          const prevQ = snapshotQuantity(pc.previousSnapshot);
                          const nextQ = snapshotQuantity(pc.newSnapshot);
                          const delta =
                            prevQ != null && nextQ != null ? nextQ - prevQ : inv?.quantityChanged != null ? Number(inv.quantityChanged) : null;
                          const notes = pc.notes || inv?.notes || '—';
                          return (
                            <tr key={`pc-${pc.id}`}>
                              <td>{formatHistoryDate(pc.createdAt)}</td>
                              <td>Product update</td>
                              <td className="amount-cell">
                                {delta != null && !Number.isNaN(delta)
                                  ? (delta > 0 ? '+' : '') +
                                    Number(delta).toLocaleString('en-IN', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })
                                  : '—'}
                              </td>
                              <td>{prevQ != null ? cellMoney(prevQ) : inv?.previousQuantity != null ? cellMoney(Number(inv.previousQuantity)) : '—'}</td>
                              <td>{nextQ != null ? cellMoney(nextQ) : inv?.newQuantity != null ? cellMoney(Number(inv.newQuantity)) : '—'}</td>
                              <td>{cellMoney(snapNum(after, 'pricePerUnit'))}</td>
                              <td>{cellMoney(snapNum(after, 'gstCharges'))}</td>
                              <td>{cellMoney(snapNum(after, 'labourCharges'))}</td>
                              <td>{cellMoney(snapNum(after, 'rtoFees'))}</td>
                              <td>{cellMoney(snapNum(after, 'damageExpenses'))}</td>
                              <td>{cellMoney(snapNum(after, 'othersExpenses'))}</td>
                              <td>{cellMoney(snapNum(after, 'transportationCharge'))}</td>
                              <td>{cellMoney(snapNum(after, 'pricePerSqftAfter'))}</td>
                              <td>{cellText(after, 'hsnNumber')}</td>
                              <td>{cellText(after, 'color')}</td>
                              <td>{cellText(after, 'unit')}</td>
                              <td>{cellText(after, 'supplierName')}</td>
                              <td>{cellText(after, 'dealerName')}</td>
                              <td className="inventory-notes-cell">{notes}</td>
                            </tr>
                          );
                        }
                        const h = row.h;
                        return (
                          <tr key={`st-${h.id}`}>
                            <td>{formatHistoryDate(h.createdAt)}</td>
                            <td>{formatActionLabel(h.actionType)}</td>
                            <td className="amount-cell">
                              {h.quantityChanged != null
                                ? (h.quantityChanged > 0 ? '+' : '') +
                                  Number(h.quantityChanged).toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })
                                : '—'}
                            </td>
                            <td>
                              {h.previousQuantity != null
                                ? Number(h.previousQuantity).toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })
                                : '—'}
                            </td>
                            <td>
                              {h.newQuantity != null
                                ? Number(h.newQuantity).toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })
                                : '—'}
                            </td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td title="Not recorded for this movement">—</td>
                            <td className="inventory-notes-cell">{h.notes || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showUpdateInventoryModal && isAdmin() && (
        <InventoryUpdateModal
          onClose={closeUpdateInventoryModal}
          categories={categories}
          inventory={inventory}
          suppliers={suppliers}
          dealers={dealers}
          isAdminUser={isAdmin()}
          onOpenAddSupplier={() => openQuickAdd('supplier', 'update')}
          onOpenAddDealer={() => openQuickAdd('dealer', 'update')}
          selectedUpdateProductId={selectedUpdateProductId}
          setSelectedUpdateProductId={setSelectedUpdateProductId}
          updateFormLoading={updateFormLoading}
          updateFormData={updateFormData}
          updateStockBaseline={updateStockBaseline}
          updatePricingFormData={updatePricingFormData}
          handleUpdateInputChange={handleUpdateInputChange}
          updateAuditNotes={updateAuditNotes}
          setUpdateAuditNotes={setUpdateAuditNotes}
          onSubmit={handleUpdateInventorySubmit}
          calculatePricePerSqft={calculatePricePerSqft}
        />
      )}

      {quickAddEntity && (
        <div className="modal-overlay" onClick={closeQuickAdd}>
          <div className="modal-content modal-quick-entity" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{quickAddEntity.type === 'supplier' ? 'New supplier' : 'New dealer'}</h3>
              <button type="button" className="modal-close" onClick={closeQuickAdd} aria-label="Close">
                ×
              </button>
            </div>
            <form className="modal-body" onSubmit={handleQuickAddSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  value={quickAddForm.name}
                  onChange={(e) => setQuickAddForm((p) => ({ ...p, name: e.target.value }))}
                  maxLength={200}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Contact number</label>
                <input
                  value={quickAddForm.contact_number}
                  onChange={(e) => setQuickAddForm((p) => ({ ...p, contact_number: e.target.value }))}
                  maxLength={50}
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea
                  value={quickAddForm.address}
                  onChange={(e) => setQuickAddForm((p) => ({ ...p, address: e.target.value }))}
                  rows={2}
                  maxLength={500}
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={quickAddSubmitting}>
                  {quickAddSubmitting ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeQuickAdd}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryItemsPage;
