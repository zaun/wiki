/**
 * @file storage/section.js
 * @description 
 */

import { int } from 'neo4j-driver';
import { v7 as uuidv7 } from 'uuid';
import { session } from '../storage/neo4j.js';

export const SUPPORTED_TYPES = ['text', 'data-table', 'music-score'];

/**
 * @function dbBulkReorderSections
 * @async
 * @description Reorders all sections under a specific node in the database based on the provided list of section IDs.
 * This operation updates the `order` property on each `HAS_SECTION` relationship to reflect the new order.
 *
 * @param {string} nodeId - ID of the node whose sections are to be reordered.
 * @param {string[]} orderedIds - Array of section IDs in the new desired order.
 * @returns {Promise<boolean>} True if the reordering was successful and all IDs matched existing sections.
 * @throws {Error} If the provided IDs are invalid, incomplete, or a database error occurs.
 */
export async function dbSectionBulkReorder(nodeId, orderedIds) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        // Ensure all provided IDs are valid sections under this node
        const result = await tx.run(
            `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
             RETURN s.id AS id`,
            { nodeId }
        );

        const existingIds = result.records.map(r => r.get('id'));

        // Validate that the provided list is a complete and accurate representation of existing sections
        if (orderedIds.length !== existingIds.length || !orderedIds.every(id => existingIds.includes(id))) {
            throw new Error('Invalid or incomplete section list provided for reordering. All existing section IDs must be present and no extra IDs should be included.');
        }

        // Apply new order to all HAS_SECTION relationships
        for (let i = 0; i < orderedIds.length; i++) {
            await tx.run(
                `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section {id: $sectionId})
                 SET r.order = $index`,
                { nodeId, sectionId: orderedIds[i], index: int(i) } // Ensure index is stored as Neo4j integer
            );
        }

        await tx.commit();
        return true;
    } catch (err) {
        if (tx.isOpen()) {
            await tx.rollback();
        }
        throw err; // Re-throw the error for the calling function to handle
    } finally {
        await s.close();
    }
}

/**
 * @function dbSectionCreate
 * @async
 * @description Creates a new section in the database under a specified node with validated input and automatic ordering.
 * @param {string} nodeId - The ID of the parent node.
 * @param {object} sectionData - The data for the new section.
 * @param {string} sectionData.title - The title of the section.
 * @param {string} [sectionData.content=''] - The main content of the section.
 * @param {object|string} [sectionData.data=''] - Additional structured data for the section.
 * @param {string} [sectionData.summary=''] - A summary of the section.
 * @param {string} sectionData.type - The type of the section (e.g., 'text', 'image').
 * @returns {Promise<string>} The ID of the newly created section.
 * @throws {Error} If the node is not found or a database error occurs.
 */
