import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

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

// Parse flat text lines into objects { id, title, definition }
function parseFlatText(flatText) {
  const lines = flatText.split('\n').filter(line => line.trim() !== '');
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Extract ID at start (digits and dots)
    const idMatch = trimmed.match(/^([\d.]+)\s+(.*)$/);
    if (!idMatch) {
      console.warn(`Skipping unparsable line: ${line}`);
      continue;
    }
    const id = idMatch[1];
    const rest = idMatch[2];

    // Split rest into title and definition by last occurrence of ' - '
    const lastDashIndex = rest.lastIndexOf(' - ');
    let title, definition;
    if (lastDashIndex === -1) {
      // No dash separator, entire rest is title
      title = rest.trim();
      definition = '';
    } else {
      title = rest.slice(0, lastDashIndex).trim();
      definition = rest.slice(lastDashIndex + 3).trim();
    }

    entries.push({ id, title, definition });
  }
  return entries;
}

// Merge flat entries into CSV records
function mergeEntries(csvRecords, flatEntries, idKey, titleKey, defKey) {
  // Create a map of CSV records by ID for quick lookup
  const csvMap = new Map();
  for (const rec of csvRecords) {
    csvMap.set(rec[idKey], rec);
  }

  // Track IDs in flatEntries to detect new entries
  const flatIds = new Set();

  for (const entry of flatEntries) {
    flatIds.add(entry.id);
    if (csvMap.has(entry.id)) {
      // Update existing record's title and definition
      const rec = csvMap.get(entry.id);
      rec[titleKey] = entry.title;
      rec[defKey] = entry.definition;
    } else {
      // Add new record with empty values for other columns
      const newRec = {};
      for (const key of Object.keys(csvRecords[0])) {
        newRec[key] = '';
      }
      newRec[idKey] = entry.id;
      newRec[titleKey] = entry.title;
      newRec[defKey] = entry.definition;
      csvRecords.push(newRec);
      csvMap.set(entry.id, newRec);
    }
  }

  return csvRecords;
}

// Main function
function mergeFlatInCsv(csvFile, flatFile, outputFile) {
  try {
    const csvContent = fs.readFileSync(csvFile, 'utf8');
    const flatContent = fs.readFileSync(flatFile, 'utf8');

    // Parse CSV with headers
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
    });

    if (records.length === 0) {
      console.error('CSV file is empty or invalid.');
      process.exit(1);
    }

    // Detect keys for ID, Title, Definition (case-insensitive)
    const headers = Object.keys(records[0]);
    const idKey = headers.find(h => h.toLowerCase() === 'id');
    const titleKey = headers.find(h => h.toLowerCase() === 'title');
    const defKey = headers.find(h => h.toLowerCase() === 'definition');

    if (!idKey || !titleKey || !defKey) {
      console.error('CSV must have ID, Title, and Definition columns.');
      process.exit(1);
    }

    // Parse flat text entries
    const flatEntries = parseFlatText(flatContent);

    // Merge
    const mergedRecords = mergeEntries(records, flatEntries, idKey, titleKey, defKey);

    // Sort by ID for logical hierarchical order
    mergedRecords.sort((a, b) => compareKeys(a[idKey], b[idKey]));

    // Stringify back to CSV
    const outputCsv = stringify(mergedRecords, {
      header: true,
      columns: headers,
    });

    fs.writeFileSync(outputFile, outputCsv, 'utf8');
    console.log(`Merged CSV saved to "${outputFile}".`);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error('Usage: node mergeFlatInCsv.js <flat.txt> <data.csv> <output.csv>');
  process.exit(1);
}

mergeFlatInCsv(args[1], args[0], args[2]);
