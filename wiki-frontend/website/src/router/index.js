// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';

import { useApi } from '@/stores/api';
import EditPage from '@/views/EditPage.vue';
import ViewPage from '@/views/ViewPage.vue';
import ExportPage from '@/views/ExportPage.vue';

const api = useApi();

// if !api.isAuthenticated don't allow access to edit
const routes = [
    { path: '/', redirect: '/view/00000000-0000-0000-0000-000000000000' },
    {
        path: '/view/:id', name: 'view', component: ViewPage, props: true, 
    },
    {
        path: '/export/:id', name: 'export', component: ExportPage, props: true, 
    },
    {
        path: '/edit/:id',
        name: 'edit',
        component: EditPage,
        props: true, 
        beforeEnter: (to, from, next) => {
            if (api.isAuthenticated.value) {
                // allow navigation
                next();
            } else {
                // redirect to view
                next({ name: 'view', params: { id: to.params.id } });
            }
        },
    },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
});
