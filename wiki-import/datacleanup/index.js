import { parse } from "csv-parse";
import * as fs from "fs";
import * as process from "process";
import {diffChars, createPatch} from 'diff';

const aiKey = process.env.GEMINI_API_KEY || 'AIzaSyDCFLWg2xd8mxPcgTBwk9Pv92IsXJMFx2g';
const aiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite-preview-06-17";
const aiVersion = "v1beta";

/**
 * Extracts the content between specified delimiter markers in a string.
 *
 * @param {string} text The full text containing the delimited content.
 * @param {string} delim The base name for the delimiter (e.g., 'FIELD_CONTENT').
 * @returns {string} The extracted text between the start and end delimiters, or an empty string if not found.
 */
function getField(text, delim) {
    // Construct the start and end delimiter strings.
    const startMarker = `---${delim}_START---`;
    const endMarker = `---${delim}_END---`;

    // Find the position immediately after the start marker.
    const startIndex = text.indexOf(startMarker);
    if (startIndex === -1) {
        return "";
    }
    const contentStart = startIndex + startMarker.length;

    // Find the position of the end marker, searching after the start marker.
    const endIndex = text.indexOf(endMarker, contentStart);
    if (endIndex === -1) {
        return "";
    }

    // Extract the substring between the markers and trim whitespace.
    const content = text.substring(contentStart, endIndex);
    return content.trim();
}

async function askGemini(conversion) {
    const url = `https://generativelanguage.googleapis.com/${aiVersion}/models/${aiModel}:generateContent?key=${aiKey}`;

    const requestBody = {
        contents: conversion
    };

    try {
        // console.error(`Asking Gemini...`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = await response.json();

        // console.error(`Reviwing response...`);
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            let generatedText = data.candidates[0].content.parts[0].text.trim();
            return { success: true, result: generatedText };
        } else {
            console.log('Unknown Response:');
            console.log(data);
            return { success: false };
        }

    } catch (error) {
        if (error.message.includes('HTTP error!') && error.message.includes('message: {') && error.message.includes('"code":')) {
            try {
                const apiError = JSON.parse(error.message.split('message: ')[1]);
                console.error(`Error calling Gemini API: Code: ${apiError.error.code}, Message: ${apiError.error.message}, Status: ${apiError.error.status}`);
            } catch (e) {
                // Couldn't parse JSON error, just log original
                console.error("Error calling Gemini API:", error);
            }
        }
        return { success: false };
    }
}

