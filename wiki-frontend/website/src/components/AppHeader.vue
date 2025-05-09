<!--
@file AppBar.vue
@description Application top bar with navigation controls, search input, and user/account actions.
-->

<template>
    <v-app-bar app fixed elevation="2">
        <v-toolbar-title @click="goHome" class="cursor-pointer">
            Unending.Wiki
        </v-toolbar-title>

        <div class="search-container">
            <v-text-field v-model="q" placeholder="Search…" hide-details dense clearable @keyup.enter="doSearch" />
        </div>

        <div class="ml-auto d-flex align-center">
            <template v-if="isViewRoute || isEditRoute">
                <v-menu offset-y>
                    <template #activator="{ props: menuProps }">
                        <v-btn icon v-bind="menuProps">
                            <v-icon>mdi-file-document-outline</v-icon>
                        </v-btn>
                    </template>
                    <v-list>
                        <v-list-item :disabled="isViewRoute" @click="goTo('view')">
                            <v-list-item-title>View</v-list-item-title>
                        </v-list-item>
                        <v-list-item :disabled="isEditRoute" @click="goTo('edit')">
                            <v-list-item-title>Edit</v-list-item-title>
                        </v-list-item>
                        <v-list-item :disabled="isHistoryRoute" @click="goTo('history')">
                            <v-list-item-title>History</v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-menu>
            </template>

            <template v-if="loggedIn">
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
                <v-btn text @click="login">Login</v-btn>
                <v-btn text @click="signup">Sign Up</v-btn>
            </template>
        </div>
    </v-app-bar>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// Get current route and router for navigation
const route = useRoute();
const router = useRouter();

/**
 * Props for AppBar component
 * @typedef {Object} AppBarProps
 * @property {boolean} [loggedIn=false] - Whether the user is authenticated.
 */

const _props = defineProps({ loggedIn: { type: Boolean, default: false } });

/**
 * Emits supported by AppBar
 * @typedef {Object} AppBarEmits
 * @property {(query: string) => void} search       - Emitted when user initiates a search.
 * @property {() => void} login                     - Emitted to trigger login flow.
 * @property {() => void} logout                    - Emitted to trigger logout.
 * @property {() => void} signup                    - Emitted to trigger sign-up flow.
 * @property {() => void} profile                   - Emitted to navigate to user profile.
 * @property {() => void} toggle-edit               - (Unused) Reserved for toggling edit mode.
 */
const emit = defineEmits([
    'toggle-edit',
    'login',
    'logout',
    'signup',
    'search',
    'profile',
]);

/**
 * Search query model
 * @type {import('vue').Ref<string>}
 */
const q = ref('');

const isEditRoute = computed(() => route.name === 'edit');
const isHistoryRoute = computed(() => route.name === 'history');
const isViewRoute = computed(() => route.name === 'view');

/**
 * Emit a `search` event with the current query string.
 * @returns {void}
 */
function doSearch() {
    emit('search', q.value);
}

/**
 * Emit a `login` event.
 * @returns {void}
 */
function login() {
    emit('login');
}

/**
 * Emit a `logout` event.
 * @returns {void}
 */
function logout() {
    emit('logout');
}

/**
 * Emit a `signup` event.
 * @returns {void}
 */
function signup() {
    emit('signup');
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
        name: 'view',
        params: { id: '00000000-0000-0000-0000-000000000000' },
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
