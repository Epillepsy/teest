<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { ActivitySummary } from '@/types'
import { formatDate, formatDuration, formatKm, formatPace, paceSecPerKm } from '@/lib/format'

defineProps<{ run: ActivitySummary }>()
</script>

<template>
  <RouterLink :to="`/runs/${run.id}`" class="row">
    <div class="main">
      <div class="title">
        {{ run.name }}
        <span v-if="run.isRace" class="badge">Race</span>
      </div>
      <div class="tiny">{{ formatDate(run.startTime, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</div>
    </div>
    <div class="stats num">
      <div><strong>{{ formatKm(run.distance) }}</strong> <span class="tiny">km</span></div>
      <div class="muted small">{{ formatPace(paceSecPerKm(run.distance, run.duration)) }} /km</div>
      <div class="muted small">{{ formatDuration(run.duration) }}</div>
    </div>
  </RouterLink>
</template>

<style scoped>
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.row:last-child { border-bottom: 0; }
.main { min-width: 0; }
.title { font-weight: 600; display: flex; gap: 6px; align-items: center; }
.stats { display: grid; grid-template-columns: auto; text-align: right; gap: 0; }
@media (min-width: 520px) {
  .stats { grid-template-columns: 80px 90px 80px; align-items: baseline; }
}
</style>
