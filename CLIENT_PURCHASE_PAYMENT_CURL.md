# Client Purchase & Payment - CURL Requests

## 📋 Overview

This document provides CURL commands for:
1. **Adding Client Purchase Details** - Record purchases from clients
2. **Payment Paid to Client** - Record payments made to clients (creates expense automatically)

---

## 🔐 Authentication

**Get your auth token first:**

```bash
# Login to get token
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "yourpassword"
  }'
```

**Save the token:**
```bash
# Extract token from response and save it
TOKEN="your_jwt_token_here"
```

---

## 📦 **1. ADD CLIENT PURCHASE DETAILS**

### Current Status
⚠️ **Note**: Client purchases are currently stored in **localStorage** (frontend only). If your backend has an endpoint for client purchases, use the format below.

### Option A: If Backend Has Client Purchase Endpoint

```bash
curl -X POST http://localhost:8080/api/client-purchases \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "clientName": "ABC Company",
    "purchaseDescription": "Marble tiles purchase",
    "totalAmount": 50000.00,
    "purchaseDate": "2025-01-15",
    "notes": "Additional notes about the purchase"
  }'
```

**Request Body Fields:**
- `clientName` (string, required): Name of the client
- `purchaseDescription` (string, required): Description of purchase
- `totalAmount` (number, required): Total amount to pay
- `purchaseDate` (string, required): Date in YYYY-MM-DD format
- `notes` (string, optional): Additional notes

**Success Response (201 Created):**
```json
{
  "id": 1,
  "clientName": "ABC Company",
  "purchaseDescription": "Marble tiles purchase",
  "totalAmount": 50000.00,
  "purchaseDate": "2025-01-15",
  "notes": "Additional notes about the purchase",
  "payments": [],
  "createdAt": "2025-01-15T10:30:00Z"
}
```

### Option B: Using Expenses API (Alternative)

If your backend doesn't have a dedicated client purchase endpoint, you can use the Expenses API:

```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "client_purchase",
    "date": "2025-01-15",
    "category": "client_purchase",
    "description": "Purchase from ABC Company - Marble tiles purchase",
    "amount": 50000.00,
    "paymentMethod": "cash"
  }'
```

---

## 💰 **2. PAYMENT PAID TO CLIENT**

### Simple Payment Transaction API

Just hit one API endpoint to track a payment transaction for a client:

```bash
curl -X POST http://localhost:8080/api/client-purchases/{PURCHASE_ID}/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "clientId": "ABC Company",
    "amount": 20000.00,
    "date": "2025-01-20",
    "paymentMethod": "cash",
    "notes": "First installment"
  }'
```

**Request Body Fields:**
- `clientId` (string, required): **Client ID from database** - Used to fetch all payments for this client
- `amount` (number, required): Payment amount
- `date` (string, required): Payment date in YYYY-MM-DD format
- `paymentMethod` (string, required): Payment method - `"cash"`, `"bank"`, `"card"`, or `"upi"`
- `notes` (string, optional): Payment notes

**Success Response (201 Created):**
```json
{
  "id": 123,
  "clientId": "ABC Company",
  "amount": 20000.00,
  "date": "2025-01-20",
  "paymentMethod": "cash",
  "notes": "First installment",
  "createdAt": "2025-01-20T14:30:00Z"
}
```

**That's it!** The backend handles storing the payment and linking it to the purchase and client.

### Create Expense for Payment (Optional - if you want to track as expense)

```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "client_payment",
    "date": "2025-01-20",
    "category": "client_payment",
    "description": "Payment to ABC Company - Marble tiles purchase",
    "amount": 20000.00,
    "paymentMethod": "cash"
  }'
```

**Request Body Fields:**
- `type` (string, required): Must be `"client_payment"`
- `date` (string, required): Payment date in YYYY-MM-DD format
- `category` (string, required): Must be `"client_payment"`
- `description` (string, required): Description of payment (e.g., "Payment to {ClientName} - {PurchaseDescription}")
- `amount` (number, required): Payment amount
- `paymentMethod` (string, required): Payment method - `"cash"`, `"bank"`, `"card"`, or `"upi"`

**Success Response (201 Created):**
```json
{
  "id": 123,
  "type": "client_payment",
  "date": "2025-01-20",
  "category": "client_payment",
  "description": "Payment to ABC Company - Marble tiles purchase",
  "amount": 20000.00,
  "paymentMethod": "cash",
  "createdAt": "2025-01-20T14:30:00Z"
}
```

### Get All Payments for a Client

