/**
 * @file api/node.js
 * @description 
 */
import { session, verifyConnection } from '../storage/neo4j.js';
import { v7 as uuidv7 } from 'uuid';
import neo4j from 'neo4j-driver';

const VALID_DETAIL_TYPES = ['currency', 'date', 'header', 'link', 'list', 'number', 'text', 'image'];
const DETAIL_JSON_TYPES = new Set(['currency', 'link', 'list', 'image'])
const VALID_CROP_PROPS = ['height', 'width', 'x', 'y'];
const VALID_RELATIONSHIPS = ['DEPENDS_ON', 'CONTRASTS_WITH', 'CONTAINS', 'INVALIDATES'];

const ROOT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * @function validateNodeExtras
 * @description
 *   Validates the optional `aliases` and `tags` fields for a Node.
 *   - `aliases` must be an array of non‑empty strings (if provided)
 *   - `tags` must be an array of lowercase alphanumeric strings (if provided)
 *
 * @param {Object} input
 * @param {string[]} [input.aliases]       - Optional list of alternate names.
 * @param {Object[]} [input.details]       - Optional list of detail items (type, label, value).
 * @param {Object[]} [input.links]         - Optional list of link objects ({ match, href?, id?, title? }).
 * @param {string[]} [input.tags]          - Optional list of tags (lowercase alphanumeric).
 * @param {string[]} [input.relationships] - Optional list of relationships ({ left, relationship, right}).
 * @throws {Error} If either `aliases` or `tags` is invalid.
 */
