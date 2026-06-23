<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import api, { ApiResponse } from '@/api';
import { showSuccessToast } from 'vant';

const ADMIN_LOGIN_USERNAME_KEY = 'adminLoginUsername';
const ADMIN_LOGIN_PASSWORD_KEY = 'adminLoginPassword';

const router = useRouter();
const auth = useAuthStore();
const username = ref('admin');
const password = ref('');
const loading = ref(false);

onMounted(() => {
  const savedUsername = localStorage.getItem(ADMIN_LOGIN_USERNAME_KEY);
  const savedPassword = localStorage.getItem(ADMIN_LOGIN_PASSWORD_KEY);
  if (savedUsername) username.value = savedUsername;
  if (savedPassword) password.value = savedPassword;
});

async function login() {
  loading.value = true;
  try {
    const res = await api.post<ApiResponse<{ accessToken: string }>>('/auth/admin/login', {
      username: username.value,
      password: password.value,
    });
    auth.setAdminToken(res.data.accessToken);
    localStorage.setItem(ADMIN_LOGIN_USERNAME_KEY, username.value);
    localStorage.setItem(ADMIN_LOGIN_PASSWORD_KEY, password.value);
    showSuccessToast('登录成功');
    router.push('/admin/dashboard');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="admin-login">
    <h2>管理后台</h2>
    <van-form @submit="login">
      <van-cell-group inset>
        <van-field v-model="username" size="large" label="用户名" placeholder="admin" />
        <van-field v-model="password" size="large" type="password" label="密码" placeholder="请输入密码" />
      </van-cell-group>
      <div style="padding: 24px 16px">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          登录
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<style scoped>
.admin-login {
  min-height: 100vh;
  padding-top: 80px;
}
.admin-login h2 {
  text-align: center;
  margin-bottom: 32px;
  font-size: 22px;
  color: var(--tt-text);
}

.admin-login :deep(.van-button) {
  height: 48px;
  font-size: 16px;
}

@media screen and (max-width: 768px) {
  .admin-login h2 {
    font-size: 24px;
  }

  .admin-login :deep(.van-field__control) {
    font-size: 16px;
    min-height: 28px;
  }
}
</style>
