/**
 * @file api/export.js
 * @description Export functionality for nodes and trees in various formats (Turtle RDF, JSON, Text)
 */

import { dbNodeFetch, dbNodeTree } from '../storage/node.js';

/**
 * Converts a node object into Turtle RDF format with proper ontology prefixes.
 * 
 * @function toTurtle
 * @description 
 *   Serializes a node and its relationships into Turtle RDF format using unending.wiki ontology.
 *   Handles nested children recursively and creates proper RDF triples for all node properties.
 * 
 * @param {object} nodeObj - The node object to convert
 * @param {string} nodeObj.id - Node ID (required)
 * @param {string} nodeObj.title - Node title
 * @param {string} [nodeObj.subtitle] - Node subtitle
 * @param {string} [nodeObj.content] - Node content (will be serialized as multi-line string)
 * @param {string} [nodeObj.status] - Node status
 * @param {string[]} [nodeObj.aliases] - Array of node aliases
 * @param {string[]} [nodeObj.tags] - Array of node tags
 * @param {Array<{url:string,title:string}>} [nodeObj.links] - Array of external links
 * @param {string} [nodeObj.createdAt] - ISO timestamp of creation
 * @param {string} [nodeObj.updatedAt] - ISO timestamp of last update
 * @param {string} [nodeObj.image] - Image ID if linked
 * @param {object} [nodeObj.imageCrop] - Image crop settings
 * @param {Array<{label:string,type:string,value:any}>} [nodeObj.details] - Node details
 * @param {Array<{left:{id:string},relationship:string,right:{id:string}}>} [nodeObj.relationships] - Node relationships
 * @param {Array<object>} [nodeObj.children] - Child nodes (processed recursively)
 * 
 * @returns {string} Complete Turtle RDF document with prefixes and triples
 * 
 * @throws {Error} When nodeObj is invalid or missing required id property
 * 
 * @example
 * const turtle = toTurtle({
 *   id: '123',
 *   title: 'Example Node',
 *   content: 'This is example content',
 *   aliases: ['alias1', 'alias2']
 * });
 */