async function processItem(item) {
    const conversion = [];

    // Add context infortmation
    conversion.push({
        role: 'user',
        parts: [{text: `
# OmniOntos: The Structured Encyclopedia (Contributor Overview)

OmniOntos is a **semantic encyclopedia** that organizes all human knowledge into a navigable, hierarchical structure; "Organize Everything and Understand Anything". Unlike traditional encyclopedias, every article (Topic) has a precise place in a logical hierarchy, and unlike formal ontologies, every entry is written as a comprehensive, accessible article. This bridges the gap between Wikipedia's accessibility and formal knowledge systems' rigor, creating a new category of knowledge organization tool.

# Why OmniOntos?

OmniOntos solves a fundamental problem in knowledge organization: existing systems are either rigorous but inaccessible (formal ontologies) or accessible but unstructured (Wikipedia). 

**OmniOntos provides:**
- **Encyclopedia-quality articles** at every level of detail
- **Systematic navigation** from broad overviews to technical specifics  
- **Semantic structure** that enhances rather than replaces readability
- **Multiple entry points** - approach any topic from your preferred angle
- **Connected understanding** - see how concepts relate across domains

Each Topic is designed as a comprehensive encyclopedia article, with broader topics providing overviews and deeper topics offering technical detail.

# Domains (Top-Level Topics)

OmniOntos begins by classifying reality into six fundamental domains. These broad categories ensure a comprehensive and distinct foundation for all subsequent classification:

1. Abstract: The domain encompassing pure abstractions not dependent on physical, mental, or social instantiation. This includes formal systems (such as logic, mathematics, and theoretical computer science constructs like algorithms as abstract procedures), conceptual entities defined by axioms or universal properties (like numbers, sets, categories, topological spaces defined by their properties), and theoretical structures whose existence is solely in the conceptual or formal realm. The focus is on entities and concepts defined by formal rules, logical relations, or abstract properties, existing outside of space-time and causal physical interaction. It is distinct from the information content of instantiated forms (Informational), the subjective mental experience of abstractions (Mental), and the social conventions or institutions that might discuss, develop, or use them (Social).
2. Informational: The domain encompassing information as abstract patterns, structures, representations, and meanings, independent of their specific physical carriers or instantiations. This includes fundamental forms, properties, logical structures, processes of transformation and analysis, and abstract characteristics of information content and representation itself. The focus is on the form, content, encoding, decoding, transmission rules, and interpretation of information, rather than the physical medium or energy used to embody or transmit it.
3. Physical: The fundamental domain of tangible reality and its intrinsic characteristics within space-time. This domain encompasses entities that possess mass, energy, occupy space, and persist through time, as well as the forces, fields, properties, states, structures, and dynamics intrinsic to such physical existence. The focus is on the material instantiation and physical behavior of phenomena and entities within the physical universe, distinct from any information or abstract structure they may carry or represent.
4. Mental: The domain encompassing the subjective, experiential, and internal states, processes, content, and capacities associated with individual conscious agents. This includes consciousness itself, affective states (emotions, moods, feelings), sensory experiences (perceptions, raw qualia), cognitive processes (perception, attention, memory, thinking, reasoning, learning, imagination), volitional processes (motivation, decision-making, intention, self-control), and mental content (beliefs, desires, subjective representations, concepts as mentally held). The focus is on the first-person perspective and the phenomena that constitute inner mental life and individual subjective experience. It is distinct from the physical substrate (e.g., brain, neural activity), the abstract informational structures processed (Informational), and the collective or emergent properties of interacting minds (which belong to the Social domain).
5. Social: The domain encompassing the entities, structures, processes, forms, and emergent phenomena arising from the interaction, relationship, and organization of multiple conscious agents. This includes collective entities (such as dyads, groups, communities, formal organizations, populations), patterned relationships (social networks, hierarchies, statuses, roles), enduring frameworks (institutions like family, economy, polity, law, education, religion; shared culture including norms, values, beliefs, customs, symbolic systems), dynamic interactions (communication, cooperation, competition, conflict, collective action, influence), and integrated collective arrangements (socio-technical systems, economic systems, political systems). The focus is on the collective level of reality, generated by intersubjectivity, interdependence, and coordination among agents. It is distinct from individual mental states (Mental), the physical properties of the agents or their environment (Physical), the abstract information exchanged during interaction (Informational), and the methodologies used to analyze social phenomena (Meta).
6. Meta: The domain encompassing the higher-order concepts, formal languages, methods, processes, models, and frameworks used for constructing, analyzing, managing, evaluating, or understanding entities, systems, or concepts within any other domain. This includes methodologies for inquiry and practice (like the scientific method, engineering processes, research methodologies), formal techniques for specification, verification, and reasoning (formal methods, logic systems applied to other domains), meta-modeling approaches, knowledge organization methods (ontology building, schema design, classification processes), evaluation criteria and techniques (benchmarking, validation), and frameworks for designing or governing complex systems (meta-policies, governance models). The focus is on the tools, processes, and conceptual structures used to operate on or reason about other domains, serving a meta-level or reflective function. It is distinct from the primary subject matter or entities being studied, modeled, or managed. Applied fields (like Medicine, Engineering, Education, Law as practice) are areas that utilize concepts and methods from the Meta domain (among others) but are not themselves kinds of Meta entities; they are complex domains of activity that draw upon multiple fundamental categories.

# Core Principles and Structure

OmniOntos is built on several key principles that ensure its logical consistency and comprehensive nature:

* Strict Hierarchy ("is-a-kind-of"): The foundational relationship is subsumption: every Sub-Topic is a more specific kind of its parent Topic. This forms a single, unambiguous inheritance structure, ensuring that properties and definitions flow downwards.  (See "The 'Is-A-Kind-Of' Hierarchy" below for more detail.)
* Unlimited Depth & Granularity: The hierarchy extends as deeply as necessary, past a minimum of six levels, to capture all logical distinctions and ensure thorough coverage within each domain.
* No "Catch-All" Categories: Every Topic must have a precise and logically valid place. Generic "Other" or "Miscellaneous" categories are strictly disallowed.
* Self-Contained Topic Definitions: Each Topic is comprehensively defined with its own summary and sections, independent of its parent or sub-topics. This ensures clarity regardless of where a user enters the hierarchy.
* Semantic Classification: OmniOntos is designed to support intelligent classification based on meaning, not just keywords, by integrating with external knowledge resources. This facilitates accurate placement of new entities within the hierarchy.

# The "Is-A-Kind-Of" Hierarchy

At its core, OmniOntos uses a strict, tree-like hierarchy. Every Sub-Topic is a specific kind of its parent Topic. This means any entity or concept under a Sub-Topic is also valid for its parent Topic. All properties and definitions from a parent Topic are inherited by its Sub-Topics. This fundamental "is-a-kind-of" rule strictly defines a Topic's position, ensuring a clear and logical structure from the Top-Level Topics down to the most granular detail.
        `}],
    });
    conversion.push({
        role: 'model',
        parts: [{text: 'OK'}],
    });

//     conversion.push({
//         role: 'user',
//         parts: [{
//             text: `
// **Title:**
// """
// ${item[1] || 'BLANK'}
// """

// **Definition:**
// """
// ${item[2] || 'BLANK'}
// """

// **Summary:**
// """
// ${item[3] || 'BLANK'}
// """

// # For the above topic:
// * IF BLANK DEFINITION - Write a accurate definition for the item title that starts with 'A' or 'An', is a minimum of 8 and is a maximum of 15 words that is a sentance while not useing the title in the deffinition.
// * IF NOT BLANK DEFINITION - Make changes or corrections **ONLY IF NEEDED** for a accurate definition for the item title that starts with 'A' or 'An' is a minimum of 8 and is a maximum of 15 words that is a sentance while not useing the title in the deffinition.
// * Wrtie why the definition change was made, if no changes or additions were made say NONE_MADE.

// * IF BLANK SUMMARY - Write a comprehensive summary that includes a rephrasing of the definition of the topic and an overview of the topic as a whole in 2-3 paragraphs.
// * IF NOT BLANK SUMMARY - Make changes or corrections **ONLY IF NEEDED** so the summary is comprehensive and includes a rephrasing of the definition of the topic and an overview of the topic as a whole in 2-3 paragraphs.
// * Wrtie why the sumary change was made, if no changes or additions were made say NONE_MADE.

// * Provide all content **RAW**.
// * Your response **must** be broken into distinct, delimited sections for each field.
// * Use the following **exact** delimiters for each section:

// ---FIELD_TITLE_START---
// [Topic title here]
// ---FIELD_TITLE_END---

// ---FIELD_DEFINITION_START---
// [Topic definition here]
// ---FIELD_DEFINITION_END---

// ---FIELD_DEFINITION_WHY_START---
// [Explain why you made a change to the definition]
// ---FIELD_DEFINITION_WHY_END---

// ---FIELD_SUMMARY_START---
// [Topic summary text here. Include markdown like bold, italics, lists, and raw LaTeX math (e.g., \(a^2 + b^2 = c^2\), $$ \oint_C \mathbf{E} \cdot d\mathbf{l} $$). Do NOT escape any backslashes or quotes.]
// ---FIELD_SUMMARY_END---

// ---FIELD_SUMMARY_WHY_START---
// [Explain why you made a change to the sumary]
// ---FIELD_SUMMARY_WHY_END---

// * **MARKDOWN RULES (for SUMMARY field - apply these in the raw text):**
//     * Do **not** indent paragraphs
//     * Do **not** include headers
//     * **bold**, *italics*, ordered lists, unordered lists, nested lists
//     * inline math (e.g., \(a^2 + b^2 = c^2\))
//     * display math (e.g., $$ \oint_C \mathbf{E} \cdot d\mathbf{l} = - \frac{d\Phi_B}{dt} $$)
//         `}],
//     });

    conversion.push({
        role: 'user',
        parts: [{
            text: `
You are a content generation system tasked with creating and refining definitions and summaries for given topics.

For each topic provided, follow these instructions precisely:

## Instructions

### Title
* Make NO changes to the title.

### Definition
* **If the provided Definition is BLANK:** Generate an accurate definition for the **Title**.
    * It must start with 'A', 'An' or 'The'.
    * It must be a complete sentence.
    * It must be between 8 and 15 words (inclusive).
    * It must NOT use the **Title** itself within the definition.
* **If the provided Definition is NOT BLANK:** Review the existing **Definition**.
    * Maintain it *as is* unless it *fails to meet any* of the following criteria:
        * It must be a correct definition for the **Title**.
        * It must start with 'A', 'An' or 'The'.
        * It must be a complete sentence.
        * It must be between 8 and 15 words (inclusive).
        * It must NOT use the **Title** itself within the definition.
* **Explanation for Definition Change:**
        * If a new defnintion was generated because the original was BLANK, output ONLY \`NEWLY_GENERATED\`.
        * State why any changes or additions were made to the definition.
        * If no changes were made, output ONLY \`NONE_MADE\`.

### Summary
* **If the provided Summary is BLANK:** Generate a comprehensive summary for the topic.
    * It must include a rephrasing of the definition.
    * It must provide an overview of the topic as a whole.
    * It must be 2-3 paragraphs long.
    * It must adhere to the markdown rules specified below.
* **If the provided Summary is NOT BLANK:** Review the existing **Summary**.
    * Make changes or corrections **ONLY IF NEEDED** to ensure it is comprehensive, includes a rephrasing of the definition, provides an overview, and is 2-3 paragraphs long.
    * It must adhere to the markdown rules specified below.
* **Explanation for Summary Change:**
        * If a new summary was generated because the original was BLANK, output ONLY \`NEWLY_GENERATED\`.
        * State why any changes or additions were made to the summary.
        * If no changes were made, output ONLY \`NONE_MADE\`.

## Output Format

Your response **must** be broken into distinct, delimited sections for each field. Use the following **exact** delimiters for each section:

---FIELD_TITLE_START---
[Title here]
---FIELD_TITLE_END---

---FIELD_DEFINITION_START---
[Definition here]
---FIELD_DEFINITION_END---

---FIELD_DEFINITION_WHY_START---
[Explanation for Definition Change text here]
---FIELD_DEFINITION_WHY_END---

---FIELD_SUMMARY_START---
[Summary text here]
---FIELD_SUMMARY_END---

---FIELD_SUMMARY_WHY_START---
[Explanation for Summary Change text here]
---FIELD_SUMMARY_WHY_END---

## Markdown Rules for SUMMARY field (apply these in the raw text):
* Do **not** indent paragraphs.
* Do **not** include headers.
* Use **bold**, *italics*, ordered lists, unordered lists, and nested lists as appropriate.
* Use inline math (e.g., \(a^2 + b^2 = c^2\)).
* Use display math (e.g., $$ \oint_C \mathbf{E} \cdot d\mathbf{l} = - \frac{d\Phi_B}{dt} $$).

## Input
**Title:**
"""
${item[1] || 'BLANK'}
"""

**Definition:**
"""
${item[2] || 'BLANK'}
"""

**Summary:**
"""
${item[3] || 'BLANK'}
"""
            `}],
    });


    const answer = await askGemini(conversion);

    if (!answer.success) {
        throw new Error(`AI result failed`);
    }

    else {
        const title = getField(answer.result, 'FIELD_TITLE');
        if (title !== item[1]) {
            console.error(`Returned title not valid: ${title} !== ${item[1]}`);
        }

        const definition = getField(answer.result, 'FIELD_DEFINITION');
        const definitionWhy = getField(answer.result, 'FIELD_DEFINITION_WHY');
        const summary = getField(answer.result, 'FIELD_SUMMARY');
        const summaryWhy = getField(answer.result, 'FIELD_SUMMARY_WHY');
        return { title, definition, definitionWhy, summary, summaryWhy };
    }
}

