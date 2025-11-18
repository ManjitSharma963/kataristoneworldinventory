import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { customerSchema } from '../utils/validation';
import { 
  fetchCustomers, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer 
} from '../utils/api';
import Loading from './Loading';
import './Customers.css';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // React Hook Form
  const { 
    register, 
    handleSubmit, 
    reset, 
    setValue,
    formState: { errors } 
  } = useForm({
    resolver: yupResolver(customerSchema),
    defaultValues: {
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
    }
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
        location: data.location || data.city || 'Bhondsi' // Use location field or fallback to city
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

  const resetForm = () => {
    const defaultData = {
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
    };
    setFormData(defaultData);
    reset(defaultData);
    setEditingCustomer(null);
    setShowForm(false);
  };

  const filteredCustomers = customers.filter(customer => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const customerName = customer.customerName || customer.name || '';
    return (
      customerName.toLowerCase().includes(query) ||
      customer.phone?.includes(query) ||
      customer.email?.toLowerCase().includes(query) ||
      customer.location?.toLowerCase().includes(query) ||
      customer.city?.toLowerCase().includes(query) ||
      customer.gstin?.toLowerCase().includes(query)
    );
  });

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="customers-container">
      <div className="customers-header">
        <h2>Customer Management</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Customer
        </button>
      </div>

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
                      {...register('phone')}
                      placeholder="Enter phone number (10 digits)"
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
                    <th>Email</th>
                    <th>Location</th>
                    <th>GSTIN</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="date-cell">{customer.customerName || customer.name || '-'}</td>
                      <td>{customer.phone || '-'}</td>
                      <td>{customer.email || '-'}</td>
                      <td>{customer.location || customer.city || '-'}</td>
                      <td>{customer.gstin || '-'}</td>
                      <td>
                        <div className="action-buttons">
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