export async function dbSectionCreate(nodeId, { title, content = '', data = '', summary = '', type }) {
    const s = session();
    const tx = s.beginTransaction();
    const now = new Date().toISOString();
    const id = uuidv7();

    try {
        const rawContent = content;
        const rawData = JSON.stringify(data);
        const rawSummary = summary;
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
        const createResult = await tx.run(
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
            RETURN s.id AS sectionId
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

        if (createResult.records.length === 0) {
            throw new Error('Node not found or section creation failed.');
        }

        await tx.commit();
        return id; // Return the ID of the newly created section
    } catch (err) {
        if (tx.isOpen()) {
            await tx.rollback();
        }
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * @function dbSectionDelete
 * @async
 * @description Deletes a section and its version history if linked to the given node from the database.
 * @param {string} nodeId - The ID of the parent node.
 * @param {string} sectionId - The ID of the section to delete.
 * @returns {Promise<boolean>} True if the section was found and deleted, false otherwise.
 * @throws {Error} If a database error occurs during the deletion process.
 */
export async function dbSectionDelete(nodeId, sectionId) {
    const s = session();
    try {
        // Verify the section exists under that node
        const check = await s.run(
            `MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $sectionId})
             RETURN s`,
            { nodeId, sectionId }
        );

        if (check.records.length === 0) {
            return false; // Section not found for this node
        }

        // Delete the current section and all its archived versions
        await s.run(
            `MATCH (s:Section {id: $sectionId})
             OPTIONAL MATCH (s)-[:PREVIOUS_VERSION_OF*0..]->(v:Section)
             DETACH DELETE s, v`,
            { sectionId }
        );

        return true; // Section found and deleted
    } finally {
        await s.close();
    }
}

/**
 * @function dbSectionFetch
 * @async
 * @description Retrieves a section scoped to a node from the database.
 * @param {string} nodeId - The ID of the parent node.
 * @param {string} sectionId - The ID of the section to retrieve.
 * @returns {Promise<object|null>} The section object or null if not found.
 */
export async function dbSectionFetch(nodeId, sectionId) {
    const s = session();
    try {
        const result = await s.run(
            `MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $sectionId})
             RETURN s`,
            { nodeId, sectionId }
        );

        if (result.records.length === 0) {
            return null;
        }

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

        // Attempt to parse 'data' property as JSON
        if (typeof section.data === 'string') {
            try {
                section.data = JSON.parse(section.data);
            } catch (e) {
                console.error(`Error parsing section data for section ${sectionId}:`, e);
                // Optionally, handle invalid JSON data more robustly (e.g., set to null or default object)
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

        return { ...section, id: sectionId, nodeId };
    } finally {
        await s.close();
    }
}

/**
 * @function dbSectionFetchAll
 * @async
 * @description Retrieves all sections for a given node from the database, ordered by the `order` property.
 * Joins chunked content automatically and removes the internal `contents` field.
 * @param {string} nodeId - The ID of the node whose sections are to be fetched.
 * @returns {Promise<Array<object>>} An array of section objects.
 */
export async function dbSectionFetchAll(nodeId) {
    const s = session();
    try {
        const result = await s.run(
            `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
             RETURN s, r.order AS order
             ORDER BY r.order ASC`,
            { nodeId }
        );

        return result.records.map(r => {
            const section = r.get('s').properties;
            const order = r.get('order'); // This is a Neo4j integer, might need conversion if used arithmetically later

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

            // Attempt to parse 'data' property as JSON
            if (typeof section.data === 'string') {
                try {
                    section.data = JSON.parse(section.data);
                } catch (e) {
                    console.error(`Error parsing section data for section ${section.id}:`, e);
                    // Default to an empty object or handle as appropriate for malformed JSON
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

            return {
                ...section,
                order: int(order), // Convert Neo4j Integer to a standard JavaScript number
                nodeId,
            };
        });
    } finally {
        await s.close();
    }
}

/**
 * @function dbSectionHistory
 * @async
 * @description Fetches a page of archived versions for a given section tied to a node.
 * @param {string} nodeId - The ID of the parent node.
 * @param {string} sectionId - The ID of the section to retrieve history for.
 * @param {number} page - Zero-based page index.
 * @param {number} pageSize - Number of items per page.
 * @returns {Promise<{
 * page: number,
 * hasMore: boolean,
 * results: Array<{id:string,title:string,createdAt:string}>
 * }>}
 * @throws {Error} If the section is not found under the given node or a database error occurs.
 */
export async function dbSectionHistory(nodeId, sectionId, page = 0, pageSize = 50) {
    const s = session();
    const skip = page * pageSize;

    try {
        // First, verify the section exists under the specified node
        const checkResult = await s.run(
            `MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $sectionId})
             RETURN s.id AS sectionExists`,
            { nodeId, sectionId }
        );

        if (checkResult.records.length === 0) {
            throw new Error('Section not found for this node.');
        }

        // Then, fetch the history
        const result = await s.run(
            `MATCH (current:Section {id: $sectionId})
             OPTIONAL MATCH (v:Section)-[:PREVIOUS_VERSION_OF*0..]->(current)
             RETURN DISTINCT v.id AS id, v.title AS title, v.createdAt AS createdAt
             ORDER BY createdAt DESC
             SKIP $skip LIMIT $limit`,
            {
                sectionId, // Use sectionId directly here as current is already matched
                skip: neo4j.int(skip),
                limit: neo4j.int(pageSize + 1), // Fetch one extra to check for hasMore
            }
        );

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
 * @function dbSectionMove
 * @async
 * @description Reorders a section by updating the `order` property on HAS_SECTION relationships in the database.
 * Ensures atomic update using a single transaction to avoid race conditions.
 * @param {string} nodeId - The ID of the parent node.
 * @param {string} sectionId - The ID of the section to move.
 * @param {number} toIndex - The target zero-based index for the section.
 * @returns {Promise<boolean>} True if the move was successful, false if the section or node was not found.
 * @throws {Error} If `toIndex` is out of bounds or a database error occurs.
 */
export async function dbSectionMove(nodeId, sectionId, toIndex) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        // Get current section ordering
        const result = await tx.run(
            `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section)
             RETURN s.id AS id, r.order AS order
             ORDER BY r.order`,
            { nodeId }
        );

        let sectionIds = result.records.map(r => r.get('id'));

        if (!sectionIds.includes(sectionId)) {
            return false; // Section not found under this node
        }

        if (toIndex < 0 || toIndex >= sectionIds.length) {
            throw new Error('toIndex is out of range.');
        }

        // Reorder array logically
        sectionIds = sectionIds.filter(secId => secId !== sectionId);
        sectionIds.splice(toIndex, 0, sectionId);

        // Apply new order to all HAS_SECTION relationships
        for (let i = 0; i < sectionIds.length; i++) {
            await tx.run(
                `MATCH (n:Node {id: $nodeId})-[r:HAS_SECTION]->(s:Section {id: $currentSectionId})
                 SET r.order = $newIndex`,
                { nodeId, currentSectionId: sectionIds[i], newIndex: int(i) } // Ensure index is stored as Neo4j integer
            );
        }

        await tx.commit();
        return true;
    } catch (err) {
        if (tx.isOpen()) {
            await tx.rollback();
        }
        throw err; // Re-throw the error for the controller to handle
    } finally {
        await s.close();
    }
}

/**
 * @function dbSectionPatch
 * @async
 * @description Archives the current version of a section and updates it in-place with new data.
 * Handles content chunking for large fields.
 * @param {string} nodeId - The ID of the parent node.
 * @param {string} currentId - The ID of the section to be patched.
 * @param {object} updates - The fields to update.
 * @param {string} [updates.title] - The new title for the section.
 * @param {string} [updates.content] - The new main content for the section.
 * @param {object|string} [updates.data] - The new structured data for the section.
 * @param {string} [updates.summary] - The new summary for the section.
 * @param {string} [updates.type] - The new type for the section.
 * @returns {Promise<void>}
 * @throws {Error} If the section is not found for the given node, or a database error occurs.
 */
export async function dbSectionPatch(nodeId, currentId, updates) {
    const s = session();
    const tx = s.beginTransaction();
    const now = new Date().toISOString();
    const archiveId = uuidv7();

    let updateData = undefined;
    try {
        updateData = updates.data !== undefined ? JSON.stringify(updates.data) : undefined;
    } catch {
        updateData = undefined;
    }

    try {
        // Match the current section, archive it, and link it.
        // This query also implicitly verifies the section belongs to the node.
        const archiveResult = await tx.run(
            `
            MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(s:Section {id: $currentId})
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
                status:    "archived",
                aiReview:  s.aiReview,
                createdAt: s.createdAt,
                updatedAt: $now
            })
            CREATE (s)-[:PREVIOUS_VERSION_OF]->(arch)
            RETURN s { .content, .contents, .data, .datas, .summary, .summaries } AS currentProps
            `,
            { nodeId, currentId, archiveId, now }
        );

        if (!archiveResult.records.length) {
            throw new Error('Section not found for this node.');
        }

        // Get the properties of the *current* section from the database *before* it's updated
        // This is necessary to correctly determine the 'effective' content/data/summary
        // if the update fields are not provided (i.e., fallback to existing values).
        const currentDbProps = archiveResult.records[0].get('currentProps');

        // Reconstruct current content, data, and summary from chunks if they exist in currentDbProps
        let currentContentFull = currentDbProps.content;
        if (currentContentFull === '' && Array.isArray(currentDbProps.contents) && currentDbProps.contents.length > 0) {
            currentContentFull = currentDbProps.contents.join('');
        }
        let currentDataFull = currentDbProps.data;
        if (currentDataFull === '' && Array.isArray(currentDbProps.datas) && currentDbProps.datas.length > 0) {
            currentDataFull = currentDbProps.datas.join('');
        }
        try {
            // Ensure currentDataFull is parsed if it was a stringified JSON
            currentDataFull = JSON.parse(currentDataFull);
        } catch (e) {
            // If parsing fails, it was not JSON or was malformed, use original string or default
            currentDataFull = currentDbProps.data; // Keep as is if not parseable JSON
        }
        let currentSummaryFull = currentDbProps.summary;
        if (currentSummaryFull === '' && Array.isArray(currentDbProps.summaries) && currentDbProps.summaries.length > 0) {
            currentSummaryFull = currentDbProps.summaries.join('');
        }

        // update the section's own props
       const setClauses = [];
        const removeClauses = [];

        const params = {
            currentId,
            now,
        };

        if (updates.title !== undefined) {
            setClauses.push('s.title = $newTitle');
            params.newTitle = updates.title;
        }
        if (updates.type !== undefined) {
            setClauses.push('s.type = $newType');
            params.newType = updates.type;
        }
        if (updates.content !== undefined && updates.content !== currentContentFull) {
            let newContents = [];
            if (updates.content.length > 800_000) {
                for (let i = 0; i < updates.content.length; i += 800_000) {
                    newContents.push(updates.content.slice(i, i + 800_000));
                }
                setClauses.push('s.content = ""');
                setClauses.push('s.contents = $newContents');
                params.newContents = newContents;
            } else {
                setClauses.push('s.content = $effectiveContent');
                setClauses.push('s.contents = []'); 
                params.effectiveContent = updates.content;
            }
        }
        if (updateData !== undefined && updateData !== JSON.stringify(currentDataFull)) {
            let newDatas = [];
            if (updateData.length > 800_000) {
                for (let i = 0; i < updateData.length; i += 800_000) {
                    newDatas.push(updateData.slice(i, i + 800_000));
                }
                setClauses.push('s.data = ""');
                setClauses.push('s.datas = $newDatas');
                params.newDatas = newDatas;
            } else {
                setClauses.push('s.data = $effectiveData');
                setClauses.push('s.datas = []'); 
                params.effectiveData = updateData;
            }
        }
        if (updates.summary !== undefined && updates.summary !== currentSummaryFull) {
            let newSummaries = [];
            if (updates.summary.length > 800_000) {
                for (let i = 0; i < updates.summary.length; i += 800_000) {
                    newSummaries.push(updates.summary.slice(i, i + 800_000));
                }
                setClauses.push('s.summary = ""');
                setClauses.push('s.summaries = $newSummaries');
                params.newSummaries = newSummaries;
            } else {
                setClauses.push('s.summary = $effectiveSummary');
                setClauses.push('s.summaries = []'); 
                params.effectiveSummary = updates.summary;
            }
        }

        // Status always based on final content
        const newStatus = effectiveContent.trim() === '' ? 'stub' : 'complete';
        setClauses.push('s.status = $newStatus');
        params.newStatus = newStatus;

        // Update timestamp
        setClauses.push('s.updatedAt = $now');

        // Remove the existing ai review
        removeClauses.push('n.aiReview');

        // Update the existing section IN-PLACE using dynamic SET clauses
        await tx.run(`
            MATCH (s:Section {id: $currentId})
            SET ${setClauses.join(',\n')}
            ${removeClauses.length ? `REMOVE ${removeClauses.join(',\n')}` : ''}
        `, params);

        await tx.commit();
    } catch (err) {
        if (tx.isOpen()) {
            await tx.rollback();
        }
        throw err; // Re-throw the error to be caught by the controller
    } finally {
        await s.close();
    }
}

/**
 * Updates a section's review properties.
 *
 * @param {object} opts
 * @param {string} opts.id     - The ID of the node to update.
 * @param {string} opts.review - The review content to set.
 * @param {string} opts.flag   - The flag to set.
 * @returns {Promise<void>}
 */
export async function dbSectionReview({ id, review, flag, isAI }) {
    const s = session();
    try {
        if (isAI) {
            await s.run(`
                MATCH (s:Section {id: $id})
                SET s.aiReview = $review
                SET s.aiFlag = $flag
            `, { id, review, flag });
        } else {
            await s.run(`
                MATCH (n:Section {id: $id})
                SET s.review = $review
                SET s.flag = $flag
            `, { id, review, flag });
        }
    } finally {
        await s.close();
    }
}

