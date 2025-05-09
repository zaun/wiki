<!--
@file InfoField.vue
@description Vue component for displaying and editing a single labeled info field, supporting multiple types: header, text, number, date, currency, link, list, and image.
-->
<template>
    <div class="info-field">
        <!-- VIEW MODE -->
        <div v-if="!editable" :class="['info-value', { header: localValue.type === 'header' }]">
            <div class="info-label">
                <span v-if="canEdit || localValue.label !== '--'">{{ localValue.label }}</span>
                <div v-if="canEdit" style="min-width: 60px; max-width: 60px;">
                    <v-btn icon density="compact" variant="plain" @click="onEdit">
                        <v-icon>mdi-pencil-outline</v-icon>
                    </v-btn>
                    <v-icon class="drag-handle" small style="cursor:move; margin-right:8px;">
                        mdi-drag
                    </v-icon>
                </div>
            </div>

            <span v-if="localValue.type === 'currency'">
                {{ formatCurrency(localValue.value) }}
            </span>
            <span v-if="localValue.type === 'date'">
                {{ formatDate(localValue.value) }}
            </span>
            <a v-if="localValue.type === 'link'" :href="localValue.value.url" target="_blank">
                <span>{{ localValue.value.text }}</span>
                <v-icon>mdi-open-in-new</v-icon>
            </a>
            <ul v-if="localValue.type === 'list'">
                <li v-for="(item, i) in localValue.value" :key="i">{{ item }}</li>
            </ul>
            <span v-if="localValue.type === 'number'">
                {{ formatNumber(localValue.value) }}
            </span>
            <span v-if="localValue.type === 'text'">
                {{ localValue.value }}
            </span>
            <span v-if="localValue.type === 'image'">
                <Image :aspect-ratio="localValue.value.aspectRatio" :src="imageUrl" />
            </span>
        </div>

        <!-- EDIT MODE -->
        <div v-else class="info-edit" key="edit">
            <!-- Label + Type selector -->
            <v-text-field density="compact" v-model="editLabel" label="Label" :hide-details="true">
                <template #prepend-inner>
                    <v-menu v-model="typeMenu" open-on-click offset-y :close-on-content-click="true"
                        location="bottom left" origin="top left">
                        <template #activator="{ props }">
                            <span v-bind="props" @mousedown.stop
                                style="cursor:pointer; display:flex; align-items:center;">
                                <v-icon size="20">{{ currentTypeIcon }}</v-icon>
                            </span>
                        </template>
                        <v-list>
                            <v-list-item v-for="opt in typeOptions" :key="opt.value"
                                @click="() => { onTypeChange(opt.value); typeMenu = false }">
                                <v-list-item-title>{{ opt.title }}</v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </v-menu>
                </template>
                <template #append-inner>
                    <v-btn icon density="compact" variant="plain" @click="onSave">
                        <v-icon>mdi-check</v-icon>
                    </v-btn>
                    <v-btn icon density="compact" variant="plain" @click="onClose">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-btn v-if="!hideDelete" icon density="compact" variant="plain" @click="onDelete">
                        <v-icon>mdi-trash-can-outline</v-icon>
                    </v-btn>
                </template>
            </v-text-field>

            <!-- CURRENCY -->
            <div v-if="editType === 'currency'" class="currency-edit">
                <v-text-field density="compact" type="number" v-model.number="editValue.amount" label="Amount"
                    :hide-details="true">
                    <template #append-inner>
                        <v-menu v-model="currencyMenu" open-on-click offset-y :close-on-content-click="true"
                            max-height="190" location="bottom left" origin="top left">
                            <template #activator="{ props }">
                                <div v-bind="props" @mousedown.stop>
                                    <label class="v-label v-field-label v-field-label--floating">{{
                                        editValue.currency }}</label>
                                    <span class="v-field__input"
                                        style="cursor:pointer; display:flex; align-items:center;">
                                        <v-icon size="20">{{ currentCurrencyIcon }}</v-icon>
                                    </span>
                                </div>
                            </template>
                            <v-list>
                                <v-list-item v-for="opt in currencyOptions" :key="opt.value" density="compact"
                                    @click="() => { editValue.currency = opt.value; currencyMenu = false }">
                                    <v-list-item-title>{{ opt.title }}</v-list-item-title>
                                </v-list-item>
                            </v-list>
                        </v-menu>
                    </template>
                </v-text-field>
                <v-text-field density="compact" v-model.number="editValue.year" label="In Year" type="number" />
            </div>

            <!-- DATE -->
            <v-menu v-if="editType === 'date'" v-model="dateMenu" open-on-click :close-on-content-click="false" offset-y
                transition="scale-transition">
                <template #activator="{ props }">
                    <v-text-field v-bind="props" v-model="editValue" label="Value" readonly density="compact" />
                </template>
                <v-date-picker v-model="dateRef" locale="en-us" show-current color="primary" hide-header hide-actions
                    :show-week="true" />
            </v-menu>

            <!-- LINK -->
            <div v-if="editType === 'link'" class="link-edit">
                <v-text-field density="compact" v-model="editValue.url" label="URL" :hide-details="true">
                    <template #append-inner>
                        <v-tooltip text="Fetch Title" location="top">
                            <template #activator="{ props }">
                                <v-icon v-bind="props" :disabled="editDisableLinkText" @click.stop="onFetchTitle"
                                    style="cursor: pointer;">
                                    mdi-download-circle-outline
                                </v-icon>
                            </template>
                        </v-tooltip>
                    </template>
                </v-text-field>
                <v-text-field density="compact" v-model="editValue.text" label="Link Text"
                    :disabled="editDisableLinkText" />
            </div>

            <!-- LIST -->
            <div v-if="editType === 'list'" class="list-edit">
                <div v-for="(item, i) in editValue" :key="i" class="list-item">
                    <v-text-field density="compact" v-model="editValue[i]" :hide-details="true" />
                    <button type="button" @click="removeItem(i)">✕</button>
                </div>
                <button type="button" class="btn-add" @click="addItem">+ Add Item</button>
            </div>

            <!-- NUMBER -->
            <v-text-field v-if="editType === 'number'" density="compact" type="number" v-model.number="editValue"
                label="Value" />

            <!-- TEXT -->
            <v-text-field v-if="editType === 'text'" density="compact" v-model="editValue" label="Value" />

            <!-- IMAGE -->
            <div v-if="editType === 'image'" class="link-edit">
                <v-select density="compact" v-model="editValue.aspectRatio" label="Aspect Ratio" :items="imageOptions"
                    :hide-details="true" />
                <Image :aspect-ratio="editValue.aspectRatio" @delete="onDeleteImage" @clicked="onSetImage"
                    :src="imageUrl" :can-edit="true" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';

