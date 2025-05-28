<!--
@file GalleryEdit.vue
@description Display a number of images.
-->

<template>
    <v-container>
        <v-row>
            <v-col cols="3">
                <v-select label="Display Style" :items="styleOptions" v-model="localData.style" variant="outlined"
                    density="compact"></v-select>
            </v-col>
            <v-col cols="3" v-if="localData.style === 'cols'">
                <v-select label="Number of Columns" :items="colsOptions" v-model="localData.cols" variant="outlined"
                    density="compact"></v-select>
            </v-col>
            <v-col cols="3" v-if="localData.style === 'rows'">
                <v-select label="Item Height (px)" :items="heightOptions" v-model="localData.height" variant="outlined"
                    density="compact"></v-select>
            </v-col>
            <v-col cols="3">
                <v-btn @click="addItem" color="primary" class="mb-4">
                    <v-icon start>mdi-plus</v-icon>
                    Add Item
                </v-btn>
            </v-col>
        </v-row>

        <v-container :style="galleryStyle">
            <Image v-for="(item, index) in localData.items" :key="index" :can-edit="true"
                :aspect-ratio="item.aspectRatio" :src="item.url" :style="imageItemStyle(item)" />
        </v-container>
    </v-container>
</template>

<script setup>
import { computed, ref, watch } from "vue";

import Image from '@/components/Image.vue';
import { useLogger } from '@/stores/logger.js';

const logger = useLogger();

const props = defineProps({
    content: {
        type: Object,
        required: true,
        default: () => ({ style: "rows", items: [] }),
    },
});

const colsOptions = ref([
    { title: '1 Column', value: 1 },
    { title: '2 Columns', value: 2 },
    { title: '3 Columns', value: 3 },
    { title: '4 Columns', value: 4 },
]);
const galleryGap = ref(16);
const heightOptions = ref([
    { title: '200px', value: 200 },
    { title: '300px', value: 300 },
    { title: '400px', value: 400 },
    { title: '500px', value: 500 },
    { title: '600px', value: 600 },
]);
const localData = ref({});
const styleOptions = ref([
    { title: 'Rows', value: 'rows' },
    { title: 'Columns', value: 'cols' },
]);

const galleryStyle = computed(() => {
    let style = {};

    switch (localData.value.style) {
        case 'cols':
            style = {
                display: 'flex',
                flexWrap: 'wrap',
                gap: `${galleryGap.value}px`,
            };
            break;
        case 'rows':
            style = {
                display: 'flex',
                flexDirection: 'column',
                gap: `${galleryGap.value}px`,
            };
            break;
        default:
            return {};
    }

    return style;
});

watch(() => props.content, updateLocalDataFromProps, {
    deep: true,
    immediate: true,
});

// Watch for changes in the style selected by the user via UI
watch(
    () => localData.value.style,
    (newStyle, oldStyle) => {
        if (!localData.value ||
            Object.keys(localData.value).length === 0 ||
            newStyle === oldStyle
        ) {
            return;
        }

        if (newStyle === 'cols') {
            localData.value.cols = 2;
            if (localData.value.hasOwnProperty('height')) {
                delete localData.value.height;
            }
        } else if (newStyle === 'rows') {
            localData.value.height = 400;
            if (localData.value.hasOwnProperty('cols')) {
                delete localData.value.cols;
            }
        }
    },
);

function updateLocalDataFromProps(newContentValue) {
    try {
        // newContentValue is the new value of props.content from the watcher
        const newLocalData = JSON.parse(JSON.stringify(newContentValue));

        // Ensure basic structure and defaults
        newLocalData.style = newLocalData.style || 'rows';
        newLocalData.items = Array.isArray(newLocalData.items) ? newLocalData.items : [];

        // Initialize style-specific properties based on the style from props
        if (newLocalData.style === 'cols') {
            newLocalData.cols = newLocalData.cols || 2;
            if (newLocalData.hasOwnProperty('height')) {
                delete newLocalData.height;
            }
        } else if (newLocalData.style === 'rows') {
            newLocalData.height = newLocalData.height || 400;
            if (newLocalData.hasOwnProperty('cols')) {
                delete newLocalData.cols;
            }
        }
        localData.value = newLocalData;
    } catch (error) {
        logger.error("Failed to parse props.content or initialize localData:", error);

        // Fallback to a default, consistent structure
        localData.value = {
            style: 'rows',
            items: [],
            height: 400,
        };
    }
}

function imageItemStyle(item) {
    let style = {};

    const numCols = localData.value.cols;
    const gapValue = parseInt(galleryGap.value, 10) || 0;

    switch (localData.value.style) {
        case 'cols':
            const basis = `calc((100% - ${
                (numCols - 1) * gapValue
            }px) / ${numCols})`;
            style = {
                flexBasis: basis,
                flexGrow: 0,
                flexShrink: 0,
            };
            break;
        case 'rows':
            style = {
                height: localData.value.height
                    ? `${localData.value.height}px`
                    : 'auto',
            };
            break;
        default:
            style = {};
    }

    return style;
};

const addItem = () => {
    if (!Array.isArray(localData.value.items)) {
        localData.value.items = [];
    }
    localData.value.items.push({
        aspectRatio: 1,
        url: '',
    });
};
</script>

<style scoped>
/* Add any specific styles for your component here */
.pa-2.my-1 {
    border: 1px solid #e0e0e0;
    /* Lighter border for items */
    border-radius: 4px;
}

h4 {
    margin-bottom: 0.5rem;
}
</style>
