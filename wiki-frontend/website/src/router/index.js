// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';

import { useApi } from '@/stores/api';
import EditPage from '@/views/EditPage.vue';
import ExportPage from '@/views/ExportPage.vue';
import SearchPage from '@/views/SearchPage.vue';
import SitePage from '@/views/SitePage.vue';
import ViewPage from '@/views/ViewPage.vue';

const api = useApi();

// if !api.isAuthenticated don't allow access to edit
const routes = [
    { path: '/', redirect: '/page/welcome' },
    { path: '/page/:id', name: 'page', component: SitePage, props: true },
    { path: '/view/:id', name: 'view', component: ViewPage, props: true },
    { path: '/search', name: 'search', component: SearchPage, props: true },
    {
        path: '/export/:id',
        name: 'export',
        component: ExportPage,
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
