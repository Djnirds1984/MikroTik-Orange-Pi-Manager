import axios from 'axios';

// The backend is running on port 3002, and we assume the app is served from the same host.
const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // This is important for session-based authentication
});

// Interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 Unauthorized error will likely mean the session has expired.
    // The AuthContext will handle this by redirecting to the login page.
    if (error.response?.status === 401) {
      console.error('Unauthorized, session might have expired.');
    }
    return Promise.reject(error);
  }
);

export default api;
