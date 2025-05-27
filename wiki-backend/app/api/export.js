/**
 * @file api/export.js
 * @description 
 */


import { dbNodeFetch, dbNodeTree } from '../storage/node.js';

/**
 * Converts a node‐tree (as returned by dbNodeFetch) into grouped Turtle.
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

    function escape(str) {
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    }

    function addTriple(subject, predicate, object) {
        if (!tripleMap.has(subject)) {
            tripleMap.set(subject, []);
        }
        tripleMap.get(subject).push(`${predicate} ${object}`);
    }

    function serialize(obj) {
        if (seen.has(obj.id)) return;
        seen.add(obj.id);

        const subj = `node:${obj.id}`;

        addTriple(subj, 'a', 'un:Node');
        addTriple(subj, 'un:id', `"${escape(obj.id)}"`);
        addTriple(subj, 'un:title', `"${escape(obj.title)}"`);

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

        if (obj.alias != null) {
            addTriple(subj, 'un:alias', `"${escape(obj.alias)}"`);
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
        }

        (obj.details || []).forEach((d, i) => {
            const dB = `_:detail_${obj.id}_${i}`;
            addTriple(subj, 'un:hasDetail', dB);
            addTriple(dB, 'a', 'un:Detail');
            addTriple(dB, 'un:detailLabel', `"${escape(d.label)}"`);
            addTriple(dB, 'un:detailType', `"${escape(d.type)}"`);
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
                `"${escape(r.relationship)}"`
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

export async function exportNode(req, res) {
    const { id } = req.params;
    const format = req.query.format?.trim();

    try {
        const node = await dbNodeFetch(id);
        if (!node) {
            return res.status(404).json({ error: 'Not found' });
        }

        delete node.children;
        if (node.breadcrumbs.length > 1) {
            node.parentIdentifier = node.breadcrumbs[node.breadcrumbs.length - 2].title;
            if (node.parentIdentifier === 'Unending.Wiki') {
                node.parentIdentifier = 'ROOT';
            }
        }
        delete node.breadcrumbs;

        switch (format.toLowerCase()) {
            case 'ttl':
                res.send(toTurtle(node));
                break;
            case 'json':
                res.json(node);
                break;
            default:
                res.send('format query must be ttl or json');
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}

function toText(treeObj) {
    let output = [];

    function traverse(node, level, path) {
        // Construct the current numbering (e.g., "1", "1.1", "1.1.1")
        const currentNumber = path.join('.');

        // Create the indentation string (e.g., "", "   ", "      ")
        const indent = '    '.repeat(level); // 4 spaces per level

        // Add the formatted line to our output array
        output.push(`${indent}${currentNumber}. ${node.title} - ${node.definition}`);

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

export async function exportTree(req, res) {
    const { id } = req.params;
    const format = req.query.format?.trim();

    function flattenTree(node, flattenedArray = []) {
        // Add the current node (excluding children) to the flattened array
        const { title, id, parentId } = node;
        flattenedArray.push({ title, id, parentId });

        // Recursively process children
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                flattenTree(child, flattenedArray);
            }
        }

        return flattenedArray;
    }

    try {
        const node = await dbNodeTree(id);

        switch (format.toLowerCase()) {
            case 'json':
                res.json(flattenTree(node));
                break;
            case 'txt':
                res.send(toText(node));
                break;
            default:
                res.send('format query must be json');
        }

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}
