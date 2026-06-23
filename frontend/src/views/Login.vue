<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { showSuccessToast } from 'vant';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const phone = ref('');
const nickname = ref('');
const loading = ref(false);

onMounted(async () => {
  const token = route.query.token as string;
  if (token) {
    auth.setToken(token);
    showSuccessToast('登录成功');
    router.replace('/home');
    return;
  }
  if (auth.isLoggedIn) {
    router.replace('/home');
  }
});

async function login() {
  loading.value = true;
  try {
    await auth.guestLogin(phone.value, nickname.value || undefined);
    showSuccessToast('登录成功');
    router.push('/home');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="hero">
      <h1>自助自习室</h1>
      <p>美团/抖音购卡 · 兑换码进门 · 自助学习</p>
    </div>
    <van-form @submit="login">
      <van-cell-group inset>
        <van-field
          v-model="phone"
          type="tel"
          label="手机号"
          placeholder="请输入手机号"
          maxlength="11"
          :rules="[{ required: true, message: '请输入手机号' }]"
        />
        <van-field v-model="nickname" label="昵称" placeholder="选填" />
      </van-cell-group>
      <div class="btn-wrap">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          进入自习室
        </van-button>
      </div>
    </van-form>
    <p class="hint">购卡请前往美团/抖音，核销后管理员将发送兑换码</p>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 48px 16px 24px;
}
.hero {
  text-align: center;
  margin-bottom: 32px;
}
.hero h1 {
  font-size: 28px;
  margin-bottom: 8px;
}
.hero p {
  color: #969799;
  font-size: 14px;
}
.btn-wrap {
  padding: 24px 16px;
}
.hint {
  text-align: center;
  font-size: 12px;
  color: #969799;
  line-height: 1.6;
}
</style>