function diff(a, b) {
    const diff = diffChars(a, b);
    let diffText ='';
    diff.forEach((part) => {
        diffText += part.added ? `{${part.value}}` : part.removed ? `[${part.value}]` : part.value;
    });
    return diffText;
}

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

async function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

const records = [];
async function main() {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error("Error: Please provide a file path as an argument.");
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found at path: "${filePath}"`);
        process.exit(1);
    }

    await new Promise((resolve, reject) => {
        const parser = parse({
            delimiter: ",",
            relax_column_count_less: true,
        });

        parser.on("readable", function () {
            let record;
            while ((record = parser.read()) !== null) {
                records.push(record);
            }
        });

        parser.on("end", resolve);
        parser.on("error", reject);

        const fileStream = fs.createReadStream(filePath);
        fileStream.on("error", reject);
        fileStream.pipe(parser);
    });

    console.error(`Loaded ${records.length} records...`);

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // Listen for 'data' events on stdin
    process.stdin.on('data', (key) => {
        if (key === '\u0003') { // Ctrl+C
            console.error('Loggin array');
            console.log(arrayToCSV(records));
            process.exit();
        }
    });

    for (const item of records) {
        if (item[0] === 'ID') continue;

        const result = await processItem(item);

        let cDef = item[2] !== result.definition;
        if (cDef) {
            cDef = result.definitionWhy !== 'NONE_MADE';
        }

        let cSum = item[3] !== result.summary;
        if (cSum) {
            cSum = result.summaryWhy !== 'NONE_MADE';
        }

        console.error(`${cDef ? 'Y' : 'N'}|${cSum ? 'Y' : 'N'} (${item[0].padEnd(20, ' ')}) ${item[1]}: ${result.definition}`);

        if (cDef) {
            item[2] = result.definition;
            item[4] = result.definitionWhy;
        } else if (item[2] === '') {
            console.error(`  **  WTF_D: ${result.definition}\n ** ${result.definitionWhy}`);
            if (result.definition !== '') {
                item[2] = result.definition;
                item[4] = '** ';
            } else {
                item[4] = '++ ';
            }
            item[4] += result.definitionWhy;
        }
        if (cSum) {
            item[3] = result.summary;
            item[5] = result.summaryWhy;
        } else if (item[3] === '') {
            console.error(`  **  WTF_S: ${result.summary}\n  ** ${result.summaryWhy}`);
            if (result.definition !== '') {
                item[3] = result.summary;
                item[5] = '** ';
            } else {
                item[5] = '++ ';
            }
            item[5] += result.summaryWhy;
        }

        await sleep(4);
    }
    process.stdin.setRawMode(false);

    console.error('\n\n');
    console.log(arrayToCSV(records));
}

main().catch(err => {
    console.log(arrayToCSV(records));
    process.stdin.setRawMode(false);
    console.error("An unexpected error occurred:", err);
    process.exit(1);
});