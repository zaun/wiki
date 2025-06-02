<template>
    <div class="section mb-4">
        <!-- view mode -->
        <div v-if="!editable">
            <div :class="headerClass">
                <span>{{ localSection.title }}</span>
                <CitationView v-for="cit in citations" :key="cit.id" :citation="cit" view="CHIP"
                    v-on="canEdit ? { edit: () => editCitation(cit.id) } : {}" />
                <v-chip v-if="canEdit" class="text-caption ml-1" size="small" density="compact" @click="editCitation()">
                    <v-icon left>mdi-plus</v-icon>
                </v-chip>
                <v-spacer />
                <slot v-if="!canEdit" name="appendTitle"></slot>
                <v-btn v-if="canEdit" icon variant="plain" @click="onEdit">
                    <v-icon>mdi-pencil-outline</v-icon>
                </v-btn>
            </div>

            <div v-if="localSection.subtitle" class="text-subtitle-2">{{ localSection.subtitle }}</div>

            <div v-if="contentType === 'text'">
                <v-img :src="localSection.image" style="width: 25%; float: right;" />
                <SimpleMarkdown :class="contentClass" :content="localSection.content" />
            </div>

            <div v-else-if="contentType === 'gallery'">
                <Gallery :class="contentClass" :content="localSection.data" />
            </div>

            <div v-else-if="contentType === 'music-score'">
                <MusicScore :class="contentClass" :content="localSection.data" />
            </div>

            <div v-else-if="contentType === 'data-table'">
                <v-img :src="localSection.image" style="width: 25%; float: data;" />
                <DataTable :class="contentClass" :value="localSection.data" />
            </div>
            <div v-else v-html="localSection.content"></div>

            <div style="clear: both;"></div>
            <v-divider class="mt-4" />
        </div>

        <!-- edit mode -->
        <div v-else>
            <div :class="headerClass">
                <v-text-field v-model="localSection.title" label="Header" :hide-details="true" class="flex-grow-1" />
                <v-select v-if="!hideType" v-model="localSection.type" :items="contentTypes" label="Type"
                    item-title="label" item-value="value" hide-details dense class="mr-2" style="max-width: 140px;" />
                <v-btn icon density="compact" variant="plain" @click="onSave" :disabled="isSaveDisabled">
                    <v-icon>mdi-check</v-icon>
                </v-btn>
                <v-btn icon density="compact" variant="plain" @click="onClose" :disabled="isCancelDisabled">
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <v-btn v-if="!hideDelete" icon density="compact" variant="plain" @click="onDelete">
                    <v-icon>mdi-trash-can-outline</v-icon>
                </v-btn>
            </div>

            <div v-if="contentType === 'text'">
                <v-textarea v-model="localSection.content" label="Section Content" rows="3" auto-grow>
                    <template #details>
                        {{ countChars(localSection.content) }} characters │
                        {{ countWords(localSection.content) }} words │
                        {{ countParagraphs(localSection.content) }} paragraphs
                    </template>
                </v-textarea>
            </div>

            <div v-else-if="contentType === 'gallery'">
                <GalleryEdit :class="contentClass" :content="localSection.data" />
            </div>

            <div v-else-if="contentType === 'music-score'">
                <MusicScoreEdit :class="contentClass" v-model="localSection.data" />
            </div>

            <div v-else-if="contentType === 'data-table'">
                <v-textarea v-model="localSection.content" label="Section Introduction" rows="3" auto-grow>
                    <template #details>
                        {{ countChars(localSection.content) }} characters │
                        {{ countWords(localSection.content) }} words │
                        {{ countParagraphs(localSection.content) }} paragraphs
                    </template>
                </v-textarea>
                <DataTableEdit v-model="localSection.data" />
                <v-textarea class="mt-4" v-model="localSection.summary" label="Section Sumary" rows="3" auto-grow>
                    <template #details>
                        {{ countChars(localSection.summary) }} characters │
                        {{ countWords(localSection.summary) }} words │
                        {{ countParagraphs(localSection.summary) }} paragraphs
                    </template>
                </v-textarea>
            </div>

            <div style="clear: both;"></div>
            <v-divider class="mt-4" />
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

import CitationView from '@/components/citations/CitationView.vue';
import DataTable from '@/components/sections/DataTable.vue';
import DataTableEdit from '@/components/sections/DataTableEdit.vue';
import Gallery from '@/components/sections/Gallery.vue';
import GalleryEdit from '@/components/sections/GalleryEdit.vue';
import MusicScore from '@/components/sections/MusicScore.vue';
import MusicScoreEdit from '@/components/sections/MusicScoreEdit.vue';
import SimpleMarkdown from '@/components/sections/SimpleMarkdown.vue';
import { useData } from '@/stores/data';

const store = useData();

