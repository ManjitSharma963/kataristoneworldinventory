import React, { useState, useEffect, useMemo } from 'react';
import { getInventory } from '../utils/storage';
import { API_BASE_URL } from '../config/api';
import { handleApiResponse, downloadBillPDF } from '../utils/api';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { FilterMatchMode, FilterOperator } from 'primereact/api';
import { Dialog } from 'primereact/dialog';
import './Sales.css';

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // PrimeReact DataTable filters
  const [filters, setFilters] = useState({
    billNumber: { value: null, matchMode: FilterMatchMode.CONTAINS },
    customerNumber: { value: null, matchMode: FilterMatchMode.CONTAINS },
    billType: { value: null, matchMode: FilterMatchMode.EQUALS },
    billDate: { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }] }
  });
  
  // Bill Type options for filter
  const billTypeOptions = [
    { label: 'All', value: null },
    { label: 'GST', value: 'GST' },
    { label: 'NON-GST', value: 'NON-GST' }
  ];

  const [isBillPopupVisible, setBillPopupVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);

  useEffect(() => {
    loadData();
    initFilters();
  }, []);

  const initFilters = () => {
    setFilters({
      billNumber: { value: null, matchMode: FilterMatchMode.CONTAINS },
      customerNumber: { value: null, matchMode: FilterMatchMode.CONTAINS },
      billType: { value: null, matchMode: FilterMatchMode.EQUALS },
      billDate: { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }] }
    });
  };

  const loadData = async () => {
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
      
      const billsResponse = await fetch(`${API_BASE_URL}/bills`, {
        method: 'GET',
        headers: headers
      });
      
      if (billsResponse.status === 401) {
        await handleApiResponse(billsResponse);
        return;
      }
      
      if (billsResponse.ok) {
        const billsData = await billsResponse.json();
        const allBills = Array.isArray(billsData) ? billsData : [];
        setSales(allBills);
      } else {
        console.error('Failed to fetch bills:', billsResponse.status);
        setSales([]);
      }
      
      setInventory(getInventory());
    } catch (error) {
      console.error('Error loading sales data:', error);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  // Prepare data for DataTable
  const prepareSalesData = useMemo(() => {
    return sales.map(sale => {
      const billId = sale.id || sale.billId;
      const billNumber = sale.billNumber || sale.billId || billId || '-';
      const billDate = sale.billDate || sale.createdAt || sale.date;
      const customerNumber = sale.customerMobileNumber || sale.customerNumber || sale.customerPhone || '-';
      const items = sale.items || sale.billItems || [];
      
      // Normalize billType
      let billType = sale.billType || (sale.gstPaid ? 'GST' : 'NON-GST');
      const billTypeUpper = (billType || '').toUpperCase();
      if (billTypeUpper !== 'GST') {
        billType = 'NON-GST';
      } else {
        billType = 'GST';
      }
      
      const isGST = billType === 'GST';
      const gstRate = sale.gstRate || (isGST ? 18 : 0);
      const subtotal = sale.subtotal || sale.subTotal || 0;
      const gstAmount = sale.taxAmount || sale.gstAmount || sale.gst || 0;
      const totalAmount = sale.totalAmount || sale.total || sale.amount || 0;

      // Ensure billDate is a proper Date object
      let dateObj = null;
      if (billDate) {
        try {
          dateObj = billDate instanceof Date ? billDate : new Date(billDate);
          if (isNaN(dateObj.getTime())) {
            dateObj = null;
          }
        } catch (e) {
          dateObj = null;
        }
      }

      return {
        id: billId,
        billNumber: String(billNumber || '').toUpperCase(),
        billDate: dateObj,
        customerNumber: String(customerNumber || ''),
        itemsCount: items.length,
        billType: billType,
        isGST: isGST,
        gstRate: gstRate,
        subtotal: Number(subtotal) || 0,
        gstAmount: Number(gstAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        originalSale: sale
      };
    });
  }, [sales]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN');
  };

  // Column templates
  const billNumberBodyTemplate = (rowData) => {
    return <span className="bill-number">#{rowData.billNumber}</span>;
  };

  const dateBodyTemplate = (rowData) => {
    return rowData.billDate ? formatDate(rowData.billDate) : '-';
  };

  const billTypeBodyTemplate = (rowData) => {
    const severity = rowData.isGST ? 'success' : 'secondary';
    const label = rowData.isGST ? `GST (${rowData.gstRate}%)` : 'NON-GST';
    return <Tag value={label} severity={severity} />;
  };

  const amountBodyTemplate = (rowData, field) => {
    const amount = rowData[field] || 0;
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const totalAmountBodyTemplate = (rowData) => {
    return (
      <span className="total-amount-cell">
        {amountBodyTemplate(rowData, 'totalAmount')}
      </span>
    );
  };

  const actionsBodyTemplate = (rowData) => {
    return (
      <div className="actions-buttons">
        <Button
          icon="pi pi-eye"
          rounded
          outlined
          severity="info"
          onClick={() => handleViewBillDetails(rowData)}
          title="View Bill Details"
        />
        <Button
          icon="pi pi-download"
          rounded
          outlined
          severity="secondary"
          onClick={async () => {
            try {
              console.log('[Sales] Downloading PDF for bill:', {
                id: rowData.id,
                billType: rowData.billType,
                billNumber: rowData.billNumber
              });
              await downloadBillPDF(rowData.id, rowData.billType);
            } catch (error) {
              console.error('[Sales] PDF download error:', error);
              const errorMessage = error.message || 'Unknown error occurred';
              alert(`Failed to download bill PDF:\n\n${errorMessage}\n\nPlease check:\n1. Backend server is running\n2. Bill data is complete\n3. Backend logs for details`);
            }
          }}
          title="Download Bill PDF"
        />
      </div>
    );
  };

  const handleViewBillDetails = (bill) => {
    setSelectedBill(bill);
    setBillPopupVisible(true);
  };

  const closeBillPopup = () => {
    setBillPopupVisible(false);
    setSelectedBill(null);
  };

  // Filter templates for row-based filtering
  const billTypeRowFilterTemplate = (options) => {
    return (
      <Dropdown
        value={options.value}
        options={billTypeOptions}
        onChange={(e) => options.filterApplyCallback(e.value === null ? null : e.value)}
        placeholder="Select Bill Type"
        className="p-column-filter"
        showClear
        style={{ minWidth: '12rem' }}
      />
    );
  };

  const dateRowFilterTemplate = (options) => {
    return (
      <Calendar
        value={options.value}
        onChange={(e) => {
          const dateValue = e.value instanceof Date ? e.value : (e.value ? new Date(e.value) : null);
          options.filterApplyCallback(dateValue);
        }}
        dateFormat="dd/mm/yy"
        placeholder="dd/mm/yyyy"
        showIcon
        style={{ minWidth: '12rem' }}
      />
    );
  };


  return (
    <div className="sales-container">
      <div className="sales-header">
        <h2>Sales Management</h2>
      </div>

      <div className="sales-list">
        <h3>Sales History</h3>
        <div className="sales-table-container">
          <DataTable
            value={prepareSalesData}
            paginator
            rows={10}
            rowsPerPageOptions={[10, 25, 50]}
            loading={loading}
            dataKey="id"
            filters={filters}
            emptyMessage="No sales found."
            filterDisplay="row"
            showGridlines
            stripedRows
            tableStyle={{ minWidth: '50rem', width: '100%' }}
            className="sales-datatable"
          >
            <Column
              field="billNumber"
              header="Bill Number"
              filter
              filterPlaceholder="Search by Bill Number"
              style={{ minWidth: '12rem' }}
              body={billNumberBodyTemplate}
            />
            <Column
              field="billDate"
              header="Date"
              filterField="billDate"
              dataType="date"
              style={{ minWidth: '10rem' }}
              body={dateBodyTemplate}
              filter
              filterElement={dateRowFilterTemplate}
            />
            <Column
              field="customerNumber"
              header="Customer Number"
              filter
              filterPlaceholder="Search by Customer Number"
              style={{ minWidth: '12rem' }}
            />
            <Column
              field="itemsCount"
              header="Items"
              style={{ minWidth: '8rem' }}
              body={(rowData) => `${rowData.itemsCount} item(s)`}
            />
            <Column
              field="billType"
              header="GST Status"
              filterField="billType"
              showFilterMenu={false}
              filterMenuStyle={{ width: '14rem' }}
              style={{ minWidth: '12rem' }}
              body={billTypeBodyTemplate}
              filter
              filterElement={billTypeRowFilterTemplate}
            />
            <Column
              field="subtotal"
              header="Subtotal"
              dataType="numeric"
              style={{ minWidth: '10rem' }}
              body={(rowData) => amountBodyTemplate(rowData, 'subtotal')}
            />
            <Column
              field="gstAmount"
              header="GST"
              dataType="numeric"
              style={{ minWidth: '9rem' }}
              body={(rowData) => amountBodyTemplate(rowData, 'gstAmount')}
            />
            <Column
              field="totalAmount"
              header="Total"
              dataType="numeric"
              style={{ minWidth: '10rem' }}
              body={totalAmountBodyTemplate}
            />
            <Column
              header="Actions"
              style={{ minWidth: '8rem' }}
              body={actionsBodyTemplate}
            />
          </DataTable>
        </div>
      </div>

      {/* Bill Details Popup */}
      <Dialog
        header="Bill Details"
        visible={isBillPopupVisible}
        style={{ width: '70vw' }}
        onHide={closeBillPopup}
        className="bill-details-dialog"
        contentClassName="bill-details-dialog-content"
      >
        {selectedBill ? (
          <div className="bill-details">
            <h3>Invoice No: {selectedBill.billNumber}</h3>
            <div className="bill-customer-details">
              <div className="detail-row">
                <span className="label">Name:</span>
                <span className="value">{selectedBill.originalSale.customerName}</span>
              </div>
              <div className="detail-row">
                <span className="label">Mobile:</span>
                <span className="value">{selectedBill.customerNumber}</span>
              </div>
              <div className="detail-row">
                <span className="label">Address:</span>
                <span className="value">{selectedBill.originalSale.address}</span>
              </div>
              <div className="detail-row">
                <span className="label">Date:</span>
                <span className="value">{formatDate(selectedBill.billDate)}</span>
              </div>
            </div>

            <table className="bill-table">
              <thead>
                <tr>
                  <th>Sr. No.</th>
                  <th>Item Description</th>
                  <th>Quantity</th>
                  <th>Rate</th>
                  <th>Amount (₹)</th>
                  <th>Purchase Price (₹)</th>
                  <th>Total Purchase Amount (₹)</th>
                  <th>Gross Profit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {selectedBill.originalSale.items.map((item, index) => {
                  const grossProfit = (item.pricePerUnit - item.purchasePrice) * item.quantity;
                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>{item.itemName || item.description || 'N/A'}</td>
                      <td>{item.quantity} ({item.unit || 'unit'})</td>
                      <td>₹ {item.pricePerUnit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td>₹ {(item.pricePerUnit * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td>₹ {item.purchasePrice ? item.purchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}</td>
                      <td>₹ {item.purchasePrice ? (item.purchasePrice * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}</td>
                      <td>₹ {grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>Subtotal for Sale:</td>
                  <td colSpan="3"></td>
                  <td style={{ fontWeight: 'bold', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₹ {selectedBill.originalSale.items.reduce((total, item) => {
                      return total + (item.pricePerUnit * item.quantity);
                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Gross Profit:</td>
                  <td colSpan="3"></td>
                  <td style={{ fontWeight: 'bold', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₹ {selectedBill.originalSale.items.reduce((total, item) => {
                      const grossProfit = (item.pricePerUnit - item.purchasePrice) * item.quantity;
                      return total + grossProfit;
                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="bill-summary">
              <p><strong>Discount Amount:</strong> ₹ {selectedBill.originalSale.discountAmount.toLocaleString('en-IN')}</p>
              <p><strong>Labour Charge:</strong> ₹ {selectedBill.originalSale.labourCharge.toLocaleString('en-IN')}</p>
              <p><strong>Transportation Charge:</strong> ₹ {selectedBill.originalSale.transportationCharge.toLocaleString('en-IN')}</p>
              <p><strong>Other Expense:</strong> ₹ {(selectedBill.originalSale.otherExpenses ?? selectedBill.originalSale.otherExpense ?? 0).toLocaleString('en-IN')}</p>
              <p><strong>GST Value:</strong> ₹ {(selectedBill.isGST ? (selectedBill.gstAmount ?? selectedBill.originalSale?.taxAmount ?? 0) : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p><strong>Total Amount:</strong> ₹ {selectedBill.totalAmount.toLocaleString('en-IN')}</p>
            </div>
          </div>
        ) : (
          <p>No bill details available.</p>
        )}
      </Dialog>
    </div>
  );
};

export default Sales;

