/**
 * @file storage/node.js
 * @description 
 */

import { int } from 'neo4j-driver';
import { v7 as uuidv7 } from 'uuid';
import { session } from '../storage/neo4j.js';
import { NODE_ROOT_ID } from './special.js';
import {
    checkReadPermission,
    checkCreatePermission,
    checkEditPermission,
    checkDeletePermission,
    checkMovePermission,
    isMinorEdit
} from '../util.js';

/**
 * Private Constants
 */
const MAX_CHILD_DEPTH = 2;

/**
 * Public Constants
 */
export const VALID_CROP_PROPS = ['height', 'width', 'x', 'y'];
export const VALID_DETAIL_TYPES = ['currency', 'date', 'header', 'link', 'list', 'number', 'text', 'image'];
export const VALID_RELATIONSHIPS = ['DEPENDS_ON', 'CONTRASTS_WITH', 'CONTAINS', 'INVALIDATES'];

const RELATIONSHIP_QUERIES = VALID_RELATIONSHIPS.reduce((queries, relType) => {
    queries[relType] = `CREATE (l)-[:${relType} {id:$rid}]->(m)`;
    return queries;
}, {});

/**
 * Fetches direct children of a Node.
 *
 * @param {string} id - The parent node ID to fetch children for
 * @param {string} userId - ID of user requesting deletion (for audit)
 * @param {string[]} roles - User roles for permission checking
 * 
 * @returns {Promise<Array<{id:string,title:string,status:string}>>} Array of child node objects
 * 
 * @throws {Error} When id is invalid or node doesn't exist
 * 
 * @example
 * const children = await dbNodeChildren('node-123');
 */
