<template>
    {{ localData.headers.length }}
    <v-data-table-virtual ref="dataTable" density="compact" :headers="localData.headers" :items="items"
        class="mt-2 data-table">
        <!-- custom headers slot -->
        <template #headers>
            <draggable :model-value="localData.headers" tag="tr" item-key="headerKey" direction="horizontal"
                :move="onMove" @end="onDragEnd">
                <template #item="{ element, index }">
                    <th v-if="element.type === 'placeholder'" :key="`placeholder_${element.headerKey}`" class="px-0">
                    </th>
                    <th v-else :key="element.headerKey" class="v-data-table__th v-data-table-column--align-start px-4"
                        :style="{ width: element.width }" @mouseenter="hovered = index" @mouseleave="hovered = null">
                        <div class="v-data-table-header__content">
                            <!-- inline‐edit title -->
                            <template v-if="editing === index">
                                <v-text-field ref="editField" v-model="element.title" density="compact" hide-details
                                    single-line @blur="editing = null" @keyup.enter="editing = null" class="colum-input"
                                    autofocus />
                            </template>
                            <template v-else>
                                <span>{{ element.title }}</span>
                            </template>

                            <v-spacer />

                            <!-- menu -->
                            <v-menu offset-y open-on-click close-on-content-click transition="scale-transition">
                                <template #activator="{ props }">
                                    <v-btn icon density="compact" variant="plain" v-bind="props">
                                        <v-icon>mdi-dots-vertical</v-icon>
                                    </v-btn>
                                </template>
                                <v-list density="compact">
                                    <v-list-item @click="editing = index">
                                        <template v-slot:prepend>
                                            <v-icon>mdi-pencil-outline</v-icon>
                                        </template>
                                        <v-list-item-title>Rename</v-list-item-title>
                                    </v-list-item>
                                    <v-divider />
                                    <v-menu location="end" open-on-hover activator="parent" offset="2"
                                        close-on-content-click>
                                        <template #activator="{ props: subMenuActivatorProps }">
                                            <v-list-item v-bind="subMenuActivatorProps" title="Set Type">
                                                <template #prepend>
                                                    <v-icon>mdi-tune-variant</v-icon>
                                                </template>
                                                <template #append>
                                                    <v-icon>mdi-chevron-right</v-icon>
                                                </template>
                                            </v-list-item>
                                        </template>
                                        <v-list density="compact">
                                            <v-list-item v-for="colType in columnTypes" :key="colType.value"
                                                :title="colType.text" @click="onSetColumnType(index, colType.value)">
                                                <template v-if="element.type === colType.value" #append>
                                                    <v-icon color="primary">mdi-check</v-icon>
                                                </template>
                                            </v-list-item>
                                        </v-list>
                                    </v-menu>
                                    <v-divider />
                                    <v-list-item @click="onAddColumn(index, 'before')">
                                        <template v-slot:prepend>
                                            <v-icon>mdi-table-column-plus-before</v-icon>
                                        </template>
                                        <v-list-item-title>Add Before</v-list-item-title>
                                    </v-list-item>
                                    <v-list-item @click="onAddColumn(index, 'after')">
                                        <template v-slot:prepend>
                                            <v-icon>mdi-table-column-plus-after</v-icon>
                                        </template>
                                        <v-list-item-title>Add After</v-list-item-title>
                                    </v-list-item>
                                </v-list>
                            </v-menu>
                            <!-- resize handle -->
                            <div class="resize-handle" @mousedown.prevent="onResizeStart($event, index)">
                                <v-icon class="not-dragging">mdi-drag-vertical-variant</v-icon>
                                <v-icon class="dragging">mdi-arrow-split-vertical</v-icon>
                            </div>
                        </div>
                    </th>
                </template>
            </draggable>
        </template>

        <template #no-data>
            <div class="my-4">No data available</div>
            <div class="my-4">
                <v-btn @click="onAddNewRow(null, 'append', 5)">Add Data</v-btn>
            </div>
        </template>

        <!-- your rows -->
        <template #item="{ item, index }">
            <tr @contextmenu.prevent="openRowContextMenu($event, item, index)">
                <td v-for="(col, colIndex) in localData.headers" :key="col.headerKey" class="pa-1"
                    :class="{ 'px-0': col.type === 'placeholder' }">
                    <v-text-field v-if="col.type !== 'placeholder'" v-model="item[colIndex]" density="compact"
                        hide-details single-line variant="plain" @update:model-value="onColUpdate" @blur="onColUpdate"
                        class="ma-0" />
                    <span v-else></span>
                </td>
            </tr>
        </template>
    </v-data-table-virtual>

    <!-- Row Context Menu -->
    <v-menu v-model="showRowContextMenu" :style="{
        left: rowContextMenuX + 'px',
        top: rowContextMenuY + 'px',
    }" absolute offset-y close-on-content-click>
        <v-list density="compact">
            <v-list-item @click="onRowAction('add_above')">
                <template v-slot:prepend>
                    <v-icon>mdi-table-row-plus-before</v-icon>
                </template>
                <v-list-item-title>Add Row Above</v-list-item-title>
            </v-list-item>
            <v-list-item @click="onRowAction('add_below')">
                <template v-slot:prepend>
                    <v-icon>mdi-table-row-plus-after</v-icon>
                </template>
                <v-list-item-title>Add Row Below</v-list-item-title>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item @click="onRowAction('delete')">
                <template v-slot:prepend>
                    <v-icon color="error">mdi-table-row-remove</v-icon>
                </template>
                <v-list-item-title class="text-error">Delete Row</v-list-item-title>
            </v-list-item>
        </v-list>
    </v-menu>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import draggable from 'vuedraggable';

