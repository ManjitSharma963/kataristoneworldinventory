// API and app URL configuration
// Inventory UI URLs:
//   Development: http://localhost:3000/inventory
//   Production (secure): https://www.katariastoneworld.com/inventory
const API_URL = 'https://api.katariastoneworld.com';

export const API_BASE_URL = process.env.REACT_APP_API_URL || `${API_URL}/api`;

// Inventory app base URL (for redirects or links if needed)
export const INVENTORY_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://www.katariastoneworld.com/inventory'
    : `${window.location.origin}/inventory`;
