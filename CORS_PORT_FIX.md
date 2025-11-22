# CORS Port Mismatch Fix - Permanent Solution

## 🔴 Why This Happens Every Time

### The Problem

1. **Backend CORS Configuration**: Your backend only allows `http://localhost:3000`
2. **React Dev Server**: Automatically uses the next available port if 3000 is busy
   - If port 3000 is occupied → uses 3001
   - If port 3001 is occupied → uses 3002
   - And so on...

3. **Result**: Frontend on port 3001 tries to access backend → CORS error!

### Why It Happens "Every Time"

- Port 3000 might be busy (another app, previous server instance)
- React dev server automatically picks next available port
- Backend CORS doesn't allow the new port
- CORS error occurs

## ✅ Permanent Fix Applied

I've made two changes to **force port 3000**:

### 1. Created `.env` File
```
PORT=3000
```
This tells React to always use port 3000.

### 2. Updated `package.json` Start Script
```json
"start": "set PORT=3000 && react-scripts start"
```
This ensures port 3000 is used even if `.env` is missing.

## 🚀 What You Need to Do

1. **Stop your current React dev server** (if running)
   - Press `Ctrl+C` in the terminal

2. **Kill any process using port 3000** (if needed):
   ```bash
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID_NUMBER> /F
   
   # Or use Task Manager to end Node.js processes
   ```

3. **Restart React dev server**:
   ```bash
   npm start
   ```

4. **Verify it's running on port 3000**:
   - Check terminal output: `Local: http://localhost:3000`
   - Browser should open at `http://localhost:3000`

## ✅ Verification

After restart, check:
- ✅ URL in browser: `http://localhost:3000` (not 3001)
- ✅ No CORS errors in console
- ✅ API calls work correctly

## 🔧 Alternative: If Port 3000 is Always Busy

If you can't free port 3000, you have two options:

### Option 1: Update Backend CORS (Recommended)

Update your backend to allow multiple ports:

**Spring Boot:**
```java
.allowedOrigins("http://localhost:3000", "http://localhost:3001", "http://localhost:3002")
```

**Node.js/Express:**
```javascript
origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']
```

**Python/Flask:**
```python
origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]
```

### Option 2: Use Different Port for Backend

If you control the backend, you could:
- Run backend on port 8081
- Update frontend API URL to `http://localhost:8081/api`
- Update backend CORS to allow `http://localhost:3001`

## 🐛 Troubleshooting

### Port 3000 Still Not Working?

1. **Check if port 3000 is free:**
   ```bash
   # Windows
   netstat -ano | findstr :3000
   
   # Should return nothing if port is free
   ```

2. **Kill processes on port 3000:**
   ```bash
   # Find PID
   netstat -ano | findstr :3000
   
   # Kill it (replace <PID> with actual number)
   taskkill /PID <PID> /F
   ```

3. **Check `.env` file exists** in project root
4. **Restart React dev server**

### Still Getting CORS Errors?

1. **Clear browser cache** (`Ctrl+Shift+R`)
2. **Check browser URL** - should be `localhost:3000`
3. **Verify backend is running** on port 8080
4. **Check backend CORS** allows `http://localhost:3000`

## 📝 Summary

**Root Cause**: React dev server uses random port when 3000 is busy, but backend only allows 3000.

**Solution**: Force React to always use port 3000 via `.env` file and `package.json` script.

**Result**: Frontend always runs on port 3000, matching backend CORS configuration.

---

**Last Updated**: January 2025

