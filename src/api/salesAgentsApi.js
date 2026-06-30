import { API_BASE_URL } from '../config/api';
import { handleApiResponse, unwrapApiEntity, unwrapApiList } from '../utils/api';

const authHeaders = () => {
  const token = localStorage.getItem('authToken');
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const parseAgentApiError = async (response, fallback) => {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    if (json.data && typeof json.data === 'object') {
      const parts = Object.entries(json.data).map(([field, msg]) => {
        if (field === 'phone') return 'Phone must be 10 digits or less';
        return `${field}: ${msg}`;
      });
      if (parts.length) return parts.join('. ');
    }
    if (json.message && json.message !== 'Validation failed') return json.message;
    if (json.message === 'Validation failed') return 'Please check the form fields and try again';
  } catch {
    /* use raw text */
  }
  return text || fallback;
};

export const fetchSalesAgents = async (activeOnly = true) => {
  const url = `${API_BASE_URL}/sales-agents?activeOnly=${activeOnly ? 'true' : 'false'}`;
  const response = await fetch(url, { method: 'GET', headers: authHeaders() });
  if (response.status === 401) {
    await handleApiResponse(response);
    return [];
  }
  if (!response.ok) {
    throw new Error(`Failed to load agents (${response.status})`);
  }
  const data = await response.json();
  return unwrapApiList(data);
};

export const createSalesAgent = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/sales-agents`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseAgentApiError(response, `Failed to create agent (${response.status})`));
  }
  const data = await response.json();
  return unwrapApiEntity(data);
};

export const updateSalesAgent = async (id, payload) => {
  const response = await fetch(`${API_BASE_URL}/sales-agents/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseAgentApiError(response, `Failed to update agent (${response.status})`));
  }
  const data = await response.json();
  return unwrapApiEntity(data);
};

export const deleteSalesAgent = async (id) => {
  const response = await fetch(`${API_BASE_URL}/sales-agents/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to delete agent (${response.status})`);
  }
};

export const fetchAgentCommissionHistory = async (agentId) => {
  const response = await fetch(`${API_BASE_URL}/sales-agents/${agentId}/commissions`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to load commission history (${response.status})`);
  }
  const data = await response.json();
  return unwrapApiList(data);
};

export const assignBillAgentCommission = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/sales-agents/commissions/assign`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to assign agent to bill (${response.status})`);
  }
  const data = await response.json();
  return unwrapApiEntity(data);
};

export const updateAgentCommissionStatus = async ({ billType, billId, status }) => {
  const response = await fetch(`${API_BASE_URL}/sales-agents/commissions/status`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ billType, billId, status }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to update commission status (${response.status})`);
  }
  const data = await response.json();
  return unwrapApiEntity(data);
};
