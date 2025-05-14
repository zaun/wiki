/**
 * @file api/citations.js
 * @description Citation API handlers — including source creation, instance linkage,
 * citation merging, and node/section-level usage.
 */

import { session } from '../storage/neo4j.js';
import { v7 as uuidv7 } from 'uuid';
import neo4j from 'neo4j-driver';

/**
 * 
 * Citation Sources
 * 
 */

/**
 * @function createCitation
 * @description Creates a new citation source (e.g., book, article, website).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createCitation(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    try {
        const { type, title, authors = [], publisher = '', year = '', url = '' } = req.body;
        if (!type || !title || typeof type !== 'string' || typeof title !== 'string') {
            return res.status(400).json({ error: 'Missing required fields: type, title' });
        }
        const id = uuidv7();
        const now = new Date().toISOString();

        // Create and return the node in one go
        const result = await tx.run(`
        CREATE (c:Citation {
          id:        $id,
          type:      $type,
          title:     $title,
          authors:   $authors,
          publisher: $publisher,
          year:      $year,
          url:       $url,
          createdAt: $now,
          updatedAt: $now
        })
        RETURN c
        `, { id, type, title, authors, publisher, year, url, now });

        await tx.commit();

        const record = result.records[0];
        const created = record.get('c').properties;

        return res.status(201).json(created);
    } catch (err) {
        await tx.rollback();
        return res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function listCitations
 * @description Lists citation sources with optional full-text search and pagination.
 * Query Parameters:
 *   - `query` (string): optional full-text search
 *   - `page` (number): optional page number (default: 0)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function listCitations(req, res) {
    const s = session();
    const { query } = req.query;
    const pageSize = 10;
    const page = Math.max(parseInt(req.query.page ?? '0', 10), 0);
    const skip = page * pageSize;

    try {
        if (query && typeof query === 'string') {
            // Full-text search
            const result = await s.run(`
                CALL db.index.fulltext.queryNodes('citation_fulltext_index', $query)
                YIELD node, score
                RETURN node { .id, .title, .type, .authors, .publisher, .year, .url, .createdAt, .updatedAt } AS citation, score
                ORDER BY score DESC
                SKIP $skip LIMIT $limit
            `, { query, skip: neo4j.int(skip), limit: neo4j.int(pageSize + 1) });

            const records = result.records.slice(0, pageSize);
            const hasMore = result.records.length > pageSize;

            res.json({
                page,
                hasMore,
                results: records.map(r => ({
                    ...r.get('citation'),
                    matchStrength: r.get('score'),
                })),
            });
        } else {
            // Plain paged list
            const result = await s.run(`
                MATCH (c:Citation)
                RETURN c
                ORDER BY c.title
                SKIP $skip LIMIT $limit
            `, { skip: neo4j.int(skip), limit: neo4j.int(pageSize + 1) });

            const records = result.records.slice(0, pageSize);
            const hasMore = result.records.length > pageSize;

            res.json({
                page,
                hasMore,
                results: records.map(r => r.get('c').properties),
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}


/**
 * @function getCitation
 * @description Retrieves a citation source by ID.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getCitation(req, res) {
    const s = session();
    try {
        const result = await s.run(`MATCH (c:Citation {id: $id}) RETURN c`, { id: req.params.id });
        if (result.records.length === 0) return res.status(404).json({ error: 'Get failed, citation not found' });
        res.json(result.records[0].get('c').properties);
    } finally {
        await s.close();
    }
}

/**
 * @function updateCitation
 * @description Updates an existing citation source's metadata.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function updateCitation(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    try {
        const { id } = req.params;
        const { type, title, authors, publisher, year, url } = req.body;
        const now = new Date().toISOString();

        const result = await tx.run(`MATCH (c:Citation {id: $id}) RETURN c`, { id });
        if (result.records.length === 0) return res.status(404).json({ error: 'Update failed, citation not found' });
        const oldCit = result.records[0].get('c').properties

        const updateType = type ?? oldCit.type;
        const updateTitle = title ?? oldCit.title;
        const updateAuthors = authors ?? oldCit.authors;
        const updatePublisher = publisher ?? oldCit.publisher;
        const updateYear = year ?? oldCit.year;
        const updateUrl = url ?? oldCit.url;

        await tx.run(`
            MATCH (c:Citation {id: $id})
            SET c += {
                type: $type, title: $title, authors: $authors,
                publisher: $publisher, year: $year, url: $url,
                updatedAt: $now
            }
        `, {
            id,
            type: updateType,
            title: updateTitle,
            authors: updateAuthors,
            publisher: updatePublisher,
            year: updateYear,
            url: updateUrl,
            now
        });

        await tx.commit();
        res.status(204).end();
    } catch (err) {
        console.error(err);
        await tx.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function deleteCitation
 * @description Deletes a citation source if it has no attached instances.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function deleteCitation(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    try {
        const { id } = req.params;

        const result = await tx.run(`MATCH (c:Citation {id: $id}) RETURN c`, { id });
        if (result.records.length === 0) return res.status(404).json({ error: 'Delete failed, citation not found' });

        await tx.run(
            `MATCH (c:Citation {id: $id})
       OPTIONAL MATCH (i:CitationInstance)-[:CITES_SOURCE]->(c)
       WITH c, collect(i) AS instances
       WHERE size(instances) = 0
       DETACH DELETE c`,
            { id }
        );

        await tx.commit();
        res.status(204).end();
    } catch (err) {
        console.error(err);
        await tx.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function mergeCitations
 * @description Moves all instances from sourceId to destId and deletes sourceId.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function mergeCitations(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    try {
        const { destId, sourceId } = req.params;
        if (destId === sourceId) return res.status(400).json({ error: 'Cannot merge citation into itself.' });

        const result = await tx.run(
            `MATCH (a:Citation {id: $a}), (b:Citation {id: $b}) RETURN count(*) AS count`,
            { a: destId, b: sourceId }
        );
        if (result.records[0].get('count').toInt() !== 1) {
            return res.status(404).json({ error: 'One or both citations not found.' });
        }

        await tx.run(
            `MATCH (old:Citation {id: $sourceId})
       MATCH (new:Citation {id: $destId})
       MATCH (i:CitationInstance)-[r:CITES_SOURCE]->(old)
       DELETE r
       CREATE (i)-[:CITES_SOURCE]->(new)`,
            { sourceId, destId }
        );

        await tx.run(`MATCH (c:Citation {id: $sourceId}) DETACH DELETE c`, { sourceId });

        await tx.commit();
        res.status(200).json({ merged: sourceId, into: destId });
    } catch (err) {
        console.error(err);
        await tx.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * 
 * Citation Instances
 * 
 */

