<script setup lang="ts">
import { useReservationDetailDialog } from '@/composables/reservationDetailDialog';
import ReservationPlanPanel from '@/components/ReservationPlanPanel.vue';

const { visible, mode, reservation, confirmReservationDetailDialog } =
  useReservationDetailDialog();
</script>

<template>
  <van-dialog
    v-model:show="visible"
    title="我的预约"
    confirm-button-text="知道了"
    class="reservation-detail-dialog"
    @confirm="confirmReservationDetailDialog"
  >
    <ReservationPlanPanel
      v-if="mode === 'detail' && reservation"
      :assignments="reservation.assignments"
      footnote="日期不可修改，如需调整请到「预约座位」更换座位。"
    >
      <template #meta>
        <p v-if="reservation.dateFrom && reservation.dateTo" class="plan-meta">
          使用期间：{{ reservation.dateFrom }} 至 {{ reservation.dateTo }}
        </p>
        <p v-if="reservation.dayCount" class="plan-meta">共 {{ reservation.dayCount }} 天</p>
      </template>
      <template v-if="!reservation.assignments?.length" #fallback>
        <p class="plan-meta">座位：{{ reservation.seatLabel }}</p>
      </template>
    </ReservationPlanPanel>

    <p v-else class="empty-message">暂无预约记录，请前往「预约座位」完成预约。</p>
  </van-dialog>
</template>

<style scoped>
:deep(.reservation-detail-dialog .van-dialog__message) {
  padding: 0;
}

.empty-message {
  padding: 12px 20px 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--tt-text, #323233);
  text-align: left;
}
</style>
