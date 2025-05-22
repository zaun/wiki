<!--
@file DataTable.vue
@description Render a table of data
-->

<template>
    <v-data-table-virtual ref="dataTable" density="compact"  class="data-table" max-height="400" :headers="headers" :items="items" fixed-header>
        <template #item="{ item, index }">
            <tr>
                <td v-for="(col, colIndex) in headers" :key="col.headerKey" class="pa-1">
                    <span>{{ item[colIndex] }}</span>
                </td>
                <td v-if="extraWidth > 0" class="px-0"></td>
            </tr>
        </template>
    </v-data-table-virtual>
</template>

<script setup>
import { computed, nextTick, watch, ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
    value: { type: Object, required: true, default: {} },
});

const containerWidth = ref(0);
const dataTable = ref(null);
const extraWidth = ref(0);

const headers = computed(() => props.value.headers || []);
const items = computed(() => props.value.rows || []);
const totalWidth = computed(() => headers.value.reduce((sum, col) => {
    if (col.type === 'placeholder') return sum;

    const w = parseInt(col.width || '0', 10);
    return sum + (isNaN(w) ? 0 : w);
}, 0));

watch(
    [totalWidth, containerWidth],
    async ([tw, cw]) => {
        await nextTick();

        // your existing table-width logic
        const tableEl = dataTable.value.$el.querySelector('table');
        if (tableEl) {
            tableEl.style.width = tw + 'px';
        }

        // compute extra space
        const diff = cw - tw;
        const ew = diff > 0 ? diff : 0;
        extraWidth.value = ew;

        // find any existing placeholder
        const headers = props.value.headers;
        const idx = headers.findIndex(h => h.type === 'placeholder');

        if (ew > 0) {
            const wpx = ew + 'px';
            if (idx === -1) {
                props.value.headers.push({
                    title: '',
                    headerKey: '__placeholder_key__',
                    type: 'placeholder',
                    width: wpx,
                });
            } else {
                props.value.headers[idx].width = wpx;
            }
        } else if (idx !== -1) {
            props.value.headers.splice(idx, 1);
        }
    },
    { immediate: true },
);

function updateContainerWidth() {
    nextTick(() => {
        const tableEl = dataTable.value?.$el;
        if (!tableEl) return;
        const wrapper = tableEl.querySelector('.v-data-table__wrapper') || tableEl;
        containerWidth.value = wrapper.clientWidth;
    });
}

onMounted(() => {
    updateContainerWidth();
    window.addEventListener('resize', updateContainerWidth);
});
onUnmounted(() => {
    window.removeEventListener('resize', updateContainerWidth);
});
</script>

<style scoped>
.data-table {
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-collapse: collapse;
}

.data-table :deep(table) {
    min-width: 100% !important;
    border: 1px solid rgba(0, 0, 0, 0.12);
    overflow: hidden;
}

.data-table :deep(th) {
    position: relative;
    user-select: none;
    border-right: 1px solid rgba(0, 0, 0, 0.12);
}

.data-table :deep(td) {
    position: relative;
    user-select: none;
    border-right: 1px solid rgba(0, 0, 0, 0.12);
}

.data-table :deep(.v-field__input) {
    padding-top: 0px;
}
</style>