export function toTurtle(nodeObj) {
    if (!nodeObj || !nodeObj.id) {
        throw new Error('Invalid node object');
    }

    const prefixes = `
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix un:   <http://unending.wiki/ontology/> .
@prefix node: <http://unending.wiki/node/> .
@prefix rel:  <http://unending.wiki/relationship/> .`.trim();

    const tripleMap = new Map();
    const seen = new Set();

    /**
     * Escapes special characters for Turtle string literals.
     * @param {any} str - Value to escape
     * @returns {string} Escaped string safe for Turtle format
     */
    function escape(str) {
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    }

    /**
     * Adds a triple to the triple map for a given subject.
     * @param {string} subject - RDF subject
     * @param {string} predicate - RDF predicate  
     * @param {string} object - RDF object
     */
    function addTriple(subject, predicate, object) {
        if (!tripleMap.has(subject)) {
            tripleMap.set(subject, []);
        }
        tripleMap.get(subject).push(`${predicate} ${object}`);
    }

    /**
     * Recursively serializes a node object into RDF triples.
     * @param {object} obj - Node object to serialize
     */
    function serialize(obj) {
        if (seen.has(obj.id)) return;
        seen.add(obj.id);

        const subj = `node:${obj.id}`;

        addTriple(subj, 'a', 'un:Node');
        addTriple(subj, 'un:id', `"${escape(obj.id)}"`);
        addTriple(subj, 'un:title', `"${escape(obj.title || '')}"`);

        if (obj.subtitle) {
            addTriple(subj, 'un:subtitle', `"${escape(obj.subtitle)}"`);
        }

        if (obj.parentIdentifier) {
            addTriple(
                subj,
                'un:parentIdentifier',
                `"${escape(obj.parentIdentifier)}"`
            );
        }

        if (typeof obj.content === 'string') {
            const lines = obj.content.split(/\r?\n/);
            const block = ['"""', ...lines, '"""'].join('\n');
            addTriple(subj, 'un:content', block);
        }

        if (obj.status != null) {
            addTriple(subj, 'un:status', `"${escape(obj.status)}"`);
        }

        // Handle aliases array
        if (obj.aliases && Array.isArray(obj.aliases)) {
            obj.aliases.forEach(alias => {
                addTriple(subj, 'un:alias', `"${escape(alias)}"`);
            });
        }

        // Handle tags array
        if (obj.tags && Array.isArray(obj.tags)) {
            obj.tags.forEach(tag => {
                addTriple(subj, 'un:tag', `"${escape(tag)}"`);
            });
        }

        // Handle links array
        if (obj.links && Array.isArray(obj.links)) {
            obj.links.forEach((link, i) => {
                const linkB = `_:link_${obj.id}_${i}`;
                addTriple(subj, 'un:hasLink', linkB);
                addTriple(linkB, 'a', 'un:Link');
                if (link.url) addTriple(linkB, 'un:url', `"${escape(link.url)}"`);
                if (link.title) addTriple(linkB, 'un:linkTitle', `"${escape(link.title)}"`);
            });
        }

        if (obj.createdAt) {
            addTriple(
                subj,
                'un:createdAt',
                `"${escape(obj.createdAt)}"^^xsd:dateTime`
            );
        }

        if (obj.updatedAt) {
            addTriple(
                subj,
                'un:updatedAt',
                `"${escape(obj.updatedAt)}"^^xsd:dateTime`
            );
        }

        if (obj.image) {
            const imgB = `_:img_${obj.id}`;
            addTriple(subj, 'un:hasImage', imgB);
            addTriple(imgB, 'a', 'un:Image');
            addTriple(imgB, 'un:id', `"${escape(obj.image)}"`);
            
            if (obj.imageCrop) {
                addTriple(imgB, 'un:cropX', `"${obj.imageCrop.x}"^^xsd:decimal`);
                addTriple(imgB, 'un:cropY', `"${obj.imageCrop.y}"^^xsd:decimal`);
                addTriple(imgB, 'un:cropWidth', `"${obj.imageCrop.width}"^^xsd:decimal`);
                addTriple(imgB, 'un:cropHeight', `"${obj.imageCrop.height}"^^xsd:decimal`);
            }
        }

        (obj.details || []).forEach((d, i) => {
            const dB = `_:detail_${obj.id}_${i}`;
            addTriple(subj, 'un:hasDetail', dB);
            addTriple(dB, 'a', 'un:Detail');
            addTriple(dB, 'un:detailLabel', `"${escape(d.label || '')}"`);
            addTriple(dB, 'un:detailType', `"${escape(d.type || '')}"`);
            const rawVal =
                typeof d.value === 'string' ? d.value : JSON.stringify(d.value);
            addTriple(dB, 'un:detailValue', `"${escape(rawVal)}"`);
        });

        (obj.relationships || []).forEach((r, i) => {
            const rB = `_:rel_${obj.id}_${i}`;
            addTriple(subj, 'un:hasRelationshipStatement', rB);
            addTriple(rB, 'a', 'un:RelationshipStatement');
            const leftId = r.left?.id === 'SELF' ? obj.id : r.left?.id;
            const rightId = r.right?.id === 'SELF' ? obj.id : r.right?.id;
            addTriple(rB, 'un:leftSubject', `"${escape(leftId || '')}"`);
            addTriple(
                rB,
                'un:relationType',
                `"${escape(r.relationship || '')}"`
            );
            addTriple(rB, 'un:rightObject', `"${escape(rightId || '')}"`);
        });

        (obj.children || []).forEach(child => {
            addTriple(subj, 'un:hasChild', `node:${child.id}`);
            serialize(child);
        });
    }

    serialize(nodeObj);

    const blocks = [];
    for (const [subject, triples] of tripleMap) {
        if (!triples.length) continue;
        const lines = [];
        // emit subject + first triple on one line
        const firstSep = triples.length === 1 ? ' .' : ' ;';
        lines.push(`${subject} ${triples[0]}${firstSep}`);

        // emit remaining triples
        for (let i = 1; i < triples.length; i++) {
            const sep = i === triples.length - 1 ? ' .' : ' ;';
            lines.push(`    ${triples[i]}${sep}`);
        }

        blocks.push(lines.join('\n'));
    }

    return prefixes + '\n\n' + blocks.join('\n\n') + '\n';
}

