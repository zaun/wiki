<!--
@file SearchView.vue
@description Lets the user search the ontology
-->

<template>
    <v-container class="d-flex justify-center mt-8">
        <v-text-field v-model="query" @change="doSearch" @keydown.enter="doSearch" />
    </v-container>

    <v-container>
        <v-alert v-if="results.length === 0" type="info" class="mb-4">
            No results found.
        </v-alert>
        <v-card v-for="item in results" :key="item.id" class="mb-4" :to="`/view/${item.id}`">
            <v-card-title class="d-flex align-center justify-space-between pb-1">
                <span><strong>{{ item.title }}</strong></span>
                <!-- <v-chip size="small" color="primary" class="ml-2">{{ item.matchType }}</v-chip> -->
                <v-chip size="small" color="secondary" class="ml-2">Score: {{ item.qualityScore.toFixed(2) }}</v-chip>
            </v-card-title>
            <v-card-subtitle v-if="item.subtitle" class="text-subtitle-1 text-grey-1 pb-0">
                <span>{{ item.subtitle }}</span>
            </v-card-subtitle>
            <v-card-text class="pt-1">
                <SimpleMarkdown :content="item.summary" />
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import SimpleMarkdown from '@/components/sections/SimpleMarkdown.vue';
import { useApi } from '@/stores/api';

const api = useApi();
const route = useRoute();
const router = useRouter();

const query = ref('');
const results = ref([]);

watch(() => route.query.q, (q) => {
    if (query.value !== q) {
        query.value = q;
        doSearch();
    }
}, { immediate: true });

/**
 * Highlights the search terms in the given content by wrapping them with '=='.
 * @param {string} content - The text content to highlight.
 * @param {string[]} terms - The search terms to highlight in the content.
 * @returns {string} The content with highlighted terms.
 */
function highlightedContent(content, terms) {
    if (!terms.length) {
        return content;
    }

    const pattern = terms
        .filter(Boolean)
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

    const regex = new RegExp(`(${pattern})`, 'gi');

    return content.replace(regex, '==$1==');
};

/**
 * Performs a search using the current query and updates the results.
 * Fetches search results from the API, highlights matching terms in the summary,
 * and logs the data to the console.
 */
async function doSearch() {
    if (route.query.q !== query.value) {
        router.push({
            path: '/search',
            query: {
                q: query.value,
                page: 1,
            },
        });
    }

    /**
     * Result:
     * id: String, UUID of the entity for the result
     * matchType: String (entity|seaction|citation), the type of result
     * qualityScore: Float, the score or the result higher is better
     * subtitle: String, the section title (only if type == section)
     * title: String, the entity title (always)
     * summary: String, the matching paragraph
     * 
     * Data:
     * page: Int, current page numner
     * size: Int, max resutls per page
     * terms: Array<string>, the individual search terms
     * results: Array<Result>, ther results of the search
     */
    const data = await api.search(query.value);
    results.value = data.results.map((r) => {
        r.summary = highlightedContent(r.summary, data.terms);
        return r;
    });
}
</script>
