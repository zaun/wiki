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
    let initialized = false;
    let db = null;

    /**
     * Watcher: persists any change to cacheNodes into the 'nodes' object store
     */
    watch(
        cacheNodes,
        async (nodes) => {
            try {
                await init();
                const tx = db.transaction('nodes', 'readwrite');
                const keys = Object.keys(nodes);
                // console.log(`[cache] NODE ${keys.length} items`);
                for (const key of keys) {
                    const item = toRaw(nodes[key]);
                    if (item.id)  {
                        // console.log(`[cache] NODE -> ${item.title}`);
                        tx.store.put(item);
                    } else {
                        console.log(`[cache] NODE -! ${JSON.stringify(item)}`);
                    }
                }
                await tx.done;
            } catch(err) {
                console.error(err);
            }
        },
        { deep: true },
    );

    /**
     * Watcher: persists any change to cacheSections into the 'sections' object store
     */
    watch(
        cacheSections,
        async (sectionsMap) => {
            try {
                await init();
                const tx = db.transaction('sections', 'readwrite');
                const keys = Object.keys(sectionsMap);
                for (const key of keys) {
                    const sections = sectionsMap[key];
                    // console.log(`[cache] SECTION items ${sections.length} items`);
                    for (const sec of sections) {
                        const item = toRaw(sec);
                        // console.log(`[cache] SECTION -> ${item.title}`);
                        tx.store.put(item);
                    }
                }
                await tx.done;
            } catch(err) {
                console.error(err);
            }
        },
        { deep: true },
    );

    /**
     * Watcher: persists any change to cacheCitations into the 'citations' object store
     */
    watch(
        cacheCitations,
        async (citsMap) => {
            try {
                await init();
                const tx = db.transaction('citations', 'readwrite');
                const keys = Object.keys(citsMap);
                for (const key of keys) {
                    const citations = citsMap[key];
                    // console.log(`[cache] CITATION items ${citations.length} items`);
                    for (const cit of citations) {
                        const item = toRaw(cit);
                        item.nodeId = key;
                        // console.log(`[cache] CITATION -> ${item.type}-${item.id}`);
                        tx.store.put(item);
                    }
                }
                await tx.done;
            } catch(err) {
                console.error(err);
            }
        },
        { deep: true },
    );

    /**
     * Lazily initialize IndexedDB and hydrate in‑memory caches
     * @async
     * @returns {Promise<void>}
     */
    async function init() {
        if (initialized) {
            return initialized;
        }

        console.log('[cache] INIT');

        initialized = openDB('UnendingWiki', 1, {
            upgrade(store) {
                store.createObjectStore('nodes', { keyPath: 'id' });
                store.createObjectStore('sections', { keyPath: 'id' });
                store.createObjectStore('citations', { keyPath: ['type', 'id'] });
            },
        });
        db = await initialized;

        const [allNodes, allSections, allCits] = await Promise.all([
            db.getAll('nodes'),
            db.getAll('sections'),
            db.getAll('citations'),
        ]);

        allNodes.forEach((n) => {
            cacheNodes.value[n.id] = n;
        });

        console.log(`[cache] Loading from database: nodes=${allNodes.length} sections=${allSections.length} citations=${allCits.length}`);
        allSections.forEach((s) => {
            if (s.nodeId) {
                cacheSections.value[s.nodeId] ||= [];
                const idx = cacheSections.value[s.nodeId].findIndex((section) => section.id === s.id);
                if (idx === -1) {
                    cacheSections.value[s.nodeId].push(s);
                } else {
                    const incomingDate = new Date(s.createdAt);
                    const cachedDate = new Date(cacheSections.value[s.nodeId][idx].createdAt);
                    if (incomingDate > cachedDate) {
                        cacheSections.value[s.nodeId][idx] = s;
                    }
                }
            } else {
                console.log(`[cache] No node ID on section`, s);
            }
        });
        allCits.forEach((c) => {
            if (c.nodeId && c.type && c.id) {
                cacheCitations.value[c.nodeId] ||= [];
                const idx = cacheCitations.value[c.nodeId].findIndex((citation) => citation.id === c.id);
                if (idx === -1) {
                    cacheCitations.value[c.nodeId].push({
                        type: c.type,
                        id: c.id,
                        order: c.order,
                        citations: c.citations,
                        createdAt: c.createdAt,
                    });
                } else {
                    const incomingDate = new Date(c.createdAt);
                    const cachedDate = new Date(cacheCitations.value[c.nodeId][idx].createdAt);
                    if (incomingDate > cachedDate) {
                        cacheCitations.value[c.nodeId][idx] = {
                            type: c.type,
                            id: c.id,
                            order: c.order,
                            citations: c.citations,
                            createdAt: c.createdAt,
                        };
                    }
                }
            } else {
                console.log(`[cache] No node ID on citation`, c);
            }
        });

        allNodes.forEach((n) => {
            console.log(`Node ${n.id} has ${cacheSections.value[n.id].length} sections.`);
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
