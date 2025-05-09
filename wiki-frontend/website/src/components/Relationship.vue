<!--
@file RelationshipField.vue
@description Inline editable relationship selector between the current item (SELF) and another target, with search/autocomplete.
-->

<template>
    <div class="relationship">
        <!-- VIEW MODE -->
        <div v-if="!editing" class="relationship-view d-flex align-center">
            <Detail :model-value="{ type: 'text', label: formDescriptor, value: displayTitle }" />
            <v-btn v-if="canEdit" icon density="compact" variant="plain" class="ms-auto" @click="startEdit">
                <v-icon>mdi-pencil-outline</v-icon>
            </v-btn>
        </div>

        <!-- EDIT MODE -->
        <div v-else class="relationship-edit">
            <div class="edit-header">
                <span>Edit Relationship</span>
                <div class="actions">
                    <v-btn icon density="compact" variant="plain" @click="save">
                        <v-icon>mdi-check</v-icon>
                    </v-btn>
                    <v-btn icon density="compact" variant="plain" @click="cancel">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-btn icon density="compact" variant="plain" @click="deleteRel">
                        <v-icon>mdi-trash-can-outline</v-icon>
                    </v-btn>
                </div>
            </div>

            <v-form ref="formRef">
                <v-select v-model="selectedOption" :items="relationshipOptions" item-title="title" :item-value="o => o"
                    label="Relationship" density="compact" hide-details class="field" />
                <v-autocomplete v-model="formTarget" :items="searchResults" item-title="title" return-object no-filter
                    label="Target" density="compact" hide-details class="field" v-model:search="searchQuery"
                    @update:search="searchUpdated" :loading="loading">
                    <template #item="{ props, item }">
                        <v-list-item @click="props.onClick" density="compact" style="width: 300px" lines="two">
                            <template #title>
                                <span class="text-body-1 ml-2" v-html="highlight(props.title)"></span>
                            </template>
                            <template #subtitle>
                                <span class="text-subtitle-2 ml-2" v-html="highlight(item.raw.summary, true)"></span>
                            </template>
                            <template #append>
                                <span class="text-caption ml-2">{{ item.raw.qualityScore }}</span>
                            </template>
                        </v-list-item>
                    </template>
                </v-autocomplete>
            </v-form>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';

import Detail from '@/components/Detail.vue';
import { useApi } from '@/stores/api';

const api = useApi();
const SELF_ID = 'SELF';

/**
 * @typedef {Object} RelationshipSide
 * @property {string|null} id    - Unique identifier of the side (SELF or target).
 * @property {string}      title - Display title of the side.
 */

/**
 * @typedef {Object} RelationshipModel
 * @property {string}           relationship - Relationship code (e.g. 'DEPENDS_ON').
 * @property {RelationshipSide} left         - Left-hand side of relationship.
 * @property {RelationshipSide} right        - Right-hand side of relationship.
 */

/**
 * @typedef {Object} RelationshipOption
 * @property {string} value - Relationship code.
 * @property {'forward'|'reverse'} dir - Direction relative to SELF.
 * @property {string} title - Human-readable title.
 */

/**
 * @typedef {Object} SearchResultItem
 * @property {string} id - Unique item ID.
 * @property {string} title - Item title.
 * @property {{ summary: string, qualityScore: number }} raw - Additional metadata for highlighting.
 */

/**
 * Props for the relationship editor
 * @typedef {Object} Props
 * @property {RelationshipModel} modelValue - The current relationship object.
 * @property {boolean}           canEdit    - Whether editing is permitted.
 * @property {boolean}           [isEditing] - Optional external control of edit mode.
 */
const props = defineProps({
    modelValue: { type: Object, required: true },
    canEdit: { type: Boolean, default: false },
    isEditing: { type: Boolean, default: undefined },
});

/**
 * Emits from this component
 * @typedef {Object} Emits
 * @property {(updated: RelationshipModel) => void} update:modelValue - When relationship is changed.
 * @property {() => void} save                                  - When the save button is pressed.
 * @property {() => void} delete                                - When the delete button is pressed.
 * @property {(editing: boolean) => void} update:isEditing      - When edit mode toggles.
 */
const emits = defineEmits(['update:modelValue', 'save', 'delete', 'update:isEditing']);

const formTarget = ref({ id: null, title: '' });
const formTargetId = ref(null);
const internalEditing = ref(false);
const loading = ref(false);
const original = ref({});
const searchQuery = ref('');
const searchResults = ref([]);
const selectedOption = ref(null);

// Derived/computed state
const displayTitle = computed(() => formTarget.value.title);
const editing = computed(() => internalEditing.value);
const formDescriptor = computed(() => selectedOption.value?.title || '');
const model = computed(() => props.modelValue);

watch(
    () => props.isEditing,
    (v) => {
        if (typeof v === 'boolean') internalEditing.value = v;
    },
);
watch(internalEditing, (v) => emits('update:isEditing', v));
watch(() => props.modelValue, initForm, { deep: true });
watch(formTargetId, (id) => {
    const found = searchResults.value.find((item) => item.id === id);
    if (found) formTarget.value = found;
});

