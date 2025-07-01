import { readFileSync } from 'fs';

function arrayToCSV(data, delimiter = ',') {
  return data
    .map(row =>
      row
        .map(cell => {
          let str = String(cell);
          if (str.includes('"')) str = str.replace(/"/g, '""');
          if (str.includes(delimiter) || str.includes('\n') || str.includes('"')) {
            str = `"${str}"`;
          }
          return str;
        })
        .join(delimiter)
    )
    .join('\n');
};

function processFile(filePath) {
  try {
    const fileContent = readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');

    const data = [];
    const parents = new Map(); // Stores parent titles by level

    let skippedLinesCount = 0;
    const skippedLinesDetails = [];

    lines.forEach((line, index) => {
      const lineNumber = index + 1; // For debugging and error messages
      const trimmedLine = line.trim();

      // Skip empty or purely whitespace lines
      if (!trimmedLine) {
        skippedLinesCount++;
        skippedLinesDetails.push(`Line ${lineNumber} (empty/whitespace only): "${line}"`);
        return;
      }

      // Check for ID and remaining content separation
      const firstSpaceIndex = trimmedLine.indexOf(' ');
      if (firstSpaceIndex === -1) {
        skippedLinesCount++;
        skippedLinesDetails.push(`Line ${lineNumber} (missing space after ID): "${trimmedLine}"`);
        return;
      }

      const id = trimmedLine.substring(0, firstSpaceIndex);
      const remaining = trimmedLine.substring(firstSpaceIndex + 1);

      let title = null;
      let subtitle = null;

      // ATTEMPT 1: Split by " - " (space-hyphen-space)
      const hyphenDashIndex = remaining.indexOf(' - ');
      if (hyphenDashIndex !== -1) {
        const parts = remaining.split(' - ');
        if (parts.length >= 2) {
          title = parts[0].trim();
          subtitle = parts.slice(1).join(' - ').trim();
        }
      }

      // ATTEMPT 2: Split by " – " (space-emdash-space) if ATTEMPT 1 failed
      if (title === null) {
        const emDashIndex = remaining.indexOf(' – ');
        if (emDashIndex !== -1) {
          const parts = remaining.split(' – ');
          if (parts.length >= 2) {
            title = parts[0].trim();
            subtitle = parts.slice(1).join(' – ').trim();
          }
        }
      }

      // ATTEMPT 3: Split by the first '(' if ATTEMPT 1 & 2 failed
      if (title === null) {
        const firstParenIndex = remaining.indexOf('(');
        if (firstParenIndex !== -1) {
          title = remaining.substring(0, firstParenIndex).trim();
          subtitle = remaining.substring(firstParenIndex).trim();
        }
      }

      // ATTEMPT 4 (Fallback): If no separator found, consider the rest as title, subtitle is empty
      if (title === null) {
        title = remaining.trim();
        subtitle = '';
      }

      // Final check: if after all attempts, title is still empty, something is wrong
      if (title === null || title === '') {
        skippedLinesCount++;
        skippedLinesDetails.push(`Line ${lineNumber} (could not extract valid title after all attempts): "${trimmedLine}"`);
        return;
      }

      // Ensure subtitle is an empty string if it remains null
      if (subtitle === null) {
          subtitle = '';
      }

      // Determine the level based on the ID (e.g., "1" is level 1, "1.1" is level 2)
      // FIX: Filter out empty segments from split to correctly calculate level for IDs like "1."
      const level = id.split('.').filter(segment => segment !== '').length;

      let parentTitle = '';
      if (level > 1) {
        // Get the parent title from the map, which should be stored at the (level - 1)
        parentTitle = parents.get(level - 1) || '';
      }

      // Push the processed data into the main array
      data.push([id, parentTitle, title, subtitle]);

      // Update the parents map: set current level's title, and clear any deeper levels
      parents.set(level, title);
      for (let i = level + 1; i <= parents.size; i++) {
        parents.delete(i);
      }
    });

    // Final output of the processed data
    if (data.length !== (lines.length - skippedLinesCount)) {
        console.log(`CRITICAL ERROR: Unexpected discrepancy! Total lines: ${lines.length}, Skipped by checks: ${skippedLinesCount}, Processed into data: ${data.length}`);
        console.log("This indicates an issue in the skipped lines counting or an unhandled parsing scenario. Review skipped lines details.");
    } else {
        data.unshift(['id', 'parentTitle', 'title', 'subtitle']);
        const csv = arrayToCSV(data);
        console.log(csv);
    }

    // Report any skipped lines
    if (skippedLinesCount > 0) {
      console.warn(`\n--- ${skippedLinesCount} LINES WERE SKIPPED DUE TO FORMATTING ISSUES ---`);
      skippedLinesDetails.forEach(detail => console.warn(detail));
      console.warn('------------------------------------------------------------------');
    }

  } catch (error) {
    console.error('An error occurred:', error.message);
  }
}

// Command-line argument handling
const filePath = process.argv[2];

if (!filePath) {
  console.log('Please provide a file path as an argument. Example: node processFile.js mydata.txt');
} else {
  processFile(filePath);
}