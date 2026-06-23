<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';

interface Order {
  id: string;
  amountFen: number;
  status: string;
  outTradeNo: string;
  createdAt: string;
  user: { nickname?: string; openid: string };
  product: { name: string };
}

const orders = ref<Order[]>([]);

onMounted(async () => {
  const res = await api.get<ApiResponse<{ items: Order[] }>>('/orders/admin');
  orders.value = res.data.items;
});
</script>

<template>
  <div>
    <h3>订单列表</h3>
    <van-cell-group inset>
      <van-cell
        v-for="o in orders"
        :key="o.id"
        :title="`${o.product.name} · ¥${(o.amountFen / 100).toFixed(2)}`"
        :label="`${o.outTradeNo} · ${new Date(o.createdAt).toLocaleString('zh-CN')}`"
        :value="o.status"
      />
      <van-empty v-if="orders.length === 0" description="暂无订单" />
    </van-cell-group>
  </div>
</template>

<style scoped>
h3 { margin-bottom: 16px; }
</style>
