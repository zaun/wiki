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
            <Image v-if="node?.image" :aspect-ratio="3.2" :src="heroImageURL" />

            <!-- breadcrumb trail -->
            <v-breadcrumbs class="mb-1 mt-0">
                <template #divider>
                    <span class="mx-2">/</span>
                </template>
                <v-breadcrumbs-item v-for="(crumb, i) in breadcrumbs" :key="crumb.id" :to="`/view/${crumb.id}`"
                    :disabled="i === breadcrumbs.length - 1">
                    {{ crumb.title }}
                </v-breadcrumbs-item>
            </v-breadcrumbs>

            <div>
                <!-- Details & Relationships Sidebar -->
                <div v-if="details.length || relationships.length" class="sidebar">
                    <div v-for="(item, index) in details" :key="index" class="d-flex align-center sidebar-item">
                        <Detail v-model="details[index]" :can-edit="false" />
                    </div>

                    <div v-if="relationships.length" class="my-6" ref="relationshipList">
                        <Detail :model-value="{ type: 'header', label: 'Relationships' }" />
                        <div class="relationship-ancho d-flex align-center sidebar-itemr"
                            v-for="(rel, idx) in relationships" :key="rel.id || idx">
                            <Relationship v-model="relationships[idx]" :can-edit="false" />
                        </div>
                    </div>
                </div>

                <!-- Main Content -->
                <div class="main-content" ref="sectionList">
                    <!-- Main node summary -->
                    <Section :header-size="4" v-model="node" />

                    <!-- sections -->
                    <div class="my-6">
                        <div class="section-anchor" v-for="(sec, idx) in sections" :key="sec.id || idx">
                            <Section v-model="sections[idx]" />
                        </div>
                    </div>

                    <!-- Citations -->
                    <div v-if="citationGroups.length" class="my-6">
                        <div class="text-h4 mb-2">Citations</div>
                        <div class="citation-container">
                            <template v-for="(group, gIdx) in citationGroups" :key="group.key">
                                <template v-for="(cit, idx) in group.citations" :key="cit.id || idx" class="mb-2">
                                    <CitationView :citation="group.citations[idx]" />
                                </template>
                            </template>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Subpages -->
            <div v-if="children.length" class="mt-8">
                <h3 class="mb-4">Subpages</h3>
                <TreeNodes :nodes="children" />
            </div>
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

import CitationView from '@/components/Citations/CitationView.vue';
import Detail from '@/components/Detail.vue';
import Image from '@/components/Image.vue';
import NotFound from '@/components/NotFound.vue';
import Relationship from '@/components/Relationship.vue';
import Section from '@/components/sections/Section.vue';
import TreeNodes from '@/components/TreeNodes.vue';
import { useApi } from '@/stores/api';
import { useData } from '@/stores/data';

const api = useApi();
const route = useRoute();
const store = useData();

const loading = ref(true);
const notFound = ref(false);

const breadcrumbs = computed(() => store.currentNode?.breadcrumbs || []);
const children = computed(() => node.value.children || []);
const citationGroups = computed(() => store.currentCitations || []);
const details = computed(() => node.value.details || []);
const heroImageURL = computed(() => {
    let url = '';
    if (node.value.image) {
        url = api.getImageUrl(node.value.image);
        if (node.value.imageCrop) {
            const c = node.value.imageCrop;
            url += `?crop=${c.x},${c.y},${c.width},${c.height}`;
        }
    }
    return url;
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