import Image from '@/components/Image.vue';
import { useApi } from '@/stores/api';
import { useConfig } from '@/stores/config';

const api = useApi();
const config = useConfig();

/**
 * Component props
 * @property {Object} modelValue - The field data object containing id, label, type, and value.
 * @property {boolean} canEdit - Whether the field is editable.
 * @property {boolean} hideDelete - If true, hide the delete button in edit mode.
 * @property {boolean|undefined} isEditing - External control for edit mode state.
 */
const props = defineProps({
    modelValue: { type: Object, required: true },
    canEdit: { type: Boolean, default: false },
    hideDelete: { type: Boolean, default: false },
    isEditing: { type: Boolean, default: undefined },
});

/**
 * Events emitted by the component
 * @emits update:modelValue - Emitted when the field value is saved.
 * @emits save - Emitted after saving edits with the updated field object.
 * @emits delete - Emitted when the field is deleted.
 * @emits update:isEditing - Emitted to sync edit mode state externally.
 */
const emits = defineEmits([
    'update:modelValue',
    'save',
    'delete',
    'update:isEditing',
]);

// Reactive state
const currencyMenu = ref(false);
const dateMenu = ref(false);
const editDisableLinkText = ref(false);
const editLabel = ref('');
const editType = ref('');
const editValue = ref(null);
const internalEditing = ref(props.isEditing === true);
const localValue = ref({ ...props.modelValue });
const typeMenu = ref(false);

