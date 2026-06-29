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
  usedAt?: string | null;
  activatedAt?: string | null;
  membershipEndAt?: string | null;
}

const products = ref<Product[]>([]);
const codes = ref<RedemptionCode[]>([]);
const codeQuery = ref('');
const loading = ref(false);
const showCreate = ref(false);
const form = ref({
  productId: '',
  redeemValidDays: 7,
  note: '',
  externalPlatform: 'meituan',
  externalVoucher: '',
  useManualCode: false,
  manualCode: '',
});
const creating = ref(false);

function onClearSearch() {
  codeQuery.value = '';
  load();
}

async function load() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    const digits = codeQuery.value.replace(/\D/g, '');
    if (digits) params.code = digits;

    const [pRes, cRes] = await Promise.all([
      api.get<ApiResponse<Product[]>>('/products/admin/all'),
      api.get<ApiResponse<{ items: RedemptionCode[] }>>('/redemption/admin', { params }),
    ]);
    products.value = pRes.data;
    codes.value = cRes.data.items;
    if (products.value.length && !form.value.productId) {
      form.value.productId = products.value[0].id;
    }
  } finally {
    loading.value = false;
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
      redeemValidDays: form.value.redeemValidDays,
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

function canRevoke(status: string) {
  return ['unused', 'bound', 'activated', 'used'].includes(status);
}

function revokeMessage(c: RedemptionCode) {
  if (c.status === 'unused') {
    return '确定作废该兑换码吗？作废后用户将无法使用。';
  }
  if (c.status === 'bound') {
    return '确定作废该兑换码吗？将解除绑定，用户需重新购卡。';
  }
  return '确定作废该兑换码吗？将取消全部已预约座位并立即失效，适用于退款等场景，此操作不可恢复。';
}

async function revoke(c: RedemptionCode) {
  try {
    await showConfirmDialog({
      title: '作废兑换码',
      message: revokeMessage(c),
      confirmButtonText: '确认作废',
      confirmButtonColor: '#ee0a24',
    });
  } catch {
    return;
  }

  const res = await api.post<
    ApiResponse<{ cancelledReservations?: number }>
  >(`/redemption/admin/${c.id}/revoke`);
  const count = res.data.cancelledReservations ?? 0;
  showSuccessToast(
    count > 0 ? `已作废，并取消 ${count} 条预约` : '已作废',
  );
  load();
}

function statusText(s: string) {
  const map: Record<string, string> = {
    unused: '待兑换',
    bound: '待预约',
    activated: '已激活',
    used: '已激活',
    expired: '已过期',
    revoked: '已作废',
  };
  return map[s] || s;
}

function platformText(p?: string) {
  const map: Record<string, string> = { meituan: '美团', douyin: '抖音', other: '其他' };
  return p ? map[p] || p : '';
}

function formatDateTime(value: string) {
  const d = new Date(value);
  const date = d.toLocaleDateString('zh-CN');
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date} ${time}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN');
}

function metaText(c: RedemptionCode) {
  return [
    c.product.name,
    platformText(c.externalPlatform),
    c.externalVoucher ? `券码 ${c.externalVoucher}` : '',
    c.note,
  ]
    .filter(Boolean)
    .join(' · ');
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    unused: 'status-unused',
    bound: 'status-bound',
    activated: 'status-activated',
    used: 'status-activated',
    expired: 'status-expired',
    revoked: 'status-revoked',
  };
  return map[status] || '';
}

