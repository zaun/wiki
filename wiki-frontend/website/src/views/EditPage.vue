<!--
@file EditPage.vue
@description Page for editing a node. Handles loading, 404, and inline edits with save/delete operations.
-->

<template>
    <div ref="topAnchor"></div>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="snackbar.timeout" location="top">
        {{ snackbar.message }}
    </v-snackbar>

    <!-- Sticky Toolbar -->
    <div class="sticky-toolbar">
        <v-toolbar flat density="compact" class="position-relative align-center">
            <!-- TOC menu -->
            <v-menu offset-y>
                <template #activator="{ props }">
                    <v-btn v-bind="props" icon><v-icon>mdi-format-list-bulleted</v-icon></v-btn>
                </template>
                <v-list>
                    <v-list-item @click="scrollToTop"><v-list-item-title>Top Of Page</v-list-item-title></v-list-item>
                    <v-divider />
                    <v-list-item v-for="(sec, idx) in form.sections" :key="sec.id || idx" @click="scrollToSection(idx)">
                        <v-list-item-title>
                            {{ sec.title || `Section ${idx + 1}` }}
                        </v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>

            <!-- centered add buttons -->
            <div class="button-group d-flex" style="position: absolute; left: 50%; transform: translateX(-50%);">
                <v-btn @click="addSection" :disabled="anyEditing">
                    <v-icon left>mdi-plus</v-icon>Section
                </v-btn>
                <v-btn @click="addDetail" :disabled="anyEditing">
                    <v-icon left>mdi-plus</v-icon>Detail
                </v-btn>
                <v-btn @click="addRelationship" :disabled="anyEditing">
                    <v-icon left>mdi-plus</v-icon>Relationship
                </v-btn>
            </div>

            <v-spacer />

            <span class="mr-2">Word Count: {{ totalWordCount }}</span>
        </v-toolbar>
    </div>

    <!-- 404 -->
    <NotFound v-if="!loading && notFound" />

    <!-- form + sidebar layout -->
    <v-container v-else-if="!loading">
        <div>
            <Image :aspect-ratio="3.2" :src="heroImageURL" :can-edit="true" @error="onSetHeroError"
                @delete="onSetHeroDelete" @clicked="onSetHero" class="mb-2"/>

            <!-- Sidebar: Details & Relationships -->
            <div v-if="form.details.length || form.relationships.length" cols="12" sm="4">
                <div class="pl-2 sidebar" ref="detailList">
                    <draggable v-model="form.details" :disabled="anyEditing" @end="onDetailsReorder" item-key="id"
                        handle=".drag-handle">
                        <template #item="{ element, index }">
                            <div class="d-flex align-center sidebar-item">
                                <Detail v-model="form.details[index]" v-model:isEditing="detailEditState[index]"
                                    :can-edit="detailEditState[index] || !anyEditing" @delete="doDeleteDetail(index)"
                                    @save="doSaveNode()" />
                            </div>
                        </template>
                    </draggable>

                    <div v-if="form.relationships.length" class="my-6" ref="relationshipList">
                        <Detail :model-value="{ type: 'header', label: 'Relationships' }" />
                        <div class="relationship-ancho d-flex align-center sidebar-itemr"
                            v-for="(rel, idx) in form.relationships" :key="rel.id || idx">
                            <Relationship v-model="form.relationships[idx]"
                                v-model:isEditing="relationshipEditState[idx]"
                                :can-edit="relationshipEditState[idx] || !anyEditing"
                                @delete="doDeleteRelationship(idx)" @save="doSaveNode()" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Content Form -->
            <div>
                <v-form>
                    <Section v-model="form.node" v-model:isEditing="nodeEditState"
                        :can-edit="nodeEditState || !anyEditing" :header-size="4"
                        :hide-delete="true" :hide-type="true" @save="doSaveNode"
                        @edit-citation="(sId) => onEditCitation('node', sId)" />

                    <!-- sections -->
                    <div class="my-6" ref="sectionList">
                        <div class="section-anchor" v-for="(sec, idx) in form.sections" :key="sec.id || idx">
                            <Section v-model="form.sections[idx]" v-model:isEditing="sectionEditState[idx]"
                                :can-edit="sectionEditState[idx] || !anyEditing" @delete="doDeleteSection(idx)"
                                @save="doSaveSection(idx)"
                                @edit-citation="(sId) => onEditCitation(form.sections[idx].id, sId)" />
                        </div>
                    </div>

                    <!-- Citations -->
                    <div v-if="citationGroups.length" class="my-6">
                        <div class="text-h4 mb-2">Citations</div>
                        <div class="citation-container">
                            <template v-for="(group, gIdx) in citationGroups" :key="group.key">
                                <template v-for="(cit, idx) in group.citations" :key="cit.id || idx" class="mb-2">
                                    <CitationView :citation="group.citations[idx]" />
                                </template>
                            </template>
                        </div>
                    </div>
                </v-form>
            </div>
        </div>
    </v-container>

    <!-- loading -->
    <v-container v-else class="d-flex justify-center pa-10">
        <v-progress-circular indeterminate size="48" />
    </v-container>

    <!-- citation modal -->
    <CitationEditDialog v-model:isOpen="editCitationOpen" v-model="editCitation" @save="doSaveCitation"
        @delete="doDeleteCitation" :key="`${editCitationParent}-${editCitation?.id ?? 'new'}`" />
