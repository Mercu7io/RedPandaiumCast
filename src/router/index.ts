import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/:language',
    name: 'Home',
    // Required by TypeScript RouteRecordRaw, even if we don't use <router-view> in App.vue
    component: { render: () => null },
  },
  {
    path: '/',
    redirect: () => `/${(navigator.language || 'en').split('-')[0]}`,
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;