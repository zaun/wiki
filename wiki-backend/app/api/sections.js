/**
 * @file api/sections.js
 * @description 
 */
import { session } from '../storage/neo4j.js';
import { v7 as uuidv7 } from 'uuid';
import neo4j from 'neo4j-driver';

/**
 * @function createSection
 * @async
 * @description Creates a new section under a node with validated input and automatic ordering.
 * Uses an atomic Cypher query to assign the correct `order` value at creation time.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createSection(req, res) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const { nodeId } = req.params;
        const { title, content, data, summary, type } = req.body;
        const now = new Date().toISOString();
        const id = uuidv7();

        // Input validation
        if (!title || typeof title !== 'string' || title.trim() === '') {
            return res.status(400).json({ error: 'Title is required and must be a non-empty string.' });
        }
        if (!type || typeof type !== 'string' || !['text', 'cvs'].includes(type)) {
            return res.status(400).json({ error: 'Type must be "text" or "cvs".' });
        }
        if (content !== undefined && typeof content !== 'string') {
            return res.status(400).json({ error: 'Content must be a string if provided.' });
        }

        const rawContent = content || '';
        const rawData = JSON.stringify(data || '');
        const rawSummary = summary || '';
        const status = rawContent.trim() === '' ? 'stub' : 'complete';

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

        // Atomic create + order assignment
        await tx.run(
            `
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
            `,
            {
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
            }
        );

        await tx.commit();
        req.params.id = id;
        await getSection(req, res);
    } catch (err) {
        console.log(err);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function getSections
 * @async
 * @description Retrieves all sections for a given node, ordered by the `order` property.
 * Joins chunked content automatically and removes the internal `contents` field.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getSections(req, res) {
    const s = session();
    const { nodeId } = req.params;

    try {
        const result = await s.run(
            `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
             RETURN s, r.order AS order
             ORDER BY r.order ASC`,
            { nodeId }
        );

        const sections = result.records.map(r => {
            const section = r.get('s').properties;
            const order = r.get('order').toInt();

            // Join contents array if content is blank
            if (section.content === '' && Array.isArray(section.contents)) {
                section.content = section.contents.join('');
            }
            delete section.contents;

            if (section.data === '' && Array.isArray(section.datas)) {
                section.data = section.datas.join('');
            }
            delete section.datas;
            section.data = JSON.parse(section.data);

            if (section.summary === '' && Array.isArray(section.summaries)) {
                section.summary = section.summaries.join('');
            }
            delete section.summaries;

            return {
                ...section,
                order,
                nodeId,
            };
        });

        res.json(sections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function getSection
 * @async
 * @description Retrieves a section scoped to a node.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getSection(req, res) {
    const s = session();
    const { nodeId, id } = req.params;

    try {
        const result = await s.run(
            `MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $id})
             RETURN s`,
            { nodeId, id }
        );

        if (result.records.length === 0) {
            return res.status(404).json({ error: 'Not found' });
        }

        const section = { ...result.records[0].get('s').properties };
        if (section.content === '' && Array.isArray(section.contents) && section.contents.length > 0) {
            section.content = section.contents.join('');
        }
        delete section.contents;

        if (section.data === '' && Array.isArray(section.datas)) {
            section.data = section.datas.join('');
        }
        delete section.datas;
        section.data = JSON.parse(section.data);

        if (section.summary === '' && Array.isArray(section.summaries)) {
            section.summary = section.summaries.join('');
        }
        delete section.summaries;

        res.json({ ...section, id, nodeId });
    } finally {
        await s.close();
    }
}

/**
 * @function patchSection
 * @async
 * @description Versions a section under a node with updated fields and links it properly.
 * Marks the previous version as archived.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function patchSection(req, res) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const { nodeId, id: currentId } = req.params;
        const { title, content, data, summary, type } = req.body;
        const now = new Date().toISOString();
        const archiveId = uuidv7();

        // verify the section belongs to that node
        const check = await tx.run(
            `MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $id}) RETURN s`,
            { nodeId, id: currentId }
        );
        if (!check.records.length) {
            return res.status(404).json({ error: 'Section not found for this node.' });
        }

        // validate inputs
        if (!title || typeof title !== 'string' || !title.trim()) {
            return res
                .status(400)
                .json({ error: 'Title is required and must be a non-empty string.' });
        }
        if (!type || !['text', 'cvs'].includes(type)) {
            return res
                .status(400)
                .json({ error: 'Type must be "text" or "cvs".' });
        }
        if (content !== undefined && typeof content !== 'string') {
            return res
                .status(400)
                .json({ error: 'Content must be a string if provided.' });
        }

        // fetch old props
        const old = check.records[0].get('s').properties;
        let oldContent = old.content;
        if (oldContent === '' && Array.isArray(old.contents) && old.contents.length > 0) {
            oldContent = old.contents.join('');
        }
        let oldData = old.data;
        if (oldData === '' && Array.isArray(old.datas) && old.datas.length > 0) {
            oldData = old.datas.join('');
        }
        oldData = JSON.parse(oldData);
        let oldSummary = old.summary;
        if (oldSummary === '' && Array.isArray(old.summaries) && old.summaries.length > 0) {
            oldSummary = old.summaries.join('');
        }

        // prepare new values (falling back to old)
		const newTitle = title ?? old.title;
		const newType = type ?? old.type;
		const newContent = content ?? oldContent;
		const newData = JSON.stringify(data ?? oldData);
		const newSummary = summary ?? oldSummary;
        const newStatus = newContent.trim() === '' ? 'stub' : 'complete';

        // split into chunks if > 800k
        let newContents = [];
        if (newContent.length > 800_000) {
            for (let i = 0; i < newContent.length; i += 800_000) {
                newContents.push(newContent.slice(i, i + 800_000));
            }
            newContent = '';
        }
        let newDatas = [];
        if (newData.length > 800_000) {
            for (let i = 0; i < newData.length; i += 800_000) {
                newDatas.push(newData.slice(i, i + 800_000));
            }
            newData = '';
        }
        let newSummaries = [];
        if (newSummary.length > 800_000) {
            for (let i = 0; i < newSummary.length; i += 800_000) {
                newSummaries.push(newSummary.slice(i, i + 800_000));
            }
            newSummary = '';
        }

        // create the archived copy
        await tx.run(
            `CREATE (arch:Section {
                id:        $archiveId,
                title:     $oldTitle,
                content:   $oldContent,
                contents:  $oldContents,
                data:      $oldData,
                datas:     $oldDatas,
                summary:   $oldSummary,
                summaries: $oldSummaries,
                type:      $oldType,
                status:    "archived",
                createdAt: $oldCreatedAt,
                updatedAt: $now
            })`,
            {
                archiveId,
                oldTitle: old.title,
                oldContent: old.content,
                oldContents: old.contents || [],
                oldData: old.data,
                oldDatas: old.datas || [],
                oldSummary: old.summary,
                oldSummaries: old.summaries || [],
                oldType: old.type,
                oldCreatedAt: old.createdAt,
                now
            }
        );

        // link the CURRENT section to its archived version
        await tx.run(
            `MATCH (curr:Section {id: $currentId}), (arch:Section {id: $archiveId})
             CREATE (curr)-[:PREVIOUS_VERSION_OF]->(arch)`,
            { currentId, archiveId }
        );

        // update the existing section IN‑PLACE
        await tx.run(
            `MATCH (s:Section {id: $currentId}) SET
                s.title     = $newTitle,
                s.content   = $newContent,
                s.contents  = $newContents,
                s.data      = $newData,
                s.datas     = $newDatas,
                s.summary   = $newSummary,
                s.summaries = $newSummaries,
                s.type      = $newType,
                s.status    = $newStatus,
                s.updatedAt = $now`,
            {
                currentId,
                newTitle,
                newContent,
                newContents,
                newData,
                newDatas,
                newSummary,
                newSummaries,
                newType,
                newStatus,
                now
            }
        );

        await tx.commit();
        await getSection(req, res);
    } catch (err) {
        console.log(err);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function deleteSection
 * @async
 * @description Deletes a section and its version history if linked to the given node.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function deleteSection(req, res) {
    const s = session();
    const { nodeId, id } = req.params;

    try {
        // Verify the section exists under that node
        const check = await s.run(
            `MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $id})
             RETURN s`,
            { nodeId, id }
        );
        if (check.records.length === 0) {
            return res.status(404).json({ error: 'Section not found for this node.' });
        }

        // Delete the current section + all its archived versions
        await s.run(
            `MATCH (s:Section {id: $id})
             OPTIONAL MATCH (s)-[:PREVIOUS_VERSION_OF*0..]->(v:Section)
             DETACH DELETE s, v`,
            { id }
        );

        res.status(204).end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function moveSection
 * @async
 * @description Reorders a section by updating the `order` property on HAS_SECTION relationships.
 * Ensures atomic update using a single transaction to avoid race conditions.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function moveSection(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    const { nodeId, id } = req.params;
    const { toIndex } = req.body;

    try {
        if (typeof toIndex !== 'number' || toIndex < 0 || !Number.isInteger(toIndex)) {
            return res.status(400).json({ error: 'toIndex must be a non-negative integer.' });
        }

        // Get current section ordering
        const result = await tx.run(
            `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
             RETURN s.id AS id, r.order AS order
             ORDER BY r.order`,
            { nodeId }
        );

        let sectionIds = result.records.map(r => r.get('id'));
        if (!sectionIds.includes(id)) {
            return res.status(404).json({ error: 'Section not found under this node.' });
        }

        if (toIndex >= sectionIds.length) {
            return res.status(400).json({ error: 'toIndex is out of range.' });
        }

        // Reorder array
        sectionIds = sectionIds.filter(secId => secId !== id);
        sectionIds.splice(toIndex, 0, id);

        // Apply new order to all HAS_SECTION relationships
        for (let i = 0; i < sectionIds.length; i++) {
            await tx.run(
                `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section {id: $sectionId})
                 SET r.order = $index`,
                { nodeId, sectionId: sectionIds[i], index: i }
            );
        }

        await tx.commit();
        res.status(200).json({ success: true });
    } catch (err) {
        console.log(err);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function bulkReorderSections
 * @async
 * @description Reorders all sections under a specific node based on the provided list of section IDs.
 * This operation updates the `order` property on each `HAS_SECTION` relationship to reflect the new order.
 * 
 * The list must include all and only the current section IDs under the given node. 
 * This prevents accidental deletion or orphaning of sections.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {string} req.params.nodeId - ID of the node whose sections are to be reordered.
 * @param {string[]} req.body.orderedIds - Array of section IDs in the new desired order.
 * @param {import('express').Response} res - Express response object.
 * 
 * @returns {200} JSON response indicating success.
 * @returns {400} If the input is invalid or incomplete.
 * @returns {500} If an internal server error occurs.
 *
 * @example
 * POST /nodes/abc123/sections/reorder
 * {
 *   "orderedIds": [
 *     "sec1-id",
 *     "sec3-id",
 *     "sec2-id"
 *   ]
 * }
 * 
 * // This will set sec1-id to order 0, sec3-id to 1, sec2-id to 2
 */