</template>

<script setup>
import { computed, reactive, ref, onMounted, watch, nextTick } from 'vue';
import draggable from 'vuedraggable';

import CitationEditDialog from '@/components/Citations/CitationEditDialog.vue';
import CitationView from '@/components/Citations/CitationView.vue';
import Detail from '@/components/Detail.vue';
import Image from '@/components/Image.vue';
import NotFound from '@/components/NotFound.vue';
import Relationship from '@/components/Relationship.vue';
import Section from '@/components/sections/Section.vue';
import { useApi } from '@/stores/api';
import { useData } from '@/stores/data';
import { useLogger } from '@/stores/logger.js';

const api = useApi();
const logger = useLogger();
const store = useData();

const props = defineProps({ id: { type: String, required: true } });

const detailEditState = ref([]);
const detailList = ref(null);
const editCitation = ref(null);
const editCitationOpen = ref(false);
const loading = ref(true);
const nodeEditState = ref(false);
const notFound = ref(false);
const relationshipEditState = ref([]);
const relationshipList = ref(null);
const sectionEditState = ref([]);
const sectionList = ref(null);
const topAnchor = ref(null);

const form = reactive({
    node: /** @type {object} */ ({}),
    sections: /** @type {Array<object>} */ ([]),
    citations: /** @type {Array<object>} */ ([]),
    details: /** @type {Array<object>} */ ([]),
    relationships: /** @type {Array<object>} */ ([]),
});
const snackbar = reactive({
    show: false,
    message: '',
    color: 'success',
    timeout: 3000,
});

const anyEditing = computed(() =>
    nodeEditState.value ||
    sectionEditState.value.some(Boolean) ||
    detailEditState.value.some(Boolean) ||
    relationshipEditState.value.some(Boolean),
);
const citationGroups = computed(() => store.currentCitations || []);
const heroImageURL = computed(() => {
    let url = '';
    if (form.node.image) {
        url = api.getImageUrl(form.node.image);
        if (form.node.imageCrop) {
            const c = form.node.imageCrop;
            url += `?crop=${c.x},${c.y},${c.width},${c.height}`;
        }
    }
    return url;
});
const totalWordCount = computed(() => {
    function countWords(t) {
        return t?.trim().split(/\s+/).filter((w) => w).length;
    }

    const total = Object.entries(form.sections).reduce(function (total, pair) {
        const [key, value] = pair;
        return total + countWords(value.content);
    }, countWords(form.node.content));

    return total;
});

let editCitationParent = null;

/**
 *
 */
async function load() {
    logger.info('EDIT_PAGE', `Loading node ${props.id}`);
    loading.value = true;
    notFound.value = false;

    const ok = await store.setNode(props.id);
    if (!ok || !store.currentNode) {
        notFound.value = true;
        loading.value = false;
        return;
    }

    initializeForm();
    loading.value = false;
}

/**
 *
 */
function initializeForm() {
    const node = store.currentNode;
    form.node = { ...node };
    form.sections = store.currentSections.map(s => ({
        id: s.id,
        type: s.type || 'text',
        title: s.title,
        content: s.content,
        data: s.data,
        summary: s.sumary,
    }));
    form.details = Array.isArray(node.details) ? node.details.map(d => ({ ...d })) : [];
    form.relationships = (node.relationships || [])
        .slice()
        .sort((a, b) => a.relationship.localeCompare(b.relationship));
}

watch(() => props.id, load);

/**
 *
 */