export function validateNodeExtras({ aliases, details, links, tags, relationships }) {
    if (aliases !== undefined) {
        if (
            !Array.isArray(aliases) ||
            !aliases.every(a => typeof a === 'string' && a.trim() !== '')
        ) {
            throw new Error('Aliases must be an array of non-empty strings.');
        }
    }

    if (details !== undefined) {
        if (!Array.isArray(details)) {
            throw new Error('details must be an array')
        }
        details.forEach((d, i) => {
            const ctx = `details[${i}]`
            if (typeof d !== 'object' || d === null) {
                throw new Error(`${ctx} must be an object`)
            }
            const { type, label, value } = d
            if (!VALID_DETAIL_TYPES.includes(type)) {
                throw new Error(`${ctx}.type must be one of: ${VALID_DETAIL_TYPES.join(', ')}`)
            }
            switch (type) {
                case 'list':
                    if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
                        throw new Error(`${ctx}.value must be an array of strings for type "list"`)
                    }
                    break
                case 'header':
                    if (typeof label !== 'string' || label.trim() === '') {
                        throw new Error(`${ctx}.label is required and must be a non-empty string`)
                    }
                    if (value) {
                        throw new Error(`${ctx}.value must not be present for type "header"`)
                    }
                    break
                case 'text':
                    if (typeof value !== 'string') {
                        throw new Error(`${ctx}.value must be a string for type "text"`)
                    }
                    break
                case 'image':
                    if (typeof value !== 'object') {
                        throw new Error(`${ctx}.value must be a valid object for type "image"`)
                    }
                    if (typeof value.image !== 'string') {
                        throw new Error(`${ctx}. value.image must be a a valid uuid for type "image"`)
                    }
                    if (typeof value.aspectRatio !== 'string') {
                        throw new Error(`${ctx}. value.aspectRatio must be a a valid uuid for type "image"`)
                    }
                    if (typeof value.imageCrop !== 'object') {
                        throw new Error(`${ctx}.value.imageCrop must be a valid object for type "image"`)
                    }
                    if (typeof value.imageCrop.x !== 'number') {
                        throw new Error(`${ctx}. value.imageCrop.x must be a valid number for type "image"`)
                    }
                    if (typeof value.imageCrop.y !== 'number') {
                        throw new Error(`${ctx}. value.imageCrop.y must be a valid number for type "image"`)
                    }
                    if (typeof value.imageCrop.width !== 'number') {
                        throw new Error(`${ctx}. value.imageCrop.width must be a valid number for type "image"`)
                    }
                    if (typeof value.imageCrop.height !== 'number') {
                        throw new Error(`${ctx}. value.imageCrop.height must be a valid number for type "image"`)
                    }
                    break
                case 'date':
                    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
                        throw new Error(`${ctx}.value must be a valid ISO date string for type "date"`)
                    }
                    break
                case 'currency':
                    if (typeof value !== 'object') {
                        throw new Error(`${ctx}.value must be a valid object for type "currency"`)
                    }
                    if (typeof value.amount !== 'number') {
                        throw new Error(`${ctx}. value.amount must be a valid number for type "currency"`)
                    }
                    if (typeof value.year !== 'number' || value.year.toString().length !== 4) {
                        throw new Error(`${ctx}. value.year must be a valid 4 digit year for type "currency"`)
                    }
                    if (typeof value.currency !== 'string' || value.currency.length !== 3) {
                        throw new Error(`${ctx}. value.ycurrencyear must be a valid 3 digit letter code for type "currency"`)
                    }
                    break
            }
        })
    }

    if (links !== undefined) {
        if (!Array.isArray(links)) {
            throw new Error('Links must be an array of link objects.');
        }
        links.forEach((link, idx) => {
            const ctx = `links[${idx}]`;
            if (typeof link !== 'object' || link === null) {
                throw new Error(`${ctx} must be an object.`);
            }
            if (typeof link.url !== 'string' || link.url.trim() === '') {
                throw new Error(`${ctx}.url is required and must be a non-empty string.`);
            }
            if (typeof link.title !== 'string' || link.title.trim() === '') {
                throw new Error(`${ctx}.title is required and must be a non-empty string.`);
            }

            // validate URL format
            try {
                new URL(link.url);
            } catch {
                throw new Error(`${ctx}.url must be a valid URL.`);
            }
        });
    }

    if (tags !== undefined) {
        if (
            !Array.isArray(tags) ||
            !tags.every(t => typeof t === 'string' && /^[a-z0-9]+$/.test(t))
        ) {
            throw new Error('Tags must be an array of lowercase alphanumeric strings.');
        }
    }

    if (relationships !== undefined) {
        for (const rel of relationships) {
            if (typeof rel !== 'object' || rel === null) {
                throw new Error('each relationship must be an object');
            }
            const { left, relationship: type, right } = rel;

            if (!VALID_RELATIONSHIPS.includes(type)) {
                throw new Error(`relationship must be one of ${VALID_RELATIONSHIPS.join(', ')}`);
            }

            // both left and right must be objects with an `id` string
            if (
                typeof left !== 'object' || left === null || typeof left.id !== 'string' ||
                typeof right !== 'object' || right === null || typeof right.id !== 'string'
            ) {
                throw new Error('left and right must each be an object with an `id` string');
            }

            const leftIsSelf = left.id === 'SELF';
            const rightIsSelf = right.id === 'SELF';

            if (leftIsSelf === rightIsSelf) {
                throw new Error('exactly one of left.id or right.id must be "SELF"');
            }

            const otherId = leftIsSelf ? right.id : left.id;
            if (!/^[0-9a-fA-F\-]{36,}$/.test(otherId)) {
                throw new Error('the non-SELF side’s id must be a valid node ID string');
            }
        }
    }
}

