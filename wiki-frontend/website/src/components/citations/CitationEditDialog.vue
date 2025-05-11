<!--
@file CitationEditor.vue
@description Dialog-based form for creating and editing citation entries, including source lookup/search.
-->

<template>
    <v-dialog v-model="isDialogOpen" persistent max-width="70vw">
        <v-card>
            <v-form ref="formRef">
                <v-card-title class="text-h5 d-flex">
                    <span>Citation Editor</span>
                    <v-spacer />
                    <v-btn icon="mdi-magnify" size="small" variant="plain" @click="openSearch" />
                    <v-btn icon="mdi-close" size="small" variant="plain" @click="cancel" />
                </v-card-title>

                <v-divider />

                <v-card-subtitle class="mt-2 text-h6">Citation Source</v-card-subtitle>
                <v-card-text>
                    <!-- Source Group -->
                    <v-row class="py-1">
                        <v-col cols="12" sm="3" class="py-0">
                            <v-select density="compact" v-model="form.source.type" :items="resourceTypes" label="Type"
                                hide-details :disabled="isExistingSource" />
                        </v-col>
                        <v-col cols="12" sm="9" class="py-0">
                            <v-text-field density="compact" v-model="form.source.publisher" label="Publisher"
                                hide-details :disabled="isExistingSource" />
                        </v-col>
                    </v-row>
                    <v-row class="py-1">
                        <v-col cols="12" sm="2" class="py-0">
                            <v-text-field density="compact" v-model.number="form.source.year" label="Year" type="number"
                                hide-details :disabled="isExistingSource" />
                        </v-col>
                        <v-col cols="12" sm="10" class="py-0">
                            <v-text-field density="compact" v-model="form.source.title" label="Title" hide-details
                                :disabled="isExistingSource" />
                        </v-col>
                    </v-row>
                    <v-row class="py-1">
                        <v-col cols="12" sm="12" class="py-0">
                            <v-text-field density="compact" v-model="form.source.authors" label="Author(s)" hide-details
                                :disabled="isExistingSource" />
                        </v-col>
                    </v-row>
                    <v-row class="py-1">
                        <v-col cols="12" sm="12" class="py-0">
                            <v-text-field density="compact" v-model="form.source.url"
                                label="Citation source homepage (do not deep link)" hide-details
                                :disabled="isExistingSource" />
                        </v-col>
                    </v-row>
                </v-card-text>

                <v-card-subtitle class="mt-2 text-h6">Citation Detail</v-card-subtitle>
                <v-card-text>
                    <v-row class="py-1">
                        <v-col cols="12" sm="3" class="py-0">
                            <v-text-field density="compact" v-model="form.page" label="Section / Page" hide-details />
                        </v-col>
                        <v-col cols="12" sm="9" class="py-0">
                            <v-text-field density="compact" v-model="form.title"
                                label="Title (Chapter, page, section, etc.)" hide-details />
                        </v-col>
                    </v-row>
                    <v-row class="py-1">
                        <v-col cols="12" sm="12" class="py-0">
                            <v-text-field density="compact" v-model="form.url"
                                label="Citation detail (deep link to specific page or article)" hide-details />
                        </v-col>
                    </v-row>
                    <v-row class="py-1">
                        <v-col cols="12" sm="8" class="py-0">
                            <v-textarea density="compact" v-model="form.quote" label="Quote" rows="4" hide-details />
                        </v-col>
                        <v-col cols="12" sm="4" class="pt-0">
                            <v-textarea density="compact" v-model="form.note" label="Note" rows="4" hide-details />
                        </v-col>
                    </v-row>
                </v-card-text>

                <v-divider />

                <v-card-actions>
                    <v-btn @click="deleteCitation">
                        <v-icon>mdi-trash-can-outline</v-icon>
                        <span>Delete</span>
                    </v-btn>
                    <v-spacer />
                    <v-btn @click="cancel">
                        <v-icon>mdi-close</v-icon>
                        <span>Cancel</span>
                    </v-btn>
                    <v-btn @click="save">
                        <v-icon>mdi-check</v-icon>
                        <span>Save</span>
                    </v-btn>
                </v-card-actions>
            </v-form>
        </v-card>
    </v-dialog>

    <!-- SEARCH DIALOG -->
    <v-dialog v-model="searchDialog" max-width="600">
        <v-card>
            <v-card-title>Search Sources</v-card-title>
            <v-card-text>
                <v-text-field density="compact" v-model="searchQuery" label="Search" @keyup.enter="performSearch">
                    <template #append-outer>
                        <v-btn icon density="compact" @click="performSearch">
                            <v-icon>mdi-magnify</v-icon>
                        </v-btn>
                    </template>
                </v-text-field>
                <div class="search-results">
                    <v-list v-if="searchResults.length">
                        <v-list-item v-for="(item, i) in searchResults" :key="i" clickable @click="selectResult(item)">
                            <v-list-item-title>{{ item.source.title }}</v-list-item-title>
                        </v-list-item>
                    </v-list>
                    <div v-else class="d-flex align-center">
                        <v-icon class="mr-2">mdi-magnify-close</v-icon>
                        <span>No results</span>
                    </div>
                </div>
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn density="compact" variant="plain" @click="searchDialog = false">
                    Cancel
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';

