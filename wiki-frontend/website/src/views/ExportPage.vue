<!--
@file NodeView.vue
@description Displays a node page. Handles loading and 404 state.
-->

<template>
    <div>
        <!-- 404 -->
        <NotFound v-if="!loading && notFound" />

        <!-- ready -->
        <v-container v-else-if="!loading">
            <v-textarea auto-grow :rows="25" :value="jsonExport"/>
        </v-container>

        <!-- loading -->
        <v-container v-else class="d-flex justify-center pa-10">
            <v-progress-circular indeterminate size="48" />
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

const breadcrumbs = computed(() => store.currentNode?.breadcrumbs || []);
const citationGroups = computed(() => store.currentCitations || []);
const details = computed(() => node.value.details || []);
const jsonExport = computed(() => {
    const parent = breadcrumbs.value[breadcrumbs.value.length-2];
    const data = {
        title: node.value.title,
        parentTitle: parent.title === 'Unending.Wiki' ? '' : parent.title,
        content: node.value.content,
        sections: [],
        details: [],
        citations: [],
    };

    sections.value.forEach((s) => {
        const section ={
            type: s.type,
            title: s.title,
            content: s.content,
            citations: [],
        };

        if (s.type === 'data-table') {
            section.data = s.data;
            section.summary = s.summary;
        }

        const nodeCit = citationGroups.value.find((g) => g.type ==='section' && g.id === s.id);
        if (nodeCit) {
            section.citations = nodeCit.citations.map((c) => {
                const e = JSON.parse(JSON.stringify(c));
                delete e.source.id;
                delete e.source.createdAt;
                delete e.source.updatedAt;
                delete e.id;
                delete e.createdAt;
                delete e.updatedAt;
                delete e.label;
                return e;
            });
        }

        data.sections.push(section);
    });

    const nodeCit = citationGroups.value.find((g) => g.type ==='node' && g.id === node.value.id);
    if (nodeCit) {
        data.citations = nodeCit.citations.map((c) => {
            const e = JSON.parse(JSON.stringify(c));
            delete e.source.id;
            delete e.source.createdAt;
            delete e.source.updatedAt;
            delete e.id;
            delete e.createdAt;
            delete e.updatedAt;
            delete e.label;
            return e;
        });
    }

    return JSON.stringify(data, null, 2);
});
const node = computed(() => store.currentNode || {});
const relationships = computed(() => {
    const list = node.value.relationships || [];
    return [...list].sort((a, b) => a.relationship.localeCompare(b.relationship));
});
const sections = computed(() => store.currentSections || []);

watch(() => route.params.id, load);

/**
 * Fetches node data from the store and handles loading/404 state.
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

// Initial load on mount
onMounted(load);
</script>

<style scoped>
.wrap {
    white-space: pre-wrap;
    word-wrap: break-word;
}

.section-anchor {
    /* fallback if JS doesn’t run; adjust for fixed toolbar height */
    scroll-margin-top: 50px;
}

.sidebar {
    float: right;
    width: 30%;
    border: 1px solid #eee;
    padding: 0 0.5rem;
}

.d-flex {
    display: flex;
}

.align-center {
    align-items: center;
}

.flex-grow-1 {
    flex-grow: 1;
}

.citation-container {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
}
</style>
