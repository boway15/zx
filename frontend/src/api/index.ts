import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { showToast } from 'vant';

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipErrorToast?: boolean;
    skipSessionClear?: boolean;
  }
}

interface TypedAxios extends AxiosInstance {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T>;
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
}

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
}) as TypedAxios;

let onMembershipUnauthorized: (() => void) | null = null;

export function registerMembershipUnauthorizedHandler(handler: () => void) {
  onMembershipUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem('adminToken');
  const membershipToken = sessionStorage.getItem('membershipToken');
  const isAdminRoute =
    config.url?.includes('/admin') ||
    config.url?.includes('/products/admin') ||
    config.url?.includes('/settings/admin') ||
    config.url?.includes('/ttlock/') ||
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
    const status = err.response?.status;
    const url = String(err.config?.url || '');
    const isAdminRoute = url.includes('/admin');
    const isPublicRedeem =
      url.includes('/redemption/preview') || url.includes('/redemption/access');

    if (
      status === 401 &&
      !err.config?.skipSessionClear &&
      !isAdminRoute &&
      !isPublicRedeem &&
      sessionStorage.getItem('membershipToken')
    ) {
      onMembershipUnauthorized?.();
    }

    if (status === 401 && isAdminRoute) {
      localStorage.removeItem('adminToken');
      if (!window.location.pathname.includes('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }

    if (!err.config?.skipErrorToast) {
      const message =
        status === 401 && isAdminRoute
          ? '管理员登录已过期，请重新登录'
          : err.response?.data?.message || err.message || '请求失败';
      showToast({ message, duration: 3500 });
    }
    return Promise.reject(err);
  },
);

export default api;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}