/** Static list of available relationship options */
const relationshipOptions = [
    { value: 'DEPENDS_ON', dir: 'forward', title: 'Depends on' },
    { value: 'DEPENDS_ON', dir: 'reverse', title: 'Dependency of' },
    { value: 'CONTRASTS_WITH', dir: 'forward', title: 'Contrasts with' },
    { value: 'CONTAINS', dir: 'forward', title: 'Contains' },
    { value: 'CONTAINS', dir: 'reverse', title: 'Contained in' },
    { value: 'INVALIDATES', dir: 'forward', title: 'Invalidates' },
    { value: 'INVALIDATES', dir: 'reverse', title: 'Invalidated by' },
];

/**
 * Initialize the form state from a RelationshipModel
 * @param {RelationshipModel} val
 */
function initForm(val) {
    original.value = JSON.parse(JSON.stringify(val));
    // Determine direction relative to SELF
    const reverse = val.left?.id !== SELF_ID;
    selectedOption.value = relationshipOptions.find(
        (o) => o.value === val.relationship && o.dir === (reverse ? 'reverse' : 'forward'),
    );
    const target = reverse ? { ...val.left } : { ...val.right };
    formTarget.value = target;
    formTargetId.value = target.id;
}

// --- Search & highlighting logic ---

/**
 * Highlight query tokens in a text snippet, optionally cropping around the first match.
 * @param {string} text
 * @param {boolean} [crop=false]
 * @returns {string} HTML string with <mark> tags around matches.
 */
function highlight(text, crop = false) {
    const startWords = 3;
    const endWords = 10;
    const q = searchQuery.value.trim();
    if (!q) return text;

    // Escape tokens and build regex
    const tokens = q
        .split(/\s+/)
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(${tokens.join('|')})`, 'gi');

    if (crop) {
        // Find the first match
        const match = re.exec(text);
        if (!match) {
            // No match → return full text highlighted
            return text.replace(re, '<mark>$1</mark>');
        }

        // Split text into words, tracking cumulative lengths
        const words = text.split(/\s+/);
        let cumulative = 0;
        let matchWordIndex = -1;

        // Locate which word contains the match
        for (let i = 0; i < words.length; i++) {
            // Add 1 for the space trimmed by split (except first)
            const wordLen = words[i].length + (i > 0 ? 1 : 0);
            if (match.index >= cumulative && match.index < cumulative + wordLen) {
                matchWordIndex = i;
                break;
            }
            cumulative += wordLen;
        }

        // Determine slice bounds
        const start = Math.max(0, matchWordIndex - startWords);
        const end = Math.min(words.length, matchWordIndex + endWords + 1);

        // Reconstruct snippet (with original spacing)
        const prefix = words.slice(start, matchWordIndex).join(' ');
        const matchedWords = words
            .slice(matchWordIndex, matchWordIndex + 1)
            .join(' ');
        const suffix = words.slice(matchWordIndex + 1, end).join(' ');

        let snippet = '';
        if (start > 0) snippet += '… ';
        snippet += prefix ? prefix + ' ' : '';
        snippet += matchedWords;
        if (suffix) snippet += ' ' + suffix;
        if (end < words.length) snippet += ' …';

        // Highlight all tokens in the snippet
        return snippet.replace(re, '<mark>$1</mark>');
    }

    // No cropping: highlight entire text
    return text.replace(re, '<mark>$1</mark>');
}


let timer = null;

/**
 * Debounced handler for autocomplete search input updates.
 * @param {string} query
 */
function searchUpdated(query) {
    searchQuery.value = query;
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(query), 100);
}

/**
 * Perform API search for relationships matching query.
 * @param {string} q
 */
async function doSearch(q) {
    if (!q || q.length < 2) {
        searchResults.value = [];
        return;
    }
    loading.value = true;
    try {
        const res = await api.search(`*${q}*`);
        searchResults.value = res.data.results;
    } catch {
        searchResults.value = [];
    } finally {
        loading.value = false;
    }
}

// --- Edit actions ---

/**
 * Enter edit mode if permitted.
 */
function startEdit() {
    if (props.canEdit) internalEditing.value = true;
}

/**
 * Save the current relationship form, emit `update:modelValue` and `save`.
 */
function save() {
    const opt = selectedOption.value;
    const tgt = formTarget.value;
    /** @type {RelationshipModel} */
    const updated = { relationship: opt.value, left: {}, right: {} };
    if (opt.dir === 'forward') {
        updated.left = { id: SELF_ID, title: model.value.left.title };
        updated.right = { ...tgt };
    } else {
        updated.left = { ...tgt };
        updated.right = { id: SELF_ID, title: model.value.left.title };
    }
    emits('update:modelValue', updated);
    internalEditing.value = false;
    emits('save');
}

/**
 * Cancel edits and restore original values.
 */
function cancel() {
    initForm(original.value);
    internalEditing.value = false;
}

/**
 * Delete the relationship, emit `delete`, and exit edit mode.
 */
function deleteRel() {
    emits('delete', JSON.parse(JSON.stringify(original.value)));
    internalEditing.value = false;
}

onMounted(() => initForm(props.modelValue));
</script>

<style scoped>
.relationship {
    width: 100%;
}

.relationship-view {
    min-height: 2rem;
}

.relationship-edit {
    background: #fafafa;
    padding: 8px;
}

.edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.actions v-btn {
    margin-left: 4px;
}

.field {
    margin-bottom: 8px;
}
</style>
