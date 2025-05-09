/**
 * @file src/stores/cache.js
 * @description
 *   A Pinia store that maintains in‑memory caches of nodes, sections, and citations,
 *   and persists them to IndexedDB via idb. Provides a clearCache() utility to wipe
 *   both in‑memory and persisted stores.
 */

import { openDB } from 'idb';
import { defineStore } from 'pinia';
import { ref, watch, toRaw } from 'vue';

/**
 * @typedef {Object} CitationGroup
 * @property {string} type     - The citation group type
 * @property {string} id       - The citation group ID
 * @property {number} order    - The display order within the parent
 * @property {Array<Object>} citations - The array of citation objects
 */

/**
 * Pinia store for caching nodes, sections, and citations
 * @returns {{
 *   cacheNodes: import('vue').Ref<Record<string, any>>,
 *   cacheSections: import('vue').Ref<Record<string, any[]>>,
 *   cacheCitations: import('vue').Ref<Record<string, CitationGroup[]>>,
 *   clearCache: () => Promise<void>
 * }}
 */
export const useCache = defineStore('cache', () => {
    const cacheNodes = ref({});
    const cacheSections = ref({});
    const cacheCitations = ref({});
    let db = null;

    /**
     * Watcher: persists any change to cacheNodes into the 'nodes' object store
     */
    watch(
        cacheNodes,
        async (nodes) => {
            if (!db) await init();
            const tx = db.transaction('nodes', 'readwrite');
            for (const [_id, node] of Object.entries(nodes)) {
                await tx.store.put(toRaw(node));
            }
            await tx.done;
        },
        { deep: true },
    );

    /**
     * Watcher: persists any change to cacheSections into the 'sections' object store
     */
    watch(
        cacheSections,
        async (sectionsMap) => {
            if (!db) await init();
            const tx = db.transaction('sections', 'readwrite');
            for (const [parentId, secs] of Object.entries(sectionsMap)) {
                for (const sec of secs) {
                    await tx.store.put({ ...toRaw(sec), parentId });
                }
            }
            await tx.done;
        },
        { deep: true },
    );

    /**
     * Watcher: persists any change to cacheCitations into the 'citations' object store
     */
    watch(
        cacheCitations,
        async (citsMap) => {
            if (!db) await init();
            const tx = db.transaction('citations', 'readwrite');
            for (const [parentId, grps] of Object.entries(citsMap)) {
                for (const grp of grps) {
                    await tx.store.put({
                        parentId,
                        type: grp.type,
                        id: grp.id,
                        order: grp.order,
                        citations: grp.citations.map((c) => toRaw(c)),
                    });
                }
            }
            await tx.done;
        },
        { deep: true },
    );

    /**
     * Lazily initialize IndexedDB and hydrate in‑memory caches
     * @async
     * @returns {Promise<void>}
     */
    async function init() {
        if (db) return;
        db = await openDB('UnendingWiki', 1, {
            upgrade(store) {
                store.createObjectStore('nodes', { keyPath: 'id' });
                store.createObjectStore('sections', { keyPath: 'id' });
                store.createObjectStore('citations', { keyPath: ['parentId', 'type', 'id'] });
            },
        });

        const [allNodes, allSections, allCits] = await Promise.all([
            db.getAll('nodes'),
            db.getAll('sections'),
            db.getAll('citations'),
        ]);

        allNodes.forEach((n) => {
            cacheNodes.value[n.id] = n;
        });
        allSections.forEach((s) => {
            cacheSections.value[s.parentId] ||= [];
            cacheSections.value[s.parentId].push(s);
        });
        allCits.forEach((c) => {
            cacheCitations.value[c.parentId] ||= [];
            cacheCitations.value[c.parentId].push({
                type: c.type,
                id: c.id,
                order: c.order,
                citations: c.citations,
            });
        });
    }
    init();

    /**
     * Clear both the in‑memory refs and all persisted IndexedDB stores.
     * @async
     * @returns {Promise<void>}
     */
    async function clearCache() {
        if (!db) await init();

        // clear IDB stores
        await Promise.all([
            db.clear('nodes'),
            db.clear('sections'),
            db.clear('citations'),
        ]);

        // reset in‑memory refs
        cacheNodes.value = {};
        cacheSections.value = {};
        cacheCitations.value = {};
    }

    return {
        cacheNodes,
        cacheSections,
        cacheCitations,
        clearCache,
    };
});
