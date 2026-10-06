<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useActivities } from './stores/activities'
import { useSettings } from './stores/settings'

const activities = useActivities()
const settings = useSettings()
const { needRefresh, updateServiceWorker } = useRegisterSW()

onMounted(() => Promise.all([activities.load(), settings.load()]))

const tabs = [
  { to: '/', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { to: '/runs', label: 'Runs', icon: 'M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6a2 2 0 0 0-1.7-1c-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7' },
  { to: '/insights', label: 'Insights', icon: 'M3.5 18.5 9.5 12.5l4 4L22 6.9 20.6 5.5l-7.1 8-4-4L2 17z' },
  { to: '/settings', label: 'Settings', icon: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z' },
]
</script>

<template>
  <RouterView />
  <div v-if="needRefresh" class="update" role="status">
    <span>A new version is available.</span>
    <button class="btn primary" @click="updateServiceWorker(true)">Reload</button>
  </div>
  <nav class="tabbar" aria-label="Main">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ exact: t.to === '/' }">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path :d="t.icon" fill="currentColor" /></svg>
      <span>{{ t.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed;
  inset: auto 0 0 0;
  height: calc(var(--nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
  z-index: 1000;
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-3);
  font-size: 0.7rem;
  font-weight: 600;
}
.tab.router-link-active:not(.exact),
.tab.exact.router-link-exact-active {
  color: var(--accent);
}
.update {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 12px);
  max-width: 480px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  z-index: 1001;
}
</style>
