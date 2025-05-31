/**
 * @file api/node.js
 * @description 
 */

import {
    VALID_CROP_PROPS,
    VALID_DETAIL_TYPES,
    VALID_RELATIONSHIPS,
    dbNodeChildren,
    dbNodeCreate,
    dbNodeDelete,
    dbNodeFetch,
    dbNodeHistory,
    dbNodeMove,
    dbNodePatch,
} from '../storage/node.js';


/**
 * @function nodeValidate
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
function nodeValidate({ aliases, details, links, tags, relationships }) {
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
    try {
        const {
            title,
            content = '',
            subtitle = '',
            parentId,
            aliases = [],
            details = [],
            links = [],
            tags = [],
            image,
            imageCrop,
            relationships = [],
        } = req.body;

        if (!title || typeof title !== 'string') {
            throw new Error('title is required and must be a non-empty string');
        }

        if (image && typeof image !== 'string') {
            throw new Error('image must be a UUID string');
        }

        let cleanCrop = null;
        if (imageCrop != null) {
            if (typeof imageCrop !== 'object') {
                throw new Error('imageCrop must be an object');
            }

            for (const p of VALID_CROP_PROPS) {
                if (typeof imageCrop[p] !== 'number') {
                    throw new Error(`imageCrop.${p} must be a number`);
                }
            }

            cleanCrop = imageCrop;
        }

        nodeValidate({ aliases, details, links, tags, relationships });

        const newId = await dbNodeCreate({
            title,
            content,
            subtitle,
            parentId,
            aliases,
            details,
            links,
            tags,
            image,
            imageCrop: cleanCrop,
            relationships,
        });

        return res.status(201).json({ id: newId });
    } catch (err) {
        console.error(err)
        const status = err.message.includes('required') ? 400 : 500;
        return res.status(status).json({ error: err.message });
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
    const { id } = req.params;

    try {
        const node = await dbNodeFetch(id);
        if (!node) {
            return res.status(404).json({ error: 'Not found' });
        }

        res.json(node);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}


/**
 * @function getChildNodes
 * @async
 *
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getChildNodes(req, res) {
    const { id } = req.params;
    try {
        const children = await dbNodeChildren(id);
        return res.json(children);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
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
    const { id } = req.params;
    const body = req.body;

    // basic validations
    if (body.image && typeof body.image !== 'string' && body.image !== 'remove') {
        return res.status(400).json({ error: 'image must be uuid or "remove"' });
    }

    if (body.hasOwnProperty('imageCrop')) {
        if (typeof body.imageCrop !== 'object' || !body.imageCrop) {
            return res.status(400).json({ error: 'imageCrop must be an object' });
        }

        for (const p of VALID_CROP_PROPS) {
            if (typeof body.imageCrop[p] !== 'number') {
                return res.status(400).json({ error: `imageCrop.${p} must be a number` });
            }
        }
    }

    // validate arrays + relationships
    nodeValidate({
        aliases: body.aliases ?? [],
        links: body.links ?? [],
        tags: body.tags ?? [],
        details: body.details ?? [],
        relationships: body.relationships ?? [],
    });

    try {
        // 3) perform all DB updates
        await dbNodePatch(id, {
            title: body.title,
            content: body.content,
            subtitle: body.subtitle,
            aliases: body.aliases,
            links: body.links,
            tags: body.tags,
            details: body.details,
            image: body.image,
            imageCrop: body.hasOwnProperty('imageCrop') ? body.imageCrop : undefined,
            relationships: body.relationships,
        });

        // 4) fetch & return the new version
        const updated = await dbNodeFetch(id);
        if (!updated) {
            return res.status(404).json({ error: 'Not found after patch' });
        }
        return res.json(updated);
    } catch (err) {
        console.error(err);
        if (err.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Node not found' });
        }
        return res.status(500).json({ error: err.message });
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
    const { id } = req.params
    try {
        await dbNodeDelete(id)
        return res.status(204).end()
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: err.message })
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
    const { id } = req.params;
    const page = Math.max(parseInt(req.query.page ?? '0', 10), 0);

    try {
        const data = await dbNodeHistory(id, page, 50);
        return res.json(data);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * @function moveNode
 * @async
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function moveNode(req, res) {
    const { id } = req.params;
    const { newParentId } = req.body;

    if (!newParentId || typeof newParentId !== 'string') {
        return res.status(400).json({ error: 'newParentId is required.' });
    }

    if (id === newParentId) {
        return res.status(400).json({ error: 'A node cannot be its own parent.' });
    }

    try {
        await dbNodeMove(id, newParentId);
        return res.status(200).json({ message: 'Node moved successfully.' });
    } catch (err) {
        if (err.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Node or new parent not found.' });
        }

        if (err.message === 'CIRCULAR') {
            return res.status(400).json({
                error: 'Cannot move a node under one of its own descendants.',
            });
        }

        console.error(err);
        return res.status(500).json({ error: err.message });
    }
}
