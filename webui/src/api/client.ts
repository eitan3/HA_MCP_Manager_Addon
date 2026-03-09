import axios from 'axios';

/**
 * Get the base path for API calls.
 * When running through HA ingress, we need to use the ingress path as base.
 * The ingress path is typically /api/hassio_ingress/<token>/
 */
function getBasePath(): string {
  // Check if we're running in an iframe (HA panel)
  const path = window.location.pathname;
  
  // If the path contains ingress, extract and use it as base
  // HA ingress URLs look like: /api/hassio_ingress/<token>/
  if (path.includes('/api/hassio_ingress/')) {
    const match = path.match(/^(\/api\/hassio_ingress\/[^/]+)/);
    if (match) {
      return match[1];
    }
  }
  
  // For direct access (no ingress), use empty base
  return '';
}

const api = axios.create({
  baseURL: getBasePath(),
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add auth token from localStorage if available (for standalone access)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('Authentication required. Please use HA ingress or provide a valid token.');
    }
    return Promise.reject(error);
  }
);

export default api;
