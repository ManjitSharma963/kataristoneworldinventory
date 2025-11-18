# 👤 Add Employee - CURL Request

## ✅ **Add New Employee to Organization**

Use this CURL request to add a new employee in the Employee section:

```bash
curl --location 'http://localhost:8080/api/employees' \
--header 'Content-Type: application/json' \
--data '{
    "employeeName": "Sumit Kumar",
    "salaryAmount": 25000.00,
    "joiningDate": "2025-01-15"
}'
```

---

## 📋 **Request Details**

### **Endpoint:**
```
POST http://localhost:8080/api/employees
```

### **Headers:**
```
Content-Type: application/json
```

### **Request Body:**
```json
{
    "employeeName": "Sumit Kumar",
    "salaryAmount": 25000.00,
    "joiningDate": "2025-01-15"
}
```

### **Required Fields:**
- ✅ `employeeName` (string) - Full name of the employee
- ✅ `salaryAmount` (number) - Monthly salary amount
- ✅ `joiningDate` (string) - Joining date in `YYYY-MM-DD` format

---

## 📝 **Examples**

### **Example 1: Add Employee**
```bash
curl --location 'http://localhost:8080/api/employees' \
--header 'Content-Type: application/json' \
--data '{
    "employeeName": "Rajesh Singh",
    "salaryAmount": 15000.00,
    "joiningDate": "2025-10-01"
}'
```

### **Example 2: Add Another Employee**
```bash
curl --location 'http://localhost:8080/api/employees' \
--header 'Content-Type: application/json' \
--data '{
    "employeeName": "Priya Sharma",
    "salaryAmount": 30000.00,
    "joiningDate": "2025-11-01"
}'
```

### **Example 3: Add Employee with Different Salary**
```bash
curl --location 'http://localhost:8080/api/employees' \
--header 'Content-Type: application/json' \
--data '{
    "employeeName": "Amit Patel",
    "salaryAmount": 18000.00,
    "joiningDate": "2025-09-15"
}'
```

---

## ✅ **Expected Response**

### **Success Response (200 OK):**
```json
{
    "id": 1,
    "employeeName": "Sumit Kumar",
    "salaryAmount": 25000.00,
    "joiningDate": "2025-01-15",
    "createdAt": "2025-11-10T10:30:00Z"
}
```

### **Error Response (400 Bad Request):**
```json
{
    "error": "Validation failed",
    "message": "Missing required field: employeeName"
}
```

---

## 🔄 **How It Works in the App**

When you add an employee through the UI:

1. **User fills the form** in Employee section
2. **Form submits** → Calls `apiCreateEmployee(employeeData)`
3. **API Request** → `POST /api/employees` with the data
4. **Database stores** → Employee saved to database
5. **UI updates** → Employee list refreshes from API

The exact same CURL request format is used internally by the application.

---

## 📊 **Related Operations**

### **Get All Employees:**
```bash
curl --location 'http://localhost:8080/api/employees'
```

### **Get Employee by ID:**
```bash
curl --location 'http://localhost:8080/api/employees/1'
```

### **Update Employee:**
```bash
curl --location --request PUT 'http://localhost:8080/api/employees/1' \
--header 'Content-Type: application/json' \
--data '{
    "employeeName": "Sumit Kumar",
    "salaryAmount": 30000.00,
    "joiningDate": "2025-01-15"
}'
```

### **Delete Employee:**
```bash
curl --location --request DELETE 'http://localhost:8080/api/employees/1'
```

---

## ✅ **Verification**

After adding an employee, verify it was saved:

1. **Check in UI:** Go to Expenses → Employee tab
2. **Or use CURL:**
   ```bash
   curl --location 'http://localhost:8080/api/employees'
   ```

---

*This CURL request format is used by the application for all employee operations.*