```bash
# Get all client purchases (includes payments)
curl -X GET http://localhost:8080/api/client-purchases \
  -H "Authorization: Bearer $TOKEN"

# Filter payments by clientId in your application
# Or use a query parameter if your backend supports it:
curl -X GET "http://localhost:8080/api/client-purchases?clientId=ABC Company" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📝 **Complete Example Workflow**

### Step 1: Add Client Purchase
```bash
# Add a purchase from ABC Company
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "client_purchase",
    "date": "2025-01-15",
    "category": "client_purchase",
    "description": "Purchase from ABC Company - Marble tiles purchase",
    "amount": 50000.00,
    "paymentMethod": "cash"
  }'
```

### Step 2: Make First Payment to Client
```bash
# Pay ₹20,000 to ABC Company
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "client_payment",
    "date": "2025-01-20",
    "category": "client_payment",
    "description": "Payment to ABC Company - Marble tiles purchase - First installment",
    "amount": 20000.00,
    "paymentMethod": "cash"
  }'
```

### Step 3: Make Second Payment to Client
```bash
# Pay another ₹15,000 to ABC Company
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "client_payment",
    "date": "2025-01-25",
    "category": "client_payment",
    "description": "Payment to ABC Company - Marble tiles purchase - Second installment",
    "amount": 15000.00,
    "paymentMethod": "bank"
  }'
```

---

## 🔍 **View Client Payments**

### Get All Payments (Direct Endpoint)

```bash
curl -X GET http://localhost:8080/api/client-purchases/payments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Response (200 OK):**
```json
[
  {
    "id": 123,
    "clientId": "ABC Company",
    "amount": 20000.00,
    "date": "2025-01-20",
    "paymentMethod": "cash",
    "notes": "First installment",
    "createdAt": "2025-01-20T14:30:00Z"
  },
  {
    "id": 124,
    "clientId": "ABC Company",
    "amount": 15000.00,
    "date": "2025-01-25",
    "paymentMethod": "bank",
    "notes": "Second installment",
    "createdAt": "2025-01-25T10:15:00Z"
  }
]
```

### Get All Client Payments (Via Expenses API - Alternative)
```bash
curl -X GET "http://localhost:8080/api/expenses?type=client_payment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

### Get Client Payments for Specific Date Range
```bash
curl -X GET "http://localhost:8080/api/expenses?type=client_payment&startDate=2025-01-01&endDate=2025-01-31" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

### Get All Client Purchases
```bash
curl -X GET "http://localhost:8080/api/expenses?type=client_purchase" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

---

## 🧪 **Testing with Windows CMD**

### Get Token First:
```cmd
curl -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@example.com\",\"password\":\"yourpassword\"}"
```

### Save Token (PowerShell):
```powershell
$response = curl -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@example.com\",\"password\":\"yourpassword\"}'
$token = ($response | ConvertFrom-Json).token
```

### Make Payment (PowerShell):
```powershell
curl -X POST http://localhost:8080/api/expenses `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -d '{
    "type": "client_payment",
    "date": "2025-01-20",
    "category": "client_payment",
    "description": "Payment to ABC Company - Marble tiles purchase",
    "amount": 20000.00,
    "paymentMethod": "cash"
  }'
```

---

## 📊 **Payment Methods**

Valid values for `paymentMethod`:
- `"cash"` - Cash payment
- `"bank"` - Bank transfer
- `"card"` - Card payment
- `"upi"` - UPI payment

---

## ✅ **Quick Reference**

### Add Client Purchase:
```bash
POST /api/expenses
Body: { "type": "client_purchase", "date": "...", "category": "client_purchase", "description": "...", "amount": 50000.00, "paymentMethod": "cash" }
```

### Make Payment to Client:
```bash
POST /api/expenses
Body: { "type": "client_payment", "date": "...", "category": "client_payment", "description": "...", "amount": 20000.00, "paymentMethod": "cash" }
```

### View Client Payments:
```bash
GET /api/expenses?type=client_payment
```

---

## 🔗 **Related Endpoints**

- **Get All Expenses**: `GET /api/expenses`
- **Get Expense by ID**: `GET /api/expenses/{id}`
- **Update Expense**: `PUT /api/expenses/{id}`
- **Delete Expense**: `DELETE /api/expenses/{id}`

---

## 📝 **Notes**

1. **Client purchases** are currently stored in localStorage in the frontend. If you want to migrate to API, you'll need backend endpoints.

2. **Client payments** automatically create expenses via `POST /api/expenses` with type `client_payment`.

3. All payments to clients are **automatically counted as expenses** and appear in your expenses list.

4. The `description` field should include:
   - Client name
   - Purchase description
   - Payment notes (optional)

---

**Last Updated**: January 2025