function onEditCitation(sectionId, citationId) {
    editCitationParent = sectionId;
    const template = {
        source: { type: 'Website', publisher: '', title: '', author: '', year: '', url: '' },
        id: undefined,
        title: '',
        page: '',
        url: '',
        note: '',
        quote: '',
    };
    if (citationId) {
        const container = sectionId === 'node'
            ? store.currentCitations.find(c => c.type === 'node')
            : store.currentCitations.find(c => c.type === 'section' && c.id === sectionId);
        const existing = container?.citations.find(c => c.id === citationId);
        editCitation.value = existing ? JSON.parse(JSON.stringify(existing)) : template;
    } else {
        editCitation.value = template;
    }
    editCitationOpen.value = true;
}

/**
 *
 */
function addRelationship() {
    form.relationships.push({ left: { id: 'SELF', title: '' }, right: { id: '', title: '' }, relationship: 'DEPENDS_ON' });
    nextTick(() => {
        const i = form.relationships.length - 1;
        relationshipEditState.value[i] = true;
        scrollToRelationship(i);
    });
}

/**
 *
 */
function addDetail() {
    form.details.push({ type: 'text', label: 'New Detail', value: '' });
    nextTick(() => {
        const i = form.details.length - 1;
        detailEditState.value[i] = true;
        scrollToDetail(i);
    });
}

/**
 *
 */
function onDetailsReorder(evt) {
    const { oldIndex, newIndex } = evt;
    if (oldIndex === newIndex) return;
    const moved = detailEditState.value.splice(oldIndex, 1)[0];
    detailEditState.value.splice(newIndex, 0, moved);
    doSaveNode();
}

/**
 *
 */
async function doDeleteDetail(idx) {
    const toSave = !!form.details[idx].id;
    form.details.splice(idx, 1);
    detailEditState.value.splice(idx, 1);
    if (toSave) await doSaveNode();
}

/**
 *
 */
function addSection() {
    form.sections.push({ id: null, type: 'text', title: '', content: '' });
    nextTick(() => {
        const i = form.sections.length - 1;
        sectionEditState.value[i] = true;
        // sectionList.value?.children[i]?.scrollIntoView({ behavior: 'smooth' });
    });
}

// -- Save/Delete Hero --------------------------------

/**
 *
 */
function onSetHeroError(err) {
    console.error(err);
}

/**
 *
 */
async function onSetHero(imageData) {
    if (
        !form.node.image ||
        form.node.image !== imageData.id ||
        JSON.stringify(form.node.imageCrop) !== JSON.stringify(imageData.crop)
    ) {
        form.node.image = imageData.id;
        form.node.imageCrop = imageData.crop;
        await doSaveNode();
    }
}

/**
 *
 */
async function onSetHeroDelete() {
    form.node.image = 'remove';
    await doSaveNode();
}

// -- Save/Delete Citation --------------------------------

/**
 *
 */
async function doSaveCitation() {
    try {
        if (editCitation.value.source.id) {
            api.updateCitationSource(editCitation.value.source.id, editCitation.value.source);
        } else {
            const source = await api.createCitationSource(editCitation.value.source);
            editCitation.value.source.id = source.data.id;
        }

        if (editCitation.value.id) {
            if (editCitationParent === 'node') {
                await store.updateNodeCitation(form.node.id, editCitation.value);
            } else {
                await store.updateSectionCitation(form.node.id, editCitationParent, editCitation.value);
            }
        } else {
            if (editCitationParent === 'node') {
                await store.createNodeCitation(form.node.id, editCitation.value);
            } else {
                await store.createSectionCitation(form.node.id, editCitationParent, editCitation.value);
            }
        }
        editCitationOpen.value = false;
        snackbar.message = 'Citation saved';
        snackbar.color = 'success';
        snackbar.show = true;
    } catch (err) {
        logger.error('EDIT_PAGE', `Failed to save citation: ${err.message}`);
        logger.debug('EDIT_PAGE', err.stack);
        snackbar.message = 'Failed to save citation';
        snackbar.color = 'error';
        snackbar.show = true;
    }
}

/**
 *
 */
