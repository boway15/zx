import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api, { ApiResponse } from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const adminToken = ref(localStorage.getItem('adminToken') || '');

  const isLoggedIn = computed(() => !!token.value);
  const isAdminLoggedIn = computed(() => !!adminToken.value);

  function setToken(t: string) {
    token.value = t;
    localStorage.setItem('token', t);
  }

  function setAdminToken(t: string) {
    adminToken.value = t;
    localStorage.setItem('adminToken', t);
  }

  function logout() {
    token.value = '';
    localStorage.removeItem('token');
  }

  function adminLogout() {
    adminToken.value = '';
    localStorage.removeItem('adminToken');
  }

  async function guestLogin(phone: string, nickname?: string) {
    const res = await api.post<ApiResponse<{ accessToken: string }>>('/auth/guest/login', {
      phone,
      nickname,
    });
    setToken(res.data.accessToken);
  }

  async function devLogin(code = 'dev_test') {
    const res = await api.post<ApiResponse<{ accessToken: string }>>('/auth/wechat/login', { code });
    setToken(res.data.accessToken);
  }

  return { token, adminToken, isLoggedIn, isAdminLoggedIn, setToken, setAdminToken, logout, adminLogout, guestLogin, devLogin };
});
