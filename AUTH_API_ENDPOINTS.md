# Authentication API Endpoints

This document describes the API endpoints required for the authentication system.

**Base URL:** `http://localhost:8080/api`

---

## 1. Register User

**Endpoint:** `POST /api/auth/register`

**Description:** Creates a new user account in the system.

**Request Headers:**
```
Content-Type: application/json
Accept: application/json
```

**Request Body (Regular User):**
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "password123",
  "location": "Bhondsi"
}
```

**Request Body (Admin User):**
```json
{
  "name": "Admin User",
  "email": "admin@example.com",
  "password": "admin123",
  "location": "Bhondsi",
  "role": "admin"
}
```

**Request Body Fields:**
- `name` (string, required): User's full name
- `email` (string, required): User's email address (must be unique)
- `password` (string, required): User's password (minimum 6 characters)
- `location` (string, required): User's location - must be either "Bhondsi" or "Tapugada"
- `role` (string, optional): User role - "admin" for admin users, defaults to "user" if not provided

**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john.doe@example.com",
    "location": "Bhondsi",
    "createdAt": "2025-01-15T10:30:00Z"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Validation failed",
  "message": "Email already exists"
}
```

**Error Response (400 Bad Request - Invalid Location):**
```json
{
  "error": "Validation failed",
  "message": "Location must be either 'Bhondsi' or 'Tapugada'"
}
```

---

## 2. Login User

**Endpoint:** `POST /api/auth/login`

**Description:** Authenticates a user and returns an access token.

**Request Headers:**
```
Content-Type: application/json
Accept: application/json
```

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "password123"
}
```

**Request Body Fields:**
- `email` (string, required): User's email address
- `password` (string, required): User's password

**Success Response (200 OK):**
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

**Error Response (401 Unauthorized):**
```json
{
  "error": "Authentication failed",
  "message": "Invalid email or password"
}
```

---

## 3. Get Current User (Optional - for future use)

**Endpoint:** `GET /api/auth/me`

**Description:** Returns the currently authenticated user's information.

**Request Headers:**
```
Authorization: Bearer <token>
Accept: application/json
```

**Success Response (200 OK):**
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john.doe@example.com",
  "location": "Bhondsi",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

**Error Response (401 Unauthorized):**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

---

## CURL Examples

### Register User (Regular User)
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john.doe@example.com",
    "password": "password123",
    "location": "Bhondsi"
  }'
```

### Register Admin User
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

### Login User
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "password123"
  }'
```

### Get Current User (with token)
```bash
curl -X GET http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer <your_token_here>" \
  -H "Accept: application/json"
```

---

## Database Schema Requirements

The backend should have a `users` table with the following structure:

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  location VARCHAR(50) NOT NULL CHECK (location IN ('Bhondsi', 'Tapugada')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## Security Considerations

1. **Password Hashing:** Passwords should be hashed using bcrypt or similar before storing in database
2. **JWT Tokens:** Use JWT tokens for authentication with appropriate expiration times
3. **Email Validation:** Validate email format on both frontend and backend
4. **Password Strength:** Enforce minimum password requirements (currently 6 characters minimum)
5. **Location Validation:** Ensure location is exactly "Bhondsi" or "Tapugada"
6. **CORS:** Configure CORS to allow requests from `http://localhost:3001` (or your frontend URL)

---

## Response Token Format

The token should be a JWT (JSON Web Token) that can be used for subsequent authenticated requests. The token should be included in the `Authorization` header as:

```
Authorization: Bearer <token>
```

---

## Notes

- All endpoints use the `/api` prefix (handled by proxy in development)
- The frontend stores the token in `localStorage` as `authToken`
- The frontend stores user data in `localStorage` as `user`
- Logout is handled client-side by clearing localStorage
- The app checks for authentication on load and redirects to login if not authenticated