const props = defineProps({
    modelValue: {
        type: Object,
        required: true,
        default: () => ({ headers: [], rows: [] }),
    },
});

const emit = defineEmits(['update:modelValue']);

const columnTypes = ref([
    { text: "Text", value: "text" },
    { text: "Number", value: "number" },
    { text: "Date", value: "date" },
    { text: "Currency", value: "currency" },
]);
const containerWidth = ref(0);
const contextRowIndex = ref(null);
const dataTable = ref(null);
const editField = ref(null);
const editing = ref(null);
const extraWidth = ref(0);
const hovered = ref(null);
const localData = ref({ ...props.modelValue });
const resizing = ref({ index: null, startX: 0, startW: 0 });
const rowContextMenuX = ref(0);
const rowContextMenuY = ref(0);
const showRowContextMenu = ref(false);
const totalWidth = ref(0);

const items = computed(() => localData.value.rows || []);

watch([totalWidth, containerWidth], updatePlaceholder, { immediate: true });
watch(
    () => props.modelValue,
    (nv) => {
        const newLocalData = JSON.parse(JSON.stringify(nv)); // Deep copy

        if (!newLocalData.headers || newLocalData.headers.length === 0) {
            newLocalData.headers = [{
                title: 'Column A',
                headerKey: getHeaderKey(),
                type: 'string',
                width: '150px',
            }, {
                title: 'Column B',
                headerKey: getHeaderKey(),
                type: 'string',
                width: '150px',
            }, {
                title: 'Column C',
                headerKey: getHeaderKey(),
                type: 'string',
                width: '150px',
            }];
            if (newLocalData.rows) {
                newLocalData.rows.forEach(row => {
                    if (Array.isArray(row) && row.length === 0) {
                        row.push('');
                    }
                });
            }
        } else {
            newLocalData.headers.forEach(h => {
                if (!h.headerKey) {
                    h.headerKey = (h.type === 'placeholder')
                        ? '__placeholder_key__'
                        : getHeaderKey();
                }
            });
        }
        localData.value = newLocalData;

        updateTotalWidth();
    },
    { deep: true, immediate: true },
);
watch(editing, async idx => {
    if (idx !== null) {
        await nextTick();
        editField.value?.focus?.();
    }
});
watch(localData.value.headers, updateTotalWidth);

