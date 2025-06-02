<!--
@file ViewPage.vue
@description Displays a node page. Handles loading and 404 state.
-->

<template>
    <div>
        <ReviewAlert v-if="!loading && !notFound" :review="reviewItems" />

        <!-- 404 -->
        <NotFound v-if="!loading && notFound" />

        <!-- ready -->
        <v-container v-else-if="!loading">

            <Image v-if="node?.image" :aspect-ratio="3.2" :src="heroImageURL" />

            <!-- breadcrumb trail -->
            <v-breadcrumbs class="mb-1 mt-0" :items="breadcrumbs" divider="/">
                <template #title="{ item }"">
                   <v-btn variant="text" size="small" density="compact" class="pa-0 ma-0" :to="`/view/${item.id}`">{{
                    item.title }}</v-btn>
                </template>
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
                    <Section :header-size="4" v-model="node">
                        <!-- <template #appendTitle>
                            <Voting />
                        </template> -->
                    </Section>

                    <!-- sections -->
                    <div class="my-6">
                        <div class="section-anchor" v-for="(sec, idx) in sections" :key="sec.id || idx">
                            <Section v-model="sections[idx]" />
                        </div>
                    </div>

                    <!-- Citations -->
                    <div v-if="citationCount > 0" class="my-6">
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

            <!-- <span v-if="reviewRating > -1">
                Review Rating: {{ reviewRating }} / 10
            </span> -->

            <!-- Subpages -->
            <div v-if="children.length" class="no-print">
                <h3 class="mt-4">Categories</h3>
                <div v-if="children.length" class="d-flex flex-wrap mt-4" style="gap: 20px;">
                    <TreeNodes :nodes="children" />
                </div>
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
import ReviewAlert from '@/components/ReviewAlert.vue';
import Section from '@/components/sections/Section.vue';
import TreeNodes from '@/components/TreeNodes.vue';
import Voting from '@/components/Voting.vue';
import { useApi } from '@/stores/api';
import { useData } from '@/stores/data';

const api = useApi();
const route = useRoute();
const store = useData();

const loading = ref(true);
const notFound = ref(false);
const ratingItems = ref([]);
const reviewItems = ref([]);

const breadcrumbs = computed(() => store.currentNode?.breadcrumbs || []);
const children = computed(() => node.value.children || []);
const citationCount = computed(() => {
    const totalCitations = store.currentCitations.reduce((accumulator, currentItem) => accumulator + (currentItem.citations?.length ?? 0), 0);
    return totalCitations;
});
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

    // Update review items
    reviewItems.value = [];
    ratingItems.values = [];
    if (store.currentNode.aiReview) {
        store.currentNode.aiReview.forEach((item) => {
            if (item.hasOwnProperty('result')) {
                reviewItems.value.push({ ...item, title: 'Summary' });
            } else {
                ratingItems.value.push({ ...item, title: 'Summary' });
            }
        });
    }
    store.currentSections.forEach((section) => {
        if (section.aiReview) {
            section.aiReview.forEach((item) => {
                if (item.hasOwnProperty('result')) {
                    reviewItems.value.push({ ...item, title: section.title });
                } else {
                    ratingItems.value.push({ ...item, title: section.title });
                }
            });
        }
    });
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
