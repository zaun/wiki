import fs from 'fs';
import { parse } from 'csv-parse/sync';

// Compare function to sort keys like "1.1.1.2" correctly
function compareKeys(a, b) {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aNum = aParts[i] ?? 0;
    const bNum = bParts[i] ?? 0;
    if (aNum !== bNum) return aNum - bNum;
  }
  return 0;
}

// Build a tree structure from flat data for proper nesting and sorting
function buildTree(data) {
  const nodes = {};
  const assignedAsChild = new Set();

  // Create all nodes
  for (const row of data) {
    const id = row.ID || row.id || row[0];
    const title = row.Title || row.title || row[1];
    const desc = row.Definition || row.definition || row[2] || '';

    const cleanDesc = desc.replace(/^"+|"+$/g, '').replace(/\r?\n/g, ' ').trim();

    nodes[id] = { id, title, desc: cleanDesc, children: [] };
  }

  // Assign children to parents
  for (const id in nodes) {
    const node = nodes[id];
    const parentId = id.includes('.') ? id.split('.').slice(0, -1).join('.') : null;

    if (parentId && parentId !== id && nodes[parentId]) {
      nodes[parentId].children.push(node);
      assignedAsChild.add(id);
    }
  }

  // Root nodes are those not assigned as children
  const root = {};
  for (const id in nodes) {
    if (!assignedAsChild.has(id)) {
      root[id] = nodes[id];
    }
  }

  return root;
}

// Recursively format the tree into the output string
function formatTree(nodes, level = 0) {
  const indent = '    '.repeat(level);
  let output = '';

  // nodes is an array here
  nodes.sort((a, b) => compareKeys(a.id, b.id));

  for (const node of nodes) {
    const id = node.id.endsWith('.') ? node.id.slice(0, -1) : node.id;

    output += `${indent}${id} ${node.title}`;
    if (node.desc) output += ` - ${node.desc}`;
    output += '\n';

    if (node.children.length > 0) {
      output += formatTree(node.children, level + 1);
    }
  }
  return output;
}

// Main function to process input and output files
function processCsvFile(inputFile, outputFile) {
  try {
    const csvContent = fs.readFileSync(inputFile, { encoding: 'utf8' });

    // Parse CSV with csv-parse, auto-detect header row
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
    });

    const tree = buildTree(records);
    const rootNodes = Object.values(tree);
    const formatted = formatTree(rootNodes);
    fs.writeFileSync(outputFile, formatted, { encoding: 'utf8' });
    console.log(`Processed "${inputFile}" and saved to "${outputFile}".`);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

// CLI argument handling
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node csvToFlat.js <input_csv_file> <output_txt_file>');
  process.exit(1);
}

processCsvFile(args[0], args[1]);