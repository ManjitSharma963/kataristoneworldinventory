# 🔌 API CURL Requests - Expenses & Employee Management

## Base URL
```
http://localhost:8080/api
```

**Note**: If your backend API endpoints are different, replace the base URL accordingly.

---

## 🔐 **AUTHENTICATION ENDPOINTS**

### **Register New User (Regular User)**
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john.doe@example.com",
    "password": "password123",
    "location": "Bhondsi"
  }'
```

### **Register Admin User**
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@example.com",
    "password": "admin123",
    "location": "Bhondsi",
    "role": "admin"
  }'
```

**Request Body Fields:**
- `name` (string, required): User's full name
- `email` (string, required): User's email address (must be unique)
- `password` (string, required): Minimum 6 characters
- `location` (string, required): Must be "Bhondsi" or "Tapugada"
- `role` (string, optional): User role - "admin" for admin users, defaults to "user" if not provided

**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john.doe@example.com",
    "location": "Bhondsi",
    "createdAt": "2025-01-15T10:30:00Z"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Validation failed",
  "message": "Email already exists"
}
```

### **Login User**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "password123"
  }'
```

**Request Body Fields:**
- `email` (string, required): User's email address
- `password` (string, required): User's password

**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john.doe@example.com",
    "location": "Bhondsi"
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "error": "Authentication failed",
  "message": "Invalid email or password"
}
```

### **Get Current User (Optional - for future use)**
```bash
curl -X GET http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer <your_token_here>" \
  -H "Accept: application/json"
```

**Success Response (200 OK):**
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john.doe@example.com",
  "location": "Bhondsi",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

---

## 📋 **1. DAILY EXPENSES**

### **1.1 Create Daily Expense**
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "daily",
    "date": "2025-11-10",
    "category": "water",
    "description": "Monthly water bill",
    "amount": 500.00,
    "paymentMethod": "cash"
  }'
```

### **1.2 Get All Expenses**
```bash
curl -X GET http://localhost:8080/api/expenses
```

### **1.3 Get Expenses by Date Range**
```bash
curl -X GET "http://localhost:8080/api/expenses?startDate=2025-11-01&endDate=2025-11-30" \
  -H "Content-Type: application/json"
```

### **1.4 Get Expenses by Type**
```bash
# Get only daily expenses
curl -X GET "http://localhost:8080/api/expenses?type=daily" \
  -H "Content-Type: application/json"

# Get only salary expenses
curl -X GET "http://localhost:8080/api/expenses?type=salary" \
  -H "Content-Type: application/json"

# Get only advance expenses
curl -X GET "http://localhost:8080/api/expenses?type=advance" \
  -H "Content-Type: application/json"
```

### **1.5 Get Expense by ID**
```bash
curl -X GET http://localhost:8080/api/expenses/{expenseId} \
  -H "Content-Type: application/json"
```

### **1.6 Update Expense**
```bash
curl -X PUT http://localhost:8080/api/expenses/{expenseId} \
  -H "Content-Type: application/json" \
  -d '{
    "type": "daily",
    "date": "2025-11-10",
    "category": "electricity",
    "description": "Updated electricity bill",
    "amount": 750.00,
    "paymentMethod": "bank"
  }'
```

### **1.7 Delete Expense**
```bash
curl -X DELETE http://localhost:8080/api/expenses/{expenseId} \
  -H "Content-Type: application/json"
```

---

## 👥 **2. EMPLOYEE MANAGEMENT**

### **2.1 Add Employee (Staff)**
```bash
curl --location 'http://localhost:8080/api/employees' \
--header 'Content-Type: application/json' \
--data '{
    "employeeName": "Sumit Kumar",
    "salaryAmount": 25000.00,
    "joiningDate": "2025-01-15"
}'
```

### **2.2 Get All Employees**
```bash
curl -X GET http://localhost:8080/api/employees
```

### **2.3 Get Employee by ID**
```bash
curl -X GET http://localhost:8080/api/employees/{employeeId} \
  -H "Content-Type: application/json"
```

