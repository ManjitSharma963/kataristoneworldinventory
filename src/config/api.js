// API URL from environment (see .env.development / .env.production)
// REACT_APP_API_URL = API host only, e.g. http://localhost:8080 or https://api.katariastoneworld.com
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// All fetch calls append /api/... — keep this suffix here, not in the env var
export const API_BASE_URL = `${API_URL.replace(/\/$/, '')}/api`;

export { API_URL };

// Inventory app base URL (for redirects or links if needed)
export const INVENTORY_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://www.katariastoneworld.com/inventory'
    : `${window.location.origin}/inventory`;
