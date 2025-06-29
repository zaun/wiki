// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';

import { useApi } from '@/stores/api';
import EditView from '@/views/EditView.vue';
import ExportView from '@/views/ExportView.vue';
import PageView from '@/views/PageView.vue';
import ProfileView from '@/views/ProfileView.vue';
import SearchView from '@/views/SearchView.vue';
import TopicView from '@/views/TopicView.vue';

const api = useApi();

// if !api.isAuthenticated don't allow access to edit
const routes = [
    { path: '/', redirect: '/page/welcome' },
    { path: '/page/:id', name: 'page', component: PageView, props: true },
    {
        path: '/profile/:id?',
        name: 'profile',
        component: ProfileView,
        props: true,
        beforeEnter: (to, _from, next) => {
            const isInvalidId = to.params.id === 'null' || to.params.id === 'undefined' || to.params.id === null || to.params.id === undefined || to.params.id === '';
            if (isInvalidId) {
                console.log('Invalid profile ID');
                return next({ name: 'page', params: { id: 'welcome' } });
            }
            console.log('Valid profile ID');
            next();
        },
    },
    { path: '/view/:id', name: 'view', component: TopicView, props: true },
    { path: '/search', name: 'search', component: SearchView, props: true },
    {
        path: '/export/:id',
        name: 'export',
        component: ExportView,
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
        component: EditView,
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
