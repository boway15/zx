<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api, { ApiResponse } from '@/api';
import { showLoadingToast, closeToast, showSuccessToast, showDialog } from 'vant';

interface Product {
  id: string;
  name: string;
  description?: string;
}

const router = useRouter();
const code = ref('');
const loading = ref(false);
const products = ref<Product[]>([]);

onMounted(async () => {
  const res = await api.get<ApiResponse<Product[]>>('/products');
  products.value = res.data;
});

async function redeem() {
  if (!code.value.trim()) return;
  loading.value = true;
  showLoadingToast({ message: '兑换中...', forbidClick: true });
  try {
    const res = await api.post<ApiResponse<{
      membership: { productName: string; endAt: string };
      passcode: string;
      passcodeValidTo: string;
    }>>('/redemption/redeem', { code: code.value.trim().toUpperCase() });

    closeToast();
    showSuccessToast('兑换成功');
    await showDialog({
      title: '兑换成功',
      message: `已开通：${res.data.membership.productName}\n有效期至：${new Date(res.data.membership.endAt).toLocaleString('zh-CN')}\n\n门锁备用密码：${res.data.passcode}\n（有效期内可使用）`,
      confirmButtonText: '去开门',
    });
    router.push('/home');
  } finally {
    loading.value = false;
    closeToast();
  }
}
</script>

<template>
  <div class="redeem-page">
    <van-nav-bar title="兑换会员卡" fixed placeholder />

    <van-notice-bar
      wrapable
      :scrollable="false"
      text="1. 在美团/抖音购买卡券  2. 加管理员微信发送券码  3. 管理员核销后发送兑换码  4. 在此输入兑换码即可开门"
    />

    <div class="card-types">
      <p class="section-title">可选卡类型（参考）</p>
      <van-tag v-for="p in products" :key="p.id" type="primary" plain class="tag">
        {{ p.name }}
      </van-tag>
    </div>

    <van-form @submit="redeem">
      <van-cell-group inset title="输入兑换码">
        <van-field
          v-model="code"
          center
          clearable
          placeholder="请输入8位兑换码"
          maxlength="8"
          :formatter="(v: string) => v.toUpperCase()"
          :rules="[{ required: true, message: '请输入兑换码' }]"
        />
      </van-cell-group>
      <div class="btn-wrap">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          立即兑换
        </van-button>
      </div>
    </van-form>

    <van-tabbar route>
      <van-tabbar-item to="/home" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item to="/redeem" icon="gift-o">兑换</van-tabbar-item>
      <van-tabbar-item to="/my" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.redeem-page {
  min-height: 100vh;
  padding-bottom: 60px;
}
.card-types {
  padding: 16px;
}
.section-title {
  font-size: 14px;
  color: #646566;
  margin-bottom: 8px;
}
.tag {
  margin: 0 8px 8px 0;
}
.btn-wrap {
  padding: 24px 16px;
}
</style>
