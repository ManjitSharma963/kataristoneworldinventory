# Clear Hardcoded Expenses & Employee Data

## How to Clear Existing localStorage Data

If you have hardcoded or test data in localStorage that you want to remove, you can use one of these methods:

### Method 1: Browser Console
Open your browser's developer console (F12) and run:

```javascript
// Clear expenses data
localStorage.removeItem('katariastoneworld_expenses');

// Clear employees data
localStorage.removeItem('katariastoneworld_employees');

// Or clear all app data
localStorage.removeItem('katariastoneworld_expenses');
localStorage.removeItem('katariastoneworld_employees');
localStorage.removeItem('katariastoneworld_inventory');
localStorage.removeItem('katariastoneworld_sales');
```

### Method 2: Application Storage Tab
1. Open Developer Tools (F12)
2. Go to "Application" tab (Chrome) or "Storage" tab (Firefox)
3. Expand "Local Storage"
4. Find your domain
5. Delete the keys:
   - `katariastoneworld_expenses`
   - `katariastoneworld_employees` (if needed)

### Method 3: Clear All Site Data
1. Open Developer Tools (F12)
2. Go to "Application" tab
3. Click "Clear site data" button
4. This will clear all localStorage data for the site

---

## What Changed

✅ **Removed localStorage fallback** - Expenses and Employees now only come from API
✅ **Removed hardcoded data usage** - All expense and employee operations use API only
✅ **Error handling** - Shows alerts when API operations fail instead of silently falling back
✅ **Database-only operations** - All create, read, update, delete operations go through the database

### Expenses Operations (API Only):
- **Load expenses** from API only (`GET /api/expenses`)
- **Create expense** to API only (`POST /api/expenses`)
- **Update expense** via API only (`PUT /api/expenses/{id}`)
- **Delete expense** via API only (`DELETE /api/expenses/{id}`)

### Employee Operations (API Only):
- **Load employees** from API only (`GET /api/employees`)
- **Create employee** to API only (`POST /api/employees`)
- **Update employee** via API only (`PUT /api/employees/{id}`)
- **Delete employee** via API only (`DELETE /api/employees/{id}`)

### Salary & Advance Payments (API Only):
- **Pay salary** creates expense via API (`POST /api/expenses` with `type: 'salary'`)
- **Pay advance** creates expense via API (`POST /api/expenses` with `type: 'advance'`)
- **Mark advances as settled** updates via API (`PUT /api/expenses/{id}` with `settled: true`)

### Behavior:
- If the API is unavailable, the app will show empty lists and display error messages
- No localStorage fallback - ensures data consistency with database
- All data changes are immediately reflected in the database
- No hardcoded or test data is used anywhere