/**
 * @function listInstancesByCitation
 * @description Lists all instances for a given citation source.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function listInstancesByCitation(req, res) {
    const s = session();
    try {
        const result = await s.run(
            `MATCH (c:Citation {id: $id})<-[:CITES_SOURCE]-(i:CitationInstance)
       RETURN i`,
            { id: req.params.id }
        );
        res.json(result.records.map(r => r.get('i').properties));
    } finally {
        await s.close();
    }
}

/**
 * 
 * Citation Node Instances
 * 
 */

/**
 * @function listNodeCitations
 * @description Lists all citation instances associated with a node.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function listNodeCitations(req, res) {
    const s = session();
    try {
        const nodeId = req.params.nodeId;
        const result = await s.run(
            `MATCH (n:Node {id: $nodeId})<-[:ATTACHES_TO_NODE]-(i:CitationInstance)-[:CITES_SOURCE]->(s:Citation)
         RETURN s AS source, i AS instance`,
            { nodeId }
        );
        const citations = result.records.map(r => ({
            source: r.get('source').properties,
            ...r.get('instance').properties
        }));
        res.json(citations);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function createNodeCitationInstance
 * @description Create and link a citation instance to a Node.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createNodeCitationInstance(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    try {
        const nodeId = req.params.nodeId;
        const { source, title, page, url, quote, note } = req.body;
        if (!source || !source.id) {
            return res.status(400).json({ error: 'Missing required field: source.id' });
        }

        const sourceId = source.id;
        const id = uuidv7();
        const now = new Date().toISOString();

        // normalize empty fields
        const clean = {
            title: title || '',
            page: page || '',
            url: url || '',
            quote: quote || '',
            note: note || ''
        };

        // create, link, and return
        const result = await tx.run(`
            MATCH (c:Citation {id: $sourceId})
            MATCH (n:Node {id: $nodeId})
            CREATE (i:CitationInstance {
                id: $id,
                title: $title,
                page: $page,
                url: $url,
                quote: $quote,
                note: $note,
                createdAt: $now,
                updatedAt: $now
            })
            CREATE (i)-[:CITES_SOURCE]->(c)
            CREATE (i)-[:ATTACHES_TO_NODE]->(n)
            RETURN c AS source, i AS instance
        `, {
            sourceId,
            nodeId,
            id,
            title: clean.title,
            page: clean.page,
            url: clean.url,
            quote: clean.quote,
            note: clean.note,
            now
        });

        await tx.commit();

        // pull back the new data
        const record = result.records[0];
        const sourceNode = record.get('source').properties;
        const instanceNode = record.get('instance').properties;

        // merge into the same shape as listNodeCitations
        const full = {
            source: sourceNode,
            ...instanceNode
        };

        return res.status(201).json(full);
    } catch (err) {
        console.error(err);
        await tx.rollback();
        return res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function updateNodeCitationInstance
 * @description Update a node's citation instance.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function updateNodeCitationInstance(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    try {
        const nodeId = req.params.nodeId;
        const instanceId = req.params.id;
        const { title, page, url, quote, note } = req.body;
        const now = new Date().toISOString();

        // 1) Load existing and merge provided fields
        const loadResult = await tx.run(`
            MATCH (n:Node {id: $nodeId})<-[:ATTACHES_TO_NODE]-(i:CitationInstance {id: $instanceId})
            RETURN i { .title, .page, .url, .quote, .note } AS props
        `, { nodeId, instanceId });

        if (loadResult.records.length === 0) {
            await tx.rollback();
            return res.status(404).json({ error: 'Node citation instance not found' });
        }

        const existing = loadResult.records[0].get('props');
        const merged = {
            title: title !== undefined ? title : existing.title,
            page: page !== undefined ? page : existing.page,
            url: url !== undefined ? url : existing.url,
            quote: quote !== undefined ? quote : existing.quote,
            note: note !== undefined ? note : existing.note,
            updatedAt: now
        };

        // 2) Apply update and return both source & instance in one go
        const updateResult = await tx.run(`
            MATCH (c:Citation { }) // placeholder to ensure we can return c below
            WITH c
            MATCH (n:Node {id: $nodeId})<-[:ATTACHES_TO_NODE]-(i:CitationInstance {id: $instanceId})
            SET i += $merged
            WITH i
            MATCH (i)-[:CITES_SOURCE]->(c:Citation)
            RETURN c AS source, i AS instance
        `, { nodeId, instanceId, merged });

        await tx.commit();

        const record = updateResult.records[0];
        const sourceProps = record.get('source').properties;
        const instProps = record.get('instance').properties;

        // Shape it just like listNodeCitations
        const full = { source: sourceProps, ...instProps };

        return res.json(full);
    } catch (err) {
        console.error(err);
        await tx.rollback();
        return res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}


/**
 * @function deleteNodeCitationInstance
 * @description Delete a node's citation instance.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function deleteNodeCitationInstance(req, res) {
    const s = session();
    const tx = s.beginTransaction();
    try {
        const nodeId = req.params.nodeId;
        const instanceId = req.params.id;

        const result = await tx.run(
            `MATCH (n:Node {id: $nodeId})<-[:ATTACHES_TO_NODE]-(i:CitationInstance {id: $instanceId})
         DETACH DELETE i RETURN count(i) AS deleted`,
            { nodeId, instanceId }
        );
        if (result.records[0].get('deleted').toInt() === 0) {
            return res.status(404).json({ error: 'Not found' });
        }

        await tx.commit();
        res.status(204).end();
    } catch (err) {
        console.error(err);
        await tx.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * 
 * Citation Section Instances
 * 
 */

