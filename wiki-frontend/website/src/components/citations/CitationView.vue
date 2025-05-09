<!--
@file CitationView.vue
@description Provides a full card or a small chip view of a citation, with optional edit action.
-->

<template>
    <v-card v-if="view === 'CARD'" density="compact" class="citation-card" elevation="1">
        <v-card-title class="d-flex align-center pa-2">
            <v-chip v-if="citation.label" density="compact" class="me-1 d-flex align-center justify-center label-chip">
                {{ citation.label }}
            </v-chip>
            <v-chip density="compact" class="me-2 d-flex align-center justify-center type-chip">
                {{ citation.source.type || 'unknown' }}
            </v-chip>
            <span class="citation-title">
                <span v-if="citation.source.title">{{ citation.source.title }}</span>
                <br v-if="citation.source.title && citation.source.publisher" />
                <span v-if="citation.source.publisher">{{ citation.source.publisher }}</span>
            </span>
            <v-spacer v-if="hasEditListener" />
            <v-btn v-if="hasEditListener" icon density="compact" variant="plain" @click="onEdit">
                <v-icon>mdi-pencil-outline</v-icon>
            </v-btn>
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-2 citation-content">
            <div v-if="citation.title" class="row mb-1">
                <label>Title:</label>
                <span>{{ citation.title }}</span>
            </div>
            <div v-if="citation.page" class="row mb-1">
                <label>Page:</label>
                <span>{{ citation.page }}</span>
            </div>
            <div v-if="citation.url" class="row mb-1">
                <label>Link:</label>
                <a :href="citation.url" target="_blank" rel="noopener" class="link-text"
                    :aria-label="`Read full citation: ${citation.source?.title || 'Unknown'}`">
                    {{ citation.url }}
                </a>
            </div>
            <div v-if="citation.quote" class="mt-2 row">
                <em>“{{ citation.quote }}”</em>
            </div>
        </v-card-text>
    </v-card>

    <v-tooltip v-if="view === 'CHIP'" location="top">
        <template #activator="{ props }">
            <v-chip v-bind="props" class="text-caption ml-1" size="small" density="compact"
                v-on="hasEditListener ? { click: () => onEdit() } : {}">
                {{ citation.label }}
            </v-chip>
        </template>
        <div class="px-2 py-1" style="width: 300px">
            <div class="font-medium text-center text-subtitle-2">
                {{ citation.source.title }}
            </div>
            <div class="font-medium text-center text-subtitle-2">
                {{ citation.title }}
            </div>
            <div class="text-sm italic text-caption">"{{ citation.quote }}"</div>
        </div>
    </v-tooltip>
</template>

<script setup>
import { getCurrentInstance, computed } from 'vue';

const instance = getCurrentInstance();

/**
 * Props accepted by the CitationView component
 * @typedef {Object} CitationViewProps
 * @property {Object} citation - The citation data to display.
 * @property {string} citation.id - Unique identifier for the citation.
 * @property {string} citation.label - Short label for the citation (e.g., “A1”).
 * @property {Object} citation.source - Source metadata.
 * @property {string} citation.source.type - Source type (e.g., “book”, “article”).
 * @property {string} [citation.source.title] - Optional source title.
 * @property {string} [citation.source.publisher] - Optional source publisher.
 * @property {string} [citation.title] - Optional title of the citation entry.
 * @property {string|number} [citation.page] - Optional page number.
 * @property {string} [citation.url] - Optional URL link to the source.
 * @property {string} [citation.quote] - Optional quote excerpt.
 * @property {string} [view='CARD'] - Display mode: `"CARD"` or `"CHIP"`.
 */

/**
 * @type {import('vue').ExtractPropTypes<{
 *   citation: {
 *     type: ObjectConstructor;
 *     required: true;
 *     validator(c: any): boolean;
 *   };
 *   view: {
 *     type: StringConstructor;
 *     default: 'CARD';
 *     validator(v: string): boolean;
 *   };
 * }>}
 */
const props = defineProps({
    citation: {
        type: Object,
        required: true,
        validator: (c) =>
            c &&
            typeof c.id === 'string' &&
            typeof c.label === 'string' &&
            c.source &&
            typeof c.source.type === 'string',
    },
    view: {
        type: String,
        default: 'CARD',
        validator: (v) => ['CARD', 'CHIP'].includes(v),
    },
});

/**
 * Emits supported by this component
 * @typedef {Object} CitationViewEmits
 * @property {(id: string|null) => void} edit - Emitted when the edit button or chip is clicked.
 */
const emits = defineEmits(['edit']);

/**
 * Whether an `edit` listener is attached.
 * @type {import('vue').ComputedRef<boolean>}
 */
const hasEditListener = computed(() => {
    const vnodeProps = instance?.vnode.props || {};
    return !!(vnodeProps.onEdit || vnodeProps['onEditOnce']);
});

/**
 * Trigger the `edit` event with the citation ID.
 * @returns {void}
 */
const onEdit = () => {
    emits('edit', props.citation?.id || null);
};
</script>

<style scoped>
.citation-card .label-chip,
.citation-card .type-chip {
    height: 20px;
    padding: 0 2px;
    border-radius: 12px;
    font-size: 0.65rem;
    line-height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #e0e0e0;
}

.citation-card .label-chip {
    max-width: 40px;
    min-width: 40px;
}

.citation-card .type-chip {
    max-width: 70px;
    min-width: 70px;
}

.citation-card .v-card-title {
    display: flex;
    line-clamp: 2;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.25rem;
    height: 45px;
}

.citation-card .citation-title {
    flex: 1 1 auto;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    white-space: normal;
    word-break: break-word;
    font-size: 0.75rem;
    line-height: 1.3;
    font-weight: 600;
}

.citation-card .citation-content {
    font-size: 0.75rem;
    line-height: 1.2;
}

.citation-card .citation-content .row>label {
    display: inline-block;
    width: 40px;
    font-weight: 600;
}
</style>
