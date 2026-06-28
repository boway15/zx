<script setup lang="ts">
import { computed } from 'vue';

export interface SeatAssignmentItem {
  date: string;
  seatLabel: string;
  isPreferred: boolean;
}

const props = withDefaults(
  defineProps<{
    assignments?: SeatAssignmentItem[];
    sectionTitle?: string;
    footnote?: string;
    showAdjustmentNote?: boolean;
  }>(),
  {
    sectionTitle: '座位安排',
    showAdjustmentNote: true,
  },
);

const hasAdjustedSeat = computed(() =>
  props.assignments?.some((item) => !item.isPreferred),
);
</script>

<template>
  <div class="reservation-plan-panel">
    <slot name="meta" />

    <template v-if="assignments?.length">
      <p class="plan-section-title">{{ sectionTitle }}</p>
      <ul class="plan-assignments">
        <li
          v-for="item in assignments"
          :key="item.date"
          class="plan-row"
          :class="{ adjusted: !item.isPreferred }"
        >
          <span class="plan-date">{{ item.date }}</span>
          <span class="plan-seat">{{ item.seatLabel }}</span>
        </li>
      </ul>
      <p v-if="showAdjustmentNote && hasAdjustedSeat" class="plan-note">
        说明：因部分日期首选已被预约，已自动调整为其他可用座位。
      </p>
    </template>

    <slot v-else name="fallback" />

    <p v-if="footnote" class="plan-footnote">{{ footnote }}</p>
  </div>
</template>

<style scoped>
.reservation-plan-panel {
  padding: 8px 20px 4px;
  text-align: left;
}

:deep(.plan-meta) {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--tt-text, #323233);
  line-height: 1.5;
}

.plan-section-title {
  margin: 12px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tt-text, #323233);
}

.plan-assignments {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 220px;
  overflow-y: auto;
}

.plan-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 13px;
  color: var(--tt-text, #323233);
  line-height: 1.4;
}

.plan-row.adjusted {
  color: #ed6a0c;
  font-weight: 500;
}

.plan-row.adjusted .plan-date,
.plan-row.adjusted .plan-seat {
  color: #ed6a0c;
}

.plan-note {
  margin: 10px 0 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #ed6a0c;
  background: #fff7e8;
  border-radius: 6px;
}

.plan-footnote {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--tt-text-secondary, #969799);
  line-height: 1.5;
}
</style>
