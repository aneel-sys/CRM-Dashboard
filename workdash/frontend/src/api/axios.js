import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000,
});

api.interceptors.response.use(
  res => res,
  err => {
    // Only redirect on 401 if we're not already on the login page,
    // otherwise the /auth/me check on mount causes an infinite reload loop.
    if (err.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
