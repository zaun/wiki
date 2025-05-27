/**
 * @file storage/node.js
 * @description 
 */

import { int } from 'neo4j-driver';
import { v7 as uuidv7 } from 'uuid';
import { session } from '../storage/neo4j.js';
/**
 * Private Constants
 */
const MAX_CHILD_DEPTH = 2;

/**
 * Public Constants
 */
export const NODE_ROOT_ID = '00000000-0000-0000-0000-000000000000';
export const VALID_CROP_PROPS = ['height', 'width', 'x', 'y'];
export const VALID_DETAIL_TYPES = ['currency', 'date', 'header', 'link', 'list', 'number', 'text', 'image'];
export const VALID_RELATIONSHIPS = ['DEPENDS_ON', 'CONTRASTS_WITH', 'CONTAINS', 'INVALIDATES'];

/**
 * Fetches direct children of a Node.
 *
 * @param {string} id
 * @returns {Promise<Array<{id:string,title:string,status:string}>>}
 */
export async function dbNodeChildren(id) {
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
 * Inserts a new Node (and optional details, image link, parent link,
 * relationships) into Neo4j and returns its new id.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.subtitle
 * @param {string} opts.content
 * @param {string} opts.parentId
 * @param {string[]} opts.aliases
 * @param {object[]} opts.details
 * @param {string[]} opts.links
 * @param {string[]} opts.tags
 * @param {string} opts.image
 * @param {object|null} opts.imageCrop
 * @param {object[]} opts.relationships
 * @returns {Promise<string>} the new node’s id
 */
export async function dbNodeCreate({
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
    const now = new Date().toISOString();
    const newId = uuidv7();
    const s = session();
    const tx = s.beginTransaction();

    try {
        // create the node
        await tx.run(`
            CREATE (n:Node {
                id:         $id,
                title:      $title,
                subtitle:   $subtitle,
                content:    $content,
                createdAt:  $now,
                updatedAt:  $now,
                status:     CASE WHEN $content='' THEN 'stub' ELSE 'complete' END,
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
            now,
            links: JSON.stringify(links),
            aliases,
            tags,
            crop: imageCrop,
        });

        // attach to parent
        await tx.run(`
            MATCH (parent:Node {id:$pid}), (child:Node {id:$cid})
            CREATE (parent)-[:HAS_CHILD]->(child)
        `, { pid: parentId || NODE_ROOT_ID, cid: newId });

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
            if (!VALID_RELATIONSHIPS.includes(r.relationship)) {
                continue
            }

            const rid = uuidv7();
            const leftId = r.left.id === 'SELF' ? newId : r.left.id;
            const rightId = r.right.id === 'SELF' ? newId : r.right.id;

            await tx.run(`
                MATCH (l:Node {id:$lid}), (r:Node {id:$rid})
                CREATE (l)-[rel:${r.relationship} {id:$relId}]->(r)
            `, { lid: leftId, rid: rightId, relId: rid })
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
 * Deletes a Node plus all its versions and any linked sections/section versions.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbNodeDelete(id) {
    const s = session();

    try {
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
 * Fetches a Node by ID, including:
 *  • its properties and ordered details
 *  • linked image
 *  • breadcrumbs (path from root)
 *  • up to 2 levels of nested children
 *  • additional relationships
 *  • parsed imageCrop, links, detail values
 *
 * @param {string} id
 * @returns {Promise<object|null>} the assembled node or null if not found
 */
export async function dbNodeFetch(id) {
    const s = session();

    let node, bcRes, chRes, relRes;
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
        chRes = await s.run(`
            MATCH path = (p:Node {id:$id})-[:HAS_CHILD*1..${MAX_CHILD_DEPTH}]->(d:Node)
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
    } finally {
        await s.close();
    }

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

    // Assemble
    return {
        ...node,
        links,
        breadcrumbs,
        children,
        relationships,
    };
}

/**
 * Fetches a page of archived versions for a given Node.
 *
 * @param {string} id           – node id
 * @param {number} page         – zero‐based page index
 * @param {number} pageSize     – number of items per page
 * @returns {Promise<{
 *   page: number,
 *   hasMore: boolean,
 *   results: Array<{id:string,title:string,createdAt:string}>
 * }>}
 */
export async function dbNodeHistory(id, page = 0, pageSize = 50) {
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
 * Moves a node under a new parent, ensuring no cycles.
 *
 * @param {string} childId
 * @param {string} newParentId
 * @throws {'NOT_FOUND'|'CIRCULAR'|Error}
 */
export async function dbNodeMove(childId, newParentId) {
    const s = session();
    const tx = s.beginTransaction();
    try {
        // ensure both nodes exist
        const checkRes = await tx.run(`
            MATCH (child:Node {id:$childId})
            MATCH (newParent:Node {id:$newParentId})
            RETURN child, newParent
        `, { childId, newParentId });

        if (!checkRes.records.length) {
            throw new Error('NOT_FOUND');
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
 * @param {string} id
 * @param {{
 *   title?:         string,
 *   subtitle?:    string,
 *   content?:       string,
 *   aliases?:       string[],
 *   links?:         string[],
 *   tags?:          string[],
 *   details?:       Array<{id?:string,label:string,type:string,value:any}>,
 *   image?:         string|'remove',
 *   imageCrop?:     object|null,
 *   relationships?: Array<{ left:{id:string}, relationship:string, right:{id:string} }>
 * }} opts
 */
export async function dbNodePatch(id, opts) {
    const {
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
    } = opts;

    const now = new Date().toISOString();
    const archiveId = uuidv7();
    const s = session();
    const tx = s.beginTransaction();

    try {
        // make sure node exists and grab its props
        const exist = await tx.run(`MATCH (n:Node {id:$id}) RETURN n`, { id });
        if (!exist.records.length) {
            throw new Error('NOT_FOUND');
        }

        // archive old version + its details
        await tx.run(`
            MATCH (n:Node {id:$id})
            OPTIONAL MATCH (n)-[rOld:HAS_DETAIL]->(dOld:Detail)
            WITH n, collect({
                label: dOld.label,
                type:  dOld.type,
                value: dOld.value,
                idx:   rOld.index
            }) AS oldDetails
            CREATE (arch:Node {
                id:         $archId,
                title:      n.title,
                subtitle: n.subtitle,
                content:    n.content,
                createdAt:  n.createdAt,
                updatedAt:  $now,
                status:     'archived',
                aliases:    n.aliases,
                tags:       n.tags,
                links:      n.links,
                imageCrop:  n.imageCrop
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
            CREATE (n)-[:PREVIOUS_VERSION_OF]->(arch)
        `, { id, archId: archiveId, now });

        // update details if provided
        if (opts.hasOwnProperty('details')) {
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
        if (opts.hasOwnProperty('image')) {
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

        await tx.run(`
            MATCH (n:Node {id:$id})
            SET ${setClauses.join(',\n')}
        `, params);

        // imageCrop
        if (imageCrop) {
            await tx.run(`
                MATCH (n:Node {id:$id})
                FOREACH (_ IN CASE WHEN $imageCrop IS NOT NULL THEN [1] ELSE [] END |
                    SET n.imageCrop = $imageCrop
                )
                FOREACH (_ IN CASE WHEN $imageCrop IS NULL THEN [1] ELSE [] END |
                    REMOVE n.imageCrop
                )
            `, { id, imageCrop });
        }

        // replace relationships if requested
        if (Array.isArray(opts.relationships)) {
            // delete old
            await tx.run(`
                MATCH (n:Node {id:$id})-[r]->() WHERE type(r) IN $types DELETE r
            `, { id, types: VALID_RELATIONSHIPS });
            await tx.run(`
                MATCH ()-[r]->(n:Node {id:$id}) WHERE type(r) IN $types DELETE r
            `, { id, types: VALID_RELATIONSHIPS });

            // create new
            for (const r of relationships) {
                if (!VALID_RELATIONSHIPS.includes(r.relationship)) {
                    continue;
                }

                const leftId = r.left.id === 'SELF' ? id : r.left.id;
                const rightId = r.right.id === 'SELF' ? id : r.right.id;
                const relId = uuidv7();

                await tx.run(`
                    MATCH (l:Node {id:$left}), (m:Node {id:$right})
                    CREATE (l)-[rel:${r.relationship} {id:$rid}]->(m)
                `, { left: leftId, right: rightId, rid: relId });
            }
        }

        await tx.commit();
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Fetches a subtree of Nodes up to a given depth.
 *
 * @param {string} id
 * @param {number} depth
 * @returns {Promise<{id:string,parentId:string|null,title:string,children:Array}>}
 */
export async function dbNodeTree(id, depth = 100) {
    const s = session();
    if (!Number.isInteger(depth) || depth < 1 || depth > 100) {
        throw new TypeError(
            'Parameter "depth" must be an integer between 1 and 100'
        );
    }
    try {
        const cypher = `
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
        n.subtitle AS subtitle
    `;
        const result = await s.run(cypher, { id });

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

