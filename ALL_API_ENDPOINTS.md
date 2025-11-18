# Complete List of API Endpoints Used in the Application

**Base URL:** `http://localhost:8080/api`

This document lists all API endpoints used in the application that require authentication.

---

## 🔐 **AUTHENTICATION ENDPOINTS** (Public - No Auth Required)

### 1. Register User
- **Endpoint:** `POST /api/auth/register`
- **Description:** Create a new user account
- **Auth Required:** ❌ No

### 2. Login User
- **Endpoint:** `POST /api/auth/login`
- **Description:** Authenticate user and get token
- **Auth Required:** ❌ No

---

## 📦 **INVENTORY ENDPOINTS** (Protected - Auth Required)

### 1. Get All Inventory Items
- **Endpoint:** `GET /api/inventory`
- **Description:** Retrieve all inventory items
- **Auth Required:** ✅ Yes
- **Used in:** Dashboard.js, Reports.js

### 2. Get Inventory Item by ID
- **Endpoint:** `GET /api/inventory/{id}`
- **Description:** Retrieve a specific inventory item
- **Auth Required:** ✅ Yes
- **Used in:** Dashboard.js

### 3. Create Inventory Item
- **Endpoint:** `POST /api/inventory`
- **Description:** Create a new inventory item
- **Auth Required:** ✅ Yes
- **Used in:** Dashboard.js

### 4. Update Inventory Item
- **Endpoint:** `PUT /api/inventory/{id}`
- **Description:** Update an existing inventory item
- **Auth Required:** ✅ Yes
- **Used in:** Dashboard.js

### 5. Delete Inventory Item
- **Endpoint:** `DELETE /api/inventory/{id}`
- **Description:** Delete an inventory item
- **Auth Required:** ✅ Yes
- **Used in:** Dashboard.js

---

## 💰 **BILLS/SALES ENDPOINTS** (Protected - Auth Required)

### 1. Get All Bills
- **Endpoint:** `GET /api/bills`
- **Description:** Retrieve all bills (sales records)
- **Auth Required:** ✅ Yes
- **Used in:** Dashboard.js, Reports.js

### 2. Get Bill by ID
- **Endpoint:** `GET /api/bills/{id}`
- **Description:** Retrieve a specific bill
- **Auth Required:** ✅ Yes
- **Used in:** Dashboard.js

### 3. Download GST Bill PDF
- **Endpoint:** `GET /api/bills/gst/{id}/download`
- **Description:** Download GST bill as PDF
- **Auth Required:** ✅ Yes
- **Headers:** `Accept: application/pdf`
- **Used in:** Dashboard.js (via downloadBillPDF)

### 4. Download Non-GST Bill PDF
- **Endpoint:** `GET /api/bills/nongst/{id}/download`
- **Description:** Download Non-GST bill as PDF
- **Auth Required:** ✅ Yes
- **Headers:** `Accept: application/pdf`
- **Used in:** Dashboard.js (via downloadBillPDF)

---

## 👥 **EMPLOYEE ENDPOINTS** (Protected - Auth Required)

### 1. Get All Employees
- **Endpoint:** `GET /api/employees`
- **Description:** Retrieve all employees
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via fetchEmployees)

### 2. Get Employee by ID
- **Endpoint:** `GET /api/employees/{id}`
- **Description:** Retrieve a specific employee
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via fetchEmployeeById)

### 3. Create Employee
- **Endpoint:** `POST /api/employees`
- **Description:** Create a new employee
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via createEmployee)

### 4. Update Employee
- **Endpoint:** `PUT /api/employees/{id}`
- **Description:** Update an existing employee
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via updateEmployee)

### 5. Delete Employee
- **Endpoint:** `DELETE /api/employees/{id}`
- **Description:** Delete an employee
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via deleteEmployee)

---

## 💵 **EXPENSE ENDPOINTS** (Protected - Auth Required)

### 1. Get All Expenses
- **Endpoint:** `GET /api/expenses`
- **Description:** Retrieve all expenses
- **Query Parameters (optional):**
  - `type` - Filter by type: 'daily', 'salary', 'advance'
  - `startDate` - Start date (YYYY-MM-DD)
  - `endDate` - End date (YYYY-MM-DD)
  - `employeeId` - Filter by employee ID
  - `month` - Filter by month (YYYY-MM)
  - `settled` - Filter by settled status (true/false)
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js, Reports.js (via fetchExpenses)

### 2. Get Expense by ID
- **Endpoint:** `GET /api/expenses/{id}`
- **Description:** Retrieve a specific expense
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via fetchExpenseById)

### 3. Create Expense
- **Endpoint:** `POST /api/expenses`
- **Description:** Create a new expense (daily, salary, or advance)
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via createExpense)

### 4. Update Expense
- **Endpoint:** `PUT /api/expenses/{id}`
- **Description:** Update an existing expense
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via updateExpense)

