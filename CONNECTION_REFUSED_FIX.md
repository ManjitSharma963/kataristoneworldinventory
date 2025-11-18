# Fix: "Connection Refused" - Dev Server Not Running

## Problem
- Browser shows: "ERR_CONNECTION_REFUSED" on `localhost:3000`
- Terminal shows: "Compiled successfully!"
- But server is NOT actually running/listening

## Root Cause
The React dev server compiled successfully but **didn't start listening** on any port. This happens when:
1. The server process crashed after compilation
2. The terminal where `npm start` was running was closed
3. There's a runtime error preventing the server from starting

## ✅ Solution Steps

### Step 1: Check Your Terminal Output
Look at the terminal where you ran `npm start`. You should see:
```
Compiled successfully!

You can now view katariastoneworld-inventory in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000

Note that the development build is not optimized.
To create a production build, use npm run build.

webpack compiled successfully
```

**IMPORTANT:** If you see "Compiled successfully" but DON'T see the "Local: http://localhost:3000" line, the server didn't start.

### Step 2: Restart the Dev Server Properly

1. **Stop any existing processes:**
   - Go to the terminal where `npm start` is running
   - Press `Ctrl+C` to stop it
   - Wait until you see the command prompt again

2. **Start the server fresh:**
   ```bash
   npm start
   ```

3. **Watch for these messages:**
   - ✅ "Compiled successfully!"
   - ✅ "Local: http://localhost:3000" (or 3001 if 3000 is in use)
   - ✅ "webpack compiled successfully"

### Step 3: Verify Server is Actually Running

After starting, check if the server is listening:
```bash
# Windows
netstat -ano | findstr :3000

# Should show something like:
# TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    12345
```

If you see nothing, the server didn't start.

### Step 4: Check for Errors

Look at the terminal output for:
- ❌ Red error messages
- ❌ "Failed to compile"
- ❌ "EADDRINUSE" (port already in use)
- ❌ Any stack traces

### Step 5: Try Different Port

If port 3000 is blocked, React will automatically try 3001. Check:
- `http://localhost:3000`
- `http://localhost:3001`

## Common Issues

### Issue 1: Port Already in Use
**Error:** `EADDRINUSE: address already in use :::3000`

**Fix:**
```bash
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Then restart
npm start
```

### Issue 2: Server Crashes After Compilation
**Symptom:** "Compiled successfully" but no "Local: http://localhost:3000"

**Fix:**
1. Check browser console (F12) for runtime errors
2. Check terminal for any error messages after compilation
3. Try clearing cache:
   ```bash
   # Stop server first (Ctrl+C)
   rmdir /s /q node_modules\.cache
   npm start
   ```

### Issue 3: Browser Shows Cached Error Page
**Fix:**
- Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- Or clear browser cache

## Verification Checklist

After restarting, verify:
- [ ] Terminal shows "Local: http://localhost:XXXX" (where XXXX is the port)
- [ ] `netstat` shows the port is LISTENING
- [ ] Browser can connect to the URL shown in terminal
- [ ] No errors in terminal after "Compiled successfully"
- [ ] No errors in browser console (F12)

## Still Not Working?

1. **Check React Scripts Version:**
   ```bash
   npm list react-scripts
   ```
   Should be `react-scripts@5.0.1`

2. **Reinstall Dependencies:**
   ```bash
   # Stop server first (Ctrl+C)
   rmdir /s /q node_modules
   del package-lock.json
   npm install
   npm start
   ```

3. **Check for Syntax Errors:**
   - Open browser DevTools (F12)
   - Check Console tab for errors
   - Fix any import/module errors

4. **Try Different Browser:**
   - Sometimes browser extensions cause issues
   - Try Incognito/Private mode

