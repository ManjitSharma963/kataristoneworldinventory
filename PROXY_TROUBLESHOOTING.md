# 🔧 Proxy Troubleshooting Guide

## Issue: 404 Errors - Proxy Not Working

If you're seeing 404 errors like:
```
Failed to load resource: the server responded with a status of 404 (Not Found)
:3001/api/employees:1
```

This means the proxy is **NOT** forwarding requests to `http://localhost:8080`.

---

## ✅ **Solution Steps**

### **Step 1: Verify Proxy File Location**
The proxy file **MUST** be at:
```
src/setupProxy.js
```
✅ Check: `dir src\setupProxy.js` (Windows) or `ls src/setupProxy.js` (Mac/Linux)

### **Step 2: Verify Package Installation**
```bash
npm list http-proxy-middleware
```
Should show: `http-proxy-middleware@^3.0.5`

If not installed:
```bash
npm install http-proxy-middleware --save-dev
```

### **Step 3: RESTART React Dev Server**
**CRITICAL:** You **MUST** restart the React dev server after creating/modifying `setupProxy.js`:

1. **Stop the server:** Press `Ctrl+C` in the terminal where `npm start` is running
2. **Start again:**
   ```bash
   npm start
   ```

### **Step 4: Check Proxy Logs**
When you start the server, you should see in the terminal:
```
[SETUP PROXY] Configuring proxy for /api -> http://localhost:8080/api
[SETUP PROXY] Proxy configured successfully
```

When you make API calls, you should see:
```
[PROXY] GET /api/employees -> http://localhost:8080/api/employees
[PROXY] Response 200 for /api/employees
```

**If you DON'T see these logs:**
- The proxy file is not being loaded
- Check file location: `src/setupProxy.js` (not `src/utils/setupProxy.js`)
- Restart the server

---

## 🔍 **Verify Backend is Running**

Make sure your backend API is running on `http://localhost:8080`:

```bash
curl -X GET http://localhost:8080/api/employees
```

Should return employee data (not 404).

---

## 🚨 **If Proxy Still Doesn't Work**

### **Option 1: Check React Scripts Version**
```bash
npm list react-scripts
```
Should be `react-scripts@5.0.1` or higher.

### **Option 2: Clear Cache and Reinstall**
```bash
# Stop the server first (Ctrl+C)
rm -rf node_modules package-lock.json
npm install
npm start
```

### **Option 3: Verify File Syntax**
Open `src/setupProxy.js` and ensure it's valid JavaScript (no syntax errors).

---

## 📝 **Current Configuration**

```javascript
// src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
    })
  );
};
```

---

## ✅ **Expected Behavior**

1. **App makes request:** `GET /api/employees`
2. **Proxy intercepts:** Forwards to `http://localhost:8080/api/employees`
3. **Backend responds:** Returns employee data
4. **Proxy forwards response:** Back to the app
5. **No CORS errors:** Because request appears to come from same origin

---

## 🎯 **Quick Test**

After restarting the server, open browser console and check:
- Network tab should show requests to `http://localhost:3001/api/employees` (not 8080)
- Terminal should show `[PROXY]` logs
- No CORS errors in console

---

*If issues persist, check the terminal where `npm start` is running for proxy logs.*

