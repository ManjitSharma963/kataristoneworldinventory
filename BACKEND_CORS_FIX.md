# Backend CORS Configuration Fix

## 🔴 Problem

Your frontend is running on `http://localhost:3001` but your backend CORS configuration only allows `http://localhost:8080`.

**Error Message:**
```
Access to fetch at 'http://localhost:8080/api/inventory' from origin 'http://localhost:3001' 
has been blocked by CORS policy: Response to preflight request doesn't pass access control check: 
The 'Access-Control-Allow-Origin' header has a value 'http://localhost:8080' that is not equal 
to the supplied origin.
```

## ✅ Solution: Update Backend CORS Configuration

You need to update your **backend** CORS configuration to allow `http://localhost:3001` (or use `*` for development).

### Option 1: Allow Multiple Origins (Recommended)

Update your backend to allow both ports:

#### Spring Boot (Java)

```java
@Configuration
public class CorsConfig {
    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                    .allowedOrigins("http://localhost:3000", "http://localhost:3001")
                    .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                    .allowedHeaders("*")
                    .allowCredentials(true);
            }
        };
    }
}
```

Or using `@CrossOrigin` annotation:

```java
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:3001"})
@RestController
@RequestMapping("/api")
public class YourController {
    // ...
}
```

#### Node.js/Express

```javascript
const cors = require('cors');

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

#### Python/Flask

```python
from flask_cors import CORS

CORS(app, 
     origins=["http://localhost:3000", "http://localhost:3001"],
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization"])
```

### Option 2: Allow All Origins (Development Only - NOT for Production)

**⚠️ WARNING: Only use this for development!**

#### Spring Boot
```java
.allowedOrigins("*")  // Allows all origins
```

#### Node.js/Express
```javascript
app.use(cors());  // Allows all origins
```

#### Python/Flask
```python
CORS(app)  # Allows all origins
```

### Option 3: Use Environment Variable

Make it configurable:

#### Spring Boot (application.properties)
```properties
cors.allowed.origins=http://localhost:3000,http://localhost:3001
```

#### Node.js/Express (.env)
```env
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

Then in code:
```javascript
app.use(cors({
  origin: process.env.CORS_ORIGINS.split(',')
}));
```

## 🔍 How to Find Your Backend CORS Configuration

1. **Search for CORS in your backend code:**
   - Look for files containing: `CORS`, `cors`, `CrossOrigin`, `allowedOrigins`
   - Common locations:
     - `CorsConfig.java` (Spring Boot)
     - `app.js` or `server.js` (Node.js)
     - `app.py` or `__init__.py` (Flask)

2. **Check for existing CORS configuration:**
   ```bash
   # In your backend directory
   grep -r "localhost:8080" .
   grep -r "allowedOrigins" .
   grep -r "CORS" .
   ```

## 📝 Quick Fix Steps

1. **Locate your backend CORS configuration file**
2. **Add `http://localhost:3001` to allowed origins**
3. **Restart your backend server**
4. **Test the frontend again**

## 🎯 Alternative: Use Port 3000

If you prefer not to change backend configuration:

1. **Change React dev server port back to 3000:**
   ```bash
   PORT=3000 npm start
   ```

2. **Or create `.env` file in React project root:**
   ```
   PORT=3000
   ```

3. **Restart React dev server**

This works if your backend already allows `http://localhost:3000`.

## ✅ Verify the Fix

After updating backend CORS:

1. **Restart your backend server**
2. **Check browser console** - CORS errors should be gone
3. **Test API calls** - They should work now

## 🐛 Troubleshooting

### Still Getting CORS Errors?

1. **Clear browser cache** and hard refresh (`Ctrl+Shift+R`)
2. **Check backend logs** - Look for CORS-related errors
3. **Verify backend is running** on port 8080
4. **Test with curl:**
   ```bash
   curl -H "Origin: http://localhost:3001" \
        -H "Access-Control-Request-Method: GET" \
        -H "Access-Control-Request-Headers: Authorization" \
        -X OPTIONS \
        http://localhost:8080/api/inventory \
        -v
   ```
   Look for `Access-Control-Allow-Origin: http://localhost:3001` in response

### Backend Not Responding to OPTIONS Requests?

Some backends need explicit OPTIONS handling:

```java
// Spring Boot
@Override
public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/**")
        .allowedOrigins("http://localhost:3001")
        .allowedMethods("*")
        .allowedHeaders("*");
}
```

---

**Remember**: The fix must be done on the **backend**, not the frontend!

**Last Updated**: January 2025

