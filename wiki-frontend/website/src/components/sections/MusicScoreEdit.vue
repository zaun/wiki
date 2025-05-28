<!--
@file Music.vue
@description Renders MusicXML.
-->

<template>
    <div v-bind="$attrs" class="music-container">
        <v-btn icon class="edit-button" variant="flat" @click="onSelectFile">
            <v-icon>mdi-music</v-icon>
            <v-icon>mdi-pencil-outline</v-icon>
        </v-btn>
        <div v-for="(page, i) in pages" :key="i" class="music-page" v-html="page" />
    </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';

import { useLogger } from '@/stores/logger.js';


const logger = useLogger();

const props = defineProps({
    modelValue: {
        type: String,
        required: true,
        default: '',
    },
});

const emit = defineEmits(['update:modelValue']);

let verovio;

const pages = ref([]);
const localData = ref(null);
const scoreContainer = ref(null);

watch(
    () => props.modelValue,
    (nv) => {
        localData.value = JSON.parse(JSON.stringify(nv));
        loadAndRender(localData.value);
    },
    { deep: true, immediate: true },
);

function checkValidXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
    return xmlDoc.getElementsByTagName('parsererror').length === 0;
}

async function loadAndRender(xml) {
    if (!verovio) {
        logger.error('MUSIC', 'Verovio not loaded.');
        return;
    }

    if (!checkValidXML(xml)) {
        logger.error('MUSIC', 'Invalid XML');
        return;
    }

    pages.value = [];
    logger.debug('MUSIC', 'Loading MusicXML');
    await verovio.loadData(xml);
    const pageCount = verovio.getPageCount();
    for (let i = 1; i <= pageCount; i++) {
        pages.value.push(verovio.renderToSVG(i));
    }

    logger.debug('MUSIC', 'Rendered');
}

function onSelectFile() {
    const input = document.createElement("input");
    input.type = "file";
    // Accept common MusicXML extensions and MIME types
    input.accept = ".musicxml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml";

    input.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;

                const bytesToRead = Math.min(content.byteLength, 5);
                if (bytesToRead === 0) {
                    return;
                }
                const checkBytes = content.slice(0, bytesToRead);
                const decoder = new TextDecoder('utf-8');
                const checkString = decoder.decode(checkBytes);

                if (checkString.indexOf('xml') !== -1) {
                    logger.info('MUSIC_EDITOR', 'Loaded XML file');
                    localData.value = decoder.decode(content);
                    emit("update:modelValue", localData.value);
                } else if (checkString.indexOf('PK') !== -1) {
                    logger.info('MUSIC_EDITOR', 'zip file');
                    // localData.value = decoder.decode(content);
                    // emit("update:modelValue", localData.value);
                } else {
                    logger.error(
                        "MUSIC",
                        "File content could not be read as string.",
                    );
                    if (scoreContainer.value) {
                        scoreContainer.value.innerHTML = '<p style="padding: 10px; color: red;">Error: Could not read file content as text.</p>';
                    }
                }
            };
            reader.onerror = (error) => {
                logger.error("MUSIC", "Error reading file:", error);
                if (scoreContainer.value) {
                    scoreContainer.value.innerHTML =
                        '<p style="padding: 10px; color: red;">Error reading selected file.</p>';
                }
            };
            reader.readAsArrayBuffer(file);
        }
    };
    input.click();
}

onMounted(async () => {
    try {
        const createVerovioModule = (await import('verovio/wasm')).default;
        const { VerovioToolkit } = await import('verovio/esm');

        const wasm = await createVerovioModule();
        verovio = new VerovioToolkit(wasm);
        verovio.setOptions({
            pageMarginTop: 30,
            pageMarginBottom: 30,
            pageMarginLeft: 30,
            pageMarginRight: 30,
            svgViewBox: true,
            svgHtml5: false,
            adjustPageHeight: true,
            breaks: 'encoded',
            header: 'encoded',
        });

        logger.debug('MUSIC', `Verovio v${verovio.getVersion()} loaded`);

        if (props.modelValue) {
            localData.value = JSON.parse(JSON.stringify(props.modelValue));
            await loadAndRender(localData.value);
        } else {
            logger.debug('MUSIC', `No content.`);
        }
    } catch (err) {
        logger.error('MUSIC', err.message);
    }
});
</script>

<style>
.music-container {
    position: relative;
    overflow: visible;
    width: 100%;
    min-height: 40px;
}

.music-page {
    position: relative;
    overflow: visible;
    width: 100%;
}

.music-page SVG {
    position: relative;
    overflow: visible;
    width: 100%;
}

.edit-button {
    position: absolute;
    top: 0px;
    right: 0px;
    z-index: 999;
}

.score {
    width: 100%;
    position: relative;
}
</style>