/**
 * Computed icon for the currently selected currency
 * @returns {string} mdi icon name
 */
const currentCurrencyIcon = computed(() => {
    const opt = currencyOptions.find(o => o.value === editValue.value.currency);
    return opt?.icon || 'mdi-magnify';
});

/**
 * Computed icon for the currently selected field type
 * @returns {string} mdi icon name
 */
const currentTypeIcon = computed(() => {
    const opt = typeOptions.find(o => o.value === editType.value);
    return opt?.icon || 'mdi-magnify';
});

/**
 * Reactive date reference for date picker
 * synchronizes ISO date string and Date object
 */
const dateRef = computed({
    get() {
        return editValue.value
            ? new Date(editValue.value)
            : new Date();
    },
    set(val) {
        editValue.value = val.toISOString().slice(0, 10);
        dateMenu.value = false;
    },
});

/**
 * Edit mode flag
 * @returns {boolean}
 */
const editable = computed(() => internalEditing.value);

/**
 * Computed image URL including optional crop parameters
 * @returns {string}
 */
const imageUrl = computed(() => {
    const srcObj = editable.value ? editValue.value : localValue.value.value;
    let url = '';
    if (srcObj.image) {
        url = api.getImageUrl(srcObj.image);
        if (srcObj.imageCrop) {
            const { x, y, width, height } = srcObj.imageCrop;
            url += `?crop=${x},${y},${width},${height}`;
        }
    }
    return url;
});

// Sync external editing prop
watch(() => props.isEditing, v => {
    if (typeof v === 'boolean') internalEditing.value = v;
});
// Emit editing sync
watch(internalEditing, v => emits('update:isEditing', v));
// Update localValue when modelValue changes
watch(() => props.modelValue, v => {
    localValue.value = { ...v };
});
// Initialize edit fields when entering edit mode
watch(editable, on => {
    if (!on) return;
    editLabel.value = props.modelValue.label;
    editType.value = props.modelValue.type;
    editValue.value = props.modelValue.type !== 'header'
        ? JSON.parse(JSON.stringify(props.modelValue.value))
        : undefined;
}, { immediate: true });

/**
 * Format an ISO date string into localized full date
 * @param {string} iso - ISO date string (YYYY-MM-DD)
 * @returns {string}
 */
function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(config.userLocale, { dateStyle: 'full' });
}

/**
 * Format a number into localized string
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
    try {
        return new Intl.NumberFormat(config.userLocale).format(value);
    } catch {
        return `${value}`;
    }
}

/**
 * Format currency amount with currency code and year
 * @param {{ amount: number, year: number, currency: string }} data
 * @returns {string}
 */
function formatCurrency({ amount, year, currency }) {
    try {
        const formatted = new Intl.NumberFormat(config.userLocale, {
            style: 'currency',
            currency,
        }).format(amount);
        return `${formatted} (in ${year})`;
    } catch {
        return `${amount} (in ${year})`;
    }
}

const typeOptions = [
    { title: 'Currency', value: 'currency', icon: 'mdi-cash' },
    { title: 'Date', value: 'date', icon: 'mdi-calendar-outline' },
    { title: 'Header', value: 'header', icon: 'mdi-format-header-pound' },
    { title: 'Link', value: 'link', icon: 'mdi-link' },
    { title: 'List', value: 'list', icon: 'mdi-format-list-bulleted' },
    { title: 'Number', value: 'number', icon: 'mdi-numeric' },
    { title: 'Text', value: 'text', icon: 'mdi-format-text' },
    { title: 'Image', value: 'image', icon: 'mdi-image-outline' },
];
const currencyOptions = [
    { title: 'Australian Dollar', value: 'AUD', icon: 'mdi-currency-usd' },
    /* ... other currency options ... */
    { title: 'United States Dollar', value: 'USD', icon: 'mdi-currency-usd' },
    { title: 'Other', value: 'UNK', icon: 'mdi-help-circle-outline' },
];
const imageOptions = ['1:1', '16:9', '9:16'];