### **2.4 Update Employee (Update Salary)**
```bash
curl -X PUT http://localhost:8080/api/employees/{employeeId} \
  -H "Content-Type: application/json" \
  -d '{
    "employeeName": "Sumit Kumar",
    "salaryAmount": 25000.00,
    "joiningDate": "2025-01-15"
  }'
```

### **2.5 Delete Employee**
```bash
curl -X DELETE http://localhost:8080/api/employees/{employeeId} \
  -H "Content-Type: application/json"
```

---

## 💰 **3. PAY EMPLOYEE SALARY**

### **3.1 Pay Salary to Employee**
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "salary",
    "category": "salary",
    "employeeId": "employee_id_here",
    "employeeName": "Sumit Kumar",
    "amount": 20000.00,
    "month": "2025-11",
    "date": "2025-11-10",
    "paymentMethod": "cash",
    "description": "Salary payment for Sumit Kumar - 2025-11"
  }'
```

### **3.2 Pay Salary with Bank Transfer**
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "salary",
    "category": "salary",
    "employeeId": "employee_id_here",
    "employeeName": "Sumit Kumar",
    "amount": 20000.00,
    "month": "2025-11",
    "date": "2025-11-10",
    "paymentMethod": "bank",
    "description": "Salary payment for Sumit Kumar - 2025-11"
  }'
```

### **3.3 Get Salary Payments for Employee**
```bash
curl -X GET "http://localhost:8080/api/expenses?type=salary&employeeId={employeeId}" \
  -H "Content-Type: application/json"
```

### **3.4 Get Salary Payments by Month**
```bash
curl -X GET "http://localhost:8080/api/expenses?type=salary&month=2025-11" \
  -H "Content-Type: application/json"
```

---

## 💵 **4. ADVANCE PAYMENT TO EMPLOYEE**

### **4.1 Pay Advance to Employee**
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "advance",
    "category": "advance",
    "employeeId": "employee_id_here",
    "employeeName": "Sumit Kumar",
    "amount": 5000.00,
    "date": "2025-11-10",
    "paymentMethod": "cash",
    "description": "Advance payment for Sumit Kumar",
    "settled": false
  }'
```

### **4.2 Get All Advance Payments**
```bash
curl -X GET "http://localhost:8080/api/expenses?type=advance" \
  -H "Content-Type: application/json"
```

### **4.3 Get Advance Payments for Specific Employee**
```bash
curl -X GET "http://localhost:8080/api/expenses?type=advance&employeeId={employeeId}" \
  -H "Content-Type: application/json"
```

### **4.4 Get Unsettled Advance Payments**
```bash
curl -X GET "http://localhost:8080/api/expenses?type=advance&settled=false" \
  -H "Content-Type: application/json"
```

### **4.5 Mark Advance as Settled (When Salary is Paid)**
```bash
curl -X PUT http://localhost:8080/api/expenses/{advanceExpenseId} \
  -H "Content-Type: application/json" \
  -d '{
    "settled": true
  }'
```

---

## 📊 **5. COMPLETE WORKFLOW EXAMPLES**

### **Example 1: Complete Employee Setup & Salary Payment**

```bash
# Step 1: Add Employee
curl -X POST http://localhost:8080/api/employees \
  -H "Content-Type: application/json" \
  -d '{
    "employeeName": "Rajesh Singh",
    "salaryAmount": 15000.00,
    "joiningDate": "2025-10-01"
  }'

# Response will contain employeeId, use it in next steps
# Example response: {"id": "1234567890", "employeeName": "Rajesh Singh", ...}

# Step 2: Pay Advance
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "advance",
    "category": "advance",
    "employeeId": "1234567890",
    "employeeName": "Rajesh Singh",
    "amount": 3000.00,
    "date": "2025-11-05",
    "paymentMethod": "cash",
    "description": "Advance payment for Rajesh Singh",
    "settled": false
  }'

# Step 3: Pay Salary (remaining amount after advance)
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "salary",
    "category": "salary",
    "employeeId": "1234567890",
    "employeeName": "Rajesh Singh",
    "amount": 12000.00,
    "month": "2025-11",
    "date": "2025-11-10",
    "paymentMethod": "cash",
    "description": "Salary payment for Rajesh Singh - 2025-11"
  }'

