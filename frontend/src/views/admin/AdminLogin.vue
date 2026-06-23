<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import api, { ApiResponse } from '@/api';
import { showSuccessToast } from 'vant';

const router = useRouter();
const auth = useAuthStore();
const username = ref('admin');
const password = ref('');
const loading = ref(false);

async function login() {
  loading.value = true;
  try {
    const res = await api.post<ApiResponse<{ accessToken: string }>>('/auth/admin/login', {
      username: username.value,
      password: password.value,
    });
    auth.setAdminToken(res.data.accessToken);
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
        <van-field v-model="username" label="用户名" placeholder="admin" />
        <van-field v-model="password" type="password" label="密码" placeholder="请输入密码" />
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
  color: var(--tt-text);
}
</style>