### 5. Delete Expense
- **Endpoint:** `DELETE /api/expenses/{id}`
- **Description:** Delete an expense
- **Auth Required:** ✅ Yes
- **Used in:** Expenses.js (via deleteExpense)

---

## 📊 **SUMMARY**

### Total Endpoints: **20**

#### Public Endpoints (No Auth): **2**
- `POST /api/auth/register`
- `POST /api/auth/login`

#### Protected Endpoints (Auth Required): **18**

**Inventory (5 endpoints):**
- `GET /api/inventory`
- `GET /api/inventory/{id}`
- `POST /api/inventory`
- `PUT /api/inventory/{id}`
- `DELETE /api/inventory/{id}`

**Bills/Sales (4 endpoints):**
- `GET /api/bills`
- `GET /api/bills/{id}`
- `GET /api/bills/gst/{id}/download`
- `GET /api/bills/nongst/{id}/download`

**Employees (5 endpoints):**
- `GET /api/employees`
- `GET /api/employees/{id}`
- `POST /api/employees`
- `PUT /api/employees/{id}`
- `DELETE /api/employees/{id}`

**Expenses (5 endpoints):**
- `GET /api/expenses`
- `GET /api/expenses/{id}`
- `POST /api/expenses`
- `PUT /api/expenses/{id}`
- `DELETE /api/expenses/{id}`

---

## 🔒 **AUTHENTICATION IMPLEMENTATION**

All protected endpoints should:
1. **Require JWT Token** in the `Authorization` header:
   ```
   Authorization: Bearer <token>
   ```

2. **Validate Token** on every request
3. **Return 401 Unauthorized** if:
   - Token is missing
   - Token is invalid
   - Token is expired

4. **Return 403 Forbidden** if:
   - User doesn't have permission to access the resource

---

## 📝 **EXAMPLE: Adding Authentication to Endpoints**

### Backend Implementation Example (Java Spring Boot):

```java
@RestController
@RequestMapping("/api")
public class InventoryController {
    
    @GetMapping("/inventory")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Inventory>> getAllInventory(
        @RequestHeader("Authorization") String token
    ) {
        // Validate token
        // Return inventory items
    }
    
    @PostMapping("/inventory")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Inventory> createInventory(
        @RequestHeader("Authorization") String token,
        @RequestBody Inventory inventory
    ) {
        // Validate token
        // Create inventory item
    }
}
```

### Or use a Global Filter/Interceptor:

```java
@Component
public class AuthInterceptor implements HandlerInterceptor {
    
    @Override
    public boolean preHandle(HttpServletRequest request, 
                           HttpServletResponse response, 
                           Object handler) {
        String path = request.getRequestURI();
        
        // Skip auth for public endpoints
        if (path.startsWith("/api/auth/")) {
            return true;
        }
        
        // Validate token for all other endpoints
        String token = request.getHeader("Authorization");
        if (token == null || !token.startsWith("Bearer ")) {
            response.setStatus(401);
            return false;
        }
        
        // Validate JWT token
        // Return true if valid, false otherwise
    }
}
```

---

## 🧪 **TESTING WITH AUTHENTICATION**

### Example: Get All Inventory (with token)
```bash
# First, login to get token
TOKEN=$(curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  | jq -r '.token')

# Then use token for protected endpoints
curl -X GET http://localhost:8080/api/inventory \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

---

## 📋 **QUICK REFERENCE CHECKLIST**

Use this checklist to ensure all endpoints are protected:

- [ ] `GET /api/inventory` - ✅ Protected
- [ ] `GET /api/inventory/{id}` - ✅ Protected
- [ ] `POST /api/inventory` - ✅ Protected
- [ ] `PUT /api/inventory/{id}` - ✅ Protected
- [ ] `DELETE /api/inventory/{id}` - ✅ Protected
- [ ] `GET /api/bills` - ✅ Protected
- [ ] `GET /api/bills/{id}` - ✅ Protected
- [ ] `GET /api/bills/gst/{id}/download` - ✅ Protected
- [ ] `GET /api/bills/nongst/{id}/download` - ✅ Protected
- [ ] `GET /api/employees` - ✅ Protected
- [ ] `GET /api/employees/{id}` - ✅ Protected
- [ ] `POST /api/employees` - ✅ Protected
- [ ] `PUT /api/employees/{id}` - ✅ Protected
- [ ] `DELETE /api/employees/{id}` - ✅ Protected
- [ ] `GET /api/expenses` - ✅ Protected
- [ ] `GET /api/expenses/{id}` - ✅ Protected
- [ ] `POST /api/expenses` - ✅ Protected
- [ ] `PUT /api/expenses/{id}` - ✅ Protected
- [ ] `DELETE /api/expenses/{id}` - ✅ Protected

---

*Last Updated: January 2025*