async function doDeleteCitation() {
    try {
        if (editCitationParent === 'node' && editCitation.value.id) {
            await store.removeNodeCitation(form.node.id, editCitation.value.id);
        } else if (editCitationParent !== 'node' && editCitation.value.id) {
            await store.removeSectionCitation(form.node.id, editCitationParent, editCitation.value.id);
        }
        editCitationOpen.value = false;
        snackbar.message = 'Citation deleted';
        snackbar.color = 'success';
        snackbar.show = true;
    } catch (err) {
        logger.error('EDIT_PAGE', `Failed to delete citation: ${err.message}`);
        logger.debug('EDIT_PAGE', err.stack);
        snackbar.message = 'Failed to delete citation';
        snackbar.color = 'error';
        snackbar.show = true;
    }
}

// -- New: Save/Delete Node --------------------------------

/**
 *
 */
async function doSaveNode() {
    try {
        await store.updateNode({
            ...form.node,
            details: form.details,
            relationships: form.relationships,
        });
        snackbar.message = 'Node saved';
        snackbar.color = 'success';
        snackbar.show = true;
        initializeForm();
    } catch (err) {
        logger.error('EDIT_PAGE', `Failed to save node: ${err.message}`);
        logger.debug('EDIT_PAGE', err.stack);
        snackbar.message = 'Failed to save node';
        snackbar.color = 'error';
        snackbar.show = true;
    }
}

// -- New: Save/Delete Section --------------------------------

/**
 *
 */
async function doSaveSection(idx) {
    try {
        const sec = form.sections[idx];
        if (sec.id) {
            await store.updateSection(form.node.id, sec.id, sec);
        } else {
            const newSection = await store.createSection(form.node.id, sec);
            form.sections[idx].id = newSection.id;
        }
        snackbar.message = 'Section saved';
        snackbar.color = 'success';
        snackbar.show = true;
        initializeForm();
    } catch (err) {
        logger.error('EDIT_PAGE', `Failed to save section: ${err.message}`);
        logger.debug('EDIT_PAGE', err.stack);
        snackbar.message = 'Failed to save section';
        snackbar.color = 'error';
        snackbar.show = true;
    }
}

/**
 *
 */
async function doDeleteSection(idx) {
    try {
        const sec = form.sections[idx];
        if (sec.id) {
            await store.deleteSection(form.node.id, sec.id);
        }
        form.sections.splice(idx, 1);
        sectionEditState.value.splice(idx, 1);
        snackbar.message = 'Section deleted';
        snackbar.color = 'success';
        snackbar.show = true;
    } catch (err) {
        logger.error('EDIT_PAGE', `Failed to delete section: ${err.message}`);
        logger.debug('EDIT_PAGE', err.stack);
        // rollback by reloading
        await load();
        snackbar.message = 'Failed to delete section';
        snackbar.color = 'error';
        snackbar.show = true;
    }
}

// -- Scrolling Helpers --------------------------------

/**
 *
 */
function scrollToTop() {
    if (topAnchor.value) topAnchor.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 *
 */
function scrollToRelationship(idx) {
    const list = relationshipList.value;
    const target = list?.children[idx];
    if (!target) return;
    const height = document.querySelector('.sticky-toolbar')?.offsetHeight || 0;
    target.style.scrollMarginTop = `${height}px`;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 *
 */
function scrollToDetail(idx) {
    const list = detailList.value;
    const target = list?.children[idx];
    if (!target) return;
    const height = document.querySelector('.sticky-toolbar')?.offsetHeight || 0;
    target.style.scrollMarginTop = `${height}px`;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onMounted(load);
</script>

<style scoped>
.sticky-toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: white;
    border-bottom: 1px solid #eee;
}

.section-anchor {
    /* fallback if JS doesn’t run; you can set a fixed toolbar height here */
    scroll-margin-top: 50px;
}

.citation-anchor {
    /* fallback if JS doesn’t run; you can set a fixed toolbar height here */
    scroll-margin-top: 50px;
}

.sidebar {
    float: right;
    width: 30%;
    border: 1px solid #eee;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
}

.sidebar-item .detail-edit-button {
    display: none;
}

.sidebar-item:hover .detail-edit-button {
    margin-left: -28px;
    display: flex;
}

.detail-edit-button>button.v-btn.v-btn--icon {
    background-color: white;
    opacity: 1;
}

.border {
    border: 1px solid #e0e0e0;
}

.pa-4 {
    padding: 1rem;
}

.mb-4 {
    margin-bottom: 1rem;
}

.my-6 {
    margin: 1.5rem 0;
}

.d-flex {
    display: flex;
}

.align-center {
    align-items: center;
}

.flex-grow-1 {
    flex-grow: 1;
}

.citation-container {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
}
</style>
