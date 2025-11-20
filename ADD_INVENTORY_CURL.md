# CURL Request for Adding New Inventory Item

## Endpoint
```
POST http://localhost:8080/api/inventory
```

## Authentication
Requires Bearer token in Authorization header (admin role required)

## Request Headers
```
Content-Type: application/json
Accept: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

## Request Body Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Product name |
| `slug` | string | Yes | URL-friendly version of product name |
| `productTypeString` | string | Yes | Product category (table, chair, marble, tiles, counter top, granite, other) |
| `pricePerSqft` | number | Yes | Price per unit |
| `totalSqftStock` | number | Yes | Quantity/Stock |
| `primaryImageUrl` | string | Yes | Primary image URL |
| `color` | string | No | Product color |
| `role` | string | Yes | User role (should be "admin") |
| `userRole` | string | Yes | Alternative role field (should be "admin") |

## Example CURL Request

```bash
curl -X POST http://localhost:8080/api/inventory \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Solid Sheesham Wood Coffee Table",
    "slug": "solid-sheesham-wood-coffee-table",
    "productTypeString": "table",
    "pricePerSqft": 15910,
    "totalSqftStock": 19,
    "primaryImageUrl": "https://example.com/images/coffee-table.jpg",
    "color": "Wooden",
    "role": "admin",
    "userRole": "admin"
  }'
```

## Example with Different Product Types

### Marble Product
```bash
curl -X POST http://localhost:8080/api/inventory \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Italian White Marble Slab",
    "slug": "italian-white-marble-slab",
    "productTypeString": "marble",
    "pricePerSqft": 2500,
    "totalSqftStock": 150,
    "primaryImageUrl": "https://example.com/images/marble-slab.jpg",
    "color": "White",
    "role": "admin",
    "userRole": "admin"
  }'
```

### Granite Product
```bash
curl -X POST http://localhost:8080/api/inventory \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Black Galaxy Granite",
    "slug": "black-galaxy-granite",
    "productTypeString": "granite",
    "pricePerSqft": 1800,
    "totalSqftStock": 200,
    "primaryImageUrl": "https://example.com/images/granite.jpg",
    "color": "Black",
    "role": "admin",
    "userRole": "admin"
  }'
```

### Tiles Product
```bash
curl -X POST http://localhost:8080/api/inventory \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Ceramic Floor Tiles",
    "slug": "ceramic-floor-tiles",
    "productTypeString": "tiles",
    "pricePerSqft": 45,
    "totalSqftStock": 500,
    "primaryImageUrl": "https://example.com/images/tiles.jpg",
    "color": "Beige",
    "role": "admin",
    "userRole": "admin"
  }'
```

### Counter Top Product
```bash
curl -X POST http://localhost:8080/api/inventory \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Quartz Counter Top",
    "slug": "quartz-counter-top",
    "productTypeString": "counter top",
    "pricePerSqft": 3200,
    "totalSqftStock": 75,
    "primaryImageUrl": "https://example.com/images/counter-top.jpg",
    "color": "Gray",
    "role": "admin",
    "userRole": "admin"
  }'
```

## Success Response (200 OK)
```json
{
  "id": 1,
  "name": "Solid Sheesham Wood Coffee Table",
  "slug": "solid-sheesham-wood-coffee-table",
  "productType": "table",
  "pricePerSqft": 15910,
  "totalSqftStock": 19,
  "primaryImageUrl": "https://example.com/images/coffee-table.jpg",
  "color": "Wooden",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

## Error Response (403 Forbidden)
```json
{
  "error": "Forbidden",
  "message": "User role not found"
}
```

## Error Response (400 Bad Request)
```json
{
  "error": "Validation failed",
  "message": "Missing required fields"
}
```

## Notes

1. **Replace `YOUR_JWT_TOKEN`** with your actual JWT token obtained from login
2. **Product Types** must be one of: `table`, `chair`, `marble`, `tiles`, `counter top`, `granite`, `other`
3. **Both `role` and `userRole`** fields are required and should be set to `"admin"`
4. **All numeric fields** (`pricePerSqft`, `totalSqftStock`) should be numbers, not strings
5. **Image URL** must be a valid URL format
6. **Slug** is typically auto-generated from the name, but can be provided manually

## Getting Your JWT Token

First, login to get your token:

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your_password"
  }'
```

The response will include a `token` field. Use that token in the Authorization header.

