# ⚡ Quick CURL Reference - Most Common Requests

## Base URL: `http://localhost:8080/api`

---

## 🚀 **QUICK START - Copy & Paste Ready**

### **1. Add Daily Expense**
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"type":"daily","date":"2025-11-10","category":"water","description":"Water bill","amount":500.00,"paymentMethod":"cash"}'
```

### **2. Add Employee**
```bash
curl --location 'http://localhost:8080/api/employees' \
--header 'Content-Type: application/json' \
--data '{
    "employeeName": "Sumit Kumar",
    "salaryAmount": 25000.00,
    "joiningDate": "2025-01-15"
}'
```

### **3. Pay Salary**
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"type":"salary","category":"salary","employeeId":"EMPLOYEE_ID","employeeName":"Sumit Kumar","amount":20000.00,"month":"2025-11","date":"2025-11-10","paymentMethod":"cash","description":"Salary payment for Sumit Kumar - 2025-11"}'
```

### **4. Pay Advance**
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"type":"advance","category":"advance","employeeId":"EMPLOYEE_ID","employeeName":"Sumit Kumar","amount":5000.00,"date":"2025-11-10","paymentMethod":"cash","description":"Advance payment for Sumit Kumar","settled":false}'
```

### **5. Get All Expenses**
```bash
curl -X GET http://localhost:8080/api/expenses
```

### **6. Get All Employees**
```bash
curl -X GET http://localhost:8080/api/employees
```

---

## 📝 **Replace These Values:**
- `EMPLOYEE_ID` - Use actual employee ID from response
- `2025-11-10` - Use actual date
- `500.00` - Use actual amount
- `Sumit Kumar` - Use actual employee name

---

*See API_CURL_REQUESTS.md for complete documentation*

