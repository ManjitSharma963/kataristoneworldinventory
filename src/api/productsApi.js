import { API_BASE_URL } from '../config/api';
import { getInventoryEndpoint, handleApiResponse } from '../utils/api';

export const fetchProductsCatalog = async () => {
  const token = localStorage.getItem('authToken');
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${getInventoryEndpoint()}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    await handleApiResponse(response);
    return [];
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch products (${response.status})`);
  }

  const payload = await response.json();
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];
};

