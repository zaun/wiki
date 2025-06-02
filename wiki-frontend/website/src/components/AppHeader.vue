<!--
@file AppBar.vue
@description Application top bar with navigation controls, search input, and user/account actions.
-->

<template>
    <v-app-bar app fixed elevation="2">
        <v-toolbar-title>
            <span class="cursor-pointer" @click="goHome">Unending.Wiki</span>
        </v-toolbar-title>
        <v-spacer />

        <div class="ml-auto d-flex align-center">
            <v-btn icon  @click="goTo('search')">
                <v-icon>mdi-magnify</v-icon>
            </v-btn>

            <v-menu v-if="showPage" offset-y>
                <template #activator="{ props: menuProps }">
                    <v-btn icon v-bind="menuProps">
                        <v-icon>mdi-file-document-outline</v-icon>
                    </v-btn>
                </template>
                <v-list>
                    <v-list-item :disabled="isViewRoute" @click="goTo('view')">
                        <v-list-item-title>View</v-list-item-title>
                    </v-list-item>
                    <v-list-item  v-if="isAuthenticated" :disabled="isEditRoute" @click="goTo('edit')">
                        <v-list-item-title>Edit</v-list-item-title>
                    </v-list-item>
                    <v-list-item :disabled="isHistoryRoute" @click="goTo('history')">
                        <v-list-item-title>History</v-list-item-title>
                    </v-list-item>
                    <v-list-item :disabled="isExportyRoute" @click="goTo('export')">
                        <v-list-item-title>Export</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>

            <template v-if="isAuthenticated">
                <v-menu offset-y>
                    <template #activator="{ props: menuProps }">
                        <v-btn icon v-bind="menuProps">
                            <v-icon>mdi-account</v-icon>
                        </v-btn>
                    </template>
                    <v-list>
                        <v-list-item @click="goToProfile">
                            <v-list-item-title>Profile</v-list-item-title>
                        </v-list-item>
                        <v-list-item @click="logout">
                            <v-list-item-title>Logout</v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-menu>
            </template>
            <template v-else>
                <v-btn text @click="doAuth">Get Started</v-btn>
            </template>
        </div>
    </v-app-bar>

    <AuthDialog v-model="showAuth" />
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AuthDialog from '@/components/AuthDialog.vue';
import { useApi } from '@/stores/api';

const api = useApi();
const route = useRoute();
const router = useRouter();


const showAuth = ref(false);

const isEditRoute = computed(() => route.name === 'edit');
const isExportyRoute = computed(() => route.name === 'export');
const isHistoryRoute = computed(() => route.name === 'history');
const isViewRoute = computed(() => route.name === 'view');
const showPage = computed(() => ['view', 'edit', 'history', 'export'].includes(route.name));

const isAuthenticated = api.isAuthenticated;

/**
 * Show the authentication dialog.
 * @returns {void}
 */
function doAuth() {
    showAuth.value = true;
}

/**
 * Emit a `logout` event.
 * @returns {void}
 */
async function logout() {
    await api.authLogout();
    router.replace('/');
}

/**
 * Emit a `profile` event to navigate to the user's profile.
 * @returns {void}
 */
function goToProfile() {
    emit('profile');
}

/**
 * Navigate via router to a named route, preserving the `id` param.
 * @param {'view'|'edit'|'history'} name - The target route name.
 * @returns {void}
 */
function goTo(name) {
    router.push({
        name,
        params: { id: route.params.id },
    });
}

/**
 * Navigate home to the default (root) view.
 * Uses a zeroed UUID as the page ID.
 * @returns {void}
 */
function goHome() {
    router.push({
        name: 'page',
        params: { id: 'welcome' },
    });
}
</script>

<style scoped>
.cursor-pointer {
    cursor: pointer;
}

.search-container {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 40%;
    max-width: 400px;
}

.ml-auto {
    margin-left: auto;
}

.d-flex {
    display: flex;
}

.align-center {
    align-items: center;
}
</style>