/**
 * Exports a single node in the specified format (Turtle RDF or JSON).
 * 
 * @function exportNode
 * @async
 * @description
 *   HTTP GET /export/node/:id - Exports a single node with all its properties,
 *   details, and relationships. Children are excluded from single node exports.
 * 
 * URL parameters:
 *   • `id` (string) — UUID of the node to export
 * 
 * Query parameters:
 *   • `format` (string) — Export format, must be "ttl" (Turtle) or "json"
 * 
 * @param {import('express').Request} req - Express request object
 * @param {string} req.params.id - Node ID to export
 * @param {string} req.query.format - Export format ("ttl" or "json")
 * @param {string} req.userId - User ID from auth middleware
 * @param {string[]} req.roles - User roles from auth middleware
 * @param {import('express').Response} res - Express response object
 * 
 * @returns {Promise<void>} Responds with exported node data
 * 
 * @throws {Error} 400 - Invalid format parameter
 * @throws {Error} 403 - Insufficient permissions
 * @throws {Error} 404 - Node not found
 * @throws {Error} 500 - Internal server error
 * 
 * @example
 * ```bash
 * curl "http://localhost:3000/export/node/550e8400-e29b-41d4-a716-446655440000?format=ttl"
 * curl "http://localhost:3000/export/node/550e8400-e29b-41d4-a716-446655440000?format=json"
 * ```
 */
export async function exportNode(req, res) {
    const { id } = req.params;
    const format = req.query.format?.trim().toLowerCase();

    // Validate format parameter
    if (!format || !['ttl', 'json'].includes(format)) {
        return res.status(400).json({ 
            error: 'Invalid format. Must be "ttl" or "json"' 
        });
    }

    try {
        const node = await dbNodeFetch(id, req.userId, req.roles);
        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }

        // Remove children for single node export
        delete node.children;
        
        // Set parent identifier from breadcrumbs
        if (node.breadcrumbs && node.breadcrumbs.length > 1) {
            node.parentIdentifier = node.breadcrumbs[node.breadcrumbs.length - 2].title;
            if (node.parentIdentifier === 'Unending.Wiki') {
                node.parentIdentifier = 'ROOT';
            }
        }
        delete node.breadcrumbs;

        switch (format) {
            case 'ttl':
                res.setHeader('Content-Type', 'text/turtle');
                res.send(toTurtle(node));
                break;
            case 'json':
                res.json(node);
                break;
        }
    } catch (err) {
        console.error('Export node error:', err);

        if (err.message.startsWith('INVALID_')) {
            return res.status(400).json({ error: err.message });
        }

        switch (err.message) {
            case 'INSUFFICIENT_PERMISSIONS':
                return res.status(403).json({ error: 'Insufficient permissions' });
            case 'NODE_NOT_FOUND':
                return res.status(404).json({ error: 'Node not found' });
            default:
                return res.status(500).json({ error: 'Failed to export node' });
        }
    }
}

/**
 * Converts a hierarchical tree object into formatted plain text with numbered outline.
 * 
 * @function toText
 * @description
 *   Creates a numbered outline format from a tree structure, using indentation
 *   and hierarchical numbering (1, 1.1, 1.1.1, etc.). Uses subtitle or content
 *   as description if available.
 * 
 * @param {object} treeObj - Tree object with children
 * @param {string} treeObj.title - Root title
 * @param {string} [treeObj.subtitle] - Root subtitle
 * @param {string} [treeObj.content] - Root content
 * @param {Array<object>} [treeObj.children] - Array of child nodes
 * @param {string} treeObj.children[].title - Child title
 * @param {string} [treeObj.children[].subtitle] - Child subtitle
 * @param {string} [treeObj.children[].content] - Child content
 * @param {Array<object>} [treeObj.children[].children] - Nested children
 * 
 * @returns {string} Formatted text outline with numbered hierarchy
 * 
 * @example
 * // Input tree:
 * {
 *   title: "Root",
 *   children: [
 *     { title: "Chapter 1", subtitle: "Introduction" },
 *     { title: "Chapter 2", subtitle: "Methods", children: [...] }
 *   ]
 * }
 * 
 * // Output:
 * 1. Chapter 1 - Introduction
 * 2. Chapter 2 - Methods
 *     2.1. Subsection - Details
 */
