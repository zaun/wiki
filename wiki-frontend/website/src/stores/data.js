// src/stores/data.js
import { defineStore, storeToRefs } from 'pinia';
import { ref } from 'vue';

import { useApi } from './api';
import { useCache } from './cache';

/**
 * Pinia store for managing nodes, sections, and their citations.
 */
export const useData = defineStore('data', () => {
    const api = useApi();
    const cacheStore = useCache();
    const { cacheNodes, cacheSections, cacheCitations } = storeToRefs(cacheStore);

    const currentNode = ref({});
    const currentSections = ref([]);
    const currentCitations = ref([]);

    /**
     * Ensure that the citation cache array exists for the given node.
     *
     * @param {string|number} nodeId - Identifier of the node.
     */
    function ensureCache(nodeId) {
        cacheSections.value[nodeId] ||= [];
        cacheCitations.value[nodeId] ||= [];
    }

    /**
     * Retrieve an existing citation group entry or create a new one.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {'node'|'section'} type - Type of citation group.
     * @param {string|number} id - Identifier of the group (node or section).
     * @param {number} order - Display order of the group.
     * @returns {{ type: string, id: string|number, order: number, citations: Array }} The citation group entry.
     */
    function getOrCreateEntry(nodeId, type, id, order) {
        ensureCache(nodeId);
        let entry = cacheCitations.value[nodeId]
            .find((e) => e.type === type && e.id === id);
        if (!entry) {
            entry = {
                type, id, order, citations: [],
            };
            cacheCitations.value[nodeId].push(entry);
        }
        return entry;
    }

    /**
     * Relabel all citations within an entry based on their order.
     *
     * @param {{ type: string, order: number, citations: Array }} entry - Citation group entry.
     */
    function relabelEntry(entry) {
        if (entry.type === 'node') {
            entry.citations.forEach((c, i) => c.label = `${i + 1}`);
        } else {
            entry.citations.forEach((c, i) => {
                c.label = `${entry.order}.${i + 1}`;
            });
        }
    }

    /**
     * Sort citation groups for a node by their order property.
     *
     * @param {string|number} nodeId - Identifier of the node.
     */
    function sortCitationGroups(nodeId) {
        cacheCitations.value[nodeId].sort((a, b) => a.order - b.order);
    }

    /**
     * Sync the currentCitations ref if the given node is active.
     *
     * @param {string|number} nodeId - Identifier of the node.
     */
    function syncCurrent(nodeId) {
        if (currentNode.value.id === nodeId) {
            currentCitations.value = cacheCitations.value[nodeId];
        }
    }

    /**
     * Fetch node data and its root-level citations from the API and cache them.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @returns {Promise<boolean>} True if fetch succeeded, false otherwise.
     */
    async function fetchNode(nodeId) {
        ensureCache(nodeId);
        try {
            const resNode = await api.getNode(nodeId);
            cacheNodes.value[nodeId] = resNode.data;

            const resCit = await api.listNodeCitations(nodeId);
            resCit.data.forEach((c, i) => c.label = `${i + 1}`);

            cacheCitations.value[nodeId] = cacheCitations.value[nodeId]
                .filter((c) => c.type !== 'node');
            cacheCitations.value[nodeId].push({
                type: 'node',
                id: nodeId,
                order: 0,
                citations: resCit.data,
            });
            sortCitationGroups(nodeId);
            return true;
        } catch (e) {
            console.error(`Error loading node: ${e.message}`);
            return false;
        }
    }

    /**
     * Fetch sections of a node and their citations from the API and cache them.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @returns {Promise<boolean>} True if fetch succeeded, false otherwise.
     */
    async function fetchSections(nodeId) {
        ensureCache(nodeId);
        try {
            const resSec = await api.listSections(nodeId);
            cacheSections.value[nodeId] = resSec.data;

            const currentSecIds = new Set(resSec.data.map((sec) => sec.id));
            cacheCitations.value[nodeId] = cacheCitations.value[nodeId]
                .filter((c) => c.type !== 'section' || currentSecIds.has(c.id));

            console.log(`[api] Loaded ${resSec.data.length} sections for node ${nodeId}`);
            for (let idx = 0; idx < resSec.data.length; idx++) {
                const sec = resSec.data[idx];
                const resCit = await api.listSectionCitations(nodeId, sec.id);
                const order = idx + 1;

                resCit.data.forEach((c, i) => c.label = `${order}.${i + 1}`);

                cacheCitations.value[nodeId] = cacheCitations.value[nodeId]
                    .filter((c) => !(c.type === 'section' && c.id === sec.id));
                cacheCitations.value[nodeId].push({
                    type: 'section',
                    id: sec.id,
                    order,
                    citations: resCit.data,
                });
            }
            sortCitationGroups(nodeId);
            return true;
        } catch (e) {
            console.error(`Error loading node sections: ${e.message}`);
            return false;
        }
    }

    /**
     * Initialize the current node, sections, and citations by fetching data.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @returns {Promise<boolean>} True if both node and sections fetched successfully.
     */
    async function setNode(nodeId) {
        cacheNodes.value[nodeId]     ||= {};
        cacheSections.value[nodeId]  ||= [];
        cacheCitations.value[nodeId] ||= [];

        currentNode.value     = cacheNodes.value[nodeId];
        currentSections.value = cacheSections.value[nodeId];
        currentCitations.value= cacheCitations.value[nodeId];

        const [nodeOk, secsOk] = await Promise.all([
            fetchNode(nodeId),
            fetchSections(nodeId),
        ]);

        if (!nodeOk || !secsOk) {
            currentNode.value     = {};
            currentSections.value = [];
            currentCitations.value= [];
            return false;
        }

        currentNode.value = cacheNodes.value[nodeId];
        currentSections.value = cacheSections.value[nodeId];
        currentCitations.value = cacheCitations.value[nodeId];
        return true;
    }

    /**
     * Create a new citation for the node and update the cache.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {Object} payload - Citation data to create.
     * @returns {Promise<Object>} The created citation object.
     */
    async function createNodeCitation(nodeId, payload) {
        const res = await api.createNodeCitation(nodeId, payload);
        const newCitation = res.data;

        const entry = getOrCreateEntry(nodeId, 'node', nodeId, 0);
        entry.citations.push(newCitation);
        relabelEntry(entry);
        sortCitationGroups(nodeId);
        syncCurrent(nodeId);

        return newCitation;
    }

    /**
     * Create a new citation for a section and update the cache.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {string|number} sectionId - Identifier of the section.
     * @param {Object} payload - Citation data to create.
     * @returns {Promise<Object>} The created citation object.
     */
    async function createSectionCitation(nodeId, sectionId, payload) {
        const res = await api.createSectionCitation(nodeId, sectionId, payload);
        const newCitation = res.data;

        const order = cacheSections.value[nodeId]
            .findIndex((s) => s.id === sectionId) + 1;

        const entry = getOrCreateEntry(nodeId, 'section', sectionId, order);
        entry.citations.push(newCitation);
        relabelEntry(entry);
        sortCitationGroups(nodeId);
        syncCurrent(nodeId);

        return newCitation;
    }

    /**
     * Update an existing node-level citation and sync the cache.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {Object} payload - Citation data to update (must include id).
     * @returns {Promise<Object>} The updated citation object.
     */
    async function updateNodeCitation(nodeId, payload) {
        const res = await api.updateNodeCitation(nodeId, payload);
        const updated = res.data;

        const entry = getOrCreateEntry(nodeId, 'node', nodeId, 0);
        const idx = entry.citations.findIndex((c) => c.id === payload.id);
        if (idx !== -1) entry.citations.splice(idx, 1, updated);

        relabelEntry(entry);
        syncCurrent(nodeId);

        return updated;
    }
    
    /**
     * Create a new section for the node.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {Object} payload - Section data to create.
     * @returns {Promise<Object>} The created section object.
     * @throws Will throw if the API call fails.
     */
    async function createSection(nodeId, payload) {
        ensureCache(nodeId);

        const res = await api.createSection(nodeId, payload);
        const newSection = res.data;

        cacheSections.value[nodeId].push(newSection);

        syncCurrent(nodeId);
        return newSection;
    }

    /**
     * Update an existing section.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {string|number} sectionId - Identifier of the section to update.
     * @param {Object} payload - Section data to update.
     * @returns {Promise<Object>} The updated section object.
     * @throws Will throw if the API call fails.
     */
    async function updateSection(nodeId, sectionId, payload) {
        ensureCache(nodeId);

        const res = await api.updateSection(nodeId, sectionId, payload);
        const updatedSection = res.data;

        const idx = cacheSections.value[nodeId].findIndex((s) => s.id === sectionId);
        if (idx !== -1) {
            cacheSections.value[nodeId].splice(idx, 1, updatedSection);
        } else {
            throw Error("Updated section not in cache");
        }

        syncCurrent(nodeId);
        return updatedSection;
    }
    
    /**
     * Delete a section from the node.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {string|number} sectionId - Identifier of the section to delete.
     * @returns {Promise<void>}
     * @throws Will throw if the API call fails.
     */
    async function deleteSection(nodeId, sectionId) {
        ensureCache(nodeId);

        await api.deleteSection(nodeId, sectionId);
        cacheCitations.value[nodeId] = cacheCitations.value[nodeId].filter(
            (entry) => !(entry.type === 'section' && entry.id === sectionId),
        );

        syncCurrent(nodeId);
    }

    /**
     * Update an existing section-level citation and sync the cache.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {string|number} sectionId - Identifier of the section.
     * @param {Object} payload - Citation data to update (must include id).
     * @returns {Promise<Object>} The updated citation object.
     */
    async function updateSectionCitation(nodeId, sectionId, payload) {
        const res = await api.updateSectionCitation(nodeId, sectionId, payload);
        const updated = res.data;

        const entry = getOrCreateEntry(nodeId, 'section', sectionId, 0);
        const idx = entry.citations.findIndex((c) => c.id === payload.id);
        if (idx !== -1) entry.citations.splice(idx, 1, updated);

        relabelEntry(entry);
        syncCurrent(nodeId);

        return updated;
    }

    /**
     * Remove a node-level citation from both server and cache.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {string|number} citationId - Identifier of the citation to remove.
     */
    async function removeNodeCitation(nodeId, citationId) {
        await api.deleteNodeCitation(nodeId, citationId);

        const entry = getOrCreateEntry(nodeId, 'node', nodeId, 0);
        entry.citations = entry.citations.filter((c) => c.id !== citationId);

        relabelEntry(entry);
        syncCurrent(nodeId);
    }

    /**
     * Remove a section-level citation from both server and cache.
     *
     * @param {string|number} nodeId - Identifier of the node.
     * @param {string|number} sectionId - Identifier of the section.
     * @param {string|number} citationId - Identifier of the citation to remove.
     */
    async function removeSectionCitation(nodeId, sectionId, citationId) {
        await api.deleteSectionCitation(nodeId, sectionId, citationId);

        const entry = getOrCreateEntry(nodeId, 'section', sectionId, 0);
        entry.citations = entry.citations.filter((c) => c.id !== citationId);

        relabelEntry(entry);
        syncCurrent(nodeId);
    }

    /**
     * Create or update a node on the server and sync the cache.
     *
     * @param {{ id?: string|number, [key: string]: any }} params - Node fields (include id to update).
     * @returns {Promise<Object>} The saved node data.
     * @throws Will throw if the API call fails.
     */
    async function updateNode({ id, ...fields }) {
        cacheNodes.value[id] ||= {};
        cacheSections.value[id] ||= [];
        cacheCitations.value[id] ||= [];

        try {
            let res;
            if (id) {
                res = await api.updateNode(id, fields);
            } else {
                res = await api.createNode(fields);
                fields.id = res.data.id;
            }

            cacheNodes.value[id] = res.data;
            currentNode.value = cacheNodes.value[id];

            return res.data;
        } catch (e) {
            console.error(`Error saving node: ${e.message}`);
            throw e;
        }
    }

    return {
        currentNode,
        currentSections,
        currentCitations,
        setNode,
        updateNode,
        createSection,
        updateSection,
        deleteSection,
        createNodeCitation,
        createSectionCitation,
        updateNodeCitation,
        updateSectionCitation,
        removeNodeCitation,
        removeSectionCitation,
    };
});