/**
 * @function listSectionCitations
 * @description Lists all citation instances associated with a specific section of a node.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function listSectionCitations(req, res) {
    const s = session();

    try {
        const { nodeId, sectionId } = req.params;

        const check = await s.run(`
            MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(sec:Section {id: $sectionId})
            RETURN sec
        `, { nodeId, sectionId });

        if (check.records.length === 0) {
            return res.status(404).json({ error: 'Section not found.' });
        }

        const result = await s.run(`
            MATCH (n:Node {id: $nodeId})-[:HAS_SECTION]->(sec:Section {id: $sectionId})
            MATCH (sec)<-[:ATTACHES_TO_SECTION]-(inst:CitationInstance)-[:CITES_SOURCE]->(src:Citation)
            RETURN src AS source, inst AS instance
        `, { nodeId, sectionId });

        const citations = result.records.map(r => ({
            source: r.get('source').properties,
            ...r.get('instance').properties
        }));

        res.json(citations);

    } catch (err) {
        console.error(err);
        await s.close();
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function createSectionCitationInstance
 * @description Create and link a citation instance to a specific Section of a Node.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createSectionCitationInstance(req, res) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const { nodeId, sectionId } = req.params;
        const { source, title, page, url, quote, note } = req.body;
        if (!source || !source.id) {
            return res.status(400).json({ error: 'Missing required field: source.id' });
        }

        const sourceId = source.id;
        const id = uuidv7();
        const now = new Date().toISOString();

        // normalize optional fields
        const clean = {
            title: title || '',
            page: page || '',
            url: url || '',
            quote: quote || '',
            note: note || ''
        };

        // create+link and return in one Cypher
        const result = await tx.run(`
            MATCH (c:Citation {id: $sourceId})
            MATCH (n:Node     {id: $nodeId})-[:HAS_SECTION]->(sec:Section {id: $sectionId})
            CREATE (i:CitationInstance {
                id:        $id,
                title:     $title,
                page:      $page,
                url:       $url,
                quote:     $quote,
                note:      $note,
                createdAt: $now,
                updatedAt: $now
            })
            CREATE (i)-[:CITES_SOURCE]->(c)
            CREATE (i)-[:ATTACHES_TO_SECTION]->(sec)
            RETURN c AS source, i AS instance
        `, {
            sourceId,
            nodeId,
            sectionId,
            id,
            title: clean.title,
            page: clean.page,
            url: clean.url,
            quote: clean.quote,
            note: clean.note,
            now
        });

        await tx.commit();

        const record = result.records[0];
        const sourceProps = record.get('source').properties;
        const instProps = record.get('instance').properties;

        return res.status(201).json({
            source: sourceProps,
            ...instProps
        });
    } catch (err) {
        console.error(err);
        await tx.rollback();
        return res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function updateSectionCitationInstance
 * @description Update a section's citation instance.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function updateSectionCitationInstance(req, res) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const { nodeId, sectionId, id: instanceId } = req.params;
        const { title, page, url, quote, note } = req.body;
        const now = new Date().toISOString();

        // 1) Load existing props
        const loadResult = await tx.run(`
            MATCH (n:Node {id: $nodeId})
                -[:HAS_SECTION]->(sec:Section {id: $sectionId})
                <-[:ATTACHES_TO_SECTION]-(i:CitationInstance {id: $instanceId})
            RETURN i { .title, .page, .url, .quote, .note } AS props
        `, { nodeId, sectionId, instanceId });

        if (loadResult.records.length === 0) {
            await tx.rollback();
            return res.status(404).json({ error: 'Section citation instance not found for this section' });
        }
        const existing = loadResult.records[0].get('props');

        // 2) Merge in updates
        const merged = {
            title: title !== undefined ? title : existing.title,
            page: page !== undefined ? page : existing.page,
            url: url !== undefined ? url : existing.url,
            quote: quote !== undefined ? quote : existing.quote,
            note: note !== undefined ? note : existing.note,
            updatedAt: now
        };

        // 3) Apply update + return full
        const updateResult = await tx.run(`
            MATCH (n:Node {id: $nodeId})
                -[:HAS_SECTION]->(sec:Section {id: $sectionId})
                <-[:ATTACHES_TO_SECTION]-(i:CitationInstance {id: $instanceId})
            SET i += $merged
            WITH i
            MATCH (i)-[:CITES_SOURCE]->(c:Citation)
            RETURN c AS source, i AS instance
        `, { nodeId, sectionId, instanceId, merged });

        await tx.commit();

        const record = updateResult.records[0];
        const sourceProps = record.get('source').properties;
        const instProps = record.get('instance').properties;

        return res.json({
            source: sourceProps,
            ...instProps
        });
    } catch (err) {
        console.error(err);
        await tx.rollback();
        return res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

/**
 * @function deleteSectionCitationInstance
 * @description Delete a Section’s citation instance.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function deleteSectionCitationInstance(req, res) {
    const s = session();
    const tx = s.beginTransaction();

    try {
        const { nodeId, sectionId, id: instanceId } = req.params;

        const result = await tx.run(
            `
        // ensure the section belongs to the node
        MATCH (n:Node {id: $nodeId})
          -[:HAS_SECTION]->(sec:Section {id: $sectionId})
  
        // find the instance attached to that section
        OPTIONAL MATCH (sec)<-[:ATTACHES_TO_SECTION]-(i:CitationInstance {id: $instanceId})
  
        // delete it if it exists
        WITH i
        DETACH DELETE i
        RETURN count(i) AS deleted
        `,
            { nodeId, sectionId, instanceId }
        );

        const deletedCount = result.records[0].get('deleted').toInt();
        if (deletedCount === 0) {
            await tx.rollback();
            return res.status(404).json({ error: 'Citation instance not found for this section' });
        }

        await tx.commit();
        return res.status(204).end();
    } catch (err) {
        console.error(err);
        await tx.rollback();
        return res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}