/**
 * Handle change of field type and initialize corresponding editValue
 * @param {string} t - New type value
 */
function onTypeChange(t) {
    editType.value = t;
    switch (t) {
        case 'currency':
            editValue.value = { amount: 0, year: new Date().getFullYear(), currency: 'USD' };
            break;
        case 'date':
            editValue.value = new Date().toISOString().slice(0, 10);
            break;
        case 'header':
            editValue.value = undefined;
            break;
        case 'link':
            editValue.value = { text: '', url: '' };
            break;
        case 'list':
            editValue.value = [];
            break;
        case 'number':
            editValue.value = 0;
            break;
        case 'text':
            editValue.value = '';
            break;
        case 'image':
            editValue.value = { aspectRatio: '1:1', image: '', imageCrop: undefined };
            break;
    }
}

/**
 * Mark image for deletion in editValue
 */
function onDeleteImage() {
    if (editValue.value.image) {
        editValue.value.image = 'remove';
    }
}

/**
 * Set image id and crop data when selected from Image component
 * @param {{ id: string, crop: object }} imageData
 */
function onSetImage(imageData) {
    if (
        !editValue.value.image ||
        editValue.value.image !== imageData.id ||
        JSON.stringify(editValue.value.imageCrop) !== JSON.stringify(imageData.crop)
    ) {
        editValue.value.image = imageData.id;
        editValue.value.imageCrop = imageData.crop;
    }
}

/**
 * Fetch page title for the given URL and populate link text
 */
async function onFetchTitle() {
    if (!editValue.value.url) return;
    editDisableLinkText.value = true;
    editValue.value.text = 'Loading…';
    try {
        const res = await api.fetchTitle({ url: editValue.value.url });
        editValue.value.text = res.data.title.trim();
    } catch {
        editValue.value.text = 'Error';
    } finally {
        editDisableLinkText.value = false;
    }
}

/**
 * Deep equality check for values
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
const deepEqual = (a, b) => {
    if (a === b) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
        return false;
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
            return false;
        }
    }
    return true;
};

/**
 * Add an empty item to the list editValue
 */
function addItem() {
    editValue.value.push('');
}

/**
 * Remove list item at index i
 * @param {number} i
 */
function removeItem(i) {
    editValue.value.splice(i, 1);
}

/**
 * Enter edit mode
 */
function onEdit() {
    internalEditing.value = true;
}

/**
 * Save edits, emit update and save events if changed
 */
function onSave() {
    internalEditing.value = false;
    nextTick(() => {
        const updated = {
            id: props.modelValue.id,
            label: editLabel.value,
            type: editType.value,
            value: editValue.value,
        };
        if (!deepEqual(props.modelValue, updated)) {
            emits('update:modelValue', updated);
            emits('save', updated);
        }
    });
}

/**
 * Cancel edits and exit edit mode without saving
 */
function onClose() {
    internalEditing.value = false;
}

/**
 * Delete the field and emit delete event
 */
function onDelete() {
    internalEditing.value = false;
    nextTick(() => {
        emits('delete', localValue.value);
    });
}
</script>

<style scoped>
.info-field {
    margin: .25rem 0;
    font-size: .9rem;
    width: 100%
}

.info-field .header {
    background-color: lavender;
    padding: 0.10rem 0;
}

.info-field .header span {
    width: 100%;
    text-align: center;
}

.info-label {
    font-weight: 600;
    display: flex;
    justify-content: space-between;
}

.info-value {
    word-break: break-word;
}

.info-value>a>span {
    margin-right: 0.25rem
}

.list-item {
    display: flex;
    align-items: center;
    gap: .3rem;
}

.btn-add {
    font-size: .8rem;
    padding: .25rem .6rem;
}
</style>
