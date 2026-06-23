<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';
import { showSuccessToast } from 'vant';

interface Product {
  id: string;
  name: string;
  type: string;
  durationHours: number;
  priceFen: number;
  enabled: boolean;
}

const naturalDaysLabel: Record<string, string> = {
  day: '1个自然日',
  week: '7个自然日',
  month: '30个自然日',
};

function formatDuration(p: Product) {
  return naturalDaysLabel[p.type] || `${p.durationHours}小时`;
}

const products = ref<Product[]>([]);

async function load() {
  const res = await api.get<ApiResponse<Product[]>>('/products/admin/all');
  products.value = res.data;
}

async function toggleEnabled(p: Product) {
  await api.put(`/products/admin/${p.id}`, { enabled: !p.enabled });
  showSuccessToast('已更新');
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <h3>卡价管理</h3>
    <van-cell-group inset>
      <van-cell
        v-for="p in products"
        :key="p.id"
        :title="p.name"
        :label="`${formatDuration(p)} · ¥${(p.priceFen / 100).toFixed(2)}`"
      >
        <template #value>
          <van-tag :type="p.enabled ? 'success' : 'default'">
            {{ p.enabled ? '上架' : '下架' }}
          </van-tag>
        </template>
        <template #right-icon>
          <van-button size="mini" @click="toggleEnabled(p)">
            {{ p.enabled ? '下架' : '上架' }}
          </van-button>
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>

<style scoped>
h3 { margin-bottom: 16px; }
</style>
