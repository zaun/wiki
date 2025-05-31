/**
 * @file storage/special.js
 * @description 
 */
import { session } from './neo4j.js';

export const NODE_ROOT_ID = '00000000-0000-0000-0000-000000000000';
export const IMAGE_ROOT_ID = '00000000-0000-0000-0000-100000000000';
export const USER_ROOT_ID = '00000000-0000-0000-0000-200000000000';
export const PAGE_ROOT_ID = '00000000-0000-0000-0000-300000000000';

/**
 * @function createRootNode
 * @async
 * @description
 *   Ensures the “root” node (UUID `00000000-0000-0000-0000-000000000000`) exists.
 *
 * @example
 * ```js
 * import { createRoot } from './api/node.js';
 * await createRoot();
 * ```
 */
export async function createRootNode() {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const now = new Date().toISOString();

        const result = await tx.run('MATCH (n:Node {id: $id}) RETURN n', { id: NODE_ROOT_ID });

        if (result.records.length > 0) {
            await tx.commit();
            console.log('✅ Root node already exists.');
            return;
        }

        await tx.run(`
            CREATE (n:Node {
                id: $id,
                title: "Unending.Wiki",
                content: "",
                createdAt: $now,
                updatedAt: $now,
                status: "complete",
                links: "[]",
                aliases: [],
                tags: []
            })
        `, { id: NODE_ROOT_ID, now });

        await tx.commit();
        console.log('🌱 Root node created.');
    } catch (err) {
        await tx.rollback();
        console.error('❌ Failed to create root node:', err);
        throw err;
    } finally {
        await s.close();
    }
}

export async function createRootImage() {
    const s = session();
    const tx = s.beginTransaction();
    const now = new Date().toISOString();

    try {
        const { records } = await tx.run('MATCH (r:ImageRoot {id: $id}) RETURN r', { id: IMAGE_ROOT_ID });
        if (records.length > 0) {
            await tx.commit();
            console.log('✅ Root image already exists.');
            return;
        }

        await tx.run(`
            CREATE (r:ImageRoot {
                id: $id,
                createdAt: $now,
                updatedAt: $now
            })
        `, { id: IMAGE_ROOT_ID, now });
        await tx.commit();
        console.log('🌱 ImageRoot created.');
    } catch (err) {
        await tx.rollback();
        console.error('❌ Failed to create ImageRoot:', err);
        throw err;
    } finally {
        await s.close();
    }
}

export async function createUserRoot() {
    const s = session();
    const tx = s.beginTransaction();
    const now = new Date().toISOString();

    try {
        const now = new Date().toISOString();

        const result = await tx.run('MATCH (n:User {id: $id}) RETURN n', { id: USER_ROOT_ID });

        if (result.records.length > 0) {
            await tx.commit();
            console.log('✅ Root user already exists.');
            return;
        }

        await tx.run(`
            CREATE (r:User {
                id: $id,
                updatedAt: $now
            })
        `, { id: USER_ROOT_ID, now });

        await tx.commit();
        console.log('🌱 Root node created.');
    } catch (err) {
        await tx.rollback();
        console.error('❌ Failed to create root user:', err);
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * @function createPageNode
 * @async
 * @description
 *   Ensures the “root” page (UUID `00000000-0000-0000-0000-000000000000`) exists.
 *
 */
export async function createPageNode() {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const now = new Date().toISOString();

        const result = await tx.run('MATCH (n:Page {id: $id}) RETURN n', { id: NODE_ROOT_ID });

        if (result.records.length > 0) {
            await tx.commit();
            console.log('✅ Root page already exists.');
            return;
        }

        await tx.run(`
            CREATE (n:Page {
                id: $id,
                title: "Unending.Wiki",
                content: "",
                createdAt: $now,
                updatedAt: $now
            })
        `, { id: PAGE_ROOT_ID, now });

        await tx.commit();
        console.log('🌱 Root page created.');
    } catch (err) {
        await tx.rollback();
        console.error('❌ Failed to create root page:', err);
        throw err;
    } finally {
        await s.close();
    }
}
