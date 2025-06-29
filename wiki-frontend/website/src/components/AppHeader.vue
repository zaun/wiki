<!--
@file AppBar.vue
@description Application top bar with navigation controls, search input, and user/account actions.
-->

<template>
    <v-app-bar app fixed elevation="2">
        <v-toolbar-title>
            <span class="cursor-pointer" @click="goHome">OmniOntos</span>
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
                <v-list class="header-menu">
                    <v-list-item :disabled="isViewRoute" @click="goTo('view')">
                        <template v-slot:prepend><v-icon icon="mdi-clipboard-outline"></v-icon></template>
                        <v-list-item-title>View Topic</v-list-item-title>
                    </v-list-item>
                    <v-list-item  v-if="isAuthenticated" :disabled="!isViewRoute" @click="goTo('edit')">
                        <template v-slot:prepend><v-icon icon="mdi-clipboard-edit-outline"></v-icon></template>
                        <v-list-item-title>Edit Topic</v-list-item-title>
                    </v-list-item>
                    <v-list-item  v-if="isAuthenticated" :disabled="!isViewRoute" @click="doCreateTopic">
                        <template v-slot:prepend><v-icon icon="mdi-clipboard-plus-outline"></v-icon></template>
                        <v-list-item-title>New Sub-Topic</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item :disabled="isEditRoute || isHistoryRoute" @click="goTo('history')">
                        <template v-slot:prepend><v-icon icon="mdi-clipboard-clock-outline"></v-icon></template>
                        <v-list-item-title>Topic History</v-list-item-title>
                    </v-list-item>
                    <v-list-item :disabled="isEditRoute || isExportyRoute" @click="goTo('export')">
                        <template v-slot:prepend><v-icon icon="mdi-clipboard-arrow-down-outline"></v-icon></template>
                        <v-list-item-title>Topic Export</v-list-item-title>
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
                    <v-list class="header-menu">
                        <v-list-item @click="goToProfile">
                            <template v-slot:prepend><v-icon icon="mdi-card-account-details-outline"></v-icon></template>
                            <v-list-item-title>Profile</v-list-item-title>
                        </v-list-item>
                        <v-list-item @click="logout">
                            <template v-slot:prepend><v-icon icon="mdi-logout"></v-icon></template>
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
    <CreateTopicDialog v-model="showCreateTopic" @create="createTopic"/>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AuthDialog from '@/components/AuthDialog.vue';
import CreateTopicDialog from '@/components/CreateTopicDialog.vue';
import { useApi } from '@/stores/api';

const api = useApi();
const route = useRoute();
const router = useRouter();

const showAuth = ref(false);
const showCreateTopic = ref(false);

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
 * Show the create topic dialog.
 * @returns {void}
 */
function doCreateTopic() {
    showCreateTopic.value = true;
}

function createTopic(data) {
    console.log(111, data);
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
    router.push({
        name: 'profile',
        params: { id: api.userId.value },
    });
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

.header-menu :deep(.v-list-item__prepend) {
    width: 35px;
}
</style>
