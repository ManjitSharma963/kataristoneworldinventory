import { API_BASE_URL } from '../config/api';
import { handleApiResponse } from '../utils/api';

export const fetchSalesBills = async () => {
  const token = localStorage.getItem('authToken');
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/bills`, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    await handleApiResponse(response);
    return [];
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch bills (${response.status})`);
  }

  const data = await response.json();
  return Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
};
