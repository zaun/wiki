/**
 * @file api/search.js
 * @description 
 */
import neo4j from 'neo4j-driver';
import { session } from '../storage/neo4j.js';
import * as lucene from 'lucene';

function boost(ast, boosts) {
    if (!ast) return ast;

    // If it's a term node with a field
    if (ast.field !== undefined && ast.term !== undefined) {
        const normalizedField = ast.field.toLowerCase();

        if ((ast.boost == null) && boosts[normalizedField] !== undefined) {
            ast.boost = boosts[normalizedField];
        }

        return ast;
    }

    // If it's a compound node with left/right
    if (ast.left || ast.right) {
        if (ast.left) ast.left = boost(ast.left, boosts);
        if (ast.right) ast.right = boost(ast.right, boosts);
        return ast;
    }

    return ast;
}

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

    let ast;
    try {
        ast = lucene.parse(textQuery);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid query syntax.' });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const size = Math.max(parseInt(req.query.size, 10) || 20, 1);
    const skip = (page - 1) * size;

    const nodeBoosts = {
        title: 2,
        aliases: 1,
        content: 0.5,
    };
    const sectionBoosts = {
        title: 0.75,
        content: 0.25,
    };
    const citationBoosts = {
        title: 0.5,
        author: 0.25,
        publisher: 0.25,
        type: 0.06,
    };

    const nodeAst = boost(JSON.parse(JSON.stringify(ast)), nodeBoosts);
    const sectionAst = boost(JSON.parse(JSON.stringify(ast)), sectionBoosts);
    const citationAst = boost(JSON.parse(JSON.stringify(ast)), citationBoosts);

    const nodeQuery = lucene.toString(nodeAst);
    const sectionQuery = lucene.toString(sectionAst);
    const citationQuery = lucene.toString(citationAst);

    try {
        const result = await s.run(`
	CALL {
		// 1) node index
		CALL db.index.fulltext.queryNodes('node_fulltext_index', $nodeQuery) YIELD node, score
		WHERE node IS NOT NULL
		RETURN node AS node,
			score AS score,
			'entity' AS type,
			node.content AS matchContent

		UNION ALL

		// 2) section index
		CALL db.index.fulltext.queryNodes('section_fulltext_index', $sectionQuery) YIELD node AS sec, score
		WHERE sec IS NOT NULL
		MATCH (parent:Node)-[:HAS_SECTION]->(sec)
		WHERE parent IS NOT NULL
		RETURN parent AS node,
			score AS score,
			'section' AS type,
			'(' + sec.title + ') ' + sec.content AS matchContent

		UNION ALL

		// 3) citation index
		CALL db.index.fulltext.queryNodes('citation_fulltext_index', $citationQuery) YIELD node AS cit, score
		WHERE cit IS NOT NULL
		MATCH (cit)-[:ATTACHES_TO_NODE]->(cnode:Node)
		WHERE cnode IS NOT NULL
		RETURN cnode AS node,
			score AS score,
			'citation' AS type,
			(cit.title + ', ' + cit.author + ', ' + cit.publisher) AS matchContent
	}
	WITH node, score, type, matchContent
	WHERE node.status IN ['complete', 'stub']
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
`, {
            nodeQuery,
            sectionQuery,
            citationQuery,
            skip: neo4j.int(skip),
            limit: neo4j.int(size),
        });


        console.log('nodeQuery:', nodeQuery);
        console.log('sectionQuery:', sectionQuery);
        console.log('citationQuery:', citationQuery);

        const nodes = result.records.map(r => ({
            id: r.get('id'),
            title: r.get('title'),
            summary: r.get('content'),
            status: r.get('status'),
            matchType: r.get('type'),
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
