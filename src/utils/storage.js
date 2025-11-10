// LocalStorage utility for managing inventory and sales data

export const STORAGE_KEYS = {
  INVENTORY: 'katariastoneworld_inventory',
  SALES: 'katariastoneworld_sales',
  EXPENSES: 'katariastoneworld_expenses',
  EMPLOYEES: 'katariastoneworld_employees'
};

export const getInventory = () => {
  const data = localStorage.getItem(STORAGE_KEYS.INVENTORY);
  return data ? JSON.parse(data) : [];
};

export const saveInventory = (inventory) => {
  localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
};

export const getSales = () => {
  const data = localStorage.getItem(STORAGE_KEYS.SALES);
  return data ? JSON.parse(data) : [];
};

export const saveSales = (sales) => {
  localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
};

export const addInventoryItem = (item) => {
  const inventory = getInventory();
  const newItem = {
    id: Date.now().toString(),
    ...item,
    createdAt: new Date().toISOString()
  };
  inventory.push(newItem);
  saveInventory(inventory);
  return newItem;
};

export const updateInventoryItem = (id, updates) => {
  const inventory = getInventory();
  const index = inventory.findIndex(item => item.id === id);
  if (index !== -1) {
    inventory[index] = { ...inventory[index], ...updates };
    saveInventory(inventory);
    return inventory[index];
  }
  return null;
};

export const deleteInventoryItem = (id) => {
  const inventory = getInventory();
  const filtered = inventory.filter(item => item.id !== id);
  saveInventory(filtered);
  return filtered;
};

export const addSale = (sale) => {
  const sales = getSales();
  const newSale = {
    id: Date.now().toString(),
    ...sale,
    date: new Date().toISOString()
  };
  sales.push(newSale);
  saveSales(sales);
  
  // Update inventory quantities
  if (sale.items && sale.items.length > 0) {
    const inventory = getInventory();
    sale.items.forEach(saleItem => {
      const invItem = inventory.find(item => item.id === saleItem.itemId);
      if (invItem) {
        invItem.quantity = (invItem.quantity || 0) - saleItem.quantity;
      }
    });
    saveInventory(inventory);
  }
  
  return newSale;
};

export const getSalesStats = () => {
  const sales = getSales();
  const totalSales = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
  const salesWithGST = sales.filter(sale => sale.gstPaid === true);
  const salesWithoutGST = sales.filter(sale => sale.gstPaid === false);
  
  const totalWithGST = salesWithGST.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
  const totalWithoutGST = salesWithoutGST.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
  const totalGSTCollected = salesWithGST.reduce((sum, sale) => sum + (sale.gstAmount || 0), 0);
  
  return {
    totalSales,
    totalWithGST,
    totalWithoutGST,
    totalGSTCollected,
    countWithGST: salesWithGST.length,
    countWithoutGST: salesWithoutGST.length,
    totalCount: sales.length
  };
};

// Expense Management Functions
export const getExpenses = () => {
  const data = localStorage.getItem(STORAGE_KEYS.EXPENSES);
  return data ? JSON.parse(data) : [];
};

export const saveExpenses = (expenses) => {
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
};

export const addExpense = (expense) => {
  const expenses = getExpenses();
  const newExpense = {
    id: Date.now().toString(),
    ...expense,
    createdAt: new Date().toISOString()
  };
  expenses.push(newExpense);
  saveExpenses(expenses);
  return newExpense;
};

export const updateExpense = (id, updates) => {
  const expenses = getExpenses();
  const index = expenses.findIndex(expense => expense.id === id);
  if (index !== -1) {
    expenses[index] = { ...expenses[index], ...updates };
    saveExpenses(expenses);
    return expenses[index];
  }
  return null;
};

export const deleteExpense = (id) => {
  const expenses = getExpenses();
  const filtered = expenses.filter(expense => expense.id !== id);
  saveExpenses(filtered);
  return filtered;
};

// Employee Management Functions
export const getEmployees = () => {
  const data = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
  return data ? JSON.parse(data) : [];
};

export const saveEmployees = (employees) => {
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
};

export const addEmployee = (employee) => {
  const employees = getEmployees();
  const newEmployee = {
    id: Date.now().toString(),
    ...employee,
    createdAt: new Date().toISOString()
  };
  employees.push(newEmployee);
  saveEmployees(employees);
  return newEmployee;
};

export const updateEmployee = (id, updates) => {
  const employees = getEmployees();
  const index = employees.findIndex(emp => emp.id === id);
  if (index !== -1) {
    employees[index] = { ...employees[index], ...updates };
    saveEmployees(employees);
    return employees[index];
  }
  return null;
};

export const deleteEmployee = (id) => {
  const employees = getEmployees();
  const filtered = employees.filter(emp => emp.id !== id);
  saveEmployees(filtered);
  return filtered;
};

