/**
 * @file api/page.js
 * @description 
 */

import {
    dbPageCreate,
    dbPageDelete,
    dbPageFetch,
    dbPagePatch,
} from '../storage/page.js';

/**
 * @function createPage
 * @async
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createPage(req, res) {
    try {
        const {
            title,
            content = '',
            subtitle = '',
        } = req.body;

        if (!title || typeof title !== 'string') {
            throw new Error('title is required and must be a non-empty string');
        }

        if (!content || typeof content !== 'object') {
            throw new Error('content is required and must be an object');
        }

        if (content.type !== 'container') {
            throw new Error('content type must be container');
        }

        const newId = await dbPageCreate({
            title,
            subtitle,
            content,
        });

        return res.status(201).json({ id: newId });
    } catch (err) {
        console.error(err)
        const status = err.message.includes('required') ? 400 : 500;
        return res.status(status).json({ error: err.message });
    }
}

/**
 * @function getPage
 * @async
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getPage(req, res) {
    const { id } = req.params;

    try {
        const page = await dbPageFetch(id);
        if (!page) {
            return res.status(404).json({ error: 'Not found' });
        }

        res.json(page);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}

/**
 * @function patchPage
 * @async
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function patchPage(req, res) {
    const { id } = req.params;
    const body = req.body;

    try {
        if (body.content) {
            if (typeof body.content !== 'object') {
                throw new Error('content is required and must be an object');
            }

            if (body.content.type !== 'container') {
                throw new Error('content type must be container');
            }
        }

        // Perform all DB updates
        await dbPagePatch(id, {
            title: body.title,
            subtitle: body.subtitle,
            content: body.content,
        });

        // Fetch & return the new version
        const updated = await dbPageFetch(id);
        if (!updated) {
            return res.status(404).json({ error: 'Not found after patch' });
        }
        return res.json(updated);
    } catch (err) {
        console.error(err);
        if (err.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Page not found' });
        }
        return res.status(500).json({ error: err.message });
    }
}

/**
 * @function deletePage
 * @async
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function deletePage(req, res) {
    const { id } = req.params
    try {
        await dbPageDelete(id)
        return res.status(204).end()
    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: err.message })
    }
}