/**
 * @typedef {Object} CitationSource
 * @property {string} type       - Resource type (Website, Book, Article, etc.).
 * @property {string} [publisher] - Publisher name.
 * @property {number} [year]      - Publication year.
 * @property {string} [title]     - Source title.
 * @property {string} [authors]   - Author(s) of the source.
 * @property {string} [url]       - Homepage URL of the source.
 * @property {string} [id]        - If existing, unique source ID.
 */

/**
 * @typedef {Object} CitationDetail
 * @property {string} [page]  - Section or page reference.
 * @property {string} [title] - Detail title (chapter, section).
 * @property {string} [url]   - Deep link to specific page or article.
 * @property {string} [quote] - Quoted excerpt.
 * @property {string} [note]  - Internal note.
 */

/**
 * Props for CitationEditor
 * @typedef {Object} Props
 * @property {CitationSource & CitationDetail} [modelValue] - Initial citation object or null for new.
 * @property {boolean} [isOpen=true]                         - Whether the dialog is open.
 */

/**
 * Emits from CitationEditor
 * @typedef {Object} Emits
 * @property {(updated: object) => void} update:modelValue - Emitted when citation is saved.
 * @property {() => void} save                            - Emitted after save action.
 * @property {() => void} cancel                          - Emitted on cancel.
 * @property {(deleted: object) => void} delete           - Emitted when citation is deleted.
 * @property {(open: boolean) => void} update:isOpen      - Emitted when dialog open state changes.
 */

const props = defineProps({
    modelValue: {
        type: Object,
        required: false,
        validator: (v) =>
            v === null ||
            (v.source &&
                ['page', 'url', 'quote', 'note'].every((k) => k in v)),
    },
    isOpen: { type: Boolean, default: true },
});

const emits = defineEmits([
    'update:modelValue',
    'save',
    'cancel',
    'delete',
    'update:isOpen',
]);

const citation = ref({});
const isOpen = ref(props.isOpen);
const resourceTypes = ref([
    'Website',
    'Book',
    'Article',
    'Journal',
    'Newspaper',
    'Report',
    'Thesis',
    'Paper',
]);
const searchDialog = ref(false);
const searchQuery = ref('');
const searchResults = ref([]);
const form = reactive({});

const isDialogOpen = computed(() => isOpen.value);
const isExistingSource = computed(() => !!form.source?.id);

// Sync props → local state
watch(
    () => props.isOpen,
    (val) => {
        if (typeof val === 'boolean') isOpen.value = val;
    },
);
watch(isOpen, (val) => emits('update:isOpen', val));
watch(
    () => props.modelValue,
    (val) => {
        const clone = JSON.parse(JSON.stringify(val || {}));
        citation.value = clone;
        Object.assign(form, clone);
    },
    { immediate: true, deep: true },
);

/**
 * Open the source-search dialog, clearing previous query and results.
 */
function openSearch() {
    searchQuery.value = '';
    searchResults.value = [];
    searchDialog.value = true;
}

/**
 * Perform a mock search based on `searchQuery`, populating `searchResults`.
 */
function performSearch() {
    if (!searchQuery.value) {
        searchResults.value = [];
        return;
    }
    searchResults.value = [
        {
            source: {
                type: 'Article',
                title: `Title 1 for '${searchQuery.value}'`,
                authors: 'Author A',
                year: 2021,
                publisher: 'Pub X',
                url: 'https://x',
            },
            page: '',
            url: '',
            quote: '',
            note: '',
        },
        {
            source: {
                type: 'Book',
                title: `Title 2 for '${searchQuery.value}'`,
                authors: 'Author B',
                year: 2022,
                publisher: 'Pub Y',
                url: 'https://y',
            },
            page: '',
            url: '',
            quote: '',
            note: '',
        },
    ];
}

/**
 * Select a search result to populate the form and close the search dialog.
 * @param {object} item - The selected citation item.
 */
function selectResult(item) {
    Object.assign(form, item);
    searchDialog.value = false;
}

/**
 * Save the current form as the citation, emit updates, and close dialog.
 */
function save() {
    const updated = JSON.parse(JSON.stringify(form));
    citation.value = updated;
    isOpen.value = false;
    emits('update:modelValue', updated);
    emits('save');
}

/**
 * Cancel editing: reset form to original citation and close dialog.
 */
function cancel() {
    Object.assign(form, citation.value || {});
    isOpen.value = false;
    emits('cancel');
}

/**
 * Delete the citation, emit delete event, and close dialog.
 */
function deleteCitation() {
    emits('delete', JSON.parse(JSON.stringify(citation.value)));
    isOpen.value = false;
}
</script>

<style scoped>
.citation-header {
    font-weight: 600;
    margin-bottom: 0.5rem;
}

.search-results {
    min-height: 100px;
}
</style>