function updateTotalWidth() {
    totalWidth.value = localData.value.headers.reduce((sum, col) => {
        if (col.type === 'placeholder') return sum;

        const w = parseInt(col.width || '0', 10);
        return sum + (isNaN(w) ? 0 : w);
    }, 0);
    updatePlaceholder();
}

function updatePlaceholder() {
    const tw = totalWidth.value;
    const cw = containerWidth.value;

    nextTick(() => {
        const tableEl = dataTable.value.$el.querySelector('table');
        if (tableEl) {
            tableEl.style.width = tw + 'px';
        }
    });

    // compute extra space
    const diff = cw - tw;
    const ew = diff > 0 ? diff : 0;
    extraWidth.value = ew;

    // find any existing placeholder
    const hdrs = localData.value.headers;
    const idx = hdrs.findIndex(h => h.type === 'placeholder');

    if (ew > 0) {
        const wpx = ew + 'px';
        if (idx === -1) {
            hdrs.push({
                title: '',
                headerKey: '__placeholder_key__',
                type: 'placeholder',
                width: wpx,
            });
        } else {
            hdrs[idx].width = wpx;
        }
    } else if (idx !== -1) {
        hdrs.splice(idx, 1);
    }
}

function getHeaderKey() {
    return `hkey_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function updateModelValue() {
    const dataToEmit = {
        ...localData.value,
        headers: localData.value.headers
            .filter((header) => header.type !== "placeholder")
            .map((header) => {
                // eslint-disable-next-line no-unused-vars
                const { headerKey, ...headerWithoutKey } = header;
                return headerWithoutKey;
            }),
    };
    emit("update:modelValue", dataToEmit);
}

function updateContainerWidth() {
    nextTick(() => {
        const tableEl = dataTable.value?.$el;
        if (!tableEl) return;
        const wrapper = tableEl.querySelector('.v-data-table__wrapper') || tableEl;
        containerWidth.value = wrapper.clientWidth;
    });
}

function onMove(evt) {
    const hdrs = localData.value.headers;

    // find placeholder’s current index
    const pi = hdrs.findIndex(h => h.type === 'placeholder');

    const from = evt.draggedContext.index;
    let to = evt.relatedContext.index + (evt.willInsertAfter ? 1 : 0);

    // when dragging within the same list, removing the item first
    // shifts indexes left if from < to
    if (from < to) to--;

    // never allow the placeholder itself to be dragged
    if (evt.draggedContext.element.type === 'placeholder') {
        return false;
    }

    // never allow dropping *at or past* the placeholder’s slot
    // Ensure pi is valid before comparison
    if (pi !== -1 && to >= pi) {
        return false;
    }
    return true;
}

function onDragEnd(evt) {
    const { oldIndex, newIndex } = evt;

    const [movedHeader] = localData.value.headers.splice(oldIndex, 1);
    localData.value.headers.splice(newIndex, 0, movedHeader);

    localData.value.rows.forEach(row => {
        if (Array.isArray(row)) {
            const [moved] = row.splice(oldIndex, 1);
            row.splice(newIndex, 0, moved);
        }
    });

    updateModelValue();
}


function onResizeStart(e, idx) {
    resizing.value = {
        index: idx,
        startX: e.clientX,
        startW: parseInt(localData.value.headers[idx].width, 10) || 0,
    };
    window.addEventListener('mousemove', onResizing);
    window.addEventListener('mouseup', onResizeEnd);
}

function onResizing(e) {
    if (resizing.value.index === null) return;
    const delta = e.clientX - resizing.value.startX;
    const newW = resizing.value.startW + delta;
    if (newW >= 75) {
        localData.value.headers[resizing.value.index].width = newW + 'px';
    }

    updateTotalWidth();
}

function onResizeEnd() {
    window.removeEventListener('mousemove', onResizing);
    window.removeEventListener('mouseup', onResizeEnd);
    resizing.value.index = null;
    updateModelValue();
}

function onAddColumn(idx, pos) {
    const col = {
        title: 'New',
        headerKey: getHeaderKey(),
        type: 'string',
        width: '150px',
        minWidth: '150px',
        maxWidth: '150px',
    };
    const at = pos === 'before' ? idx : idx + 1;
    localData.value.headers.splice(at, 0, col);

    localData.value.rows.forEach(row => {
        if (Array.isArray(row)) {
            row.splice(at, 0, '');
        }
    });
    updateModelValue();
}

function onColUpdate() {
    updateModelValue();
}

/**
 * Adds one or more new rows to the table.
 * @param {number | null} idx - The index of the reference row. Can be null if pos is 'append'.
 * @param {'before' | 'after' | 'append'} pos - Position relative to idx, or 'append' to add to the end.
 * @param {number} [count=1] - The number of new rows to add. Defaults to 1.
 */
function onAddNewRow(idx, pos, count = 1) {
    if (count <= 0) {
        console.warn('onAddNewRow: count must be positive.');
        return;
    }

    if (!localData.value.rows) {
        localData.value.rows = [];
    }

    // Determine the number of cells needed for a new row, based on actual data headers
    const actualDataHeaders = localData.value.headers.filter(
        (h) => h.type !== 'placeholder',
    );
    const numCells = actualDataHeaders.length;

    // Create the new row(s)
    const newRowsToAdd = [];
    for (let i = 0; i < count; i++) {
        const newRowData = [];
        for (let j = 0; j < numCells; j++) {
            // Initialize cells with a default value (e.g., empty string)
            // You could make this more sophisticated based on actualDataHeaders[j].type
            newRowData.push('');
        }
        newRowsToAdd.push(newRowData);
    }

    // Determine the insertion index
    let insertAtIndex;
    const currentRowCount = localData.value.rows.length;

    if (pos === 'before' && idx !== null && idx >= 0 && idx < currentRowCount) {
        insertAtIndex = idx;
    } else if (
        pos === 'after' &&
        idx !== null &&
        idx >= 0 &&
        idx < currentRowCount
    ) {
        insertAtIndex = idx + 1;
    } else {
        // Default to appending if pos is 'append', idx is null, or idx is out of bounds
        insertAtIndex = currentRowCount;
    }

    // Insert the new row(s)
    localData.value.rows.splice(insertAtIndex, 0, ...newRowsToAdd);

    // Emit the update to the parent
    updateModelValue();
}

function onRowAction(action, count = 1) {
    if (contextRowIndex.value === null) return;

    switch (action) {
        case "add_above":
            onAddNewRow(contextRowIndex.value, "before", count);
            break;
        case "add_below":
            onAddNewRow(contextRowIndex.value, "after", count);
            break;
        case "delete":
            if (
                contextRowIndex.value >= 0 &&
                contextRowIndex.value < localData.value.rows.length
            ) {
                localData.value.rows.splice(contextRowIndex.value, 1);
                updateModelValue();
            }
            break;
    }

    showRowContextMenu.value = false;
    contextRowIndex.value = null;
}

function openRowContextMenu(event, itemWrapper, clickIndex) {
    event.preventDefault();
    showRowContextMenu.value = false;
    rowContextMenuX.value = event.clientX;
    rowContextMenuY.value = event.clientY;
    contextRowIndex.value = clickIndex;

    nextTick(() => {
        showRowContextMenu.value = true;
    });
}

function formatDate(val) {
    const d = new Date(val);
    return isNaN(d) ? '' : d.toLocaleDateString();
}

onMounted(() => {
    updateContainerWidth();
    window.addEventListener('resize', updateContainerWidth);
});
onUnmounted(() => {
    onResizeEnd();
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

/* the little handle at the right edge */
.resize-handle {
    margin-right: -27px;
    width: 21px;
    height: 100%;
}

.resize-handle .dragging {
    display: none;
}

.resize-handle .not-dragging {
    display: block;
}

.resize-handle:hover .dragging {
    display: block;
}

.resize-handle:hover .not-dragging {
    display: none;
}

.colum-input {
    width: 100%
}
</style>
