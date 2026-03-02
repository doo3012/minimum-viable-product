import axios from 'axios';

export const api = axios.create({
  baseURL: '/api', // routes to Next.js BFF proxy
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginRequest) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
