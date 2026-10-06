import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from './views/DashboardView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/runs', name: 'runs', component: () => import('./views/RunsView.vue') },
    { path: '/runs/:id', name: 'activity', component: () => import('./views/ActivityView.vue'), props: true },
    { path: '/insights', name: 'insights', component: () => import('./views/InsightsView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})
