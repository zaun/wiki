/**
 * @file storage/page.js
 * @description
 */

import { session } from './neo4j.js';
import { PAGE_ROOT_ID } from './special.js';

/**
 * Inserts a new Page into Neo4j and returns its new id.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.subtitle
 * @param {string} opts.content
 * @returns {Promise<string>} the new node’s id
 */
export async function dbPageCreate({
    title,
    subtitle,
    content,
}) {
    const now = new Date().toISOString();
    // Your original logic: ID derived from title
    const newId = title.replace(/\s+/g, '-').toLowerCase();
    const s = session();
    const tx = s.beginTransaction();

    try {
        // create the node
        await tx.run(`
            CREATE (p:Page {
                id: $id,
                title: $title,
                subtitle: $subtitle,
                content: $content,
                createdAt: $now,
                updatedAt: $now
            })
        `, {
            id: newId,
            title,
            subtitle,
            content: JSON.stringify(content),
            now,
        });

        // Your original logic: Always attach to PAGE_ROOT_ID
        await tx.run(`
            MATCH (parent:Node {id:$pid}), (child:Page {id:$cid})
            CREATE (parent)-[:HAS_CHILD]->(child)
        `, { pid: PAGE_ROOT_ID, cid: newId });

        await tx.commit();
        return newId;
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Deletes a Page and its link to the ROOT page.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbPageDelete(id) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        await tx.run(`
            MATCH (p:Page {id:$id})
            DETACH DELETE p
        `, { id });
        await tx.commit();
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Fetches a Page by ID
 *
 * @param {string} id
 * @returns {Promise<object|null>} the assembled node or null if not found
 */
export async function dbPageFetch(id) {
    const s = session();

    let page;
    try {
        // Fetch only the page, without any breadcrumb logic
        const nodeRes = await s.run(`
            MATCH (p:Page {id:$id})
            RETURN p AS page
        `, { id });

        if (!nodeRes.records.length) {
            return null;
        }

        const record = nodeRes.records[0];
        page = record.get('page').properties;


    } finally {
        await s.close();
    }

    page.content = JSON.parse(page.content);
    return page;
}

/**
 * Update the current page in place.
 *
 * @param {string} id
 * @param {{
 * title?:         string,
 * subtitle?:      string,
 * content?:       string,
 * }} opts
 */
export async function dbPagePatch(id, opts) {
    const {
        title,
        content,
        subtitle,
    } = opts;

    const now = new Date().toISOString();
    const s = session();
    const tx = s.beginTransaction();

    try {
        // make sure node exists and grab its props
        const exist = await tx.run(`MATCH (p:Page {id:$id}) RETURN p`, { id });
        if (!exist.records.length) {
            throw new Error('NOT_FOUND');
        }

        // update the node’s own props
        const setClauses = [];
        const params = {
            id,
            now
        };

        if (title !== undefined) {
            setClauses.push('p.title = $title');
            params.title = title;
        }
        if (subtitle !== undefined) {
            setClauses.push('p.subtitle = $subtitle');
            params.subtitle = subtitle;
        }
        if (content !== undefined) {
            setClauses.push('p.content = $content');
            params.content = JSON.stringify(content);
        }
        setClauses.push(`p.updatedAt = $now`);

        await tx.run(`
            MATCH (p:Page {id:$id})
            SET ${setClauses.join(',\n')}
        `, params);

        await tx.commit();
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}
