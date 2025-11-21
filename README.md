# Kataria Stone World - Inventory Management System

A comprehensive inventory and sales management system built with React for managing stone inventory, sales, expenses, employees, and customer data.

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [API Configuration](#api-configuration)
- [Authentication](#authentication)
- [Features](#features)
- [Environment Setup](#environment-setup)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)
- [Documentation](#documentation)

---

## 🎯 Project Overview

This is a full-stack inventory management application designed for stone business operations. It includes:

- **Inventory Management**: Track stone products, stock levels, pricing
- **Sales Management**: Create and manage bills, invoices, GST/non-GST transactions
- **Expense Tracking**: Daily expenses, employee salaries, advances
- **Employee Management**: Employee records, salary payments, advance tracking
- **Customer Management**: Customer database with contact information
- **Reports & Analytics**: Sales reports, profit/loss, GST reports, charts
- **Home Screen Management**: Manage hero slides and categories for homepage

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14.0.0 or higher)
- **npm** (v6.0.0 or higher) or **yarn**
- **Backend API Server** running on `http://localhost:8080`
- A modern web browser (Chrome, Firefox, Safari, Edge)

### Verify Installation

```bash
node --version
npm --version
```

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd katariastoneworld-inventory
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- React 19.2.0
- React DOM 19.2.0
- React Hook Form 7.51.0
- Recharts 3.4.1 (for charts and graphs)
- Yup 1.4.0 (for form validation)
- http-proxy-middleware 3.0.5 (for API proxying)

### 3. Start the Development Server

```bash
npm start
```

The application will open at [http://localhost:3000](http://localhost:3000)

---

## ⚙️ Configuration

### API Configuration

The API base URL is configured in `src/config/api.js`:

```javascript
export const API_BASE_URL = 'http://localhost:8080/api';
```

**Important**: 
- The proxy is currently **disabled** in `src/setupProxy.js`
- All API calls are made directly to `http://localhost:8080/api`
- If your backend runs on a different port or URL, update `API_BASE_URL` accordingly

### Changing API Base URL

1. Open `src/config/api.js`
2. Update the `API_BASE_URL` constant:
   ```javascript
   export const API_BASE_URL = 'http://your-backend-url:port/api';
   ```

### Enabling Proxy (Optional)

If you want to use a proxy instead of direct API calls:

1. Open `src/setupProxy.js`
2. Uncomment the proxy configuration code
3. The proxy will forward `/api/*` requests to `http://localhost:8080/api`

---

## 📜 Available Scripts

### `npm start`

Runs the app in development mode at [http://localhost:3000](http://localhost:3000)

- Hot reload enabled
- Console logs for API requests (in development mode)
- Opens browser automatically

### `npm run build`

Builds the app for production to the `build` folder.

- Optimized and minified
- Ready for deployment
- Creates static files for hosting

### `npm test`

Launches the test runner in interactive watch mode.

### `npm run eject`

**⚠️ Warning**: This is a one-way operation. Once you eject, you can't go back!

Ejects from Create React App and gives you full control over configuration.

---

## 📁 Project Structure

```
katariastoneworld-inventory/
├── public/                 # Static files
│   ├── index.html         # Main HTML template
│   ├── favicon.ico        # App icon
│   └── manifest.json      # PWA manifest
├── src/
│   ├── components/        # React components
│   │   ├── Dashboard.js   # Main dashboard
│   │   ├── Sales.js       # Sales management
│   │   ├── Inventory.js   # Inventory management
│   │   ├── Expenses.js    # Expense tracking
│   │   ├── Customers.js   # Customer management
│   │   ├── Reports.js     # Reports and analytics
│   │   ├── Login.js        # Login page
│   │   ├── Register.js     # Registration page
│   │   └── ...
│   ├── config/
│   │   └── api.js         # API configuration
│   ├── utils/
│   │   ├── api.js         # API utility functions
│   │   ├── storage.js     # LocalStorage utilities
│   │   └── validation.js  # Form validation schemas
│   ├── App.js             # Main app component
│   ├── index.js           # Entry point
│   └── setupProxy.js      # Proxy configuration (disabled)
├── package.json           # Dependencies and scripts
└── README.md             # This file
```

---

## 🔌 API Configuration

### Base URL

```
http://localhost:8080/api
```

### Authentication

The application uses **Bearer Token** authentication. Tokens are stored in `localStorage` under the key `authToken`.

### API Endpoints

#### Authentication (Public - No Auth Required)

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

#### Inventory (Protected - Auth Required)

- `GET /api/inventory` - Get all inventory items
- `GET /api/inventory/{id}` - Get inventory item by ID
- `POST /api/inventory` - Create inventory item
- `PUT /api/inventory/{id}` - Update inventory item
- `DELETE /api/inventory/{id}` - Delete inventory item

#### Bills/Sales (Protected - Auth Required)

- `GET /api/bills` - Get all bills
- `GET /api/bills/{id}` - Get bill by ID
- `POST /api/bills` - Create new bill
- `PUT /api/bills/{id}` - Update bill
- `DELETE /api/bills/{id}` - Delete bill
- `GET /api/bills/gst/{id}/download` - Download GST bill PDF

#### Expenses (Protected - Auth Required)

- `GET /api/expenses` - Get all expenses
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/{id}` - Update expense
- `DELETE /api/expenses/{id}` - Delete expense

#### Employees (Protected - Auth Required)

- `GET /api/employees` - Get all employees
- `POST /api/employees` - Create employee
- `PUT /api/employees/{id}` - Update employee
- `DELETE /api/employees/{id}` - Delete employee

#### Categories (Protected - Auth Required)

- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category
- `PUT /api/categories/{id}` - Update category
- `DELETE /api/categories/{id}` - Delete category

#### Heroes (Public for GET, Protected for POST/PUT/DELETE)

- `GET /api/heroes` - Get all hero slides (Public)
- `POST /api/heroes` - Create hero slide (Admin only)
- `PUT /api/heroes/{id}` - Update hero slide (Admin only)
- `DELETE /api/heroes/{id}` - Delete hero slide (Admin only)

For detailed API documentation, see:
- `ALL_API_ENDPOINTS.md` - Complete API endpoint list
- `API_CURL_REQUESTS.md` - CURL request examples
- `AUTH_API_ENDPOINTS.md` - Authentication endpoints

---

## 🔐 Authentication

### User Registration

**Endpoint**: `POST /api/auth/register`

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "password123",
  "location": "Bhondsi",
  "role": "user"  // Optional: "admin" for admin users
}
```

**Location Options**: Must be either `"Bhondsi"` or `"Tapugada"`

**Response**:
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

### User Login

**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "email": "john.doe@example.com",
  "password": "password123"
}
```

**Response**: Same as registration response

### Token Storage

- Tokens are stored in `localStorage` as `authToken`
- Tokens are automatically included in API requests (except auth endpoints)
- Token format: `Bearer {token}` in Authorization header

---

## ✨ Features

### 1. Dashboard
- Sales overview with statistics
- Inventory management
- Quick access to all modules
- Date range filtering
- Search functionality

### 2. Sales Management
- Create GST and Non-GST bills
- Bill item management
- Customer information
- Tax calculations (18% GST)
- Discount support
- Bill printing
- Date-based sorting (newest first by default)

### 3. Inventory Management
- Add/Edit/Delete inventory items
- Product images
- Stock tracking
- Price per sqft management
- Category management
- Low stock indicators

### 4. Expense Tracking
- Daily expenses
- Employee salary payments
- Advance payments
- Client purchases and payments
- Expense categorization
- Date-based sorting (newest first by default)

### 5. Employee Management
- Employee records
- Salary management
- Advance payment tracking
- Payment history
- Pending payment calculations

### 6. Customer Management
- Customer database
- Contact information
- GSTIN tracking
- Location management

### 7. Reports & Analytics
- Profit & Loss reports
- GST reports
- Sales charts (daily, weekly, monthly, yearly)
- Expense analysis
- Category-wise breakdowns
- Date range filtering

### 8. Home Screen Management
- Hero slide management (Admin only)
- Category management
- Display order control
- Active/Inactive status

---

## 🌍 Environment Setup

### Development Environment

1. **Backend Server**: Ensure backend is running on `http://localhost:8080`
2. **Frontend**: Run `npm start` (runs on `http://localhost:3000`)
3. **Browser**: Open `http://localhost:3000` in your browser

### Production Environment

1. Build the application:
   ```bash
   npm run build
   ```

2. The `build` folder contains optimized production files

3. Deploy the `build` folder to your hosting service:
   - Static hosting (Netlify, Vercel, GitHub Pages)
   - Web server (Apache, Nginx)
   - Cloud services (AWS S3, Azure Blob Storage)

### Environment Variables (Optional)

Currently, the app uses hardcoded API URLs. To use environment variables:

1. Create `.env` file in root directory:
   ```
   REACT_APP_API_BASE_URL=http://localhost:8080/api
   ```

2. Update `src/config/api.js`:
   ```javascript
   export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api';
   ```

**Note**: Environment variables must start with `REACT_APP_` to be accessible in React.

---

## 🔧 Troubleshooting

### Common Issues

#### 1. API Connection Errors

**Problem**: Cannot connect to backend API

**Solutions**:
- Verify backend server is running on `http://localhost:8080`
- Check `src/config/api.js` for correct API URL
- Check browser console for CORS errors
- Verify network connectivity

#### 2. Authentication Issues

**Problem**: "Unauthorized" or "Token expired" errors

**Solutions**:
- Clear browser localStorage: `localStorage.clear()`
- Log out and log in again
- Check if token is being sent in request headers
- Verify token format: `Bearer {token}`

#### 3. CORS Errors

**Problem**: CORS policy blocking requests

**Solutions**:
- Ensure backend has CORS enabled for `http://localhost:3000`
- Check backend CORS configuration
- Use proxy if direct calls fail (see `src/setupProxy.js`)

#### 4. Build Errors

**Problem**: `npm run build` fails

**Solutions**:
- Clear node_modules: `rm -rf node_modules && npm install`
- Check for syntax errors in code
- Verify all dependencies are installed
- Check Node.js version compatibility

#### 5. Port Already in Use

**Problem**: Port 3000 is already in use

**Solutions**:
- Kill the process using port 3000
- Use a different port: `PORT=3001 npm start`
- Windows: `netstat -ano | findstr :3000` then `taskkill /PID <PID> /F`

### Debugging

Enable API request logging (already enabled in development):

```javascript
// In src/utils/api.js
if (process.env.NODE_ENV === 'development') {
  console.log('[API] Making request:', { endpoint, url, method });
}
```

### Browser Cache Issues

If you see stale data:

1. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. Clear browser cache
3. Open in incognito/private mode

See `FIX_BROWSER_CACHE_ISSUE.md` for detailed instructions.

---

## 🚀 Deployment

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.

### Deployment Options

#### 1. Static Hosting (Recommended)

**Netlify**:
1. Connect your repository
2. Build command: `npm run build`
3. Publish directory: `build`

**Vercel**:
1. Import your project
2. Framework preset: Create React App
3. Build command: `npm run build`
4. Output directory: `build`

**GitHub Pages**:
1. Install gh-pages: `npm install --save-dev gh-pages`
2. Add to package.json:
   ```json
   "homepage": "https://yourusername.github.io/katariastoneworld-inventory",
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d build"
   }
   ```
3. Deploy: `npm run deploy`

#### 2. Web Server (Apache/Nginx)

1. Build the app: `npm run build`
2. Copy `build/` folder contents to web server directory
3. Configure server to serve `index.html` for all routes
4. Update API URL in `src/config/api.js` to production backend URL

#### 3. Docker (Optional)

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t kataria-inventory .
docker run -p 80:80 kataria-inventory
```

### Post-Deployment Checklist

- [ ] Update API base URL to production backend
- [ ] Test authentication flow
- [ ] Verify all API endpoints are accessible
- [ ] Check CORS configuration on backend
- [ ] Test on multiple browsers
- [ ] Verify responsive design on mobile devices
- [ ] Check console for errors
- [ ] Test all major features

---

## 📚 Documentation

### Additional Documentation Files

- `ALL_API_ENDPOINTS.md` - Complete list of all API endpoints
- `API_CURL_REQUESTS.md` - CURL request examples for testing
- `AUTH_API_ENDPOINTS.md` - Detailed authentication documentation
- `TROUBLESHOOTING.md` - Common issues and solutions
- `PROXY_TROUBLESHOOTING.md` - Proxy-related issues
- `FIX_BROWSER_CACHE_ISSUE.md` - Browser cache problems

### Code Documentation

- API utilities: `src/utils/api.js`
- Validation schemas: `src/utils/validation.js`
- Storage utilities: `src/utils/storage.js`

---

## 🔒 Security Notes

1. **Authentication Tokens**: Stored in localStorage (consider httpOnly cookies for production)
2. **API URLs**: Currently hardcoded (use environment variables for production)
3. **Password Requirements**: Minimum 6 characters (enforced by backend)
4. **CORS**: Ensure backend has proper CORS configuration
5. **HTTPS**: Use HTTPS in production for secure data transmission

---

## 📝 License

[Add your license information here]

---

## 👥 Support

For issues, questions, or contributions:

1. Check existing documentation files
2. Review troubleshooting section
3. Check browser console for errors
4. Verify backend API is running and accessible

---

## 🔄 Version History

- **v0.1.0** - Initial release
  - Inventory management
  - Sales/bills management
  - Expense tracking
  - Employee management
  - Reports and analytics
  - Home screen management

---

## 📞 Contact

[Add contact information if needed]

---

**Last Updated**: January 2025

**Maintained by**: [Your Name/Team]
