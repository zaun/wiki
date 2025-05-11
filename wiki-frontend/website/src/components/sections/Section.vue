<template>
    <div class="section mb-4">
        <!-- view mode -->
        <div v-if="!editable">
            <div :class="headerClass">
                <span>{{ localSection.title }}</span>
                <CitationView v-for="cit in citations" :key="cit.id" :citation="cit" view="CHIP" v-on="canEdit ? { edit: () => editCitation(cit.id) } : {}"/>
                <v-chip v-if="canEdit" class="text-caption ml-1" size="small" density="compact" @click="editCitation()">
                    <v-icon left>mdi-plus</v-icon>
                </v-chip>
                <v-spacer />
                <v-btn v-if="canEdit" icon variant="plain" @click="onEdit">
                    <v-icon>mdi-pencil-outline</v-icon>
                </v-btn>
            </div>

            <div v-if="contentType === 'text'">
                <v-img :src="localSection.image" style="width: 25%; float: right;" />
                <SimpleMarkdown :class="contentClass" :content="localSection.content" />
            </div>
            <div v-else v-html="localSection.content"></div>

            <div style="clear: both;"></div>
            <v-divider class="mt-4" />
        </div>

        <!-- edit mode -->
        <div v-else>
            <div :class="headerClass">
                <v-text-field label="Header" :hide-details="true" v-model="localSection.title" class="flex-grow-1">
                    <template #append-inner>
                        <v-btn icon variant="plain" @click="onSave">
                            <v-icon>mdi-check</v-icon>
                        </v-btn>
                        <v-btn icon variant="plain" @click="onClose">
                            <v-icon>mdi-close</v-icon>
                        </v-btn>
                        <v-btn v-if="!hideDelete" icon variant="plain" @click="onDelete">
                            <v-icon>mdi-trash-can-outline</v-icon>
                        </v-btn>
                    </template>
                </v-text-field>
            </div>

            <v-textarea v-model="localSection.content" label="Section Content" rows="3" auto-grow>
                <template #details>
                    {{ countChars(localSection.content) }} characters │
                    {{ countWords(localSection.content) }} words │
                    {{ countParagraphs(localSection.content) }} paragraphs
                </template>
            </v-textarea>

            <div style="clear: both;"></div>
            <v-divider class="mt-4" />
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

import CitationView from '@/components/citations/CitationView.vue';
import SimpleMarkdown from '@/components/SimpleMarkdown.vue';
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
const isDirty = computed(() =>
    JSON.stringify(localSection.value) !== JSON.stringify(props.modelValue),
);

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
        console.log(111, v.type);
        localSection.value = { ...v };
    },
);

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
