// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';

import EditPage from '@/views/EditPage.vue';
import ViewPage from '@/views/ViewPage.vue';

const routes = [
    { path: '/', redirect: '/view/00000000-0000-0000-0000-000000000000' },
    {
        path: '/view/:id', name: 'view',  component: ViewPage, props: true, 
    },
    {
        path: '/edit/:id', name: 'edit',  component: EditPage, props: true, 
    },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
});
