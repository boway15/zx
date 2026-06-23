<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api, { ApiResponse } from '@/api';
import { showDialog, showConfirmDialog, showSuccessToast } from 'vant';

interface DateItem {
  id: string;
  reserveDate: string;
  seatLabel: string;
  roomCode: string;
  seatNo: number;
  code: string | null;
  productName: string | null;
  note: string | null;
}

interface CodeItem {
  id: string;
  reserveDate: string;
  seatLabel: string;
  roomCode: string;
  seatNo: number;
}

interface ByDateResult {
  date: string;
  items: DateItem[];
}

interface ByCodeResult {
  code: string;
  status: string;
  productName: string;
  note: string | null;
  items: CodeItem[];
}

const activeTab = ref(0);

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const selectedDate = ref(todayStr());
const showCalendar = ref(false);
const dateItems = ref<DateItem[]>([]);
const loadingDate = ref(false);

const codeInput = ref('');
const codeResult = ref<ByCodeResult | null>(null);
const loadingCode = ref(false);

function statusText(s: string) {
  const map: Record<string, string> = {
    unused: '待兑换',
    used: '已兑换',
    expired: '已过期',
    revoked: '已作废',
  };
  return map[s] || s;
}

function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

function onCalendarConfirm(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  selectedDate.value = `${y}-${m}-${day}`;
  showCalendar.value = false;
  loadByDate();
}

async function loadByDate() {
  loadingDate.value = true;
  try {
    const res = await api.get<ApiResponse<ByDateResult>>(
      '/seats/admin/reservations/by-date',
      { params: { date: selectedDate.value } },
    );
    dateItems.value = res.data.items;
  } finally {
    loadingDate.value = false;
  }
}

async function loadByCode() {
  const digits = codeInput.value.replace(/\D/g, '');
  if (digits.length !== 11) {
    await showDialog({ title: '提示', message: '请输入11位兑换码' });
    return;
  }
  loadingCode.value = true;
  try {
    const res = await api.get<ApiResponse<ByCodeResult>>(
      '/seats/admin/reservations/by-code',
      { params: { code: digits } },
    );
    codeResult.value = res.data;
  } finally {
    loadingCode.value = false;
  }
}

function cancelLabel(item: { reserveDate: string; seatLabel: string }) {
  return `${formatDateLabel(item.reserveDate)} ${item.seatLabel}`;
}

async function cancelReservation(
  item: { id: string; reserveDate: string; seatLabel: string },
  reload: 'date' | 'code',
) {
  try {
    await showConfirmDialog({
      title: '取消预约',
      message: `确定取消 ${cancelLabel(item)} 的预约吗？`,
    });
  } catch {
    return;
  }

  await api.delete(`/seats/admin/reservations/${item.id}`);
  showSuccessToast('已取消预约');
  if (reload === 'date') {
    await loadByDate();
  } else {
    await loadByCode();
  }
}

onMounted(loadByDate);
</script>

<template>
  <div>
    <h3>预约查看</h3>
    <p class="tip">查看兑换码与座位的预约对应关系</p>

    <van-tabs v-model:active="activeTab" shrink>
      <van-tab title="按日期">
        <van-cell
          title="选择日期"
          :value="formatDateLabel(selectedDate)"
          is-link
          @click="showCalendar = true"
        />

        <van-loading v-if="loadingDate" class="loading" />

        <van-cell-group v-else inset class="list">
          <van-cell
            v-for="(item, idx) in dateItems"
            :key="`${item.id}-${idx}`"
            :title="item.seatLabel"
            :label="[item.productName, item.note].filter(Boolean).join(' · ') || undefined"
            :value="item.code || '未关联兑换码'"
          >
            <template #right-icon>
              <van-button
                size="mini"
                type="danger"
                plain
                @click="cancelReservation(item, 'date')"
              >
                取消
              </van-button>
            </template>
          </van-cell>
          <van-empty v-if="dateItems.length === 0" description="该日暂无预约" />
        </van-cell-group>
      </van-tab>

      <van-tab title="按兑换码">
        <van-cell-group inset class="code-search">
          <van-field
            v-model="codeInput"
            type="tel"
            label="兑换码"
            placeholder="输入11位兑换码"
            maxlength="11"
            clearable
            :formatter="(v: string) => v.replace(/\D/g, '')"
          >
            <template #button>
              <van-button size="small" type="primary" :loading="loadingCode" @click="loadByCode">
                查询
              </van-button>
            </template>
          </van-field>
        </van-cell-group>

        <van-loading v-if="loadingCode" class="loading" />

        <template v-else-if="codeResult">
          <van-cell-group inset class="list">
            <van-cell
              title="兑换码"
              :value="codeResult.code"
              :label="[
                codeResult.productName,
                statusText(codeResult.status),
                codeResult.note || '',
              ].filter(Boolean).join(' · ')"
            />
          </van-cell-group>

          <van-cell-group v-if="codeResult.items.length" inset title="预约记录" class="list">
            <van-cell
              v-for="(item, idx) in codeResult.items"
              :key="`${item.id}-${idx}`"
              :title="formatDateLabel(item.reserveDate)"
              :value="item.seatLabel"
            >
              <template #right-icon>
                <van-button
                  size="mini"
                  type="danger"
                  plain
                  @click="cancelReservation(item, 'code')"
                >
                  取消
                </van-button>
              </template>
            </van-cell>
          </van-cell-group>
          <van-empty
            v-else
            :description="codeResult.status === 'used' ? '该兑换码尚未预约座位' : '兑换码未激活，暂无预约'"
          />
        </template>

        <van-empty v-else description="输入兑换码后查询" />
      </van-tab>
    </van-tabs>

    <van-calendar
      v-model:show="showCalendar"
      :default-date="new Date(`${selectedDate}T12:00:00`)"
      @confirm="onCalendarConfirm"
    />
  </div>
</template>

<style scoped>
h3 {
  margin-bottom: 4px;
}
.tip {
  font-size: 12px;
  color: #969799;
  margin-bottom: 12px;
}
.list {
  margin-top: 12px;
}
.code-search {
  margin-top: 12px;
}
.loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}
</style>