function toText(treeObj) {
    let output = [];

    /**
     * Recursively traverses tree nodes and builds numbered outline.
     * @param {object} node - Current node to process
     * @param {number} level - Current indentation level
     * @param {number[]} path - Current numbering path (e.g., [1, 2, 3])
     */
    function traverse(node, level, path) {
        // Construct the current numbering (e.g., "1", "1.1", "1.1.1")
        const currentNumber = path.join('.');

        // Create the indentation string (e.g., "", "   ", "      ")
        const indent = '    '.repeat(level); // 4 spaces per level

        // Use subtitle if available, otherwise use content or placeholder
        const description = node.subtitle || 'No description';
        
        // Add the formatted line to our output array
        output.push(`${indent}${currentNumber}. ${node.title} - ${description}`);

        // Recursively process children
        if (node.children && node.children.length > 0) {
            for (let i = 0; i < node.children.length; i++) {
                // Create the path for the child node
                const childPath = [...path, i + 1]; // Increment for 1-based numbering
                traverse(node.children[i], level + 1, childPath);
            }
        }
    }

    // Instead of traversing the root, iterate over its children
    if (treeObj.children && treeObj.children.length > 0) {
        for (let i = 0; i < treeObj.children.length; i++) {
            // Each child of the original root becomes a top-level item (level 0)
            // and starts its own path (e.g., [1], [2], etc.)
            traverse(treeObj.children[i], 0, [i + 1]);
        }
    }

    return output.join('\n');
}

/**
 * Exports a complete node tree in the specified format (JSON or plain text).
 * 
 * @function exportTree
 * @async
 * @description
 *   HTTP GET /export/tree/:id - Exports a hierarchical tree starting from the specified
 *   node, including all descendants up to the specified depth. Can output as flattened
 *   JSON array or numbered plain text outline.
 * 
 * URL parameters:
 *   • `id` (string) — UUID of the root node for tree export
 * 
 * Query parameters:
 *   • `format` (string) — Export format, must be "json" or "txt"
 *   • `depth` (number, optional) — Maximum tree depth (1-100, default 100)
 * 
 * @param {import('express').Request} req - Express request object
 * @param {string} req.params.id - Root node ID for tree export
 * @param {string} req.query.format - Export format ("json" or "txt")
 * @param {string} [req.query.depth] - Maximum depth to traverse (default 100)
 * @param {string} req.userId - User ID from auth middleware
 * @param {string[]} req.roles - User roles from auth middleware
 * @param {import('express').Response} res - Express response object
 * 
 * @returns {Promise<void>} Responds with exported tree data
 * 
 * @throws {Error} 400 - Invalid format or depth parameter
 * @throws {Error} 403 - Insufficient permissions
 * @throws {Error} 404 - Node not found
 * @throws {Error} 500 - Internal server error
 * 
 * @example
 * ```bash
 * # Export as flattened JSON array
 * curl "http://localhost:3000/export/tree/550e8400-e29b-41d4-a716-446655440000?format=json&depth=3"
 * 
 * # Export as numbered text outline
 * curl "http://localhost:3000/export/tree/550e8400-e29b-41d4-a716-446655440000?format=txt"
 * ```
 */
export async function exportTree(req, res) {
    const { id } = req.params;
    const format = req.query.format?.trim().toLowerCase();
    const depth = parseInt(req.query.depth) || 100;

    // Validate format parameter
    if (!format || !['json', 'txt'].includes(format)) {
        return res.status(400).json({ 
            error: 'Invalid format. Must be "json" or "txt"' 
        });
    }

    // Validate depth parameter
    if (depth < 1 || depth > 100) {
        return res.status(400).json({ 
            error: 'Depth must be between 1 and 100' 
        });
    }

    /**
     * Recursively flattens a hierarchical tree into a flat array of nodes.
     * @param {object} node - Root node of tree to flatten
     * @param {Array<object>} [flattenedArray] - Accumulator array for results
     * @returns {Array<{title:string,id:string,parentId:string,subtitle:string,content:string}>} Flattened node array
     */
    function flattenTree(node, flattenedArray = []) {
        // Add the current node (excluding children) to the flattened array
        const { title, id, parentId, subtitle, content } = node;
        flattenedArray.push({ title, id, parentId, subtitle, content });

        // Recursively process children
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                flattenTree(child, flattenedArray);
            }
        }

        return flattenedArray;
    }

    try {
        const node = await dbNodeTree(id, req.userId, req.roles, depth);
        
        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }

        switch (format) {
            case 'json':
                res.json(flattenTree(node));
                break;
            case 'txt':
                res.setHeader('Content-Type', 'text/plain');
                res.send(toText(node));
                break;
        }

    } catch (err) {
        console.error('Export tree error:', err);

        if (err.message.startsWith('INVALID_')) {
            return res.status(400).json({ error: err.message });
        }

        switch (err.message) {
            case 'INSUFFICIENT_PERMISSIONS':
                return res.status(403).json({ error: 'Insufficient permissions' });
            case 'NODE_NOT_FOUND':
                return res.status(404).json({ error: 'Node not found' });
            default:
                return res.status(500).json({ error: 'Failed to export tree' });
        }
    }
}
