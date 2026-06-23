<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';
import { showLoadingToast, closeToast, showSuccessToast } from 'vant';

interface Product {
  id: string;
  name: string;
  type: string;
  durationHours: number;
  priceFen: number;
  description?: string;
}

const products = ref<Product[]>([]);
const buying = ref<string | null>(null);

async function loadProducts() {
  const res = await api.get<ApiResponse<Product[]>>('/products');
  products.value = res.data;
}

function formatPrice(fen: number) {
  return (fen / 100).toFixed(2);
}

const naturalDaysLabel: Record<string, string> = {
  day: '1个自然日',
  week: '7个自然日',
  month: '30个自然日',
};

function formatDuration(p: Product) {
  return p.description || `${naturalDaysLabel[p.type] || `${p.durationHours}小时`}有效`;
}

async function buy(product: Product) {
  buying.value = product.id;
  showLoadingToast({ message: '下单中...', forbidClick: true });
  try {
    const res = await api.post<ApiResponse<{ order: { id: string }; payParams: { mock?: boolean; orderId?: string } }>>('/orders', {
      productId: product.id,
    });

    if (res.data.payParams.mock) {
      await api.post('/orders/mock-pay', { orderId: res.data.order.id });
      showSuccessToast('购卡成功');
    } else {
      showSuccessToast('请在微信中完成支付');
    }
  } finally {
    buying.value = null;
    closeToast();
  }
}

onMounted(loadProducts);
</script>

<template>
  <div class="products-page">
    <van-nav-bar title="购卡" fixed placeholder />

    <div class="product-list">
      <van-card
        v-for="p in products"
        :key="p.id"
        :title="p.name"
        :desc="formatDuration(p)"
        :price="formatPrice(p.priceFen)"
        currency="¥"
      >
        <template #footer>
          <van-button
            type="primary"
            size="small"
            round
            :loading="buying === p.id"
            @click="buy(p)"
          >
            立即购买
          </van-button>
        </template>
      </van-card>
    </div>

    <van-tabbar route>
      <van-tabbar-item to="/home" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item to="/products" icon="shopping-cart-o">购卡</van-tabbar-item>
      <van-tabbar-item to="/my" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.products-page {
  min-height: 100vh;
  padding-bottom: 60px;
}
.product-list {
  padding: 16px;
}
</style>
