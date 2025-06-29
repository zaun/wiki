<!--
@file HistoryView.vue
@description Renders a minimal node view: title, summary, and sections. Handles loading and 404 state.
-->

<template>
    <div>
        <!-- 404 -->
        <NotFound v-if="!loading && notFound" />

        <!-- ready -->
        <v-container v-else-if="!loading">
            <h1>{{ node.title }}</h1>
            <p>{{ node.summary }}</p>
            <v-divider class="my-4"></v-divider>

            <div v-for="sec in sections" :key="sec.id">
                <h3>{{ sec.title }}</h3>
                <div v-html="sec.content"></div>
                <v-divider class="my-2"></v-divider>
            </div>
        </v-container>

        <!-- loading -->
        <v-container v-else class="d-flex justify-center pa-10">
            <v-progress-circular indeterminate size="48"></v-progress-circular>
        </v-container>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';

import NotFound from '@/components/NotFound.vue';
import { useData } from '@/stores/data';

const route = useRoute();
const store = useData();

const loading = ref(true);
const notFound = ref(false);

const node = computed(() => /** @type {NodeData} */(store.currentNode || {}));
const sections = computed(() => /** @type {SectionData[]} */(store.currentSections || []));

watch(() => route.params.id, load);

/**
 * Load node and sections via the store, managing loading and 404 state.
 * @returns {Promise<void>}
 */
async function load() {
    loading.value = true;
    notFound.value = false;

    const ok = await store.setNode(route.params.id);
    if (!ok || !store.currentNode) {
        notFound.value = true;
    }

    loading.value = false;
}

// Initial load on component mount
onMounted(load);
</script>