export async function dbNodeChildren(id, userId, roles) {
    if (!id || typeof id !== 'string') {
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
            MATCH (parent:Node {id:$id})-[:HAS_CHILD]->(child:Node)
            RETURN child.id    AS id,
                child.title AS title,
                child.status AS status
        `, { id });

        return result.records.map(r => ({
            id: r.get('id'),
            title: r.get('title'),
            status: r.get('status'),
        }));
    } finally {
        await s.close();
    }
}

/**
 * Creates a new Node with optional details, relationships, and metadata.
 *
 * @param {string} userId - ID of the user creating the node
 * @param {string[]} roles - Array of user roles for permission checking
 * @param {object} opts - Node creation options
 * @param {string} opts.title - Required title for the node
 * @param {string} [opts.subtitle] - Optional subtitle
 * @param {string} [opts.content=''] - Node content, determines initial status
 * @param {string} opts.parentId - Parent node ID, defaults to NODE_ROOT_ID
 * @param {string[]} [opts.aliases] - Array of node aliases
 * @param {Array<{id?:string,label:string,type:string,value:any}>} [opts.details] - Array of detail objects
 * @param {string[]} [opts.links] - Array of external links
 * @param {string[]} [opts.tags] - Array of tags
 * @param {string} [opts.image] - Image ID to link to node
 * @param {object|null} [opts.imageCrop] - Image crop settings
 * @param {Array<{left:{id:string}, relationship:string, right:{id:string}}>} [opts.relationships] - Node relationships
 * 
 * @returns {Promise<string>} The new node's ID
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_ALIASES - When aliases is not an array
 * @throws {Error} INVALID_DETAILS - When details is not an array
 * @throws {Error} INVALID_DETAILS_STRUCTURE - When detail structure is malformed
 * @throws {Error} INVALID_LINKS - When links is not an array
 * @throws {Error} INVALID_TAGS - When tags is not an array
 * @throws {Error} INVALID_RELATIONSHIPS - When relationships contain invalid types
 * @throws {Error} INVALID_RELATIONSHIP_STRUCTURE - When relationship structure is malformed
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks required permissions
 * @throws {Error} PARENT_NODE_NOT_FOUND - When the parent node is not found
 */
export async function dbNodeCreate(userId, roles, {
    title,
    subtitle,
    content = '',
    parentId,
    aliases,
    details,
    links,
    tags,
    image,
    imageCrop,
    relationships,
}) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (aliases && !Array.isArray(aliases)) {
        throw new Error('INVALID_ALIASES');
    }

    if (details && details.length > 0) {
        if (!Array.isArray(details)) {
            throw new Error('INVALID_DETAILS');
        }
        
        const invalidDets = details.filter(d => 
            !VALID_DETAIL_TYPES.includes(d.type)
        );

        if (invalidDets.length > 0) {
            throw new Error(`INVALID_DETAILS: ${invalidDets.map(d => d.type).join(', ')}`);
        }

        details.forEach((d, index) => {
            if (!d.label || !d.type || !d.value) {
                throw new Error(`INVALID_DETAIL_STRUCTURE at index ${index}`);
            }
        });
    }

    if (links && !Array.isArray(links)) {
        throw new Error('INVALID_LINKS');
    }

    if (tags && !Array.isArray(tags)) {
        throw new Error('INVALID_TAGS');
    }

    if (relationships && relationships.length > 0) {
        if (!Array.isArray(relationships)) {
            throw new Error('INVALID_RELATIONSHIPS');
        }
        
        const invalidRels = relationships.filter(r => 
            !VALID_RELATIONSHIPS.includes(r.relationship)
        );

        if (invalidRels.length > 0) {
            throw new Error(`INVALID_RELATIONSHIPS: ${invalidRels.map(r => r.relationship).join(', ')}`);
        }

        relationships.forEach((r, index) => {
            if (!r.left?.id || !r.right?.id || !r.relationship) {
                throw new Error(`INVALID_RELATIONSHIP_STRUCTURE at index ${index}`);
            }
        });
    }

    let processedImageCrop = imageCrop;
    if (imageCrop && typeof imageCrop === 'object') {
        try {
            processedImageCrop = JSON.stringify(imageCrop);
        } catch {
            processedImageCrop = null;
        }
    }

    const pId = parentId || NODE_ROOT_ID;
    const now = new Date().toISOString();
    const newId = uuidv7();
    const s = session();
    const tx = s.beginTransaction();

    try {
        // Look up parent node and calculate level/domain for new node
        const parentInfoRes = await tx.run(`
            MATCH (parent:Node {id:$parentId})
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(parent)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN parent.title AS parentTitle,
                path IS NOT NULL AS hasPathToRoot,
                NOT EXISTS { (parent)<-[:HAS_CHILD]-() } AS isRootNode,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (parent)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS parentLevel,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS parentDomain
        `, { parentId: pId });
        
        if (!parentInfoRes.records.length) {
            throw new Error('PARENT_NODE_NOT_FOUND');
        }

        const record = parentInfoRes.records[0];
        const parentLevel = Number(record.get('parentLevel'));
        const parentDomain = record.get('parentDomain');
        const parentTitle = record.get('parentTitle');
        const hasPathToRoot = record.get('hasPathToRoot');
        const isRootNode = record.get('isRootNode');

        // Check for data integrity error: parent has parents but no path to root
        if (!hasPathToRoot && !isRootNode) {
            throw new Error('DATA_INTEGRITY_ERROR');
        }

        // Calculate new node's level and domain
        const level = parentLevel + 1;
        const domain = parentLevel === -1 ? parentTitle.toUpperCase() : parentDomain;

        const security = checkCreatePermission(roles, level, domain);

        if (!security.canCreate && !security.newPending) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        let status = 'stub';
        if (content) {
            status = 'complete';
        }

        if (security.newPending) {
            status = 'pending_new';
        }
        
        // create the node
        await tx.run(`
            CREATE (n:Node {
                id:         $id,
                title:      $title,
                subtitle:   $subtitle,
                content:    $content,
                createdAt:  $now,
                updatedAt:  $now,
                status:     $status,
                links:      $links,
                aliases:    $aliases,
                tags:       $tags
            })
            WITH n
            FOREACH (_ IN CASE WHEN $crop IS NOT NULL THEN [1] ELSE [] END |
                SET n.imageCrop = $crop
            )
        `, {
            id: newId,
            title,
            subtitle,
            content,
            status,
            now,
            links: JSON.stringify(links),
            aliases,
            tags,
            crop: processedImageCrop,
        });

        // Add creator link
        await tx.run(`
            MATCH (n:Node {id: $cid}), (u:User {id: $userId})
            CREATE (n)-[:CREATED_BY]->(u)
        `, { cid: newId, userId });

        // attach to parent
        await tx.run(`
            MATCH (parent:Node {id:$pId}), (child:Node {id:$cid})
            CREATE (parent)-[:HAS_CHILD]->(child)
        `, { pId, cid: newId });

        // details
        if (details.length) {
            const params = details.map((d, i) => ({
                did: d.id || uuidv7(),
                label: d.label,
                type: d.type,
                value: VALID_DETAIL_TYPES.includes(d.type)
                    ? JSON.stringify(d.value)
                    : d.value,
                idx: i,
            }));

            await tx.run(`
                UNWIND $params AS p
                CREATE (d:Detail {
                    id:        p.did,
                    label:     p.label,
                    type:      p.type,
                    value:     p.value,
                    createdAt: $now
                })
                WITH d,p
                MATCH (n:Node {id:$cid})
                CREATE (n)-[:HAS_DETAIL {index:p.idx}]->(d)
            `, { params, now, cid: newId });
        }

        // image link
        if (image) {
            await tx.run(`
                MATCH (n:Node {id:$cid}), (img:Image {id:$iid})
                CREATE (n)-[:HAS_IMAGE]->(img)
            `, { cid: newId, iid: image });
        }

        // relationships
        for (const r of relationships) {
            const relId = uuidv7();
            const leftId = r.left.id === 'SELF' ? newId : r.left.id;
            const rightId = r.right.id === 'SELF' ? newId : r.right.id;

            const query = RELATIONSHIP_QUERIES[r.relationship];
            if (!query) {
                throw new Error(`INVALID_RELATIONSHIPS: ${r.relationship}`);
            }

            await tx.run(`
                MATCH (l:Node {id:$left}), (m:Node {id:$right})
                ${query}
            `, { left: leftId, right: rightId, rid: relId });
        }

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
 * Permanently deletes a Node and all its versions, details, and relationships.
 * WARNING: This operation is irreversible.
 *
 * @param {string} id - The node ID to delete
 * @param {string} userId - ID of user requesting deletion (for audit)
 * @param {string[]} roles - User roles for permission checking
 * 
 * @returns {Promise<void>}
 * 
 * @throws {Error} INVALID_NODE_ID - When id is invalid
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks delete permissions
 * @throws {Error} NODE_NOT_FOUND - When node doesn't exist
 */
export async function dbNodeDelete(id, userId, roles) {
    if (!id || typeof id !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    const s = session();

    try {
        // Check if node exists and get permission info
        const checkRes = await s.run(`
            MATCH (n:Node {id:$id})
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN n,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (n)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS level,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS domain
        `, { id });

        if (!checkRes.records.length) {
            throw new Error('NODE_NOT_FOUND');
        }

        const record = checkRes.records[0];
        const level = record.get('level');
        const domain = record.get('domain');

        const canDelete = checkDeletePermission(roles, level, domain);

        if (!canDelete) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        await s.run(`
            MATCH (n:Node {id:$id})
            OPTIONAL MATCH (n)-[:PREVIOUS_VERSION_OF*0..]->(v)
            OPTIONAL MATCH (v)-[:HAS_SECTION]->(sec)
            OPTIONAL MATCH (sec)-[:PREVIOUS_VERSION_OF*0..]->(sv)
            DETACH DELETE n, v, sec, sv
        `, { id });
    } finally {
        await s.close();
    }
}

/**
 * Fetches a complete Node with all related data including details, relationships,
 * breadcrumbs, children tree, and linked images.
 *
 * @param {string} id - Node ID
 * @param {string} userId - The ID of the user making the changes
 * @param {string[]} roles - Array of user roles for permission checking
 * @param {string} title - Node title
 * @param {string} subtitle - Node subtitle
 * @param {string} content - Node content
 * @param {string} status - Node status (stub|complete|pending_*)
 * @param {Array} details - Ordered array of node details
 * @param {Array} breadcrumbs - Path from root to this node
 * @param {Array} children - Nested children up to MAX_CHILD_DEPTH levels
 * @param {Array} relationships - All related nodes with relationship types
 * @param {string|undefined} image - Linked image ID if present
 * @param {object|undefined} imageCrop - Image crop settings if present
 * @param {Array} links - External links array
 * 
 * @returns {Promise<object|null>} Complete node object with all relationships, or null if not found
 * 
 * @throws {Error} INVALID_NODE_ID - When id is invalid
 */
export async function dbNodeFetch(id, userId, roles) {
    if (!id || typeof id !== 'string') {
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

    let node, bcRes, chRes, relRes, contributorsRes;
    try {
        // Basic node + details
        const nodeRes = await s.run(`
            MATCH (n:Node {id:$id})
            OPTIONAL MATCH (n)-[r:HAS_DETAIL]->(d:Detail)
            WITH n, d, r
            ORDER BY r.index
            WITH n, collect(d { .id, .label, .type, .value, index: r.index })
            AS details
            RETURN n { .*, details } AS node
        `, { id });

        if (!nodeRes.records.length) {
            return null;
        }
        node = nodeRes.records[0].get('node');

        // Image
        const imgRes = await s.run(`
            MATCH (n:Node {id:$id})-[:HAS_IMAGE]->(img:Image)
            RETURN img { .id } AS image
        `, { id });
        node.image = imgRes.records.length ? imgRes.records[0].get('image').id : undefined;

        // Breadcrumbs
        bcRes = await s.run(`
            MATCH path = (a:Node)-[:HAS_CHILD*]->(n:Node {id:$id})
            WITH nodes(path) AS bn
            ORDER BY length(path) DESC
            LIMIT 1
            RETURN [x IN bn | { id: x.id, title: x.title }] AS crumbs
        `, { id });

        // Children tree
        const maxDepthValue = parseInt(MAX_CHILD_DEPTH);
        chRes = await s.run(`
            MATCH path = (p:Node {id:$id})-[:HAS_CHILD*1..${maxDepthValue}]->(d:Node)
            WITH nodes(path) AS pathList
            RETURN pathList
        `, { id });

        // Relationships
        relRes = await s.run(`
            UNWIND $types AS t
            MATCH (n:Node {id:$id})-[r]->(m:Node)
            WHERE type(r)=t
            RETURN { id:'SELF', title:n.title } AS left,
                type(r)                       AS relationship,
                { id:m.id, title:m.title }    AS right,
                r.id                           AS relId
            UNION
            UNWIND $types AS t2
            MATCH (m2:Node)-[r2]->(n:Node {id:$id})
            WHERE type(r2)=t2
            RETURN { id:m2.id, title:m2.title } AS left,
                type(r2)                        AS relationship,
                { id:'SELF', title:n.title }    AS right,
                r2.id                           AS relId
        `, { id, types: VALID_RELATIONSHIPS });

        // Get on contributors
        contributorsRes = await s.run(`
            MATCH (n:Node {id: $id})
            // Get current node creator
            OPTIONAL MATCH (n)-[:CREATED_BY]->(currentCreator:User)
            // Get all archived versions and their creators
            OPTIONAL MATCH (n)-[:PREVIOUS_VERSION_OF*]->(archived:Node)-[:CREATED_BY]->(archivedCreator:User)
            WITH collect(DISTINCT currentCreator) + collect(DISTINCT archivedCreator) AS allCreators
            UNWIND allCreators AS creator
            WITH DISTINCT creator
            WHERE creator IS NOT NULL
            RETURN collect(DISTINCT coalesce(creator.displayName, 'Anonymous')) AS contributors
        `, { id });
    } finally {
        await s.close();
    }

    const contributors = contributorsRes.records[0]?.get('contributors') || [];
    const breadcrumbs = bcRes.records[0]?.get('crumbs') || [];

    const treeMap = new Map();
    for (const rec of chRes.records) {
        const full = rec.get('pathList');
        const branch = full.slice(1);
        let cursor = treeMap;
        for (const nObj of branch) {
            const cid = nObj.properties.id;
            if (!cursor.has(cid)) {
                cursor.set(cid, {
                    id: cid,
                    title: nObj.properties.title,
                    children: new Map(),
                });
            }
            cursor = cursor.get(cid).children;
        }
    }
    const mapToJson = m => Array.from(m.values()).map(({ id, title, children }) => ({
        id,
        title,
        children: mapToJson(children),
    }));
    const children = mapToJson(treeMap);

    const relationships = relRes.records.map(r => ({
        id: r.get('relId'),
        left: r.get('left'),
        relationship: r.get('relationship'),
        right: r.get('right'),
    }));

    // Parse imageCrop
    if (node.imageCrop) {
        try {
            node.imageCrop = JSON.parse(node.imageCrop);
        } catch {
            delete node.imageCrop;
        }
    }

    // Coerce detail values
    node.details = node.details.map(d => {
        let value = d.value;
        delete d.index;
        if (VALID_DETAIL_TYPES.includes(d.type) && typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch {
                // leave as string
            }
        }
        return { ...d, value };
    })

    // Parse links
    let links = []
    if (typeof node.links === 'string') {
        try {
            links = JSON.parse(node.links);
        } catch {
            links = [];
        }
    }

    if (node.aiReview) {
        try {
            node.aiReview = JSON.parse(node.aiReview);
        } catch {
            delete node.aiReview;
        }
    }

    if (node.createdAt) {
        try {
            node.createdAt = new Date(node.createdAt).toISOString();
        } catch (e) {
            console.error("Error converting createdAt to ISO format:", e);
        }
    }

    if (node.updatedAt) {
        try {
            node.updatedAt = new Date(node.updatedAt).toISOString();
        } catch (e) {
            console.error("Error converting updatedAt to ISO format:", e);
        }
    }

    // Assemble
    return {
        ...node,
        links,
        breadcrumbs,
        children,
        relationships,
        contributors,
    };
}

/**
 * Fetches paginated archived versions for a Node.
 *
 * @param {string} id - The node ID to get history for
 * @param {string} userId - The ID of the user making the changes
 * @param {string[]} roles - Array of user roles for permission checking
 * @param {number} [page=0] - Zero-based page index
 * @param {number} [pageSize=50] - Items per page (max 100)
 * 
 * @returns {Promise<{page: number, hasMore: boolean, results: Array<{id:string,title:string,createdAt:string}>}>} Paginated history results
 * 
 * @throws {Error} INVALID_NODE_ID - When id is invalid
 * @throws {Error} INVALID_PAGINATION - When page or pageSize parameters are invalid
 */
export async function dbNodeHistory(id, userId, roles, page = 0, pageSize = 50) {
    if (!id || typeof id !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!Number.isInteger(page) || page < 0 || page > 100) {
        throw new Error('INVALID_PAGE');
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
        throw new Error('INVALID_PAGE_SIZE');
    }

    const security = checkReadPermission(roles);

    if (!security.canHistory) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const skip = page * pageSize;
    const s = session();
    try {
        const result = await s.run(`
            MATCH (current:Node {id:$id})
                    <-[:PREVIOUS_VERSION_OF*0..]-(v:Node)
            RETURN v.id        AS id,
                    v.title     AS title,
                    v.createdAt AS createdAt
            ORDER BY v.createdAt DESC
            SKIP $skip
            LIMIT $limit
        `, {
            id,
            skip: int(skip),
            limit: int(pageSize + 1),
        });

        const records = result.records;
        const pageRecords = records.slice(0, pageSize);

        return {
            page,
            hasMore: records.length > pageSize,
            results: pageRecords.map(r => ({
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
 * Moves a node under a new parent, with cycle detection and permission checking.
 *
 * @param {string} childId - ID of node to move
 * @param {string} newParentId - ID of new parent node
 * @param {string} userId - ID of user requesting the move
 * @param {string[]} roles - User roles for permission checking
 * 
 * @returns {Promise<void>}
 * 
 * @throws {Error} INVALID_NODE_ID - When either ID is invalid
 * @throws {Error} NODE_NOT_FOUND - When either node doesn't exist
 * @throws {Error} CIRCULAR - When move would create a cycle
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks move permissions
 */
export async function dbNodeMove(childId, newParentId, userId, roles) {

    if (!childId || typeof childId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!newParentId || typeof newParentId !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        // ensure both nodes exist
        const checkRes = await tx.run(`
            MATCH (child:Node {id:$childId})
            MATCH (newParent:Node {id:$newParentId})
            OPTIONAL MATCH childPath = (root1:Node)-[:HAS_CHILD*]->(child)
            WHERE NOT EXISTS { (root1)<-[:HAS_CHILD]-() }
            OPTIONAL MATCH parentPath = (root2:Node)-[:HAS_CHILD*]->(newParent)
            WHERE NOT EXISTS { (root2)<-[:HAS_CHILD]-() }
            RETURN child, newParent,
                CASE WHEN childPath IS NULL THEN 
                    CASE WHEN NOT EXISTS { (child)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(childPath)) - 2 
                END AS childLevel,
                CASE WHEN parentPath IS NULL THEN 
                    CASE WHEN NOT EXISTS { (newParent)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(parentPath)) - 2 
                END AS parentLevel,
                CASE WHEN childPath IS NOT NULL AND size(nodes(childPath)) > 1 
                    THEN nodes(childPath)[1].title 
                    ELSE null 
                END AS childDomain,
                CASE WHEN parentPath IS NOT NULL AND size(nodes(parentPath)) > 1 
                    THEN nodes(parentPath)[1].title 
                    ELSE null 
                END AS parentDomain
        `, { childId, newParentId });

        if (!checkRes.records.length) {
            throw new Error('NODE_NOT_FOUND');
        }

        const record = checkRes.records[0];
        const childDomain = record.get('childDomain');
        const parentDomain = record.get('parentDomain');

        const canMove = checkMovePermission(roles, childDomain, parentDomain);

        if (!canMove) {
            throw new Error('INSUFFICIENT_PERMISSIONS');
        }

        // prevent cycles: newParent must not be a descendant of child
        const circRes = await tx.run(`
            MATCH (child:Node {id:$childId})
            MATCH (descendant:Node)-[:HAS_CHILD*]->(child)
            WHERE descendant.id = $newParentId
            RETURN descendant
        `, { childId, newParentId });

        if (circRes.records.length) {
            throw new Error('CIRCULAR');
        }

        // remove existing parent link
        await tx.run(`
            MATCH (oldParent:Node)-[r:HAS_CHILD]->(child:Node {id:$childId})
            DELETE r
        `, { childId });

        // create new parent link
        await tx.run(`
            MATCH (newParent:Node {id:$newParentId}), (child:Node {id:$childId})
            CREATE (newParent)-[:HAS_CHILD]->(child)
        `, { childId, newParentId });

        await tx.commit();
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Archive the current node, apply in‐place updates, and (if provided)
 * replace all extra relationships.
 *
 * @param {string} id - The ID of the node to patch
 * @param {string} userId - The ID of the user making the changes
 * @param {string[]} roles - Array of user roles for permission checking
 * @param {object} opts - Update options
 * @param {string} [opts.title] - New title for the node
 * @param {string} [opts.subtitle] - New subtitle for the node
 * @param {string} [opts.content] - New content for the node
 * @param {string[]} [opts.aliases] - Array of node aliases
 * @param {string[]} [opts.links] - Array of external links
 * @param {string[]} [opts.tags] - Array of tags
 * @param {Array<{id?:string,label:string,type:string,value:any}>} [opts.details] - Array of detail objects
 * @param {string|'remove'} [opts.image] - Image ID to link or 'remove' to unlink
 * @param {object|null} [opts.imageCrop] - Image crop settings object or null to remove
 * @param {Array<{left:{id:string}, relationship:string, right:{id:string}}>} [opts.relationships] - Array of relationship definitions
 *
 * @returns {Promise<{id: string, status: string}>} Object with the node ID and status ('pending' or 'updated')
 * 
 * @throws {Error} INVALID_NODE_ID - When id is not a valid string
 * @throws {Error} INVALID_USER_ID - When userId is not a valid string
 * @throws {Error} INVALID_IMAGE_ID - When image is not a valid string
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_RELATIONSHIPS - When relationships array contains invalid relationship types
 * @throws {Error} NODE_NOT_FOUND - When the specified node doesn't exist
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks required permissions
 */
export async function dbNodePatch(id, userId, roles, {
    title,
    content,
    subtitle,
    aliases,
    links,
    tags,
    details,
    image,
    imageCrop,
    relationships,
}) {
    if (!id || typeof id !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (details && !Array.isArray(details)) {
        throw new Error('INVALID_DETAILS');
    }

    if (links && !Array.isArray(links)) {
        throw new Error('INVALID_LINKS');
    }

    if (tags && !Array.isArray(tags)) {
        throw new Error('INVALID_TAGS');
    }

    if (relationships && relationships.length > 0) {
        if (!Array.isArray(relationships)) {
            throw new Error('INVALID_RELATIONSHIPS');
        }
        
        const invalidRels = relationships.filter(r => 
            !VALID_RELATIONSHIPS.includes(r.relationship)
        );

        if (invalidRels.length > 0) {
            throw new Error(`INVALID_RELATIONSHIPS: ${invalidRels.map(r => r.relationship).join(', ')}`);
        }

        relationships.forEach((r, index) => {
            if (!r.left?.id || !r.right?.id || !r.relationship) {
                throw new Error(`INVALID_RELATIONSHIP_STRUCTURE at index ${index}`);
            }
        });
    }

    if (image !== undefined && image !== 'remove' && typeof image !== 'string') {
        throw new Error('INVALID_IMAGE_ID');
    }

    let processedImageCrop = imageCrop;
    if (imageCrop && typeof imageCrop === 'object') {
        try {
            processedImageCrop = JSON.stringify(imageCrop);
        } catch {
            processedImageCrop = null;
        }
    }

    const now = new Date().toISOString();
    const archiveId = uuidv7();
    const s = session();
    const tx = s.beginTransaction();

    let level = 0;
    let domain = null;
    let existingContent = '';
    let existingPending = false;

    try {
        // Make sure node exists and grab its props
        const nodeInfoRes = await tx.run(`
            MATCH (n:Node {id:$id})
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN n.content AS content, 
                n.status AS status,
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
        `, { id });

        if (!nodeInfoRes.records.length) {
            throw new Error('NODE_NOT_FOUND');
        }
        const record = nodeInfoRes.records[0];
        const hasPathToRoot = record.get('hasPathToRoot');
        const isRootNode = record.get('isRootNode');

        // Check for data integrity error: node has parents but no path to root
        if (!hasPathToRoot && !isRootNode) {
            throw new Error('DATA_INTEGRITY_ERROR');
        }

        existingContent = record.get('content') || '';
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
            const pendingNodeId = uuidv7();

            // Copy node and set its status to 'pending_update'.
            await tx.run(`
                MATCH (n:Node {id:$id})
                OPTIONAL MATCH (n)-[rOld:HAS_DETAIL]->(dOld:Detail)
                WITH n, collect({
                    label: dOld.label,
                    type:  dOld.type,
                    value: dOld.value,
                    idx:   rOld.index
                }) AS oldDetails
                // Capture existing details to copy them
                CREATE (pendingNode:Node {
                    id:          $pendingNodeId,
                    title:       n.title,
                    subtitle:    n.subtitle,
                    content:     n.content,
                    createdAt:   n.createdAt,
                    updatedAt:   $now,
                    status:      'pending',
                    aliases:     n.aliases,
                    tags:        n.tags,
                    links:       n.links,
                    imageCrop:   n.imageCrop
                })
                // Copy existing details to the pending node
                FOREACH (od IN oldDetails |
                    CREATE (pd:Detail {
                        id:        randomUUID(),
                        label:     od.label,
                        type:      od.type,
                        value:     od.value,
                        createdAt: $now
                    })
                    CREATE (pendingNode)-[:HAS_DETAIL {index:od.idx}]->(pd)
                )
                WITH n, oldDetails,
                    [(n)-[r]->(other) WHERE type(r) IN $validRelationships | {rel: r, node: other}] AS oldRelOut,
                    [(other)-[r]->(n) WHERE type(r) IN $validRelationships | {rel: r, node: other}] AS oldRelIn
                // Copy existing relationships (outgoing)
                FOREACH (r IN oldRelOut |
                    CREATE (pendingNode)-[newRel:HAS_REL_PENDING {
                        originalType: type(r.rel),
                        originalRelId: r.rel.id,
                        createdAt: $now
                    }]->(r.node)
                )
                // Copy existing relationships (incoming)
                FOREACH (r IN oldRelIn |
                    CREATE (r.node)-[newRel:HAS_REL_PENDING {
                        originalType: type(r.rel),
                        originalRelId: r.rel.id,
                        createdAt: $now
                    }]->(pendingNode)
                )
                // Add pending relationship
                CREATE (pendingNode)-[:PENDING_FOR { createdAt: $now, userId: $userId }]->(n)
            `, {
                id,
                pendingNodeId,
                userId,
                validRelationships: VALID_RELATIONSHIPS,
                now,
            });

            // Add creator link
            await tx.run(`
                MATCH (pendingNode:Node {id: $pendingNodeId}), (u:User {id: $userId})
                CREATE (pendingNode)-[:CREATED_BY]->(u)
            `, { pendingNodeId, userId });

            // update details if provided for the pending node
            if (details !== undefined) {
                // delete removed details from pending node
                const detailParams = details.map((d, i) => ({
                    detailId: d.id || uuidv7(),
                    label: d.label,
                    type: d.type,
                    value: VALID_DETAIL_TYPES.includes(d.type) ? JSON.stringify(d.value) : d.value,
                    idx: i,
                }));

                await tx.run(`
                    MATCH (n:Node {id:$pendingNodeId})
                    OPTIONAL MATCH (n)-[:HAS_DETAIL]->(old:Detail)
                    WITH collect(old.id) AS oldIds, $params AS newParams
                    UNWIND [x IN oldIds WHERE NOT x IN [p IN newParams | p.detailId]] AS toDel
                    MATCH (d:Detail {id:toDel})
                    DETACH DELETE d
                `, { pendingNodeId, params: detailParams });

                // upsert remaining and new details for pending node
                await tx.run(`
                    UNWIND $params AS p
                    MERGE (d:Detail {id:p.detailId})
                        ON CREATE SET d.createdAt = $now
                    SET d.label = p.label,
                        d.type  = p.type,
                        d.value = p.value
                    WITH d,p
                    MATCH (n:Node {id:$pendingNodeId})
                    MERGE (n)-[r:HAS_DETAIL]->(d)
                    SET r.index = p.idx
                `, { pendingNodeId, params: detailParams, now });
            }

            // unlink/link image if requested for pending node
            if (image !== undefined) {
                await tx.run(`MATCH (n:Node {id:$pendingNodeId})-[r:HAS_IMAGE]->() DELETE r`, { pendingNodeId });
                if (image && image !== 'remove') {
                    await tx.run(`
                        MATCH (n:Node {id:$pendingNodeId}), (img:Image {id:$imgId})
                        CREATE (n)-[:HAS_IMAGE]->(img)
                    `, { pendingNodeId, imgId: image });
                }
            }

            // update the pending node’s own props
            const setClauses = [];
            const removeClauses = [];

            const params = {
                pendingNodeId,
                now
            };

            if (title !== undefined) {
                setClauses.push('n.title = $title');
                params.title = title;
            }
            if (subtitle !== undefined) {
                setClauses.push('n.subtitle = $subtitle');
                params.subtitle = subtitle;
            }
            if (content !== undefined) {
                setClauses.push('n.content = $content');
                params.content = content;
            }
            if (aliases !== undefined) {
                setClauses.push('n.aliases = $aliases');
                params.aliases = aliases;
            }
            if (links !== undefined) {
                setClauses.push('n.links = $links');
                params.links = JSON.stringify(links);
            }
            if (tags !== undefined) {
                setClauses.push('n.tags = $tags');
                params.tags = tags;
            }

            // Status of pending node is always 'pending_update'
            setClauses.push(`n.updatedAt = $now`);
            setClauses.push(`n.status = 'pending_update'`);

            await tx.run(`
                MATCH (n:Node {id:$pendingNodeId})
                SET ${setClauses.join(',\n')}
                ${removeClauses.length ? `REMOVE ${removeClauses.join(',\n')}` : ''}
            `, params);

            // imageCrop for pending node
            if (imageCrop !== undefined) {
                await tx.run(`
                    MATCH (n:Node {id:$pendingNodeId})
                    FOREACH (_ IN CASE WHEN $imageCrop IS NOT NULL THEN [1] ELSE [] END |
                        SET n.imageCrop = $imageCrop
                    )
                    FOREACH (_ IN CASE WHEN $imageCrop IS NULL THEN [1] ELSE [] END |
                        REMOVE n.imageCrop
                    )
                `, { pendingNodeId, imageCrop: processedImageCrop });
            }

            // replace relationships if requested for pending node
            if (relationships && Array.isArray(relationships)) {
                // delete old relationships from the PENDING node
                await tx.run(`
                    MATCH (n:Node {id:$pendingNodeId})-[r]->() WHERE type(r) IN $types DELETE r
                `, { pendingNodeId, types: VALID_RELATIONSHIPS });
                await tx.run(`
                    MATCH ()-[r]->(n:Node {id:$pendingNodeId}) WHERE type(r) IN $types DELETE r
                `, { pendingNodeId, types: VALID_RELATIONSHIPS });

                // create new relationships for the PENDING node
                for (const r of relationships) {
                    const leftId = r.left.id === 'SELF' ? id : r.left.id;
                    const rightId = r.right.id === 'SELF' ? id : r.right.id;
                    const relId = uuidv7();

                    const query = RELATIONSHIP_QUERIES[r.relationship];
                    if (!query) {
                        throw new Error(`INVALID_RELATIONSHIPS: ${r.relationship}`);
                    }

                    await tx.run(`
                        MATCH (l:Node {id:$left}), (m:Node {id:$right})
                        ${query}
                    `, { left: leftId, right: rightId, rid: relId });
                }
            }

            await tx.commit();
            return { id: pendingNodeId, status: 'pending' };
        }

        // Not Pending, direct edit.
        else {
            // archive old version + its details
            await tx.run(`
                MATCH (n:Node {id:$id})
                OPTIONAL MATCH (n)-[rOld:HAS_DETAIL]->(dOld:Detail)
                OPTIONAL MATCH (n)-[:CREATED_BY]->(originalCreator:User)
                WITH n, originalCreator, collect({
                    label: dOld.label,
                    type:  dOld.type,
                    value: dOld.value,
                    idx:   rOld.index
                }) AS oldDetails
                CREATE (arch:Node {
                    id:         $archId,
                    title:      n.title,
                    subtitle:   n.subtitle,
                    content:    n.content,
                    createdAt:  n.createdAt,
                    updatedAt:  $now,
                    status:     'archived',
                    aliases:    n.aliases,
                    tags:       n.tags,
                    links:      n.links,
                    imageCrop:  n.imageCrop,
                    aiReview:   n.aiReview
                })
                FOREACH (od IN oldDetails |
                    CREATE (ad:Detail {
                        id:        randomUUID(),
                        label:     od.label,
                        type:      od.type,
                        value:     od.value,
                        createdAt: $now
                    })
                    CREATE (arch)-[:HAS_DETAIL {index:od.idx}]->(ad)
                )
                // Copy CREATED_BY to archive
                FOREACH (_ IN CASE WHEN originalCreator IS NOT NULL THEN [1] ELSE [] END |
                    CREATE (arch)-[:CREATED_BY]->(originalCreator)
                )
                CREATE (n)-[:PREVIOUS_VERSION_OF]->(arch)
            `, { id, archId: archiveId, now });

            // update details if provided
            if (details !== undefined) {
                // delete removed details
                const detailParams = details.map((d, i) => ({
                    detailId: d.id || uuidv7(),
                    label: d.label,
                    type: d.type,
                    value: VALID_DETAIL_TYPES.includes(d.type) ? JSON.stringify(d.value) : d.value,
                    idx: i,
                }));

                await tx.run(`
                    MATCH (n:Node {id:$id})
                    OPTIONAL MATCH (n)-[:HAS_DETAIL]->(old:Detail)
                    WITH collect(old.id) AS oldIds, $params AS newParams
                    UNWIND [x IN oldIds WHERE NOT x IN [p IN newParams | p.detailId]] AS toDel
                    MATCH (d:Detail {id:toDel})
                    DETACH DELETE d
                `, { id, params: detailParams });

                // upsert remaining and new
                await tx.run(`
                    UNWIND $params AS p
                    MERGE (d:Detail {id:p.detailId})
                        ON CREATE SET d.createdAt = $now
                    SET d.label = p.label,
                        d.type  = p.type,
                        d.value = p.value
                    WITH d,p
                    MATCH (n:Node {id:$id})
                    MERGE (n)-[r:HAS_DETAIL]->(d)
                    SET r.index = p.idx
                `, { id, params: detailParams, now });
            }

            // unlink/link image if requested
            if (image !== undefined) {
                await tx.run(`MATCH (n:Node {id:$id})-[r:HAS_IMAGE]->() DELETE r`, { id });
                if (image && image !== 'remove') {
                    await tx.run(`
                        MATCH (n:Node {id:$id}), (img:Image {id:$imgId})
                        CREATE (n)-[:HAS_IMAGE]->(img)
                    `, { id, imgId: image });
                }
            }

            // update the node’s own props
            const setClauses = [];
            const removeClauses = [];

            const params = {
                id,
                now
            };

            if (title !== undefined) {
                setClauses.push('n.title = $title');
                params.title = title;
            }
            if (subtitle !== undefined) {
                setClauses.push('n.subtitle = $subtitle');
                params.subtitle = subtitle;
            }
            if (content !== undefined) {
                setClauses.push('n.content = $content');
                params.content = content;
            }
            if (aliases !== undefined) {
                setClauses.push('n.aliases = $aliases');
                params.aliases = aliases;
            }
            if (links !== undefined) {
                setClauses.push('n.links = $links');
                params.links = JSON.stringify(links);
            }
            if (tags !== undefined) {
                setClauses.push('n.tags = $tags');
                params.tags = tags;
            }

            // status always based on final content
            setClauses.push(`n.updatedAt = $now`);
            setClauses.push(`n.status = CASE 
                WHEN n.content = '' THEN 'stub'
                ELSE 'complete' END
            `);

            // Remove the existing ai review
            removeClauses.push('n.aiReview');

            await tx.run(`
                MATCH (n:Node {id:$id})
                SET ${setClauses.join(',\n')}
                ${removeClauses.length ? `REMOVE ${removeClauses.join(',\n')}` : ''}
            `, params);

            // Update creator link
            await tx.run(`
                MATCH (n:Node {id: $id}), (editor:User {id: $userId})
                // Remove old CREATED_BY relationship
                OPTIONAL MATCH (n)-[oldCreated:CREATED_BY]->()
                DELETE oldCreated
                // Add new CREATED_BY relationship
                CREATE (n)-[:CREATED_BY]->(editor)
            `, { id, userId });

            // imageCrop
            if (imageCrop !== undefined) {
                await tx.run(`
                    MATCH (n:Node {id:$id})
                    FOREACH (_ IN CASE WHEN $imageCrop IS NOT NULL THEN [1] ELSE [] END |
                        SET n.imageCrop = $imageCrop
                    )
                    FOREACH (_ IN CASE WHEN $imageCrop IS NULL THEN [1] ELSE [] END |
                        REMOVE n.imageCrop
                    )
                `, { id, imageCrop: processedImageCrop });
            }

            // replace relationships if requested
            if (relationships && Array.isArray(relationships)) {
                // delete old
                await tx.run(`
                    MATCH (n:Node {id:$id})-[r]->() WHERE type(r) IN $types DELETE r
                `, { id, types: VALID_RELATIONSHIPS });
                await tx.run(`
                    MATCH ()-[r]->(n:Node {id:$id}) WHERE type(r) IN $types DELETE r
                `, { id, types: VALID_RELATIONSHIPS });

                // create new
                for (const r of relationships) {
                    const leftId = r.left.id === 'SELF' ? id : r.left.id;
                    const rightId = r.right.id === 'SELF' ? id : r.right.id;
                    const relId = uuidv7();

                    const query = RELATIONSHIP_QUERIES[r.relationship];
                    if (!query) {
                        throw new Error(`INVALID_RELATIONSHIPS: ${r.relationship}`);
                    }

                    await tx.run(`
                        MATCH (l:Node {id:$left}), (m:Node {id:$right})
                        ${query}
                    `, { left: leftId, right: rightId, rid: relId });
                }
            }

            await tx.commit();
            return { id, status: 'updated' };
        }
        
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Fetches a hierarchical subtree of Nodes up to specified depth.
 *
 * @param {string} id - Root node ID for the subtree
 * @param {string} userId - The ID of the user making the changes
 * @param {string[]} roles - Array of user roles for permission checking
 * @param {number} [depth=100] - Maximum depth to traverse (1-100)
 * 
 * @returns {Promise<{id:string,parentId:string|null,title:string,subtitle:string,children:Array}>} Hierarchical tree structure
 * 
 * @throws {Error} When depth is not a valid integer between 1-100
 * @throws {Error} INVALID_NODE_ID - When id is invalid
 * @throws {Error} NODE_NOT_FOUND - When root node doesn't exist
 */
export async function dbNodeTree(id, userId, roles, depth = 100) {
    if (!id || typeof id !== 'string') {
        throw new Error('INVALID_NODE_ID');
    }

    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!Number.isInteger(depth) || depth < 1 || depth > 100) {
        throw new Error('INVALID_DEPTH');
    }

    const security = checkReadPermission(roles);

    if (!security.canRead && !security.canExport) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    
    try {
        // Check if root node exists
        const rootCheck = await s.run(`
            MATCH (root:Node {id: $id})
            RETURN root
        `, { id });

        if (!rootCheck.records.length) {
            throw new Error('NODE_NOT_FOUND');
        }

        const result = await s.run(`
            MATCH (root:Node {id: $id})
            OPTIONAL MATCH (root)-[:HAS_CHILD*1..${depth}]->(descendant:Node)
            WITH root, collect(DISTINCT descendant) AS descendants
            WITH [root] + descendants AS allNodes
            UNWIND allNodes AS n
            OPTIONAL MATCH (parent:Node)-[:HAS_CHILD]->(n)
            RETURN
                n.id         AS id,
                parent.id    AS parentId,
                n.title      AS title,
                n.subtitle   AS subtitle
        `, { id });

        const rows = result.records.map(r => ({
            id: r.get('id'),
            parentId: r.get('parentId'),
            title: r.get('title'),
            subtitle: r.get('subtitle'),
            children: []
        }));

        const map = new Map(rows.map(node => [node.id, node]));
        rows.forEach(node => {
            if (node.parentId && map.has(node.parentId)) {
                map.get(node.parentId).children.push(node);
            }
        });

        return map.get(id);
    } finally {
        await s.close();
    }
}

/**
 * Approves a pending node update by archiving the current version and applying pending changes.
 *
 * @param {string} id - The pending node ID to approve
 * @param {string} userId - ID of user requesting approval
 * @param {string[]} roles - User roles for permission checking
 * 
 * @returns {Promise<{id: string, originalId: string}>} Object with pending ID and original node ID
 * 
 * @throws {Error} INVALID_NODE_ID - When id is invalid
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} PENDING_NODE_NOT_FOUND - When pending node doesn't exist
 * @throws {Error} NOT_PENDING - When node is not in pending status
 * @throws {Error} DATA_INTEGRITY_ERROR - When node has parents but no path to root
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks edit permissions
 */
export async function dbNodeApprove(id, userId, roles) {
    if (!id || typeof id !== 'string') {
        throw new Error('INVALID_NODE_ID');
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
        // Find pending node and its original target
        const pendingInfoRes = await tx.run(`
            MATCH (pending:Node {id: $id})-[:PENDING_FOR]->(original:Node)
            OPTIONAL MATCH path = (root:Node)-[:HAS_CHILD*]->(original)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            RETURN pending.status AS pendingStatus,
                original.id AS originalId,
                path IS NOT NULL AS hasPathToRoot,
                NOT EXISTS { (original)<-[:HAS_CHILD]-() } AS isRootNode,
                CASE WHEN path IS NULL THEN 
                    CASE WHEN NOT EXISTS { (original)<-[:HAS_CHILD]-() } THEN -1 ELSE 0 END
                    ELSE size(nodes(path)) - 2 
                END AS level,
                CASE WHEN path IS NOT NULL AND size(nodes(path)) > 1 
                    THEN nodes(path)[1].title 
                    ELSE null 
                END AS domain
        `, { id });

        if (!pendingInfoRes.records.length) {
            throw new Error('PENDING_NODE_NOT_FOUND');
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

        // Archive the original node with its details
        await tx.run(`
            MATCH (original:Node {id: $originalId})
            OPTIONAL MATCH (original)-[rOld:HAS_DETAIL]->(dOld:Detail)
            WITH original, collect({
                label: dOld.label,
                type:  dOld.type,
                value: dOld.value,
                idx:   rOld.index
            }) AS oldDetails
            CREATE (arch:Node {
                id:         $archiveId,
                title:      original.title,
                subtitle:   original.subtitle,
                content:    original.content,
                createdAt:  original.createdAt,
                updatedAt:  $now,
                status:     'archived',
                aliases:    original.aliases,
                tags:       original.tags,
                links:      original.links,
                imageCrop:  original.imageCrop,
                aiReview:   original.aiReview
            })
            FOREACH (od IN oldDetails |
                CREATE (ad:Detail {
                    id:        randomUUID(),
                    label:     od.label,
                    type:      od.type,
                    value:     od.value,
                    createdAt: $now
                })
                // Copy CREATED_BY to archive
                FOREACH (_ IN CASE WHEN originalCreator IS NOT NULL THEN [1] ELSE [] END |
                    CREATE (arch)-[:CREATED_BY]->(originalCreator)
                )
                CREATE (arch)-[:HAS_DETAIL {index:od.idx}]->(ad)
            )
            CREATE (original)-[:PREVIOUS_VERSION_OF]->(arch)
        `, { originalId, archiveId, now });

        // Copy pending node properties to original
        await tx.run(`
            MATCH (pending:Node {id: $id}), (original:Node {id: $originalId})
            SET original.title = pending.title,
                original.subtitle = pending.subtitle,
                original.content = pending.content,
                original.aliases = pending.aliases,
                original.tags = pending.tags,
                original.links = pending.links,
                original.imageCrop = pending.imageCrop,
                original.updatedAt = $now,
                original.status = CASE 
                    WHEN pending.content = '' THEN 'stub'
                    ELSE 'complete' END
            REMOVE original.aiReview
        `, { id, originalId, now });

        // Copy the creator, or use approver
        await tx.run(`
            MATCH (original:Node {id: $originalId}), (pending:Node {id: $id})
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
        `, { originalId, id, userId });

        // Delete original details and copy pending details
        await tx.run(`
            MATCH (original:Node {id: $originalId})
            OPTIONAL MATCH (original)-[:HAS_DETAIL]->(oldDetail:Detail)
            DETACH DELETE oldDetail
        `, { originalId });

        await tx.run(`
            MATCH (pending:Node {id: $id})-[r:HAS_DETAIL]->(pendingDetail:Detail),
                  (original:Node {id: $originalId})
            CREATE (newDetail:Detail {
                id:        randomUUID(),
                label:     pendingDetail.label,
                type:      pendingDetail.type,
                value:     pendingDetail.value,
                createdAt: $now
            })
            CREATE (original)-[:HAS_DETAIL {index: r.index}]->(newDetail)
        `, { id, originalId, now });

        // Delete original relationships and convert pending relationships
        await tx.run(`
            MATCH (original:Node {id: $originalId})-[r]->() 
            WHERE type(r) IN $types 
            DELETE r
        `, { originalId, types: VALID_RELATIONSHIPS });

        await tx.run(`
            MATCH ()-[r]->(original:Node {id: $originalId}) 
            WHERE type(r) IN $types 
            DELETE r
        `, { originalId, types: VALID_RELATIONSHIPS });

        // Convert HAS_REL_PENDING back to proper relationships
        await tx.run(`
            MATCH (pending:Node {id: $id})-[pendingRel:HAS_REL_PENDING]->(targetNode:Node)
            MATCH (original:Node {id: $originalId})
            WITH original, targetNode, pendingRel.originalType AS relType, 
                 coalesce(pendingRel.originalRelId, randomUUID()) AS relId
            CALL apoc.create.relationship(original, relType, {id: relId}, targetNode) YIELD rel
            RETURN count(rel) AS outgoingCount
        `, { id, originalId });

        await tx.run(`
            MATCH (sourceNode:Node)-[pendingRel:HAS_REL_PENDING]->(pending:Node {id: $id})
            MATCH (original:Node {id: $originalId})
            WITH sourceNode, original, pendingRel.originalType AS relType,
                 coalesce(pendingRel.originalRelId, randomUUID()) AS relId
            CALL apoc.create.relationship(sourceNode, relType, {id: relId}, original) YIELD rel
            RETURN count(rel) AS incomingCount
        `, { id, originalId });

        // Handle image relationships
        await tx.run(`
            MATCH (original:Node {id: $originalId})-[r:HAS_IMAGE]->()
            DELETE r
        `, { originalId });

        await tx.run(`
            MATCH (pending:Node {id: $id})-[:HAS_IMAGE]->(img:Image),
                  (original:Node {id: $originalId})
            CREATE (original)-[:HAS_IMAGE]->(img)
        `, { id, originalId });

        // Delete the pending node and all its relationships
        await tx.run(`
            MATCH (pending:Node {id: $id})
            DETACH DELETE pending
        `, { id });

        await tx.commit();
        return { id, originalId };
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}
