# Setup Guide - Kataria Stone World Inventory System

This guide provides step-by-step instructions for setting up the application from scratch.

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- [ ] Node.js installed (v14.0.0 or higher)
- [ ] npm or yarn installed
- [ ] Backend API server running
- [ ] Git installed (if cloning from repository)
- [ ] Code editor (VS Code recommended)
- [ ] Modern web browser

## 🚀 Quick Start

### Step 1: Install Node.js

**Windows:**
1. Download from [nodejs.org](https://nodejs.org/)
2. Run installer and follow prompts
3. Verify: Open Command Prompt and run `node --version`

**Mac:**
```bash
# Using Homebrew
brew install node
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm
```

### Step 2: Clone/Download Project

**Option A: Git Clone**
```bash
git clone <repository-url>
cd katariastoneworld-inventory
```

**Option B: Download ZIP**
1. Download project ZIP file
2. Extract to desired location
3. Open terminal in project folder

### Step 3: Install Dependencies

```bash
npm install
```

This will install:
- React and React DOM
- React Hook Form
- Recharts (for charts)
- Yup (for validation)
- All other dependencies

**Expected Output:**
```
added 1234 packages in 2m
```

### Step 4: Configure API

1. Open `src/config/api.js`
2. Verify API base URL:
   ```javascript
   export const API_BASE_URL = 'http://localhost:8080/api';
   ```
3. Update if your backend runs on different URL/port

### Step 5: Start Backend Server

**Important**: Backend must be running before starting frontend!

1. Navigate to backend directory
2. Start backend server (usually `npm start` or `node server.js`)
3. Verify backend is running on `http://localhost:8080`
4. Test: Open `http://localhost:8080/api` in browser (should show API info or error)

### Step 6: Start Frontend

```bash
npm start
```

**Expected Output:**
```
Compiled successfully!

You can now view katariastoneworld-inventory in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000

Note that the development build is not optimized.
```

### Step 7: Access Application

1. Browser should open automatically
2. If not, navigate to `http://localhost:3000`
3. You should see the login/register page

## 🔧 Configuration Details

### API Configuration

**File**: `src/config/api.js`

```javascript
// Development
export const API_BASE_URL = 'http://localhost:8080/api';

// Production (update before deployment)
export const API_BASE_URL = 'https://your-production-api.com/api';
```

### Proxy Configuration

**File**: `src/setupProxy.js`

**Current Status**: Proxy is **disabled** (using direct API calls)

**To Enable Proxy:**
1. Uncomment the proxy code in `src/setupProxy.js`
2. Restart development server
3. API calls will go through proxy at `/api/*`

### Environment Variables (Optional)

Create `.env` file in root directory:

```env
REACT_APP_API_BASE_URL=http://localhost:8080/api
REACT_APP_ENVIRONMENT=development
```

Then update `src/config/api.js`:
```javascript
export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api';
```

## 👤 First Time Setup

### 1. Create Admin Account

**Option A: Using Registration Page**
1. Navigate to Register page
2. Fill in details:
   - Name: Your Name
   - Email: admin@example.com
   - Password: (strong password)
   - Location: Bhondsi or Tapugada
   - Role: admin (if backend supports it)
3. Click Register

**Option B: Using CURL**
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

### 2. Login

1. Use registered email and password
2. Click Login
3. You should be redirected to Dashboard

### 3. Initial Data Setup

**Add Inventory Items:**
1. Go to Dashboard → Inventory tab
2. Click "Add Inventory"
3. Fill in product details
4. Save

**Add Employees (Optional):**
1. Go to Expenses → Employee tab
2. Click "Add Employee"
3. Fill in employee details
4. Save

## 🧪 Testing the Setup

### Test API Connection

1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Check for API request logs (in development mode)
4. Look for any CORS or connection errors

### Test Authentication

1. Try logging in with created account
2. Check if token is stored: Open Console and run:
   ```javascript
   localStorage.getItem('authToken')
   ```
3. Should return a JWT token string

### Test Features

- [ ] Login/Logout works
- [ ] Dashboard loads
- [ ] Can create inventory item
- [ ] Can create bill/sale
- [ ] Can view reports
- [ ] Date sorting works (newest first)

## 🐛 Troubleshooting Setup Issues

### Issue: npm install fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Issue: Port 3000 already in use

**Solution:**
```bash
# Use different port
PORT=3001 npm start

# Or kill process on port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -ti:3000 | xargs kill
```

### Issue: Cannot connect to backend

**Checklist:**
- [ ] Backend server is running
- [ ] Backend is on correct port (8080)
- [ ] API URL in `src/config/api.js` is correct
- [ ] No firewall blocking connection
- [ ] Check backend logs for errors

### Issue: CORS errors

**Solution:**
1. Check backend CORS configuration
2. Ensure backend allows `http://localhost:3000`
3. Or enable proxy in `src/setupProxy.js`

### Issue: Build fails

**Solution:**
```bash
# Update npm
npm install -g npm@latest

# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# Try build again
npm run build
```

## 📦 Production Build

### Create Production Build

```bash
npm run build
```

### Test Production Build Locally

```bash
# Install serve globally
npm install -g serve

# Serve build folder
serve -s build

# Or use npx
npx serve -s build
```

### Build Output

- Location: `build/` folder
- Contains: Optimized, minified files
- Size: Typically 200-500 KB (gzipped)

## 🔄 Updating the Application

### Update Dependencies

```bash
# Check for outdated packages
npm outdated

# Update all packages
npm update

# Or update specific package
npm install package-name@latest
```

### Update Code

1. Pull latest changes (if using Git):
   ```bash
   git pull origin main
   ```

2. Install new dependencies:
   ```bash
   npm install
   ```

3. Restart development server:
   ```bash
   npm start
   ```

## 📝 Next Steps

After successful setup:

1. **Explore Features**: Test all modules
2. **Add Data**: Create inventory items, employees
3. **Configure**: Update settings as needed
4. **Customize**: Modify styling, add features
5. **Deploy**: Follow deployment guide when ready

## 🆘 Getting Help

If you encounter issues:

1. Check `TROUBLESHOOTING.md`
2. Review browser console for errors
3. Check backend server logs
4. Verify all prerequisites are met
5. Review API documentation

---

**Last Updated**: January 2025