export async function bulkReorderSections(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    const { nodeId } = req.params;
    const { orderedIds } = req.body;

    try {
        if (!Array.isArray(orderedIds) || orderedIds.some(id => typeof id !== 'string')) {
            return res.status(400).json({ error: 'orderedIds must be an array of strings.' });
        }

        // Ensure all provided IDs are valid sections under this node
        const result = await tx.run(
            `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
             RETURN s.id AS id`,
            { nodeId }
        );

        const existingIds = result.records.map(r => r.get('id'));
        if (orderedIds.length !== existingIds.length || !orderedIds.every(id => existingIds.includes(id))) {
            return res.status(400).json({ error: 'Invalid or incomplete section list.' });
        }

        for (let i = 0; i < orderedIds.length; i++) {
            await tx.run(
                `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section {id: $sectionId})
                 SET r.order = $index`,
                { nodeId, sectionId: orderedIds[i], index: i }
            );
        }

        await tx.commit();
        res.status(200).json({ success: true });
    } catch (err) {
        console.log(err);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}


/**
 * @function getSectionHistory
 * @async
 * @description Gets the version history of a section tied to a node.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getSectionHistory(req, res) {
    const s = session();
    const { nodeId, id } = req.params;
    const pageSize = 50;
    const page = Math.max(parseInt(req.query.page ?? '0', 10), 0);
    const skip = page * pageSize;

    try {
        const result = await s.run(
            `MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(current:Section {id: $id})
             OPTIONAL MATCH (v:Section)-[:PREVIOUS_VERSION_OF*0..]->(current)
             RETURN DISTINCT v.id AS id, v.title AS title, v.createdAt AS createdAt
             ORDER BY createdAt DESC
             SKIP $skip LIMIT $limit`,
            {
                nodeId,
                id,
                skip: neo4j.int(skip),
                limit: neo4j.int(pageSize + 1),
            }
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
