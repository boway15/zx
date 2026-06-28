import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/views/UserApp.vue') },
    { path: '/admin/login', component: () => import('@/views/admin/AdminLogin.vue') },
    {
      path: '/admin',
      component: () => import('@/views/admin/AdminLayout.vue'),
      meta: { admin: true },
      children: [
        { path: '', redirect: '/admin/dashboard' },
        { path: 'dashboard', component: () => import('@/views/admin/Dashboard.vue') },
        { path: 'products', component: () => import('@/views/admin/ProductsAdmin.vue') },
        { path: 'redemption', component: () => import('@/views/admin/RedemptionAdmin.vue') },
        { path: 'seats', component: () => import('@/views/admin/SeatsAdmin.vue') },
        { path: 'reservations', component: () => import('@/views/admin/ReservationsAdmin.vue') },
        { path: 'logs', component: () => import('@/views/admin/AccessLogsAdmin.vue') },
        { path: 'settings', component: () => import('@/views/admin/SettingsAdmin.vue') },
        { path: 'ttlock', component: () => import('@/views/admin/TtlockAdmin.vue') },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.admin && !auth.isAdminLoggedIn) return '/admin/login';
  return true;
});

export default router;