# Step 4: Mark advance as settled
curl -X PUT http://localhost:8080/api/expenses/{advanceExpenseId} \
  -H "Content-Type: application/json" \
  -d '{"settled": true}'
```

### **Example 2: Daily Expense Management**

```bash
# Add Water Bill
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "daily",
    "date": "2025-11-10",
    "category": "water",
    "description": "Monthly water bill",
    "amount": 500.00,
    "paymentMethod": "cash"
  }'

# Add Electricity Bill
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "daily",
    "date": "2025-11-10",
    "category": "electricity",
    "description": "Monthly electricity bill",
    "amount": 2000.00,
    "paymentMethod": "bank"
  }'

# Add Rent
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "daily",
    "date": "2025-11-01",
    "category": "rent",
    "description": "Monthly office rent",
    "amount": 10000.00,
    "paymentMethod": "bank"
  }'
```

---

## 🔍 **6. QUERY PARAMETERS**

### **Expenses Query Parameters:**
- `type` - Filter by type: `daily`, `salary`, `advance`
- `category` - Filter by category
- `startDate` - Start date (YYYY-MM-DD)
- `endDate` - End date (YYYY-MM-DD)
- `employeeId` - Filter by employee ID
- `month` - Filter by month (YYYY-MM)
- `settled` - Filter by settled status (true/false)
- `paymentMethod` - Filter by payment method

### **Example Queries:**
```bash
# Get all expenses in November 2025
curl -X GET "http://localhost:8080/api/expenses?startDate=2025-11-01&endDate=2025-11-30"

# Get all cash payments
curl -X GET "http://localhost:8080/api/expenses?paymentMethod=cash"

# Get all unsettled advances
curl -X GET "http://localhost:8080/api/expenses?type=advance&settled=false"
```

---

## 📝 **7. REQUEST/RESPONSE FORMATS**

### **Expense Object Structure:**
```json
{
  "id": "string (auto-generated)",
  "type": "daily | salary | advance",
  "date": "YYYY-MM-DD",
  "category": "string",
  "description": "string (optional)",
  "amount": "number",
  "paymentMethod": "cash | bank | card | upi",
  "employeeId": "string (required for salary/advance)",
  "employeeName": "string (required for salary/advance)",
  "month": "YYYY-MM (required for salary)",
  "settled": "boolean (for advance payments)",
  "createdAt": "ISO 8601 timestamp"
}
```

### **Employee Object Structure:**
```json
{
  "id": "string (auto-generated)",
  "employeeName": "string",
  "salaryAmount": "number",
  "joiningDate": "YYYY-MM-DD",
  "createdAt": "ISO 8601 timestamp"
}
```

---

## ⚠️ **8. ERROR HANDLING**

### **Common Error Responses:**

**400 Bad Request:**
```json
{
  "error": "Validation failed",
  "message": "Missing required field: amount"
}
```

**404 Not Found:**
```json
{
  "error": "Not found",
  "message": "Expense with id '123' not found"
}
```

**500 Server Error:**
```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

---

## 🔐 **9. AUTHENTICATION (If Required)**

If your API requires authentication, add headers:

```bash
# With JWT Token
curl -X GET http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# With API Key
curl -X GET http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY"
```

---

## 📋 **10. QUICK REFERENCE**

### **All Endpoints Summary:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/expenses` | Create expense (daily/salary/advance) |
| GET | `/api/expenses` | Get all expenses |
| GET | `/api/expenses/{id}` | Get expense by ID |
| PUT | `/api/expenses/{id}` | Update expense |
| DELETE | `/api/expenses/{id}` | Delete expense |
| POST | `/api/employees` | Add employee |
| GET | `/api/employees` | Get all employees |
| GET | `/api/employees/{id}` | Get employee by ID |
| PUT | `/api/employees/{id}` | Update employee |
| DELETE | `/api/employees/{id}` | Delete employee |

---

## 💡 **11. TESTING TIPS**

1. **Test with Postman/Insomnia**: Import these CURL commands
2. **Use jq for pretty JSON**: `curl ... | jq`
3. **Save responses**: `curl ... > response.json`
4. **Test error cases**: Send invalid data to test validation

---

*Last Updated: November 2025*

