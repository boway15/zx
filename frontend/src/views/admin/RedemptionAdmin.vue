<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';
import { showSuccessToast, showDialog, showConfirmDialog } from 'vant';

interface Product {
  id: string;
  name: string;
}

interface RedemptionCode {
  id: string;
  code: string;
  status: string;
  redeemValidUntil: string;
  note?: string;
  externalPlatform?: string;
  externalVoucher?: string;
  product: { name: string };
  usedAt?: string;
}

const products = ref<Product[]>([]);
const codes = ref<RedemptionCode[]>([]);
const showCreate = ref(false);
const form = ref({
  productId: '',
  redeemValidHours: 168,
  note: '',
  externalPlatform: 'meituan',
  externalVoucher: '',
  useManualCode: false,
  manualCode: '',
});
const creating = ref(false);

async function load() {
  const [pRes, cRes] = await Promise.all([
    api.get<ApiResponse<Product[]>>('/products/admin/all'),
    api.get<ApiResponse<{ items: RedemptionCode[] }>>('/redemption/admin'),
  ]);
  products.value = pRes.data;
  codes.value = cRes.data.items;
  if (products.value.length && !form.value.productId) {
    form.value.productId = products.value[0].id;
  }
}

async function create() {
  if (form.value.useManualCode) {
    const digits = form.value.manualCode.replace(/\D/g, '');
    if (digits.length !== 11) {
      await showDialog({ title: '提示', message: '手工兑换码必须为11位纯数字' });
      return;
    }
  }
  creating.value = true;
  try {
    const payload: Record<string, unknown> = {
      productId: form.value.productId,
      redeemValidHours: form.value.redeemValidHours,
      note: form.value.note || undefined,
      externalPlatform: form.value.externalPlatform || undefined,
      externalVoucher: form.value.externalVoucher || undefined,
    };
    if (form.value.useManualCode) {
      payload.code = form.value.manualCode.replace(/\D/g, '');
    }
    const res = await api.post<ApiResponse<RedemptionCode>>('/redemption/admin', payload);
    showCreate.value = false;
    await showConfirmDialog({
      title: '兑换码已生成',
      message: `请复制发送给用户：\n\n${res.data.code}\n\n有效期至：${new Date(res.data.redeemValidUntil).toLocaleString('zh-CN')}`,
      confirmButtonText: '复制兑换码',
      cancelButtonText: '知道了',
    })
      .then(() => copyCode(res.data.code))
      .catch(() => {});
    form.value.note = '';
    form.value.externalVoucher = '';
    form.value.manualCode = '';
    form.value.useManualCode = false;
    load();
  } finally {
    creating.value = false;
  }
}

async function revoke(id: string) {
  await api.post(`/redemption/admin/${id}/revoke`);
  showSuccessToast('已作废');
  load();
}

function statusText(s: string) {
  const map: Record<string, string> = {
    unused: '待兑换',
    used: '已兑换',
    expired: '已过期',
    revoked: '已作废',
  };
  return map[s] || s;
}

function platformText(p?: string) {
  const map: Record<string, string> = { meituan: '美团', douyin: '抖音', other: '其他' };
  return p ? map[p] || p : '';
}

async function copyCode(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showSuccessToast('已复制');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showSuccessToast('已复制');
    } catch {
      await showDialog({ title: '复制失败', message: text });
    } finally {
      document.body.removeChild(ta);
    }
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="header">
      <div>
        <h3>核销 / 兑换码</h3>
        <p class="hint">点击兑换码可复制</p>
      </div>
      <van-button type="primary" size="small" @click="showCreate = true">生成兑换码</van-button>
    </div>

    <van-cell-group inset>
      <van-cell
        v-for="c in codes"
        :key="c.id"
        :label="[
          platformText(c.externalPlatform),
          c.externalVoucher ? `券码:${c.externalVoucher}` : '',
          c.note || '',
          `兑换期限:${new Date(c.redeemValidUntil).toLocaleString('zh-CN')}`,
        ].filter(Boolean).join(' · ')"
        :value="statusText(c.status)"
      >
        <template #title>
          <span class="code-text" @click.stop="copyCode(c.code)">{{ c.code }}</span>
          <span> · {{ c.product.name }}</span>
        </template>
        <template v-if="c.status === 'unused'" #right-icon>
          <van-button size="mini" type="danger" plain @click="revoke(c.id)">作废</van-button>
        </template>
      </van-cell>
      <van-empty v-if="codes.length === 0" description="暂无兑换码" />
    </van-cell-group>

    <van-popup v-model:show="showCreate" position="bottom" round :style="{ minHeight: '60%' }">
      <div class="popup-body">
        <h4>核销并生成兑换码</h4>
        <p class="tip">用户已在美团/抖音购卡并加微信发券码，确认无误后生成兑换码发给用户</p>
        <van-form @submit="create">
          <van-field name="product" label="卡类型">
            <template #input>
              <van-radio-group v-model="form.productId" direction="horizontal">
                <van-radio v-for="p in products" :key="p.id" :name="p.id">{{ p.name }}</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field name="platform" label="来源">
            <template #input>
              <van-radio-group v-model="form.externalPlatform" direction="horizontal">
                <van-radio name="meituan">美团</van-radio>
                <van-radio name="douyin">抖音</van-radio>
                <van-radio name="other">其他</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field name="codeMode" label="兑换码">
            <template #input>
              <van-radio-group v-model="form.useManualCode" direction="horizontal">
                <van-radio :name="false">自动生成</van-radio>
                <van-radio :name="true">手工输入</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field
            v-if="form.useManualCode"
            v-model="form.manualCode"
            type="tel"
            label="指定码"
            placeholder="11位纯数字"
            maxlength="11"
            :formatter="(v: string) => v.replace(/\D/g, '')"
          />
          <van-field v-model="form.externalVoucher" label="平台券码" placeholder="用户发来的券码" />
          <van-field v-model="form.note" label="备注" placeholder="用户微信昵称等" />
          <van-field
            v-model.number="form.redeemValidHours"
            type="digit"
            label="兑换期限(小时)"
            placeholder="168=7天"
          />
          <div class="btn-wrap">
            <van-button round block type="primary" native-type="submit" :loading="creating">
              生成并发送给用户
            </van-button>
          </div>
        </van-form>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
h3, h4 { margin: 0; }
.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #969799;
}
.code-text {
  font-weight: 600;
  color: var(--tt-red, #f85959);
  cursor: pointer;
}
.code-text:active {
  opacity: 0.7;
}
.popup-body {
  padding: 20px 16px 32px;
}
.tip {
  font-size: 12px;
  color: #969799;
  margin: 8px 0 16px;
}
.btn-wrap {
  padding: 16px 0;
}
</style>
