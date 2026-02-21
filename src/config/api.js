// API and app URL configuration
// Inventory UI URLs:
//   Development: http://localhost:3000/inventory
//   Production (secure): https://www.katariastoneworld.com/inventory
// API base (no trailing slash):
//   Development: http://localhost:8080/api
//   Production (secure): https://www.katariastoneworld.com/api
const defaultDevelopment = 'http://localhost:8080/api';
const defaultProduction = 'https://www.katariastoneworld.com/api';

export const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? defaultProduction : defaultDevelopment);

// Inventory app base URL (for redirects or links if needed)
export const INVENTORY_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://www.katariastoneworld.com/inventory'
    : `${window.location.origin}/inventory`;