const props = defineProps({
    modelValue: {
        type: Object,
        required: true,
    },
    canEdit: {
        type: Boolean,
        default: false,
    },
    hideDelete: {
        type: Boolean,
        default: false,
    },
    hideType: {
        type: Boolean,
        default: false,
    },
    headerSize: {
        type: Number,
        default: 5,
        validator: (v) => v >= 1 && v <= 6,
    },
    contentSize: {
        type: Number,
        default: 1,
        validator: (v) => v >= 1 && v <= 2,
    },
    // external v-model:isEditing
    isEditing: {
        type: Boolean,
        default: undefined,
    },
});

const emits = defineEmits([
    'update:modelValue',
    'save',
    'delete',
    'editCitation',
    'update:isEditing',
]);

// fallback internal edit state if parent doesn't bind
const internalEditing = ref(props.isEditing === true);
const localSection = ref({ ...props.modelValue });

const citations = computed(() => {
    let sec = store.currentCitations.find((c) => c.type === 'section' && c.id === localSection.value.id);
    if (!sec)
        sec = store.currentCitations.find((c) => c.type === 'node' && c.id === localSection.value.id) || {};
    return sec?.citations || [];
});
const contentClass = computed(() => `text-body-${props.contentSize}`);
const contentType = computed(() => localSection.value.type ?? 'text');
const editable = computed(() => internalEditing.value);
const headerClass = computed(() => `text-h${props.headerSize} d-flex justify-space-between align-center`);
const isCancelDisabled = computed(() => !localSection.value.id || localSection.value.id.trim() === '');
const isDirty = computed(() =>
    JSON.stringify(localSection.value) !== JSON.stringify(props.modelValue),
);
const isSaveDisabled = computed(() => !localSection.value.title || localSection.value.title.trim() === '');

watch(
    () => props.isEditing,
    (v) => {
        if (typeof v === 'boolean') {
            internalEditing.value = v;
        }
    },
);
watch(internalEditing, (v) => {
    emits('update:isEditing', v);
});
watch(
    () => props.modelValue,
    (v) => {
        localSection.value = { ...v };
    },
);
watch(
    () => localSection.value.type,
    (newType) => {
        // If we’ve switched back to the original type, restore
        // its original data (deep‐cloned to avoid mutating the prop).
        if (newType === props.modelValue.type) {
            localSection.value.data = cloneDeep(props.modelValue.data);
        }
        // If we’ve just switched _to_ a data-table, initialize from scratch.
        else if (newType === 'data-table') {
            localSection.value.data = {
                headers: [],
                rows: [],
            };
        }
        // Otherwise (e.g. switching away from data-table) you
        // could delete the key entirely or set it to null.
        else {
            delete localSection.value.data;
        }
    },
);

const contentTypes = [
    { label: 'Atom', value: 'atom' },
    { label: 'Text', value: 'text' },
    { label: 'Gallery', value: 'gallery' },
    { label: 'Data Table', value: 'data-table' },
    { label: 'Music Score', value: 'music-score' },
];

/**
 * Count characters in a string.
 * @param {string} t - Input text.
 * @returns {number} Number of words.
 */
function countChars(t) {
    return t?.trim().length;
}

/**
 * Count words in a string.
 * @param {string} t - Input text.
 * @returns {number} Number of words.
 */
function countWords(t) {
    return t?.trim().split(/\s+/).filter((w) => w).length;
}

/**
 * Count paragraphs in a string.
 * @param {string} t - Input text.
 * @returns {number} Number of paragraphs.
 */
function countParagraphs(t) {
    return t?.split(/\n+/).filter((p) => p.trim()).length;
}

/**
 * Emit an editCitation event.
 * @param {string} [id] - ID of the citation to edit; omit to add new.
 */
function editCitation(id) {
    emits('editCitation', id); // Propagate to parent
}

/**
 * Enter edit mode.
 * @emits update:isEditing
 */
function onEdit() {
    internalEditing.value = true;
    emits('update:isEditing', true); // Propagate to parent
}

/**
 * Save changes and exit edit mode.
 * @emits update:modelValue, save, update:isEditing
 */
function onSave() {
    localSection.value.title = localSection.value.title.trim();
    if (isDirty.value) {
        emits('update:modelValue', localSection.value);
        emits('save', localSection.value);
    }
    internalEditing.value = false;
    emits('update:isEditing', false); // Propagate to parent
}

/**
 * Discard changes and exit edit mode.
 * @emits update:isEditing
 */
function onClose() {
    localSection.value = { ...props.modelValue };
    internalEditing.value = false;
    emits('update:isEditing', false); // Propagate to parent
}

/**
 * Delete the section and exit edit mode.
 * @emits delete, update:isEditing
 */
function onDelete() {
    emits('delete', localSection.value);
    internalEditing.value = false;
    emits('update:isEditing', false); // Propagate to parent
}
</script>

<style scoped>
.section {
    cursor: default;
    margin-bottom: 1rem;
}
</style>