/**
 * @function createRoot
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
export async function createRoot() {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const now = new Date().toISOString();

        const result = await tx.run('MATCH (n:Node {id: $id}) RETURN n', { id: ROOT_ID });

        if (result.records.length > 0) {
            await tx.commit();
            console.log('✅ Root node already exists.');
            return;
        }

        await tx.run(
            `CREATE (n:Node {
                id: $id,
                title: "Unending.Wiki",
                content: "",
                createdAt: $now,
                updatedAt: $now,
                status: "complete",
                links: "[]",
                aliases: [],
                tags: []
            })`,
            { id: ROOT_ID, now }
        );

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

/**
 * @function createNode
 * @async
 * @description
 *   HTTP POST / nodes — Creates a new Node (entity or category), optionally under a parent,
 *   and optionally creates additional relationships.
 *
 * Required body properties:
 *   • `title` (string)   – non‑empty  
 *
 * Optional body properties:
 *   • `content`  (string)  
 *   • `image.id` (string)  
 *   • `aliases`  (string[])  
 *   • `tags`     (string[])  
 *   • `details`  (string[])  
 *   • `links`    (string[])  
 *   • `parentId` (string) — UUID of an existing category  
 *   • `imageCrop` (object with numeric props from VALID_CROP_PROPS)  
 *   • `relationships` (array of { left, relationship, right })
 *
 * Relationship objects must have:
 *   • `relationship`: one of DEPENDS_ON, CONTRASTS_WITH, CONTAINS, INVALIDATES  
 *   • one of `left` or `right` === 'SELF', the other a valid node ID string  
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createNode(req, res) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const newId = uuidv7();
        const now = new Date().toISOString();
        const {
            title,
            content = '',
            parentId,
            aliases,
            details,
            links,
            tags,
            image,
            imageCrop,
            relationships,
        } = req.body;

        if (!title || typeof title !== 'string') {
            throw new Error('title is required and must be a non-empty string.');
        }

        if (image && typeof image !== 'string') {
            throw new Error('image must be a valid uuid string.');
        }

        let cleanImageCrop;
        if (imageCrop !== undefined) {
            if (typeof imageCrop !== 'object' || imageCrop === null) {
                throw new Error('imageCrop must be an object.');
            }
            for (const prop of VALID_CROP_PROPS) {
                if (typeof imageCrop[prop] !== 'number') {
                    throw new Error(`imageCrop.${prop} must be a number.`);
                }
            }
            cleanImageCrop = imageCrop;
        }

        const cleanAliases = Array.isArray(aliases) ? aliases : [];
        const cleanDetails = Array.isArray(details) ? details : [];
        const cleanLinks = Array.isArray(links) ? links : [];
        const cleanTags = Array.isArray(tags) ? tags : [];
        const cleanRelationships = Array.isArray(relationships) ? relationships : [];
        validateNodeExtras({
            aliases: cleanAliases,
            details: cleanDetails,
            links: cleanLinks,
            tags: cleanTags,
            relationships: relationships,
        });

        const status = content.trim() === '' ? 'stub' : 'complete';

        await tx.run(
            `CREATE (n:Node {
          id: $id,
          title: $title,
          content: $content,
          createdAt: $now,
          updatedAt: $now,
          status: $status,
          links: $links,
          aliases: $aliases,
          tags: $tags
        })
        WITH n
        FOREACH (_ IN CASE WHEN $imageCrop IS NOT NULL THEN [1] ELSE [] END |
          SET n.imageCrop = $imageCrop
        )
        WITH n
        FOREACH (_ IN CASE WHEN $imageCrop IS NULL THEN [1] ELSE [] END |
          REMOVE n.imageCrop
        )`,
            {
                id: newId,
                title,
                content,
                now,
                status,
                links: JSON.stringify(cleanLinks),
                aliases: cleanAliases,
                tags: cleanTags,
                imageCrop: cleanImageCrop || null,
            }
        );

        await tx.run(
            `MATCH (parent:Node {id: $parentId}), (child:Node {id: $childId})
         CREATE (parent)-[:HAS_CHILD]->(child)`,
            { parentId: parentId || ROOT_ID, childId: newId }
        );

        if (cleanDetails.length) {
            const detailParams = cleanDetails.map((d, i) => ({
                detailId: d.id || uuidv7(),
                label: d.label,
                type: d.type,
                value: DETAIL_JSON_TYPES.has(d.type) ? JSON.stringify(d.value) : d.value,
                index: i,
            }));
            await tx.run(
                `UNWIND $detailParams AS dp
           CREATE (d:Detail {
             id: dp.detailId,
             label: dp.label,
             type: dp.type,
             value: dp.value,
             createdAt: $now
           })
           WITH d, dp
           MATCH (n:Node {id: $childId})
           CREATE (n)-[:HAS_DETAIL {index: dp.index}]->(d)`,
                { detailParams, childId: newId, now }
            );
        }

        if (image) {
            await tx.run(`
                MATCH (n:Node {id:$nodeId}), (img:Image {id:$imageId})
                   CREATE (n)-[:HAS_IMAGE]->(img)
            `, { nodeId: newId, imageId: image });
        }

        for (const rel of cleanRelationships) {
            const leftId = rel.left.id === 'SELF' ? newId : rel.left.id;
            const rightId = rel.right.id === 'SELF' ? newId : rel.right.id;
            const relId = uuidv7()
            await tx.run(`
                MATCH (l:Node {id:$leftId}), (r:Node {id:$rightId})
                CREATE (l)-[nr:${rel.relationship} {id:$relId}]->(r)
            `, { leftId, rightId, relId });
        }

        await tx.commit();
        res.status(201).json({ id: newId });
    } catch (err) {
        await tx.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function getNode
 * @async
 * @description
 *   HTTP GET / nodes/:id — Retrieves a Node by ID, including:
 *     • its properties (`id`, `title`, `content`, etc.)  
 *     • `breadcrumbs` (path from root)  
 *     • up to 2 levels of `children`  
 *     • additional relationships (DEPENDS_ON, CONTRASTS_WITH, CONTAINS, INVALIDATES)
 *
 * URL parameters:
 *   • `id` (string) — UUID of the node
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getNode(req, res) {
    const s = session();
    const { id } = req.params;
    const MAX_DEPTH = 2;
    const REL_TYPES = ['DEPENDS_ON', 'CONTRASTS_WITH', 'CONTAINS', 'INVALIDATES'];

    try {
        // 1) fetch the node and its ordered details
        const nodeResult = await s.run(
            `
        MATCH (n:Node {id:$id})
        OPTIONAL MATCH (n)-[r:HAS_DETAIL]->(d:Detail)
        WITH n, d, r
        ORDER BY r.index
        WITH n, collect(d { .id, .label, .type, .value, index: r.index }) AS details
        RETURN n { .*, details } AS node
        `,
            { id }
        );
        if (!nodeResult.records.length) {
            return res.status(404).json({ error: 'Not found' });
        }
        const node = nodeResult.records[0].get('node');

        // 2) add any linked image
        const imgResult = await s.run(
            `
        MATCH (n:Node {id:$id})-[:HAS_IMAGE]->(img:Image)
        RETURN img { .id } AS image
        `,
            { id }
        );
        node.image = imgResult.records.length
            ? imgResult.records[0].get('image').id
            : undefined;

        // 3) build breadcrumbs
        const breadcrumbResult = await s.run(
            `
        MATCH path = (ancestor:Node)-[:HAS_CHILD*]->(n:Node {id:$id})
        WITH nodes(path) AS breadcrumbNodes
        ORDER BY length(path) DESC
        LIMIT 1
        RETURN [x IN breadcrumbNodes | { id: x.id, title: x.title }] AS breadcrumbs
        `,
            { id }
        );
        const breadcrumbs = breadcrumbResult.records[0]?.get('breadcrumbs') || [];

        // 4) fetch children up to MAX_DEPTH and nest
        const childrenResult = await s.run(
            `
        MATCH path = (parent:Node {id:$id})-[:HAS_CHILD*1..${MAX_DEPTH}]->(descendant:Node)
        WITH nodes(path) AS pathList
        RETURN pathList
        `,
            { id }
        );
        const treeMap = new Map();
        for (const record of childrenResult.records) {
            const fullPath = record.get('pathList');
            const path = fullPath.slice(1); // drop the root itself
            let current = treeMap;
            for (const nodeObj of path) {
                const childId = nodeObj.properties.id;
                const title = nodeObj.properties.title;
                if (!current.has(childId)) {
                    current.set(childId, { id: childId, title, children: new Map() });
                }
                current = current.get(childId).children;
            }
        }
        function mapToJson(map) {
            return Array.from(map.values()).map(({ id, title, children }) => ({
                id,
                title,
                children: mapToJson(children),
            }));
        }
        const children = mapToJson(treeMap);

        // 5) fetch additional relationships
        const relResult = await s.run(`
            UNWIND $types AS relType
            // outgoing
            MATCH (n:Node {id:$id})-[r]->(m:Node)
            WHERE type(r)=relType
            RETURN
                { id: 'SELF', title: n.title } AS left,
                type(r)                       AS relationship,
                { id: m.id, title: m.title } AS right,
                r.id                          AS relId
            UNION
          
            // incoming
            UNWIND $types AS relType2
            MATCH (m2:Node)-[r2]->(n:Node {id:$id})
            WHERE type(r2)=relType2
            RETURN
                { id: m2.id, title: m2.title }  AS left,
                type(r2)                        AS relationship,
                { id: 'SELF', title: n.title }    AS right,
                r2.id                           AS relId
        `, { id, types: REL_TYPES });

        const relationships = relResult.records.map(rec => ({
            id: rec.get('relId'),
            left: rec.get('left'),
            relationship: rec.get('relationship'),
            right: rec.get('right'),
        }))


        // 6) parse imageCrop if present
        if (node.imageCrop) {
            try {
                node.imageCrop = JSON.parse(node.imageCrop);
            } catch {
                delete node.imageCrop;
            }
        }

        // 7) coerce detail values
        node.details = node.details.map(d => {
            let value = d.value;
            delete d.index;
            if (DETAIL_JSON_TYPES.has(d.type) && typeof value === 'string') {
                try {
                    value = JSON.parse(value);
                } catch {
                    // leave as-is
                }
            }
            return { ...d, value };
        });

        // 8) parse links
        let links = [];
        if (typeof node.links === 'string') {
            try {
                links = JSON.parse(node.links);
            } catch {
                links = [];
            }
        }

        // 9) return everything
        res.json({
            ...node,
            links,
            breadcrumbs,
            children,
            relationships,
        });

    } finally {
        await s.close();
    }
}

/**
 * @function patchNode
 * @async
 * @description
 *   HTTP PATCH / nodes/:id — Updates a Node’s metadata in place, archives the prior version,
 *   and optionally replaces its extra relationships.
 *
 * URL parameters:
 *   • `id` (string) — UUID of the node
 *
 * Optional body properties (any subset):
 *   • `title`         (string)  
 *   • `content`       (string)  
 *   • `image.id`      (string)  
 *   • `aliases`       (string[])  
 *   • `tags`          (string[])
 *   • `links`         (string[])
 *   • `details`       (array of detail objects)
 *   • `imageCrop`     (object with numeric props from VALID_CROP_PROPS)
 *   • `relationships` (array of { left, relationship, right })
 *
 * If `relationships` is present, all existing DEPENDS_ON, CONTRASTS_WITH,
 * CONTAINS, INVALIDATES edges to or from this node will be deleted and
 * replaced by the new set.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function patchNode(req, res) {
    const s = session();
    const tx = s.beginTransaction();

    const REL_TYPES = ['DEPENDS_ON', 'CONTRASTS_WITH', 'CONTAINS', 'INVALIDATES'];

    try {
        const now = new Date().toISOString();
        const currentId = req.params.id;
        const {
            title,
            content,
            aliases,
            links,
            tags,
            details,
            image,
            relationships,
        } = req.body;

        // validate image
        if (image && typeof image !== 'string') {
            throw new Error('image must be a valid uuid.');
        }

        // validate imageCrop if provided
        let cleanImageCrop;
        if (req.body.hasOwnProperty('imageCrop')) {
            const imageCrop = req.body.imageCrop;
            if (typeof imageCrop !== 'object' || imageCrop === null) {
                throw new Error('imageCrop must be an object.');
            }
            for (const prop of VALID_CROP_PROPS) {
                if (typeof imageCrop[prop] !== 'number') {
                    throw new Error(`imageCrop.${prop} must be a number.`);
                }
            }
            cleanImageCrop = JSON.stringify(imageCrop);
        }

        // fetch existing node
        const existing = await tx.run(`
            MATCH (n:Node {id:$currentId}) RETURN n
        `, { currentId });
        if (!existing.records.length) {
            await tx.rollback();
            return res.status(404).json({ error: 'Not found' });
        }
        const old = existing.records[0].get('n').properties;
        const archiveId = uuidv7();

        // archive old node + details
        await tx.run(`
            MATCH (n:Node {id:$currentId})
            OPTIONAL MATCH (n)-[rOld:HAS_DETAIL]->(dOld:Detail)
            WITH n, collect({
                label: dOld.label,
                type:  dOld.type,
                value: dOld.value,
                index: rOld.index
            }) AS oldDetails
    
            CREATE (arch:Node {
                id:        $archiveId,
                title:     n.title,
                content:   n.content,
                createdAt: n.createdAt,
                updatedAt: $now,
                status:    'archived',
                aliases:   n.aliases,
                tags:      n.tags,
                links:     n.links
            })
    
            FOREACH (od IN oldDetails |
            CREATE (ad:Detail {
                id:        randomUUID(),
                label:     od.label,
                type:      od.type,
                value:     od.value,
                createdAt: $now
            })
            CREATE (arch)-[:HAS_DETAIL {index: od.index}]->(ad)
            )
    
            CREATE (n)-[:PREVIOUS_VERSION_OF]->(arch)
        `, { currentId, archiveId, now });

        // validate arrays
        validateNodeExtras({
            aliases: aliases ?? old.aliases ?? [],
            links: links ?? old.links ?? [],
            tags: tags ?? old.tags ?? [],
            details: details || [],
            relationships: relationships || [],
        });

        // update details if provided
        if (req.body.hasOwnProperty('details')) {
            const detailParams = details.map((d, i) => ({
                detailId: d.id || uuidv7(),
                label: d.label,
                type: d.type,
                value: DETAIL_JSON_TYPES.has(d.type) ? JSON.stringify(d.value) : d.value,
                index: i
            }));

            // remove dropped details
            await tx.run(`
                MATCH (n:Node {id:$currentId})
                OPTIONAL MATCH (n)-[:HAS_DETAIL]->(old:Detail)
                WITH collect(old.id) AS oldIds, $detailParams AS newParams
                UNWIND [ id IN oldIds WHERE NOT id IN [ p IN newParams | p.detailId ] ] AS toRemove
                MATCH (d:Detail {id: toRemove})
                DETACH DELETE d
            `, { currentId, detailParams });

            // upsert kept/added details
            await tx.run(`
                UNWIND $detailParams AS dp
                MERGE (d:Detail {id: dp.detailId})
                    ON CREATE SET d.createdAt = $now
                SET d.label = dp.label,
                    d.type  = dp.type,
                    d.value = dp.value
                WITH d, dp
                MATCH (n:Node {id:$currentId})
                MERGE (n)-[r:HAS_DETAIL]->(d)
                SET r.index = dp.index
            `, { currentId, detailParams, now });
        }

        // handle image unlink/link
        if (req.body.hasOwnProperty('image')) {
            await tx.run(`
                MATCH (n:Node {id:$id})-[r:HAS_IMAGE]->() DELETE r
            `, { id: currentId });

            if (image !== 'remove') {
                await tx.run(`
                    MATCH (n:Node {id:$id}), (img:Image {id:$imageId})
                    CREATE (n)-[:HAS_IMAGE]->(img)
                `, { id: currentId, imageId: image });
            }
        }

        // update node properties
        const newTitle = title ?? old.title;
        const newContent = content ?? old.content;
        const newAliases = aliases ?? old.aliases ?? [];
        const newLinks = links ?? old.links ?? [];
        const newTags = tags ?? old.tags ?? [];
        let newImageCrop = cleanImageCrop ?? old.imageCrop;
        if (!req.body.hasOwnProperty('image') || (req.body.hasOwnProperty('image') && image === 'remove')) {
            newImageCrop = undefined;
        }
        const newStatus = newContent.trim() === '' ? 'stub' : 'complete';

        await tx.run(`
            MATCH (n:Node {id:$id})
            SET
                n.title     = $newTitle,
                n.content   = $newContent,
                n.aliases   = $newAliases,
                n.links     = $newLinks,
                n.tags      = $newTags,
                n.updatedAt = $now,
                n.status    = $newStatus
            FOREACH (_ IN CASE WHEN $newImageCrop IS NOT NULL
                THEN [1] ELSE [] END |
                SET n.imageCrop = $newImageCrop
            )
            FOREACH (_ IN CASE WHEN $newImageCrop IS NULL
                THEN [1] ELSE [] END |
                REMOVE n.imageCrop
            )
        `,
            {
                id: currentId,
                newTitle,
                newContent,
                newAliases,
                newLinks: JSON.stringify(newLinks),
                newTags,
                newStatus,
                newImageCrop: newImageCrop || null,
                now
            }
        );

        // handle relationships if provided
        if (req.body.hasOwnProperty('relationships')) {
            const cleanRels = relationships;

            // delete existing rels both directions
            await tx.run(`
                MATCH (n:Node {id:$id})-[r]->() WHERE type(r) IN $types DELETE r
            `, { id: currentId, types: REL_TYPES });
            await tx.run(`
                MATCH ()-[r]->(n:Node {id:$id}) WHERE type(r) IN $types DELETE r
            `, { id: currentId, types: REL_TYPES });

            // create new ones
            for (const rel of cleanRels) {
                const leftId = rel.left.id === 'SELF' ? currentId : rel.left.id;
                const rightId = rel.right.id === 'SELF' ? currentId : rel.right.id;
                const relId = uuidv7()
                await tx.run(`
                    MATCH (l:Node {id:$leftId}), (r:Node {id:$rightId})
                    CREATE (l)-[nr:${rel.relationship} {id:$relId}]->(r)
                `, { leftId, rightId, relId });
            }
        }

        // commit and then call getNode (but don’t return it)
        await tx.commit();
        await getNode(req, res);
    } catch (err) {
        console.log(err);
        await tx.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}


/**
 * @function deleteNode
 * @async
 * @description
 *   HTTP DELETE / nodes/:id — Deletes a Node, all its archived versions,
 *   and any linked sections/section versions.
 *
 * URL parameters:
 *   • `id` (string) — UUID of the node to delete
 *
 * @example
 * ```bash
 * curl -X DELETE http://localhost:3000/nodes/550e8400-e29b-41d4-a716-446655440000
 * ```
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function deleteNode(req, res) {
    const s = session();
    try {
        await s.run(
            `MATCH (n:Node {id: $id}) 
             OPTIONAL MATCH (n)-[:PREVIOUS_VERSION_OF*0..]->(v)
             OPTIONAL MATCH (v)-[:HAS_SECTION]->(s)
             OPTIONAL MATCH (s)-[:PREVIOUS_VERSION_OF*0..]->(sv)
             DETACH DELETE n, v, s, sv`,
            { id: req.params.id }
        );
        res.status(204).end();
    } finally {
        await s.close();
    }
}


/**
 * @function getNodeHistory
 * @async
 * @description
 *   HTTP GET / nodes/:id/history — Lists archived versions of a Node.
 *
 * URL parameters:
 *   • `id` (string) — UUID of the node
 * Query parameters:
 *   • `page` (number, default 0) — zero‑based page index (50 items/page)
 *
 * @example
 * ```bash
 * curl http://localhost:3000/nodes/550e8400-e29b-41d4-a716-446655440000/history?page=1
 * ```
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getNodeHistory(req, res) {
    const s = session();
    const { id } = req.params;
    const pageSize = 50;
    const page = Math.max(parseInt(req.query.page ?? '0', 10), 0);
    const skip = page * pageSize;

    try {
        const result = await s.run(
            `
            MATCH (current:Node {id: $id})<-[:PREVIOUS_VERSION_OF*0..]-(v:Node)
            RETURN v.id AS id, v.title AS title, v.createdAt AS createdAt
            ORDER BY createdAt DESC
            SKIP $skip LIMIT $limit
            `,
            { id, skip: neo4j.int(skip), limit: neo4j.int(pageSize + 1) }
        );

        const records = result.records.slice(0, pageSize);
        const hasMore = result.records.length > pageSize;

        res.json({
            page,
            hasMore,
            results: records.map(r => ({
                id: r.get('id'),
                title: r.get('title'),
                createdAt: r.get('createdAt'),
            }))
        });
    } finally {
        await s.close();
    }
}

/**
 * @function getNodeHistory
 * @async
 * @description
 *   HTTP GET / nodes/:id/history — Lists archived versions of a Node.
 *
 * URL parameters:
 *   • `id` (string) — UUID of the node
 * Query parameters:
 *   • `page` (number, default 0) — zero‑based page index (50 items/page)
 *
 * @example:
 * ```bash
 * curl http://localhost:3000/nodes/550e8400-e29b-41d4-a716-446655440000/history?page=1
 * ```
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getChildNodes(req, res) {
    const s = session();
    const { id } = req.params;

    try {
        const result = await s.run(
            `MATCH (parent:Node {id: $id})-[:HAS_CHILD]->(child:Node)
             RETURN child.id AS id, child.title AS title, child.status AS status`,
            { id }
        );

        res.json(result.records.map(r => ({
            id: r.get('id'),
            title: r.get('title'),
            status: r.get('status'),
        })));
    } finally {
        await s.close();
    }
}

/**
 * @function getChildNodes
 * @async
 * @description
 *   HTTP GET / nodes/:id/children — Retrieves all direct children of a category node.
 *
 * URL parameters:
 *   • `id` (string) — UUID of the parent node
 *
 * @example
 * ```bash
 * curl http://localhost:3000/nodes/00000000-0000-0000-0000-000000000000/children
 * ```
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function moveNode(req, res) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const { id } = req.params;
        const { newParentId } = req.body;

        if (!newParentId || typeof newParentId !== 'string') {
            return res.status(400).json({ error: 'newParentId is required.' });
        }

        if (id === newParentId) {
            return res.status(400).json({ error: 'A node cannot be its own parent.' });
        }

        // Ensure both nodes exist
        const result = await tx.run(
            `MATCH (child:Node {id: $childId})
             MATCH (newParent:Node {id: $newParentId})
             RETURN child, newParent`,
            { childId: id, newParentId }
        );

        if (result.records.length === 0) {
            return res.status(404).json({ error: 'Node or new parent not found.' });
        }

        // Prevent circular parenting (check if newParent is a descendant of the node)
        const circularCheck = await tx.run(
            `MATCH (child:Node {id: $childId})
             MATCH (descendant:Node)-[:HAS_CHILD*]->(child)
             WHERE descendant.id = $newParentId
             RETURN descendant`,
            { childId: id, newParentId }
        );

        if (circularCheck.records.length > 0) {
            return res.status(400).json({ error: 'Cannot move a node under one of its own descendants.' });
        }

        // Remove existing parent relationships
        await tx.run(
            `MATCH (oldParent:Node)-[r:HAS_CHILD]->(child:Node {id: $id}) DELETE r`,
            { id }
        );

        // Create new parent relationship
        await tx.run(
            `MATCH (newParent:Node {id: $newParentId}), (child:Node {id: $id})
             CREATE (newParent)-[:HAS_CHILD]->(child)`,
            { newParentId, id }
        );

        await tx.commit();
        res.status(200).json({ message: 'Node moved successfully.' });
    } catch (err) {
        await tx.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}