function codeDetailRows(c: RedemptionCode) {
  const rows: { label: string; value: string }[] = [];

  if (c.activatedAt && c.membershipEndAt) {
    rows.push({ label: '激活时间', value: formatDateTime(c.activatedAt) });
    rows.push({
      label: '有效期',
      value: `${formatDate(c.activatedAt)} 至 ${formatDate(c.membershipEndAt)} 23:59`,
    });
    return rows;
  }

  if ((c.status === 'bound' || c.status === 'used') && c.usedAt) {
    rows.push({ label: '绑定时间', value: formatDateTime(c.usedAt) });
    rows.push({ label: '兑换期限至', value: formatDateTime(c.redeemValidUntil) });
    return rows;
  }

  if (c.status === 'unused') {
    rows.push({ label: '兑换期限至', value: formatDateTime(c.redeemValidUntil) });
    return rows;
  }

  if (c.status === 'expired') {
    rows.push({ label: '兑换期限至', value: formatDateTime(c.redeemValidUntil) });
    if (c.activatedAt && c.membershipEndAt) {
      rows.push({
        label: '曾激活',
        value: `${formatDate(c.activatedAt)} 至 ${formatDate(c.membershipEndAt)} 23:59`,
      });
    }
  }

  return rows;
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
        <p class="hint">查询兑换码状态，或点击兑换码复制</p>
      </div>
      <van-button type="primary" size="small" @click="showCreate = true">生成兑换码</van-button>
    </div>

    <van-cell-group inset class="search-box">
      <van-field
        v-model="codeQuery"
        type="tel"
        label="兑换码"
        placeholder="输入11位兑换码查询"
        maxlength="11"
        clearable
        :formatter="(v: string) => v.replace(/\D/g, '')"
        @clear="onClearSearch"
        @keyup.enter="load"
      >
        <template #button>
          <van-button size="small" type="primary" :loading="loading" @click="load">
            查询
          </van-button>
        </template>
      </van-field>
    </van-cell-group>

    <van-loading v-if="loading" class="list-loading" />

    <div v-else class="code-list">
      <article v-for="c in codes" :key="c.id" class="code-card">
        <div class="code-card-head">
          <div class="code-card-main">
            <button type="button" class="code-text" @click="copyCode(c.code)">{{ c.code }}</button>
            <p v-if="metaText(c)" class="code-meta">{{ metaText(c) }}</p>
          </div>
          <span class="status-tag" :class="statusClass(c.status)">{{ statusText(c.status) }}</span>
        </div>

        <dl v-if="codeDetailRows(c).length" class="code-detail">
          <div v-for="row in codeDetailRows(c)" :key="row.label" class="code-detail-row">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <div v-if="canRevoke(c.status)" class="code-actions">
          <van-button size="mini" type="danger" plain @click="revoke(c)">作废</van-button>
        </div>
      </article>
      <van-empty
        v-if="!loading && codes.length === 0"
        :description="codeQuery.replace(/\D/g, '') ? '未找到匹配的兑换码' : '暂无兑换码'"
      />
    </div>

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
            v-model.number="form.redeemValidDays"
            type="digit"
            label="兑换期限(自然日)"
            placeholder="默认7天，截止最后一天23:59"
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
  color: var(--tt-text-secondary, #969799);
}
.search-box {
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.search-box :deep(.van-field__label) {
  width: 4.2em;
  color: var(--tt-text, #323233);
}
.list-loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}
.code-text {
  border: none;
  background: none;
  padding: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--tt-red, #f85959);
  cursor: pointer;
}
.code-text:active {
  opacity: 0.7;
}
.code-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.code-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.code-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.code-card-main {
  min-width: 0;
  flex: 1;
}
.code-meta {
  margin: 6px 0 0;
  font-size: 13px;
  color: #646566;
  line-height: 1.5;
}
.status-tag {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.status-unused {
  color: #ed6a0c;
  background: #fff7e8;
}
.status-bound {
  color: #1989fa;
  background: #ecf5ff;
}
.status-activated {
  color: #07c160;
  background: #e8faf0;
}
.status-expired {
  color: #969799;
  background: #f2f3f5;
}
.status-revoked {
  color: #ee0a24;
  background: #ffeef0;
}
.code-detail {
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid #f2f3f5;
}
.code-detail-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
  font-size: 13px;
  line-height: 1.6;
}
.code-detail-row + .code-detail-row {
  margin-top: 4px;
}
.code-detail-row dt {
  color: #969799;
  margin: 0;
}
.code-detail-row dd {
  margin: 0;
  color: #323233;
  word-break: break-all;
}
.code-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f2f3f5;
  text-align: right;
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
