/**
 * @file api/search.js
 * @description 
 */
import neo4j from 'neo4j-driver';
import { session } from '../storage/neo4j.js';

/**
 * @function search
 * @async
 * @description
 *   HTTP GET /api/search — retrieves nodes matching an optional title substring and/or tag.
 *
 * Query parameters:
 *   • `q` (string, optional) — case‑insensitive query  
 *
 *
 * @example
 * ```bash
 * curl "http://localhost:3000/api/search?q=test"
 * ```
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function search(req, res) {
    const s = session();

    const textQuery = req.query.q?.trim();
    if (!textQuery) {
        return res.status(400).json({ error: 'Missing required parameter: q' });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const size = Math.max(parseInt(req.query.size, 10) || 20, 1);
    const skip = (page - 1) * size;

    const nodeBoosts = {
        title: 2,
        aliases: 1,
        content: 0.5,
    };
    const nodeQuery = Object
        .entries(nodeBoosts)
        .map(([prop, boost]) => `${prop}:(${textQuery})^${boost}`)
        .join(' ');

    const sectionBoosts = {
        title: 0.75,
        content: 0.25,
    };
    const sectionQuery = Object
        .entries(sectionBoosts)
        .map(([prop, boost]) => `${prop}:(${textQuery})^${boost}`)
        .join(' ');

    const citationBoosts = {
        title: 0.5,
        author: 0.25,
        publisher: 0.25,
        type: 0.06,
    };
    const citationQuery = Object
        .entries(citationBoosts)
        .map(([prop, boost]) => `${prop}:(${textQuery})^${boost}`)
        .join(' ');

    try {
        const result = await s.run(`
			CALL {
				// 1) node index
				CALL db.index.fulltext.queryNodes('node_fulltext_index', $nodeQuery) YIELD node, score
				RETURN node AS node,
					score AS score,
					'entity' AS type,
					node.content AS matchContent

				UNION ALL

				// 2) section index
				CALL db.index.fulltext.queryNodes('section_fulltext_index', $sectionQuery) YIELD node AS sec, score
				MATCH (parent:Node)-[:HAS_SECTION]->(sec)
				RETURN parent AS node,
					score AS score,
					'section' AS type,
					'(' + sec.title + ') ' + sec.content AS matchContent

				UNION ALL

				// 3) citation index
				CALL db.index.fulltext.queryNodes('citation_fulltext_index', $citationQuery) YIELD node AS cit, score
				MATCH (cit)-[:ATTACHES_TO_NODE]->(cnode:Node)
				RETURN cnode AS node,
					score AS score,
					'citation' AS type,
					(cit.title + ', ' + cit.author + ', ' + cit.publisher) AS matchContent
			}
			WITH node, score, type, matchContent
			WHERE node.status = 'complete'
			WITH 
				node,
				collect({c: matchContent, s: score, t: type}) AS hits,
				node.summary AS fallback,
				sum(score) AS qualityScore
			WITH
				node,
				qualityScore,
				fallback,
				[h IN hits WHERE h.c IS NOT NULL AND h.c <> ''] AS realHits
			WITH
				node,
				qualityScore,
			CASE 
				WHEN size(realHits) > 0 THEN
				reduce(best = {c:'', s:toFloat(0), t:''}, h IN realHits |
					CASE WHEN h.s > best.s THEN h ELSE best END
				)
				ELSE
				{c: fallback, s: 0.0, t: 'fallback'}
			END AS content
			RETURN
				node.id        AS id,
				node.title     AS title,
				content.c      AS content,
				content.t      AS type,
				node.status    AS status,
				qualityScore   AS qualityScore
			ORDER BY qualityScore DESC, node.updatedAt DESC
			SKIP $skip
			LIMIT $limit

            `,
            {
                nodeQuery,
                sectionQuery,
                citationQuery,
                skip: neo4j.int(skip),
                limit: neo4j.int(size)
            }
        );


        const nodes = result.records.map(r => ({
            id: r.get('id'),
            title: r.get('title'),
            summary: r.get('content'),
            status: r.get('status'),
            mathcType: r.get('type'),
            qualityScore: r.get('qualityScore'),
        }));

        res.json({
            page,
            size,
            results: nodes
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        await s.close();
    }
}
