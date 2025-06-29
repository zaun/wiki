/**
 * @file storage/section.js
 * @description 
 */

import { int } from 'neo4j-driver';
import { v7 as uuidv7 } from 'uuid';
import { session } from '../storage/neo4j.js';
import {
    checkReadPermission,
    checkCreatePermission,
    checkEditPermission,
    checkDeletePermission,
    isMinorEdit
} from '../util.js';

export const SUPPORTED_TYPES = ['text', 'data-table', 'music-score'];

/**
 * Reorders all sections under a specific node. This is an edit operation on the node structure.
 *
 * @param {string} nodeId - ID of the node whose sections are to be reordered
 * @param {string} userId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {string[]} orderedIds - Array of section IDs in the new desired order
 * 
 * @returns {Promise<{id: string, status: string}>} Result with nodeId and status ('updated' or 'pending')
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_SECTION_ORDER - When orderedIds is invalid or incomplete
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks edit permissions
 * @throws {Error} NODE_NOT_FOUND - When node doesn't exist
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * 
 * @example
 * const result = await dbSectionBulkReorder('node123', 'user456', ['user:basic'], ['sec1', 'sec2', 'sec3']);
 * 
 * @fixme This is an edit in place, no pending support
 */
export async function dbSectionBulkReorder(nodeId, userId, roles, orderedIds) {
    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!Array.isArray(orderedIds)) {
        throw new Error('INVALID_SECTION_ORDER');
    }

    const s = session();
    const tx = s.beginTransaction();

    try {
        // Get node info and check permissions
        const nodeInfoRes = await tx.run(`
            MATCH (n:Node {id: $nodeId})
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN n,
                path IS NOT NULL AS hasPathToRoot,
                NOT EXISTS { (n)<-[:HAS_CHILD]-() } AS isRootNode,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (n)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS level,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS domain
        `, { nodeId });

        if (!nodeInfoRes.records.length) {
            throw new Error('NODE_NOT_FOUND');
        }

        const record = nodeInfoRes.records[0];
        const hasPathToRoot = record.get('hasPathToRoot');
        const isRootNode = record.get('isRootNode');
        const level = record.get('level');
        const domain = record.get('domain');

        // Check for data integrity error
        if (!hasPathToRoot && !isRootNode) {
            throw new Error('DATA_INTEGRITY_ERROR');
        }

        const security = checkEditPermission(roles, level, domain);
        if (!security.canEdit && !security.newPending) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        // Validate section IDs belong to this node
        const existingRes = await tx.run(`
            MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
            RETURN s.id AS id
        `, { nodeId });

        const existingIds = existingRes.records.map(r => r.get('id'));

        if (orderedIds.length !== existingIds.length || 
            !orderedIds.every(id => existingIds.includes(id))) {
            throw new Error('INVALID_SECTION_ORDER');
        }

        // Apply reordering directly (this is just a structural edit, not content change)
        for (let i = 0; i < orderedIds.length; i++) {
            await tx.run(`
                MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section {id: $sectionId})
                SET r.order = $index
            `, { nodeId, sectionId: orderedIds[i], index: int(i) });
        }

        await tx.commit();
        return { id: nodeId, status: 'updated' };
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Creates a new section under a node, following node's permission model.
 *
 * @param {string} nodeId - The ID of the parent node
 * @param {string} userId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {object} sectionData - The data for the new section
 * @param {string} sectionData.title - The title of the section
 * @param {string} [sectionData.content=''] - The main content of the section
 * @param {object|string} [sectionData.data=''] - Additional structured data for the section
 * @param {string} [sectionData.summary=''] - A summary of the section
 * @param {string} sectionData.type - The type of the section (must be in SUPPORTED_TYPES)
 * 
 * @returns {Promise<{id: string, status: string}>} Result with sectionId and status ('created' or 'pending')
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_SECTION_TYPE - When type is not supported
 * @throws {Error} INVALID_TITLE - When title is missing or invalid
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks create permissions
 * @throws {Error} NODE_NOT_FOUND - When node doesn't exist
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * 
 * @example
 * const result = await dbSectionCreate('node123', 'user456', ['user:basic'], {
 *   title: 'Introduction',
 *   content: 'This is the introduction section...',
 *   type: 'text'
 * });
 */
export async function dbSectionCreate(nodeId, userId, roles, {
    title,
    content = '',
    data = '',
    summary = '',
    type,
}) {
    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!title || typeof title !== 'string') {
        throw new Error('INVALID_TITLE');
    }

    if (!type || !SUPPORTED_TYPES.includes(type)) {
        throw new Error('INVALID_SECTION_TYPE');
    }

    const s = session();
    const tx = s.beginTransaction();
    const now = new Date().toISOString();
    const id = uuidv7();

    try {
        // Get node info and check permissions (same as node creation)
        const nodeInfoRes = await tx.run(`
            MATCH (n:Node {id: $nodeId})
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN n,
                path IS NOT NULL AS hasPathToRoot,
                NOT EXISTS { (n)<-[:HAS_CHILD]-() } AS isRootNode,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (n)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS level,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS domain
        `, { nodeId });

        if (!nodeInfoRes.records.length) {
            throw new Error('NODE_NOT_FOUND');
        }

        const record = nodeInfoRes.records[0];
        const hasPathToRoot = record.get('hasPathToRoot');
        const isRootNode = record.get('isRootNode');
        const level = record.get('level');
        const domain = record.get('domain');

        // Check for data integrity error
        if (!hasPathToRoot && !isRootNode) {
            throw new Error('DATA_INTEGRITY_ERROR');
        }

        const security = checkCreatePermission(roles, level, domain);
        if (!security.canCreate && !security.newPending) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        // Process content for chunking
        const rawContent = content;
        const rawData = JSON.stringify(data);
        const rawSummary = summary;
        let status = rawContent.trim() === '' ? 'stub' : 'complete';

        // If user needs pending workflow, mark as pending
        if (security.newPending) {
            status = 'pending_new';
        }

        let contentField = '';
        let contents = [];
        if (rawContent.length > 800_000) {
            for (let i = 0; i < rawContent.length; i += 800_000) {
                contents.push(rawContent.slice(i, i + 800_000));
            }
        } else {
            contentField = rawContent;
        }

        let dataField = '';
        let datas = [];
        if (rawData.length > 800_000) {
            for (let i = 0; i < rawData.length; i += 800_000) {
                datas.push(rawData.slice(i, i + 800_000));
            }
        } else {
            dataField = rawData;
        }

        let summaryField = '';
        let summaries = [];
        if (rawSummary.length > 800_000) {
            for (let i = 0; i < rawSummary.length; i += 800_000) {
                summaries.push(rawSummary.slice(i, i + 800_000));
            }
        } else {
            summaryField = rawSummary;
        }

        // Create section with atomic order assignment
        const createResult = await tx.run(`
            MATCH (n:Node {id: $nodeId})
            OPTIONAL MATCH (n)-[r:HAS_SECTION]->(:Section)
            WITH n, COALESCE(MAX(r.order), -1) + 1 AS nextOrder
            CREATE (s:Section {
                id: $id,
                title: $title,
                content: $content,
                contents: $contents,
                data: $data,
                datas: $datas,
                summary: $summary,
                summaries: $summaries,
                createdAt: $now,
                updatedAt: $now,
                type: $type,
                status: $status
            })
            CREATE (n)-[:HAS_SECTION {order: nextOrder}]->(s)
            RETURN s.id AS sectionId
        `, {
            nodeId,
            id,
            title,
            content: contentField,
            contents,
            data: dataField,
            datas,
            summary: summaryField,
            summaries,
            now,
            type,
            status
        });

        if (createResult.records.length === 0) {
            throw new Error('NODE_NOT_FOUND');
        }

        const newSection = createResult.records[0];
        const sectionId = newSection.get('sectionId');

        // After creating a new section
        await tx.run(`
            MATCH (s:Section {id: $sectionId}), (u:User {id: $userId})
            CREATE (s)-[:CREATED_BY]->(u)
        `, { sectionId, userId });

        await tx.commit();
        return { 
            id, 
            status: status 
        };
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Permanently deletes a section and its version history. Uses node's delete permissions.
 *
 * @param {string} nodeId - The ID of the parent node
 * @param {string} sectionId - The ID of the section to delete
 * @param {string} userId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * 
 * @returns {Promise<boolean>} True if the section was found and deleted
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_SECTION_ID - When sectionId is invalid
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks delete permissions
 * @throws {Error} NODE_NOT_FOUND - When node doesn't exist
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * 
 * @example
 * const deleted = await dbSectionDelete('node123', 'user456', ['moderator'], 'section789');
 * 
 * @fixme Should also delete any pending edits
 */
export async function dbSectionDelete(nodeId, sectionId, userId, roles) {
    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!sectionId || typeof sectionId !== 'string') {
        throw new Error('INVALID_SECTION_ID');
    }

    const s = session();
    const tx = s.beginTransaction();

    try {
        // Get node info and verify section exists
        const checkRes = await tx.run(`
            MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $sectionId})
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN s,
                path IS NOT NULL AS hasPathToRoot,
                NOT EXISTS { (n)<-[:HAS_CHILD]-() } AS isRootNode,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (n)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS level,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS domain
        `, { nodeId, sectionId });

        if (!checkRes.records.length) {
            return false; // Section not found for this node
        }

        const record = checkRes.records[0];
        const hasPathToRoot = record.get('hasPathToRoot');
        const isRootNode = record.get('isRootNode');
        const level = record.get('level');
        const domain = record.get('domain');

        // Check for data integrity error
        if (!hasPathToRoot && !isRootNode) {
            throw new Error('DATA_INTEGRITY_ERROR');
        }

        const canDelete = checkDeletePermission(roles, level, domain);
        if (!canDelete) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        // Delete the section and all its archived versions
        await tx.run(`
            MATCH (s:Section {id: $sectionId})
            OPTIONAL MATCH (s)-[:PREVIOUS_VERSION_OF*0..]->(v:Section)
            DETACH DELETE s, v
        `, { sectionId });

        await tx.commit();
        return true;
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Retrieves a specific section. Uses node's read permissions.
 *
 * @param {string} nodeId - The ID of the parent node
 * @param {string} sectionId - The ID of the section to retrieve
 * @param {string} userId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * 
 * @returns {Promise<object|null>} The section object or null if not found/no permission
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_SECTION_ID - When sectionId is invalid
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks read permissions
 * 
 * @example
 * const section = await dbSectionFetch('node123', 'user456', ['user:basic'], 'section789');
 */
export async function dbSectionFetch(nodeId, sectionId, userId, roles) {
    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!sectionId || typeof sectionId !== 'string') {
        throw new Error('INVALID_SECTION_ID');
    }

    const security = checkReadPermission(roles);
    if (!security.canRead) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    try {
        const result = await s.run(`
            MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $sectionId})
            RETURN s
        `, { nodeId, sectionId });

        if (result.records.length === 0) {
            return null;
        }

        const contributorsRes = await s.run(`
            MATCH (s:Section {id: $sectionId})
            // Get current section creator
            OPTIONAL MATCH (s)-[:CREATED_BY]->(currentCreator:User)
            // Get all archived versions and their creators
            OPTIONAL MATCH (s)-[:PREVIOUS_VERSION_OF*]->(archived:Section)-[:CREATED_BY]->(archivedCreator:User)
            WITH collect(DISTINCT currentCreator) + collect(DISTINCT archivedCreator) AS allCreators
            UNWIND allCreators AS creator
            WITH DISTINCT creator
            WHERE creator IS NOT NULL
            RETURN collect(DISTINCT coalesce(creator.displayName, 'Anonymous')) AS contributors
        `, { sectionId });

        const contributors = contributorsRes.records[0]?.get('contributors') || [];

        const section = { ...result.records[0].get('s').properties };

        // Process potential multi-part string properties
        if (section.content === '' && Array.isArray(section.contents) && section.contents.length > 0) {
            section.content = section.contents.join('');
        }
        delete section.contents;

        if (section.data === '' && Array.isArray(section.datas)) {
            section.data = section.datas.join('');
        }
        delete section.datas;

        // Parse 'data' property as JSON
        if (typeof section.data === 'string') {
            try {
                section.data = JSON.parse(section.data);
            } catch (e) {
                console.error(`Error parsing section data for section ${sectionId}:`, e);
                section.data = {};
            }
        }

        if (section.summary === '' && Array.isArray(section.summaries)) {
            section.summary = section.summaries.join('');
        }
        delete section.summaries;

        if (section.aiReview) {
            try {
                section.aiReview = JSON.parse(section.aiReview);
            } catch {
                delete section.aiReview;
            }
        }

        if (section.createdAt) {
            try {
                section.createdAt = new Date(section.createdAt).toISOString();
            } catch (e) {
                console.error("Error converting createdAt to ISO format:", e);
            }
        }

        if (section.updatedAt) {
            try {
                section.updatedAt = new Date(section.updatedAt).toISOString();
            } catch (e) {
                console.error("Error converting updatedAt to ISO format:", e);
            }
        }

        return {
            ...section,
            contributors,
            id: sectionId,
            nodeId,
        };
    } finally {
        await s.close();
    }
}

/**
 * Retrieves all sections for a given node. Uses node's read permissions.
 *
 * @param {string} nodeId - The ID of the node whose sections are to be fetched
 * @param {string} userId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * 
 * @returns {Promise<Array<object>>} An array of section objects ordered by their position
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks read permissions
 * 
 * @example
 * const sections = await dbSectionFetchAll('node123', 'user456', ['user:basic']);
 */
export async function dbSectionFetchAll(nodeId, userId, roles) {
    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    const security = checkReadPermission(roles);
    if (!security.canRead) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    try {
        const result = await s.run(`
            MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
            // Get contributors for each section
            OPTIONAL MATCH (s)-[:CREATED_BY]->(currentCreator:User)
            OPTIONAL MATCH (s)-[:PREVIOUS_VERSION_OF*]->(archived:Section)-[:CREATED_BY]->(archivedCreator:User)
            WITH s, r.order AS order,
                 collect(DISTINCT currentCreator) + collect(DISTINCT archivedCreator) AS allCreators
            UNWIND (CASE WHEN size(allCreators) = 0 THEN [null] ELSE allCreators END) AS creator
            WITH s, order, 
                 collect(DISTINCT CASE WHEN creator IS NOT NULL 
                                      THEN coalesce(creator.displayName, 'Anonymous') 
                                      ELSE null END) AS contributors
            RETURN s, order, [c IN contributors WHERE c IS NOT NULL] AS contributors
            ORDER BY order ASC
        `, { nodeId });

        return result.records.map(r => {
            const section = r.get('s').properties;
            const order = r.get('order');
            const contributors = r.get('contributors') || [];

            // Join contents array if content is blank
            if (section.content === '' && Array.isArray(section.contents)) {
                section.content = section.contents.join('');
            }
            delete section.contents;

            // Join datas array if data is blank and then parse it
            if (section.data === '' && Array.isArray(section.datas)) {
                section.data = section.datas.join('');
            }
            delete section.datas;

            // Parse 'data' property as JSON
            if (typeof section.data === 'string') {
                try {
                    section.data = JSON.parse(section.data);
                } catch (e) {
                    console.error(`Error parsing section data for section ${section.id}:`, e);
                    section.data = {};
                }
            }

            // Join summaries array if summary is blank
            if (section.summary === '' && Array.isArray(section.summaries)) {
                section.summary = section.summaries.join('');
            }
            delete section.summaries;

            if (section.aiReview) {
                try {
                    section.aiReview = JSON.parse(section.aiReview);
                } catch {
                    delete section.aiReview;
                }
            }

            if (section.createdAt) {
                try {
                    section.createdAt = new Date(section.createdAt).toISOString();
                } catch (e) {
                    console.error("Error converting createdAt to ISO format:", e);
                }
            }

            if (section.updatedAt) {
                try {
                    section.updatedAt = new Date(section.updatedAt).toISOString();
                } catch (e) {
                    console.error("Error converting updatedAt to ISO format:", e);
                }
            }

            return {
                ...section,
                order: int(order),
                nodeId,
                contributors,
            };
        });
    } finally {
        await s.close();
    }
}

/**
 * Fetches paginated archived versions for a section. Uses node's read permissions.
 *
 * @param {string} nodeId - The ID of the parent node
 * @param {string} sectionId - The ID of the section to retrieve history for
 * @param {string} userId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {number} [page=0] - Zero-based page index
 * @param {number} [pageSize=50] - Number of items per page (max 100)
 * 
 * @returns {Promise<{page: number, hasMore: boolean, results: Array<{id:string,title:string,createdAt:string}>}>} Paginated history results
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_SECTION_ID - When sectionId is invalid
 * @throws {Error} INVALID_PAGE - When page parameter is invalid
 * @throws {Error} INVALID_PAGE_SIZE - When pageSize parameter is invalid
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks history permissions
 * @throws {Error} SECTION_NOT_FOUND - When section doesn't exist for the node
 * 
 * @example
 * const history = await dbSectionHistory('node123', 'user456', ['moderator'], 'section789', 0, 25);
 */
export async function dbSectionHistory(nodeId, sectionId, userId, roles, page = 0, pageSize = 50) {
    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!sectionId || typeof sectionId !== 'string') {
        throw new Error('INVALID_SECTION_ID');
    }

    if (!Number.isInteger(page) || page < 0) {
        throw new Error('INVALID_PAGE');
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new Error('INVALID_PAGE_SIZE');
    }

    const security = checkReadPermission(roles);
    if (!security.canHistory) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    const skip = page * pageSize;

    try {
        // First, verify the section exists under the specified node
        const checkResult = await s.run(`
            MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $sectionId})
            RETURN s.id AS sectionExists
        `, { nodeId, sectionId });

        if (checkResult.records.length === 0) {
            throw new Error('SECTION_NOT_FOUND');
        }

        // Fetch the history
        const result = await s.run(`
            MATCH (current:Section {id: $sectionId})
            OPTIONAL MATCH (v:Section)-[:PREVIOUS_VERSION_OF*0..]->(current)
            RETURN DISTINCT v.id AS id, v.title AS title, v.createdAt AS createdAt
            ORDER BY createdAt DESC
            SKIP $skip LIMIT $limit
        `, {
            sectionId,
            skip: int(skip),
            limit: int(pageSize + 1),
        });

        const records = result.records.slice(0, pageSize);
        const hasMore = result.records.length > pageSize;

        return {
            page,
            hasMore,
            results: records.map(r => ({
                id: r.get('id'),
                title: r.get('title'),
                createdAt: r.get('createdAt'),
            })),
        };
    } finally {
        await s.close();
    }
}

/**
 * Moves a section to a new position (reordering). This is an edit operation on node structure.
 *
 * @param {string} nodeId - The ID of the parent node
 * @param {string} sectionId - The ID of the section to move
 * @param {string} userId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {number} toIndex - The target zero-based index for the section
 * 
 * @returns {Promise<{id: string, status: string}>} Result with nodeId and status ('updated' or 'pending')
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_SECTION_ID - When sectionId is invalid
 * @throws {Error} INVALID_INDEX - When toIndex is out of bounds
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks edit permissions
 * @throws {Error} NODE_NOT_FOUND - When node doesn't exist
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * 
 * @example
 * const result = await dbSectionMove('node123', 'user456', ['user:basic'], 'section789', 2);
 * 
 * @fixme This is an edit in place, no pending support
 */
export async function dbSectionMove(nodeId, sectionId, userId, roles, toIndex) {
    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!sectionId || typeof sectionId !== 'string') {
        throw new Error('INVALID_SECTION_ID');
    }

    if (!Number.isInteger(toIndex) || toIndex < 0) {
        throw new Error('INVALID_INDEX');
    }

    const s = session();
    const tx = s.beginTransaction();

    try {
        // Get node info and check permissions (edit permissions for reordering)
        const nodeInfoRes = await tx.run(`
            MATCH (n:Node {id: $nodeId})
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN n,
                path IS NOT NULL AS hasPathToRoot,
                NOT EXISTS { (n)<-[:HAS_CHILD]-() } AS isRootNode,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (n)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS level,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS domain
        `, { nodeId });

        if (!nodeInfoRes.records.length) {
            throw new Error('NODE_NOT_FOUND');
        }

        const record = nodeInfoRes.records[0];
        const hasPathToRoot = record.get('hasPathToRoot');
        const isRootNode = record.get('isRootNode');
        const level = record.get('level');
        const domain = record.get('domain');

        // Check for data integrity error
        if (!hasPathToRoot && !isRootNode) {
            throw new Error('DATA_INTEGRITY_ERROR');
        }

        const security = checkEditPermission(roles, level, domain);
        if (!security.canEdit && !security.newPending) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        // Get current section ordering
        const result = await tx.run(`
            MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
            RETURN s.id AS id, r.order AS order
            ORDER BY r.order
        `, { nodeId });

        let sectionIds = result.records.map(r => r.get('id'));

        if (!sectionIds.includes(sectionId)) {
            return { id: nodeId, status: 'not_found' };
        }

        if (toIndex >= sectionIds.length) {
            throw new Error('INVALID_INDEX');
        }

        // Reorder array logically
        sectionIds = sectionIds.filter(secId => secId !== sectionId);
        sectionIds.splice(toIndex, 0, sectionId);

        // Apply new order to all HAS_SECTION relationships
        for (let i = 0; i < sectionIds.length; i++) {
            await tx.run(`
                MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section {id: $currentSectionId})
                SET r.order = $newIndex
            `, { nodeId, currentSectionId: sectionIds[i], newIndex: int(i) });
        }

        await tx.commit();
        return { id: nodeId, status: 'updated' };
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Archives the current version of a section and updates it with new data.
 * Follows the same pending logic as node updates.
 *
 * @param {string} nodeId - The ID of the parent node
 * @param {string} sectionId - The ID of the section to be patched
 * @param {string} userId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {object} updates - The fields to update
 * @param {string} [updates.title] - The new title for the section
 * @param {string} [updates.content] - The new main content for the section
 * @param {object|string} [updates.data] - The new structured data for the section
 * @param {string} [updates.summary] - The new summary for the section
 * @param {string} [updates.type] - The new type for the section
 * 
 * @returns {Promise<{id: string, status: string}>} Object with section ID and update status ('updated' or 'pending')
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_SECTION_ID - When sectionId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_SECTION_TYPE - When type is not supported
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks edit permissions
 * @throws {Error} NODE_NOT_FOUND - When node doesn't exist
 * @throws {Error} SECTION_NOT_FOUND - When section doesn't exist for the node
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * 
 * @example
 * const result = await dbSectionPatch('node123', 'section789', 'user456', ['user:basic'], {
 *   title: 'Updated Title',
 *   content: 'Updated content...'
 * });
 */
export async function dbSectionPatch(nodeId, sectionId, userId, roles, {
    title,
    content,
    data,
    summary,
    type,
}) {
    const currentExecutionId = uuidv7(); // Unique ID for THIS specific function call
    console.log(`[${currentExecutionId}] dbSectionPatch START for sectionId: ${sectionId}`);

    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!sectionId || typeof sectionId !== 'string') {
        throw new Error('INVALID_SECTION_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (type && !SUPPORTED_TYPES.includes(type)) {
        throw new Error('INVALID_SECTION_TYPE');
    }

    let processedData = undefined;
    if (data !== undefined) {
        try {
            processedData = JSON.stringify(data);
        } catch {
            processedData = undefined;
        }
    }

    const now = new Date().toISOString();
    const s = session();
    const tx = s.beginTransaction();

    let level = 0;
    let domain = null;
    let existingContent = '';
    let existingPending = false;

    try {
        // Get node and section info, check permissions
        const sectionInfoRes = await tx.run(`
            MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $sectionId})
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN s.content AS content,
                s.contents AS contents,
                s.status AS status,
                path IS NOT NULL AS hasPathToRoot,
                NOT EXISTS { (n)<-[:HAS_CHILD]-() } AS isRootNode,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (n)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS level,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS domain
        `, { nodeId, sectionId });

        if (!sectionInfoRes.records.length) {
            throw new Error('SECTION_NOT_FOUND');
        }

        const record = sectionInfoRes.records[0];
        const hasPathToRoot = record.get('hasPathToRoot');
        const isRootNode = record.get('isRootNode');

        // Check for data integrity error
        if (!hasPathToRoot && !isRootNode) {
            throw new Error('DATA_INTEGRITY_ERROR');
        }

        existingContent = record.get('content') || '';
        const existingContents = record.get('contents') || [];
        if (existingContent === '' && Array.isArray(existingContents) && existingContents.length > 0) {
            existingContent = existingContents.join('');
        }

        existingPending = (record.get('status') === 'pending_update' || 
                          record.get('status') === 'pending_new');
        level = record.get('level');
        domain = record.get('domain') ? record.get('domain').toUpperCase() : null;

        // Security checks
        const security = checkEditPermission(roles, level, domain);
        if (security.canEdit === 'minor_only') {
            security.canEdit = isMinorEdit(existingContent, content);
        }
        if (security.newPending && existingPending) {
            security.canEdit = true;
            security.newPending = false;
        }

        if (!security.canEdit && !security.newPending) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        if (security.newPending) {
            const pendingSectionId = uuidv7();
            console.log(`[${currentExecutionId}] (Pending Logic) Generated pendingSectionId: ${pendingSectionId}`);
            console.log(`  Creading a pending section for ${sectionId} as ${pendingSectionId}`);

            // Copy section and set its status to 'pending_update'
            await tx.run(`
                MATCH (s:Section {id: $sectionId})
                CREATE (pendingSection:Section {
                    id:          $pendingSectionId,
                    title:       s.title,
                    content:     s.content,
                    contents:    s.contents,
                    data:        s.data,
                    datas:       s.datas,
                    summary:     s.summary,
                    summaries:   s.summaries,
                    type:        s.type,
                    createdAt:   s.createdAt,
                    updatedAt:   $now,
                    status:      'pending_update'
                })
                // Add CREATED_BY relationship for pending section
                WITH pendingSection
                MATCH (u:User {id: $userId})
                CREATE (pendingSection)-[:CREATED_BY]->(u)
                // Add pending relationship
                CREATE (pendingSection)-[:PENDING_FOR { createdAt: $now, userId: $userId }]->(s)
            `, {
                sectionId,
                pendingSectionId,
                userId,
                now,
            });

            // Update the pending section's properties
            const setClauses = [];
            const removeClauses = [];
            const params = { pendingSectionId, now };

            if (title !== undefined) {
                setClauses.push('s.title = $title');
                params.title = title;
            }
            if (type !== undefined) {
                setClauses.push('s.type = $type');
                params.type = type;
            }

            // Handle content chunking for pending section
            if (content !== undefined) {
                let newContents = [];
                if (content.length > 800_000) {
                    for (let i = 0; i < content.length; i += 800_000) {
                        newContents.push(content.slice(i, i + 800_000));
                    }
                    setClauses.push('s.content = ""');
                    setClauses.push('s.contents = $contents');
                    params.contents = newContents;
                } else {
                    setClauses.push('s.content = $content');
                    setClauses.push('s.contents = []');
                    params.content = content;
                }
            }

            // Handle data chunking for pending section
            if (processedData !== undefined) {
                let newDatas = [];
                if (processedData.length > 800_000) {
                    for (let i = 0; i < processedData.length; i += 800_000) {
                        newDatas.push(processedData.slice(i, i + 800_000));
                    }
                    setClauses.push('s.data = ""');
                    setClauses.push('s.datas = $datas');
                    params.datas = newDatas;
                } else {
                    setClauses.push('s.data = $data');
                    setClauses.push('s.datas = []');
                    params.data = processedData;
                }
            }

            // Handle summary chunking for pending section
            if (summary !== undefined) {
                let newSummaries = [];
                if (summary.length > 800_000) {
                    for (let i = 0; i < summary.length; i += 800_000) {
                        newSummaries.push(summary.slice(i, i + 800_000));
                    }
                    setClauses.push('s.summary = ""');
                    setClauses.push('s.summaries = $summaries');
                    params.summaries = newSummaries;
                } else {
                    setClauses.push('s.summary = $summary');
                    setClauses.push('s.summaries = []');
                    params.summary = summary;
                }
            }

            // Status of pending section is always 'pending_update'
            setClauses.push('s.updatedAt = $now');
            setClauses.push('s.status = "pending_update"');

            // Remove the existing ai review
            removeClauses.push('s.aiReview');

            await tx.run(`
                MATCH (s:Section {id: $pendingSectionId})
                SET ${setClauses.join(',\n')}
                ${removeClauses.length ? `REMOVE ${removeClauses.join(',\n')}` : ''}
            `, params);

            await tx.commit();
            console.log(`[${currentExecutionId}] (Pending Logic) Transaction committed. Pending section ID: ${pendingSectionId}`);
            return { id: pendingSectionId, status: 'pending' };
        }

        // Not Pending, direct edit
        else {
            const archiveId = uuidv7();
            console.log(`[${currentExecutionId}] (Direct Edit Logic) Generated archiveId: ${archiveId}`);

            const result = await tx.run('MATCH (s:Section {id: $archiveId}) RETURN s', { archiveId });
            if (result.records.length > 0) {
                console.log(`[${currentExecutionId}] ${archiveId} FOUND}`);
            } else {
                console.log(`[${currentExecutionId}] ${archiveId} NOT FOUND`);
            }

            // Archive old version
            await tx.run(`
                MATCH (s:Section {id: $sectionId})
                OPTIONAL MATCH (s)-[:CREATED_BY]->(originalCreator:User)
                CREATE (arch:Section {
                    id:        $archiveId,
                    title:     s.title,
                    content:   s.content,
                    contents:  s.contents,
                    data:      s.data,
                    datas:     s.datas,
                    summary:   s.summary,
                    summaries: s.summaries,
                    type:      s.type,
                    status:    'archived',
                    aiReview:  s.aiReview,
                    createdAt: s.createdAt,
                    updatedAt: $now
                })
                // Copy CREATED_BY to archive
                FOREACH (_ IN CASE WHEN originalCreator IS NOT NULL THEN [1] ELSE [] END |
                    CREATE (arch)-[:CREATED_BY]->(originalCreator)
                )
                CREATE (s)-[:PREVIOUS_VERSION_OF]->(arch)
            `, { sectionId, archiveId, now });

            // Update the section's properties
            const setClauses = [];
            const removeClauses = [];
            const params = { sectionId, now };

            if (title !== undefined) {
                setClauses.push('s.title = $title');
                params.title = title;
            }
            if (type !== undefined) {
                setClauses.push('s.type = $type');
                params.type = type;
            }

            // Handle content chunking
            if (content !== undefined) {
                let newContents = [];
                if (content.length > 800_000) {
                    for (let i = 0; i < content.length; i += 800_000) {
                        newContents.push(content.slice(i, i + 800_000));
                    }
                    setClauses.push('s.content = ""');
                    setClauses.push('s.contents = $contents');
                    params.contents = newContents;
                } else {
                    setClauses.push('s.content = $content');
                    setClauses.push('s.contents = []');
                    params.content = content;
                }
            }

            // Handle data chunking
            if (processedData !== undefined) {
                let newDatas = [];
                if (processedData.length > 800_000) {
                    for (let i = 0; i < processedData.length; i += 800_000) {
                        newDatas.push(processedData.slice(i, i + 800_000));
                    }
                    setClauses.push('s.data = ""');
                    setClauses.push('s.datas = $datas');
                    params.datas = newDatas;
                } else {
                    setClauses.push('s.data = $data');
                    setClauses.push('s.datas = []');
                    params.data = processedData;
                }
            }

            // Handle summary chunking
            if (summary !== undefined) {
                let newSummaries = [];
                if (summary.length > 800_000) {
                    for (let i = 0; i < summary.length; i += 800_000) {
                        newSummaries.push(summary.slice(i, i + 800_000));
                    }
                    setClauses.push('s.summary = ""');
                    setClauses.push('s.summaries = $summaries');
                    params.summaries = newSummaries;
                } else {
                    setClauses.push('s.summary = $summary');
                    setClauses.push('s.summaries = []');
                    params.summary = summary;
                }
            }

            // Status based on final content
            setClauses.push('s.updatedAt = $now');
            setClauses.push(`s.status = CASE 
                WHEN s.content = '' AND size(s.contents) = 0 AND s.summary = '' AND size(s.summaries) = 0 THEN 'stub'
                ELSE 'complete' END
            `);

            // Remove the existing ai review
            removeClauses.push('s.aiReview');

            await tx.run(`
                MATCH (s:Section {id: $sectionId})
                SET ${setClauses.join(',\n')}
                ${removeClauses.length ? `REMOVE ${removeClauses.join(',\n')}` : ''}
            `, params);

            await tx.run(`
                MATCH (s:Section {id: $sectionId}), (editor:User {id: $userId})
                // Remove old CREATED_BY relationship
                OPTIONAL MATCH (s)-[oldCreated:CREATED_BY]->()
                DELETE oldCreated
                // Add new CREATED_BY relationship
                CREATE (s)-[:CREATED_BY]->(editor)
            `, { sectionId, userId });

            await tx.commit();
            console.log(`[${currentExecutionId}] (Direct Edit Logic) Transaction committed. Section ID: ${sectionId}`);
            return { id: sectionId, status: 'updated' };
        }
    } catch (err) {
        await tx.rollback();
        console.error(`[${currentExecutionId}] Error patching section ${sectionId}:`, err);
        throw err;
    } finally {
        await s.close();
        console.log(`[${currentExecutionId}] dbSectionPatch END for sectionId: ${sectionId}`);
    }
}

/**
 * Approves a pending section update by archiving the current version and applying pending changes.
 *
 * @param {string} nodeId - The parent node ID
 * @param {string} sectionId - The pending section ID to approve
 * @param {string} userId - ID of user requesting approval
 * @param {string[]} roles - User roles for permission checking
 * 
 * @returns {Promise<{id: string, originalId: string}>} Object with pending ID and original section ID
 * 
 * @throws {Error} INVALID_NODE_ID - When nodeId is invalid
 * @throws {Error} INVALID_SECTION_ID - When sectionId is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} PENDING_SECTION_NOT_FOUND - When pending section doesn't exist
 * @throws {Error} NOT_PENDING - When section is not in pending status
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks edit permissions
 */
export async function dbSectionApprove(nodeId, sectionId, userId, roles) {
    if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!sectionId || typeof sectionId !== 'string') {
        throw new Error('INVALID_SECTION_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    const now = new Date().toISOString();
    const archiveId = uuidv7();
    const s = session();
    const tx = s.beginTransaction();

    try {
        // Find pending section and its original target
        const pendingInfoRes = await tx.run(`
            MATCH (pending:Section {id: $sectionId})-[:PENDING_FOR]->(original:Section)
            MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(original)
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN pending.status AS pendingStatus,
                original.id AS originalId,
                path IS NOT NULL AS hasPathToRoot,
                NOT EXISTS { (n)<-[:HAS_CHILD]-() } AS isRootNode,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (n)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS level,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS domain
        `, { nodeId, sectionId });

        if (!pendingInfoRes.records.length) {
            throw new Error('PENDING_SECTION_NOT_FOUND');
        }

        const record = pendingInfoRes.records[0];
        const pendingStatus = record.get('pendingStatus');
        const pendingUserId = -1; // FIXME
        const originalId = record.get('originalId');
        const hasPathToRoot = record.get('hasPathToRoot');
        const isRootNode = record.get('isRootNode');
        const level = record.get('level');
        const domain = record.get('domain') ? record.get('domain').toUpperCase() : null;

        if (pendingStatus !== 'pending_update' && pendingStatus !== 'pending_new') {
            throw new Error('NOT_PENDING');
        }

        // Check for data integrity error
        if (!hasPathToRoot && !isRootNode) {
            throw new Error('DATA_INTEGRITY_ERROR');
        }

        // Check permissions
        const security = checkModeratorPermission(roles, userId, pendingUserId, level, domain);
        if (!security.canEdit) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        // Archive the original section
        await tx.run(`
            MATCH (original:Section {id: $originalId})
            CREATE (arch:Section {
                id:        $archiveId,
                title:     original.title,
                content:   original.content,
                contents:  original.contents,
                data:      original.data,
                datas:     original.datas,
                summary:   original.summary,
                summaries: original.summaries,
                type:      original.type,
                status:    'archived',
                aiReview:  original.aiReview,
                createdAt: original.createdAt,
                updatedAt: $now
            })
            // Copy CREATED_BY to archive
            FOREACH (_ IN CASE WHEN originalCreator IS NOT NULL THEN [1] ELSE [] END |
                CREATE (arch)-[:CREATED_BY]->(originalCreator)
            )
            CREATE (original)-[:PREVIOUS_VERSION_OF]->(arch)
        `, { originalId, archiveId, now });

        // Copy pending section properties to original
        await tx.run(`
            MATCH (pending:Section {id: $sectionId}), (original:Section {id: $originalId})
            SET original.title = pending.title,
                original.content = pending.content,
                original.contents = pending.contents,
                original.data = pending.data,
                original.datas = pending.datas,
                original.summary = pending.summary,
                original.summaries = pending.summaries,
                original.type = pending.type,
                original.updatedAt = $now,
                original.status = CASE 
                    WHEN pending.content = '' AND size(pending.contents) = 0 AND 
                         pending.summary = '' AND size(pending.summaries) = 0 THEN 'stub'
                    ELSE 'complete' END
            REMOVE original.aiReview
        `, { sectionId, originalId, now });

        await tx.run(`
            MATCH (original:Section {id: $originalId}), (pending:Section {id: $sectionId})
            OPTIONAL MATCH (pending)-[:CREATED_BY]->(pendingCreator:User)
            // Remove old CREATED_BY from original
            OPTIONAL MATCH (original)-[oldCreated:CREATED_BY]->()
            DELETE oldCreated
            // Copy CREATED_BY from pending to original (or use approver if no pending creator)
            FOREACH (_ IN CASE WHEN pendingCreator IS NOT NULL THEN [1] ELSE [] END |
                CREATE (original)-[:CREATED_BY]->(pendingCreator)
            )
            WITH original, pendingCreator
            MATCH (approver:User {id: $userId})
            // If no pending creator, use approver
            FOREACH (_ IN CASE WHEN pendingCreator IS NULL THEN [1] ELSE [] END |
                CREATE (original)-[:CREATED_BY]->(approver)
            )
        `, { originalId, sectionId, userId });

        // Delete the pending section
        await tx.run(`
            MATCH (pending:Section {id: $sectionId})
            DETACH DELETE pending
        `, { sectionId });

        await tx.commit();
        return { id: sectionId, originalId };
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}
