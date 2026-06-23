import axios from 'axios';
import { showToast } from 'vant';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem('adminToken');
  const membershipToken = sessionStorage.getItem('membershipToken');
  const isAdminRoute =
    config.url?.includes('/admin') ||
    config.url?.includes('/products/admin') ||
    config.url?.includes('/settings/admin') ||
    config.url?.includes('/ttlock/status') ||
    config.url?.includes('/access/admin') ||
    config.url?.includes('/redemption/admin') ||
    config.url?.includes('/seats/admin');

  const token = isAdminRoute ? adminToken : membershipToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.message || err.message || '请求失败';
    showToast(message);
    return Promise.reject(err);
  },
);

export default api;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}
