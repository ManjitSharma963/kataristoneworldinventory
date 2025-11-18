# 🔧 QUICK FIX: Connection Refused Issue

## The Problem
- Terminal shows "Compiled successfully!" ✅
- Browser shows "ERR_CONNECTION_REFUSED" ❌
- Server appears to compile but doesn't accept connections

## ✅ IMMEDIATE SOLUTION

### Option 1: Use the Batch Script (Easiest)
1. **Double-click** `START_SERVER_FIX.bat` in your project folder
2. Wait for it to show "Compiled successfully!"
3. Look for the line: `Local: http://localhost:3000` (or 3001)
4. Open that URL in your browser

### Option 2: Manual Steps

#### Step 1: Stop Everything
1. Close ALL terminal windows running `npm start`
2. Press `Ctrl+C` in any terminal with npm running
3. Wait 5 seconds

#### Step 2: Kill All Node Processes
Open a NEW terminal (PowerShell or CMD) and run:
```bash
taskkill /F /IM node.exe
```

#### Step 3: Clear Cache
```bash
rmdir /s /q node_modules\.cache
```

#### Step 4: Set Port and Start
```bash
set PORT=3000
npm start
```

#### Step 5: Watch for These Messages
When the server starts, you MUST see:
```
Compiled successfully!

You can now view katariastoneworld-inventory in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000
```

**If you DON'T see the "Local: http://localhost:3000" line, the server didn't start!**

#### Step 6: Check What Port It's Using
If you see a different port (like 3001), use that instead:
- Try: `http://localhost:3000`
- Try: `http://localhost:3001`
- Try: `http://localhost:3002`

## 🔍 Troubleshooting

### Issue 1: Port Already in Use
**Error:** `EADDRINUSE: address already in use :::3000`

**Fix:**
```bash
# Find what's using the port
netstat -ano | findstr :3000

# Kill that process (replace PID with the number from above)
taskkill /PID <PID> /F

# Then start again
npm start
```

### Issue 2: Windows Firewall Blocking
1. Open Windows Defender Firewall
2. Click "Allow an app or feature through Windows Defender Firewall"
3. Find "Node.js" and make sure both Private and Public are checked
4. If Node.js isn't listed, click "Allow another app" and add it

### Issue 3: Server Starts But Browser Can't Connect
Try these URLs in order:
1. `http://localhost:3000`
2. `http://127.0.0.1:3000`
3. `http://localhost:3001` (if 3000 is in use)
4. Check the terminal for the actual port number

### Issue 4: Browser Shows Cached Error
1. Press `Ctrl + Shift + R` (hard refresh)
2. Or open in Incognito/Private mode
3. Or clear browser cache

### Issue 5: Still Not Working
1. **Check if server is actually running:**
   ```bash
   netstat -ano | findstr :3000
   ```
   Should show a LISTENING line. If not, server didn't start.

2. **Check for errors in terminal:**
   - Look for red error messages
   - Look for "Failed to compile"
   - Look for any stack traces

3. **Try a different approach:**
   ```bash
   # Stop everything
   taskkill /F /IM node.exe
   
   # Clear everything
   rmdir /s /q node_modules\.cache
   rmdir /s /q node_modules
   del package-lock.json
   
   # Reinstall
   npm install
   
   # Start fresh
   npm start
   ```

## ✅ Verification Checklist

After starting the server, verify:
- [ ] Terminal shows "Compiled successfully!"
- [ ] Terminal shows "Local: http://localhost:XXXX"
- [ ] `netstat -ano | findstr :3000` shows LISTENING
- [ ] Browser can connect to the URL shown in terminal
- [ ] No errors in browser console (F12)
- [ ] No errors in terminal after compilation

## 🚨 Still Not Working?

If nothing works:
1. **Check your terminal output** - Copy and paste the FULL output from `npm start`
2. **Check browser console** (F12) - Look for any error messages
3. **Try a different browser** - Sometimes extensions cause issues
4. **Check Windows Firewall** - Make sure Node.js is allowed
5. **Restart your computer** - Sometimes processes get stuck

