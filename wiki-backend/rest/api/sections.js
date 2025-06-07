/**
 * @file api/sections.js
 * @description 
 */
import { session } from '../storage/neo4j.js';
import { v7 as uuidv7 } from 'uuid';
import neo4j from 'neo4j-driver';

import {
    SUPPORTED_TYPES,
    dbSectionBulkReorder,
    dbSectionCreate,
    dbSectionDelete,
    dbSectionFetch,
    dbSectionFetchAll,
    dbSectionMove,
    dbSectionPatch,
} from '../storage/section.js';


/**
 * @function createSection
 * @async
 * @description Creates a new section under a node with validated input.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createSection(req, res) {
    const { nodeId } = req.params;
    const { title, content, data, summary, type } = req.body;

    // Input validation
    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Title is required and must be a non-empty string.' });
    }
    if (!type || typeof type !== 'string' || !SUPPORTED_TYPES.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${SUPPORTED_TYPES.join(', ')}.` });
    }
    if (content !== undefined && typeof content !== 'string') {
        return res.status(400).json({ error: 'Content must be a string if provided.' });
    }
    // You might want to add more robust validation for 'data' based on its expected structure
    // For now, I'm assuming it can be any JSON-serializable object or string.

    try {
        const newSectionId = await dbSectionCreate(nodeId, req.userId, req.roles, { title, content, data, summary, type });

        // Reuse getSection to fetch and return the newly created section
        req.params.id = newSectionId; // Set the ID for getSection to use
        await getSection(req, res); // Call getSection to return the full section object
    } catch (err) {
        console.error('Error creating section:', err);
        let statusCode = 500;
        let errorMessage = 'Internal server error.';

        if (err.message.includes('Node not found')) {
            statusCode = 404;
            errorMessage = 'Parent node not found.';
        }

        res.status(statusCode).json({ error: errorMessage });
    }
}

/**
 * @function getSections
 * @async
 * @description Retrieves all sections for a given node, ordered by the `order` property.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getSections(req, res) {
    const { nodeId } = req.params;

    try {
        const sections = await dbSectionFetchAll(nodeId, req.userId, req.roles);
        res.json(sections);
    } catch (err) {
        console.error('Error fetching sections:', err);
        res.status(500).json({ error: err.message });
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
    const { nodeId, id } = req.params;

    try {
        const section = await dbSectionFetch(nodeId, id, req.userId, req.roles);

        if (!section) {
            return res.status(404).json({ error: 'Not found' });
        }

        res.json(section);
    } catch (error) {
        console.error('Error fetching section:', error);
        res.status(500).json({ error: 'Internal server error' });
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
    const { nodeId, id: sectionId } = req.params;
    const { title, content, data, summary, type } = req.body;

    // Validate inputs
    // Check if at least one field is provided for update
    const updatesProvided = title !== undefined || content !== undefined || data !== undefined || summary !== undefined || type !== undefined;
    if (!updatesProvided) {
        return res.status(400).json({ error: 'No update fields provided.' });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
        return res.status(400).json({ error: 'Title must be a non-empty string if provided.' });
    }
    if (type !== undefined && (typeof type !== 'string' || !SUPPORTED_TYPES.includes(type))) {
        return res.status(400).json({ error: `Type must be one of: ${SUPPORTED_TYPES.join(', ')} if provided.` });
    }
    if (content !== undefined && typeof content !== 'string') {
        return res.status(400).json({ error: 'Content must be a string if provided.' });
    }
    // Add validation for 'data' if needed (e.g., must be an object)

    try {
        await dbSectionPatch(nodeId, sectionId, req.userId, req.roles, { title, content, data, summary, type });
        // After successful patch, fetch and return the updated section
        await getSection(req, res);
    } catch (err) {
        console.error('Error patching section:', err);
        let statusCode = 500;
        let errorMessage = 'Internal server error.';

        if (err.message.includes('Section not found for this node.')) {
            statusCode = 404;
            errorMessage = 'Section not found for the specified node.';
        }

        res.status(statusCode).json({ error: errorMessage });
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
    const { nodeId, id } = req.params;

    try {
        const deleted = await dbSectionDelete(nodeId, id, req.userId, req.roles);

        if (!deleted) {
            return res.status(404).json({ error: 'Section not found for this node.' });
        }

        res.status(204).end(); // No content to send back on successful deletion
    } catch (err) {
        console.error('Error deleting section:', err);
        res.status(500).json({ error: 'Internal server error.' });
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
    const { nodeId, id } = req.params;
    const { toIndex } = req.body;

    // Input validation
    if (typeof toIndex !== 'number' || !Number.isInteger(toIndex) || toIndex < 0) {
        return res.status(400).json({ error: 'toIndex must be a non-negative integer.' });
    }

    try {
        const moved = await dbSectionMove(nodeId, id, req.userId, req.roles, toIndex);

        if (!moved) {
            return res.status(404).json({ error: 'Section not found under this node.' });
        }

        res.status(200).json({ success: true, message: 'Section reordered successfully.' });
    } catch (err) {
        console.error('Error moving section:', err);
        let statusCode = 500;
        let errorMessage = 'Internal server error.';

        if (err.message.includes('out of range')) {
            statusCode = 400;
            errorMessage = 'Provided index is out of bounds for the number of sections.';
        }

        res.status(statusCode).json({ error: errorMessage });
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
 */
export async function bulkReorderSections(req, res) {
    const { nodeId } = req.params;
    const { orderedIds } = req.body;

    // Input validation
    if (!Array.isArray(orderedIds) || orderedIds.some(id => typeof id !== 'string')) {
        return res.status(400).json({ error: '`orderedIds` must be an array of strings.' });
    }

    try {
        const success = await dbSectionBulkReorder(nodeId, req.userId, req.roles, orderedIds);

        if (success) {
            res.status(200).json({ success: true, message: 'Sections reordered successfully.' });
        } else {
            // This case should ideally be caught by the error thrown from dbSectionBulkReorder,
            // but included for robustness.
            res.status(500).json({ error: 'Failed to reorder sections due to an unknown issue.' });
        }
    } catch (err) {
        console.error('Error in bulk reorder sections:', err);
        let statusCode = 500;
        let errorMessage = 'Internal server error.';

        if (err.message.includes('Invalid or incomplete section list')) {
            statusCode = 400;
            errorMessage = err.message; // Use the specific error message from the DB function
        }

        res.status(statusCode).json({ error: errorMessage });
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
    const { nodeId, id } = req.params;
    const pageSize = 50;
    // Ensure page is a non-negative integer
    const page = Math.max(parseInt(req.query.page ?? '0', 10), 0);

    try {
        const history = await dbSectionHistory(nodeId, id, req.userId, req.roles, page, pageSize);
        res.json(history);
    } catch (err) {
        console.error('Error fetching section history:', err);
        let statusCode = 500;
        let errorMessage = 'Internal server error.';

        if (err.message.includes('Section not found for this node.')) {
            statusCode = 404;
            errorMessage = 'Section not found for the specified node.';
        }

        res.status(statusCode).json({ error: errorMessage });
    }
}
