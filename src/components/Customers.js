import React, { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { customerSchema } from '../utils/validation';
import { 
  fetchCustomers, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer,
  fetchCustomerAdvanceSummary,
  fetchCustomerAdvanceHistory,
  createCustomerAdvance,
} from '../utils/api';
import Loading from './Loading';
import './Customers.css';

const CUSTOMER_FORM_DEFAULTS = {
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstin: '',
  location: 'Bhondsi',
  notes: '',
  tokenAmount: '',
  tokenPaymentMode: 'CASH',
};

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [advanceModalCustomer, setAdvanceModalCustomer] = useState(null);
  const [advanceSummary, setAdvanceSummary] = useState(null);
  const [advanceHistory, setAdvanceHistory] = useState([]);
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDesc, setAdvanceDesc] = useState('');
  const [advancePaymentMode, setAdvancePaymentMode] = useState('CASH');

  // React Hook Form
  const { 
    register, 
    handleSubmit, 
    reset, 
    setValue,
    formState: { errors } 
  } = useForm({
    resolver: yupResolver(customerSchema),
    defaultValues: CUSTOMER_FORM_DEFAULTS,
  });

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    location: 'Bhondsi',
    notes: ''
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadAdvanceData = async (customerId) => {
    setAdvanceLoading(true);
    try {
      const [sum, hist] = await Promise.all([
        fetchCustomerAdvanceSummary(customerId),
        fetchCustomerAdvanceHistory(customerId),
      ]);
      setAdvanceSummary(sum);
      setAdvanceHistory(Array.isArray(hist) ? hist : []);
    } catch (e) {
      console.error('Advance load failed:', e);
      setAdvanceSummary(null);
      setAdvanceHistory([]);
    } finally {
      setAdvanceLoading(false);
    }
  };

  const openAdvanceModal = (customer) => {
    setAdvanceModalCustomer(customer);
    setAdvanceAmount('');
    setAdvanceDesc('');
    setAdvancePaymentMode('CASH');
    loadAdvanceData(customer.id);
  };

  const closeAdvanceModal = () => {
    setAdvanceModalCustomer(null);
    setAdvanceSummary(null);
    setAdvanceHistory([]);
  };

  const handleAddAdvance = async (e) => {
    e.preventDefault();
    if (!advanceModalCustomer) return;
    const amt = parseFloat(String(advanceAmount).replace(/[^\d.]/g, ''));
    if (!amt || amt <= 0) {
      alert('Enter a positive amount');
      return;
    }
    try {
      setAdvanceLoading(true);
      await createCustomerAdvance({
        customerId: advanceModalCustomer.id,
        amount: amt,
        paymentMode: advancePaymentMode || 'CASH',
        description: advanceDesc || undefined,
      });
      setAdvanceAmount('');
      setAdvanceDesc('');
      await loadAdvanceData(advanceModalCustomer.id);
    } catch (err) {
      alert(err.message || 'Could not record advance');
    } finally {
      setAdvanceLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const customersData = await fetchCustomers();
      setCustomers(customersData || []);
    } catch (error) {
      console.error('Error loading customers:', error);
      // Fallback to localStorage if API fails
      try {
        const stored = localStorage.getItem('customers');
        if (stored) {
          setCustomers(JSON.parse(stored));
        } else {
          setCustomers([]);
        }
      } catch (localError) {
        console.error('Error loading from localStorage:', localError);
        setCustomers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setValue(name, value);
  };

  const onSubmit = async (data) => {
    try {
      setLoading(true);
      
      // Map form data to API format
      const apiData = {
        customerName: data.name,
        phone: data.phone,
        email: data.email || '',
        address: data.address || '',
        gstin: data.gstin || '',
        location: data.location || data.city || 'Bhondsi', // Use location field or fallback to city
        notes: data.notes || ''
      };

      if (editingCustomer) {
        // Update existing customer
        const updatedCustomer = await updateCustomer(editingCustomer.id, apiData);
        setCustomers(customers.map(c => 
          c.id === editingCustomer.id ? updatedCustomer : c
        ));
      } else {
        // Create new customer
        const newCustomer = await createCustomer(apiData);
        setCustomers([...customers, newCustomer]);

        const tokenRaw =
          data.tokenAmount != null && data.tokenAmount !== undefined ? String(data.tokenAmount).trim() : '';
        const tokenAmt =
          tokenRaw === '' ? 0 : parseFloat(tokenRaw.replace(/[^\d.]/g, ''));
        if (tokenAmt > 0 && newCustomer?.id) {
          try {
            await createCustomerAdvance({
              customerId: newCustomer.id,
              amount: tokenAmt,
              paymentMode: data.tokenPaymentMode || 'CASH',
              description: 'Initial token at customer registration',
            });
          } catch (advErr) {
            console.error(advErr);
            alert(
              `Customer was saved, but the token could not be recorded: ${advErr.message || 'Unknown error'}. Add it using the token (💰) action on the customer row.`
            );
          }
        }
      }
      
      resetForm();
    } catch (error) {
      console.error('Error saving customer:', error);
      alert(`Error saving customer: ${error.message || 'Please try again'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    // Map API data to form format
    const editData = {
      name: customer.customerName || customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      city: customer.location || customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      gstin: customer.gstin || '',
      location: customer.location || customer.city || '',
      notes: customer.notes || ''
    };
    setFormData(editData);
    setValue('tokenAmount', '');
    // Update react-hook-form values
    Object.keys(editData).forEach(key => {
      setValue(key, editData[key]);
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        setLoading(true);
        await deleteCustomer(id);
        setCustomers(customers.filter(c => c.id !== id));
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert(`Error deleting customer: ${error.message || 'Please try again'}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const openAddCustomer = () => {
    setEditingCustomer(null);
    setFormData({ ...CUSTOMER_FORM_DEFAULTS });
    reset(CUSTOMER_FORM_DEFAULTS);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({ ...CUSTOMER_FORM_DEFAULTS });
    reset(CUSTOMER_FORM_DEFAULTS);
    setEditingCustomer(null);
    setShowForm(false);
  };

  const normalizeSearchText = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const filteredCustomers = useMemo(() => {
    const list = Array.isArray(customers) ? customers : [];
    const query = normalizeSearchText(searchQuery);
    if (!query) return list;
    return list.filter((customer) => {
      const customerName = customer.customerName || customer.name || '';
      const directMatch =
        normalizeSearchText(customerName).includes(query) ||
        normalizeSearchText(customer.phone).includes(query) ||
        normalizeSearchText(customer.email).includes(query) ||
        normalizeSearchText(customer.location).includes(query) ||
        normalizeSearchText(customer.city).includes(query) ||
        normalizeSearchText(customer.gstin).includes(query) ||
        normalizeSearchText(customer.notes).includes(query);
      if (directMatch) return true;
      // Fallback: include all plain values in one searchable blob for unexpected field names.
      const fallbackBlob = normalizeSearchText(Object.values(customer || {}).join(' '));
      return fallbackBlob.includes(query);
    });
  }, [customers, searchQuery]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + itemsPerPage);

  const money = (n) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="customers-container">
      <div className="customers-header">
        <h2>Customer Management</h2>
        <button type="button" className="btn btn-primary" onClick={openAddCustomer}>
          + Add Customer
        </button>
      </div>

      {advanceModalCustomer && (
        <div className="modal-overlay" onClick={closeAdvanceModal}>
          <div className="modal-content advance-token-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Token / Advance — {advanceModalCustomer.customerName || advanceModalCustomer.name || 'Customer'}</h3>
              <button type="button" className="modal-close" onClick={closeAdvanceModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {advanceLoading && !advanceSummary ? (
                <p>Loading…</p>
              ) : (
                <>
                  <div className="advance-summary-cards">
                    <div className="advance-summary-card">
                      <span className="advance-summary-label">Total advance</span>
                      <span className="advance-summary-value">₹ {money(advanceSummary?.totalAdvance)}</span>
                    </div>
                    <div className="advance-summary-card">
                      <span className="advance-summary-label">Used on bills</span>
                      <span className="advance-summary-value">₹ {money(advanceSummary?.totalUsed)}</span>
                    </div>
                    <div className="advance-summary-card">
                      <span className="advance-summary-label">Remaining</span>
                      <span className="advance-summary-value">₹ {money(advanceSummary?.remaining)}</span>
                    </div>
                  </div>

                  <form onSubmit={handleAddAdvance} className="advance-add-form">
                    <h4 className="advance-section-title">Add advance / token</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Amount (₹) *</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={advanceAmount}
                          onChange={(e) => setAdvanceAmount(e.target.value)}
                          placeholder="e.g. 5000"
                        />
                      </div>
                      <div className="form-group">
                        <label>Payment mode *</label>
                        <select
                          value={advancePaymentMode}
                          onChange={(e) => setAdvancePaymentMode(e.target.value)}
                          className="form-select"
                        >
                          <option value="CASH">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="BANK_TRANSFER">Bank transfer</option>
                          <option value="CHEQUE">Cheque</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Description</label>
                        <input
                          type="text"
                          value={advanceDesc}
                          onChange={(e) => setAdvanceDesc(e.target.value)}
                          placeholder="Optional note"
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={advanceLoading}>
                      Record advance
                    </button>
                  </form>

                  <h4 className="advance-section-title">History</h4>
                  <div className="advance-history-wrap">
                    <table className="data-table advance-history-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Date</th>
                          <th>Amount (₹)</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advanceHistory.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center' }}>
                              No advance activity yet
                            </td>
                          </tr>
                        ) : (
                          advanceHistory.map((row, i) => (
                            <tr key={`${row.type}-${row.createdAt}-${i}`}>
                              <td>{row.type === 'DEPOSIT' ? 'Deposit' : 'Applied to bill'}</td>
                              <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
                              <td>{money(row.amount)}</td>
                              <td>
                                {row.type === 'USAGE' && row.billId
                                  ? `${row.billKind || ''} bill #${row.billId}`
                                  : [row.description || '—', row.paymentMode ? `(Mode: ${String(row.paymentMode).replace('_', ' ')})` : null]
                                      .filter(Boolean)
                                      .join(' ')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
              <button className="modal-close" onClick={resetForm}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="form-group">
                  <label>Customer Name *</label>
                  <input
                    type="text"
                    {...register('name')}
                    placeholder="Enter customer name"
                  />
                  {errors.name && (
                    <span className="error-message">{errors.name.message}</span>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone Number *</label>
                    <input
                      type="tel"
                      {...register('phone', {
                        onChange: (e) => {
                          const digits = String(e.target.value || '').replace(/\D/g, '').slice(0, 10);
                          e.target.value = digits;
                          setValue('phone', digits, { shouldValidate: true, shouldDirty: true });
                        }
                      })}
                      placeholder="Enter phone number (10 digits)"
                      inputMode="numeric"
                      maxLength={10}
                      pattern="[0-9]{10}"
                      autoComplete="off"
                    />
                    {errors.phone && (
                      <span className="error-message">{errors.phone.message}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      {...register('email')}
                      placeholder="Enter email address"
                    />
                    {errors.email && (
                      <span className="error-message">{errors.email.message}</span>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    {...register('address')}
                    placeholder="Enter address"
                    rows="2"
                  />
                  {errors.address && (
                    <span className="error-message">{errors.address.message}</span>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input
                      type="text"
                      {...register('city')}
                      placeholder="Enter city"
                    />
                    {errors.city && (
                      <span className="error-message">{errors.city.message}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input
                      type="text"
                      {...register('state')}
                      placeholder="Enter state"
                    />
                    {errors.state && (
                      <span className="error-message">{errors.state.message}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Pincode</label>
                    <input
                      type="text"
                      {...register('pincode')}
                      placeholder="Enter pincode (6 digits)"
                    />
                    {errors.pincode && (
                      <span className="error-message">{errors.pincode.message}</span>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Location *</label>
                    <select
                      {...register('location')}
                      className="form-select"
                    >
                      <option value="Bhondsi">Bhondsi</option>
                      <option value="Tapugada">Tapugada</option>
                    </select>
                    {errors.location && (
                      <span className="error-message">{errors.location.message}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>GSTIN</label>
                    <input
                      type="text"
                      {...register('gstin')}
                      placeholder="Enter GSTIN (optional)"
                    />
                    {errors.gstin && (
                      <span className="error-message">{errors.gstin.message}</span>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    {...register('notes')}
                    placeholder="Additional notes (optional)"
                    rows="2"
                  />
                  {errors.notes && (
                    <span className="error-message">{errors.notes.message}</span>
                  )}
                </div>
                {!editingCustomer && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Token amount</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        {...register('tokenAmount')}
                        placeholder="Enter token amount (optional)"
                        autoComplete="off"
                      />
                      {errors.tokenAmount && (
                        <span className="error-message">{errors.tokenAmount.message}</span>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Token payment mode</label>
                      <select {...register('tokenPaymentMode')} className="form-select">
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    </div>
                    <span className="customers-field-hint">
                      If token amount is set, advance is recorded with selected payment mode (applied to future bills).
                    </span>
                  </div>
                )}
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    {editingCustomer ? 'Update Customer' : 'Add Customer'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={resetForm}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="search-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search customers by name, phone, email..."
          className="search-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setCurrentPage(1);
            }}
            className="search-clear-btn"
          >
            ×
          </button>
        )}
      </div>

      {/* Customers Table */}
      <div className="customers-table-container">
        {loading ? (
          <Loading message="Loading customers..." />
        ) : filteredCustomers.length > 0 ? (
          <>
            <div className="sales-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Location</th>
                    <th>GSTIN</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="date-cell">{customer.customerName || customer.name || '-'}</td>
                      <td>{customer.phone || '-'}</td>
                      <td>{customer.location || customer.city || '-'}</td>
                      <td>{customer.gstin || '-'}</td>
                      <td>{customer.notes || '-'}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="action-btn action-btn-advance"
                            onClick={() => openAdvanceModal(customer)}
                            title="Token / advance"
                          >
                            💰
                          </button>
                          <button
                            className="action-btn"
                            onClick={() => handleEdit(customer)}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            className="action-btn"
                            onClick={() => handleDelete(customer.id)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span className="pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="pagination-btn"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state-wrapper">
            <span className="empty-icon">👥</span>
            <p className="empty-state">No customers found</p>
            <p className="empty-subtitle">
              {searchQuery ? 'Try a different search term' : 'Click "Add Customer" to add your first customer'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Customers;

