# 📥 Get Data from Database - CURL Requests

## ✅ **Get All Employees from Database**

```bash
curl -X GET http://localhost:8080/api/employees
```

### **Response Example:**
```json
[
  {
    "id": 1,
    "employeeName": "Sumit Kumar",
    "salaryAmount": 25000.00,
    "joiningDate": "2025-01-15",
    "createdAt": "2025-11-10T10:30:00Z"
  },
  {
    "id": 2,
    "employeeName": "Rajesh Singh",
    "salaryAmount": 15000.00,
    "joiningDate": "2025-10-01",
    "createdAt": "2025-11-10T11:00:00Z"
  }
]
```

---

## ✅ **Get All Expenses from Database**

```bash
curl -X GET http://localhost:8080/api/expenses
```

### **Response Example:**
```json
[
  {
    "id": 1,
    "type": "daily",
    "date": "2025-11-10",
    "category": "water",
    "description": "Water bill",
    "amount": 500.00,
    "paymentMethod": "cash",
    "createdAt": "2025-11-10T10:30:00Z"
  },
  {
    "id": 2,
    "type": "salary",
    "category": "salary",
    "employeeId": 1,
    "employeeName": "Sumit Kumar",
    "amount": 25000.00,
    "month": "2025-11",
    "date": "2025-11-10",
    "paymentMethod": "cash",
    "description": "Salary payment for Sumit Kumar - 2025-11",
    "createdAt": "2025-11-10T11:00:00Z"
  },
  {
    "id": 3,
    "type": "advance",
    "category": "advance",
    "employeeId": 1,
    "employeeName": "Sumit Kumar",
    "amount": 5000.00,
    "date": "2025-11-10",
    "paymentMethod": "cash",
    "description": "Advance payment for Sumit Kumar",
    "settled": false,
    "createdAt": "2025-11-10T11:30:00Z"
  }
]
```

---

## 🔍 **Filtered Queries**

### **Get Expenses by Type:**
```bash
# Get only daily expenses
curl -X GET "http://localhost:8080/api/expenses?type=daily"

# Get only salary expenses
curl -X GET "http://localhost:8080/api/expenses?type=salary"

# Get only advance expenses
curl -X GET "http://localhost:8080/api/expenses?type=advance"
```

### **Get Expenses by Date Range:**
```bash
curl -X GET "http://localhost:8080/api/expenses?startDate=2025-11-01&endDate=2025-11-30"
```

### **Get Expenses for Specific Employee:**
```bash
curl -X GET "http://localhost:8080/api/expenses?employeeId=1"
```

### **Get Unsettled Advances:**
```bash
curl -X GET "http://localhost:8080/api/expenses?type=advance&settled=false"
```

---

## 📊 **How It Works in the App**

### **Loading Employees:**
1. Component mounts → `loadEmployees()` function called
2. API Request → `GET /api/employees`
3. Database returns → All employees from database
4. UI updates → Employee list displayed

### **Loading Expenses:**
1. Component mounts → `loadExpenses()` function called
2. API Request → `GET /api/expenses`
3. Database returns → All expenses from database
4. UI updates → Expense list displayed

---

## ✅ **Verification**

After adding data through the UI or CURL, verify it's in the database:

```bash
# Check employees
curl -X GET http://localhost:8080/api/employees

# Check expenses
curl -X GET http://localhost:8080/api/expenses
```

---

## 🔄 **Data Flow**

```
Database ← API Endpoint ← Application UI
         ← CURL Request
```

All data comes from the database - no hardcoded or localStorage data.

---

*These CURL requests fetch data directly from your database.*

