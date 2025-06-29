/**
 * @file index.js
 * @description 
 */
import neo4j from 'neo4j-driver';
import { v7 as uuidv7 } from 'uuid';

/**
 * @constant {string} dbUrl - Neo4j connection URL.
 * @constant {string} dbName - Neo4j database (enterprise only).
 * @constant {string} dbUser - Neo4j username.
 * @constant {string} dbLogLevel - Neo4j loggin.
 */
const dbUrl = process.env.DB_URL || 'bolt://localhost:7687';
const dbName = process.env.DB_DATABASE || '';
const dbUser = process.env.DB_USER || 'neo4j';
const dbPassword = process.env.DB_PASSWORD || 'password';
const dbLogLevel = process.env.DB_LOG_LEVEL || 'none';
const aiKey = process.env.GEMINI_API_KEY || 'AIzaSyDCFLWg2xd8mxPcgTBwk9Pv92IsXJMFx2g';
const aiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-05-20";
const aiVersion = "v1beta";

/**
 * @constant {neo4j.Driver} driver - Shared Neo4j driver instance.
 * Reused across sessions.
 */
const driver = neo4j.driver(
    dbUrl,
    neo4j.auth.basic(dbUser, dbPassword),
    {
        encrypted: 'ENCRYPTION_ON',
        logging: dbLogLevel !== 'none' ? {
            level: dbLogLevel,
            logger: (level, message) => {
                console.log(`[neo4j][${level}] ${message}`);
            },
        } : undefined,
    }
);

/**
 * Gracefully closes the shared Neo4j driver.
 * Call this before application shutdown to ensure all connections are closed cleanly.
 *
 * @async
 * @function closeDriver
 * @returns {Promise<void>}
 */
const closeDriver = async () => {
    await driver.close();
};

/**
 * Creates a new Neo4j session.
 * You must `await session.close()` after using it.
 *
 * @function session
 * @returns {neo4j.Session} a new Neo4j session instance
 */
const session = () =>
    dbName ? driver.session({ database: dbName }) : driver.session();

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
        console.log(`Asking Gemini...`);
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

        console.log(`Reviwing response...`);
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

const getTopic = async () => {
    const s = session();

    try {
        const result = await s.run(`
            MATCH (n:Node)
            WHERE n.title IS NOT NULL AND n.title <> ''
            AND n.content = ''
            AND n.status = 'stub'
            LIMIT 1
            OPTIONAL MATCH path_to_root = (root:Node)-[:HAS_CHILD*]->(n)
            WHERE NOT EXISTS { (root)<-[:HAS_CHILD]-() }
            OPTIONAL MATCH breadcrumb_path = (a:Node)-[:HAS_CHILD*]->(n)
            WITH n, path_to_root, breadcrumb_path
            ORDER BY length(breadcrumb_path) DESC
            LIMIT 1 // Ensures we get the longest path for breadcrumbs if multiple exist

            OPTIONAL MATCH (n)-[:HAS_SECTION]->(s:Section)

            RETURN
                n.id AS id,
                n.title AS title,
                n.content AS content,
                n.subtitle AS subtitle,
                CASE WHEN path_to_root IS NOT NULL AND size(nodes(path_to_root)) > 1
                    THEN nodes(path_to_root)[1].title
                    ELSE null
                END AS domain,
                COLLECT(DISTINCT CASE WHEN breadcrumb_path IS NOT NULL THEN [x IN nodes(breadcrumb_path) | { id: x.id, title: x.title }] ELSE [] END) AS breadcrumbs,
                COLLECT(DISTINCT {
                    id: s.id,
                    type: s.type,
                    title: s.title,
                    content: s.content,
                    data: s.data,
                    summary: s.summary
                }) AS sections
        `);

        const record = result.records[0];
        if (record) {
            const rawBreadcrumbs = record.get('breadcrumbs');
            const breadcrumbs = rawBreadcrumbs.length > 0 ? rawBreadcrumbs[0] : [];


            // Filter out null sections if no sections were found (COLLECT on OPTIONAL MATCH can include a null entry)
            const sections = record.get('sections').filter(section => section.type !== null);

            return {
                id: record.get('id'),
                domain: record.get('domain'),
                title: record.get('title'),
                subtitle: record.get('subtitle'),
                content: record.get('content'),
                breadcrumbs: breadcrumbs,
                sections: sections
            };
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error:', error);
        return null;
    } finally {
        await s.close();
    }
}

async function updateTopic(id, content) {
    const s = session();
    try {
        await s.run(`
            MATCH (n:Node {id: $id})
            SET n.content = $content
            SET n.state = 'complete'
        `, { id, content: content });
        console.log(`  Update topic ${id} content...`)
    } finally {
        await s.close();
    }
}

async function addSection(nodeId, type, title, rawContent, data, rawSummary) {
    const s = session();

    const now = new Date().toISOString();
    const id = uuidv7();
    const rawData = JSON.stringify(data);

    let contentField = '';
    let contents = [];
    if (rawContent.length > 800_000) {
        for (let i = 0; i < rawContent.length; i += 800_000) {
            contents.push(rawContent.slice(i, i + 800_000));
        }
    } else {
        contentField = rawContent;
    }

    let dataField = '';
    let datas = [];
    if (rawData.length > 800_000) {
        for (let i = 0; i < rawData.length; i += 800_000) {
            datas.push(rawData.slice(i, i + 800_000));
        }
    } else {
        dataField = rawData;
    }

    let summaryField = '';
    let summaries = [];
    if (rawSummary.length > 800_000) {
        for (let i = 0; i < rawSummary.length; i += 800_000) {
            summaries.push(rawSummary.slice(i, i + 800_000));
        }
    } else {
        summaryField = rawSummary;
    }
    
    try {
        await s.run(`
            MATCH (n:Node {id: $nodeId})
            OPTIONAL MATCH (n)-[r:HAS_SECTION]->(:Section)
            WITH n, COALESCE(MAX(r.order), -1) + 1 AS nextOrder
            CREATE (s:Section {
                id: $id,
                title: $title,
                content: $content,
                contents: $contents,
                data: $data,
                datas: $datas,
                summary: $summary,
                summaries: $summaries,
                createdAt: $now,
                updatedAt: $now,
                type: $type,
                status: $status
            })
            CREATE (n)-[:HAS_SECTION {order: nextOrder}]->(s)
            RETURN s.id AS sectionId
        `, {
            nodeId,
            id,
            title,
            content: contentField,
            contents,
            data: dataField,
            datas,
            summary: summaryField,
            summaries,
            now,
            type,
            status: 'complete'
        });
        console.log(`  Update topic section ${id}...`)
    } finally {
        await s.close();
    }
}

async function completeTopic () {
    let topic = await getTopic();
    if (!topic) {
        console.log(`Topic not found`);
        return;
    }
    if (topic.sections.length != 0) {
        console.log(`Topic not stub`);
        return;
    }
    console.log(`Creating: ${topic.title} - ${topic.id}`);

    const conversion = [];

    let extra = '';
    if (topic.subtitle) {
        extra = ` defined as "${topic.subtitle}"`;
    }
    conversion.push({
        role: 'user',
        parts: [{
            text: `
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
`,
        }],
    }, {
        role: 'model',
        parts: [{text: 'OK'}],
    });

    conversion.push({
        role: 'user',
        parts: [{
            text: `
# For the "${topic.title}" topic${extra} in domain ${topic.domain}:
* Write a comprehensive summary that includes a rephrasing of the definition of the topic and an overview of the topic as a whole in 2-3 paragraphs.
* Your response **must** be broken into distinct, delimited sections for each field.
* **DO NOT** output any JSON. **DO NOT** attempt to escape any characters. Provide all content **RAW**.
* Use the following exact delimiters for each section:

---FIELD_TITLE_START---
[Topic title here]
---FIELD_TITLE_END---

---FIELD_CONTENT_START---
[The full content text here. Include markdown like bold, italics, lists, and raw LaTeX math (e.g., \(a^2 + b^2 = c^2\), $$ \oint_C \mathbf{E} \cdot d\mathbf{l} $$). Do NOT escape any backslashes or quotes.]
---FIELD_CONTENT_END---

* **MARKDOWN RULES (for content field - apply these in the raw text):**
    * Do **not** indent paragraphs
    * Do **not** include headers
    * bold, italics, ordered lists, unordered lists, nested lists
    * inline math (e.g., \(a^2 + b^2 = c^2\))
    * display math (e.g., $$ \oint_C \mathbf{E} \cdot d\mathbf{l} = - \frac{d\Phi_B}{dt} $$)`,
        }],
    });

    let answer = await askGemini(conversion);
    if (answer.success === false) {
        console.log(answer);
        console.log('Error getting summary');
        return;
    }
    let title = getField(answer.result, 'FIELD_TITLE');
    let content = getField(answer.result, 'FIELD_CONTENT');
    if (title !== topic.title) {
        console.log(answer);
        console.log('Error: sumary title not matched');
        return;
    }
    if (!content) {
        console.log(answer);
        console.log('Error: sumary content missing');
        return;
    }
    topic.content = content;

    conversion.push({
        role: 'model',
        parts: [{
            text: answer.result,
        }],
    });

    conversion.push({
        role: 'user',
        parts: [{
            text: `
# For the "${topic.title}" topic${extra}:
* What 4-15 sections would you include in an encyclopedia-style entry, not including a summary or examples?
* Sections should be in a logical order.
* Do **not** use a biased number os sections, the topic should dictate the number of sections.
* Sections choesen should be broad enough to contain 3-10 paragraphs on the subject.
* If including information on key sub-topics, limit this to a single section.
* Your response **must** be broken into distinct, delimited sections for each field.
* **DO NOT** output any JSON. **DO NOT** attempt to escape any characters. Provide all content **RAW**.
* Use the following exact delimiters for each section:

---TITLES_START---
SECTION TILES, ONE PER LINE
---TITLES_END---`
        }],
    });

    answer = await askGemini(conversion);
    if (answer.success === false) {
        console.log(answer.result);
        console.log('Error getting section titles');
        return;
    }

    let titles = getField(answer.result, 'TITLES');
    if (!titles) {
        console.log(answer.result);
        console.log('Error: section titles missing');
        return;
    }
    const sectionsTitles = titles.split('\n');

    conversion.push({
        role: 'model',
        parts: [{
            text: answer.result,
        }],
    });

    for (let idx = 0; idx < sectionsTitles.length; idx += 1) {
        conversion.push({
            role: 'user',
            parts: [{
                text: `
# For the "${topic.title}" topic, section titled "${sectionsTitles[idx]}":
* Complete the content of this section in 3-8 paragraphs.
* Response **must** be in one of the types listed. For the provided section title, analyze the content implied by the title and select the most appropriate response format from the options available. Your choice should be based on which format best clarifies and illustrates the information presented in that section.
* **Response Type (markdown only):** type is text, include fields: type, title, content
* **Response Type (markdown and packet diagram):** type is packet, include fields: type, title, content, data, summary
* **Response Type (markdown and state diagram):** type is state, include fields: type, title, content, data, summary
* **Response Type (markdown and sequence diagram):** type is sequence, include fields: type, title, content, data, summary
* **Response Type (markdown and flowchart diagram):** type is flowchart, include fields: type, title, content, data, summary
* Your response **must** be broken into distinct, delimited sections for each field.
* **DO NOT** output any JSON. **DO NOT** attempt to escape any characters. Provide all content **RAW**.
* Use the following exact delimiters for each section:

---FIELD_TYPE_START---
[Chosen type here, e.g., 'text', 'packet', 'flowchart']
---FIELD_TYPE_END---

---FIELD_TITLE_START---
[Section title here]
---FIELD_TITLE_END---

---FIELD_CONTENT_START---
[The full content text here. Include markdown like bold, italics, lists, and raw LaTeX math (e.g., \(a^2 + b^2 = c^2\), $$ \oint_C \mathbf{E} \cdot d\mathbf{l} $$). Do NOT escape any backslashes or quotes.]
---FIELD_CONTENT_END---

---FIELD_DATA_START---
[The raw diagram markup here. Do NOT escape any characters like backslashes, quotes, or newlines. Use the examples below verbatim.]
---FIELD_DATA_END---

---FIELD_SUMMARY_START---
[The summary text here. Do NOT escape any characters.]
---FIELD_SUMMARY_END---

* **NOTE:** If the chosen format is 'text', then the 'DATA' and 'SUMMARY' fields should be omitted from your response.
* **MARKDOWN RULES (for content and summary fields - apply these in the raw text as in the examples shown):**
    * Do **not** indent paragraphs
    * Do **not** include headers
    * **bold**, *italics*, 1. ordered lists, * unordered lists, nested lists
    * inline math (e.g., \(a^2 + b^2 = c^2\))
    * display math (e.g., $$ \oint_C \mathbf{E} \cdot d\mathbf{l} = - \frac{d\Phi_B}{dt} $$)
* **DIAGRAM MARKUP EXAMPLES (for DATA field - use these exactly as provided without any escaping):**
    * Use **ONLY** the example markup. Do **NOT** add other markup to the diagrams. The **ONLY** supported markup is listed for each daigram.
    * **PACKET MARKUP EXAMPLE:**
        title UDP Packet
        0-15: "Source Port"
        16-31: "Destination Port"
        32-47: "Length"
        48-63: "Checksum"
        64-95: "Data (variable length)"
    * **STATE MARKUP EXAMPLE:**
        a: Multi Word Title
        b: Moving
        c: Crash
        [*] --> a
        a --> b
        b --> a
        b --> c
        c --> [*]

        pos: Is Positvie
        t: True
        f: False
        sp: Send Page
        se: Send Error
        [*] --> pos
        pos --> if_state
        if_state --> f : line label false
        if_state --> t : line label true
        t --> sp
        f --> se
    * **SEQUENCE MARKUP EXAMPLE:**
        Alice->>John: Hello John, how are you? /* Solid Line*/
        John-->>Alice: Great! /* Dashed Line*/
        Alice-)John: See you later! /* Curved arrowhead */
        John->>Stacy: Hi!
    * **FLOWCHART MARKUP EXAMPLE:**
        A --> B /* arrow line */
        A <--> B /* double arrow line */
        A ==> B /* arrow bold line */
        A <==> B /* dowble arrow bold line */
        A -.-> B /* arrow dotted line */
        A <-.-> B /* double arrow dotted line */
        A --- B /* line */
        A === B /* bold line */
        A -.- B /* dotted line */
        A --o B /* circle line */
        A o--o B /* double circle line */
        A --x B /* cross line */
        A x--x B /* double cross line */
        A ===|"label"| B /* bold line with a label */
        A -.-|"label"| B /* dotted line with a label */
        A["label"] /* rectagle A labeled label */
        A{"label"} /* diamond A labeled label */
        A{{"label"}} /* hexagon A labeled label */
        A[/"label"/] /* parallelogram A labeled label */
        A[/"label"\] /* trapezoid A labeled label */
        A[\"label"/] /* alt trapezoid A labeled label */

        A["Start"] --> B{"Is it?"}
        B -.->|"Yes"| C["OK"]
        C ==> D["Rethink"]
        D <--> B
        B --x|"No"| E["End"]`,
            }],
        });

        let answer = await askGemini(conversion);
        if (answer.success === false) {
            console.log(answer);
            console.log('Error getting section');
            return;
        }

        let sectionType = getField(answer.result, 'FIELD_TYPE');
        let title = getField(answer.result, 'FIELD_TITLE');
        let content = getField(answer.result, 'FIELD_CONTENT');
        let data = getField(answer.result, 'FIELD_DATA');
        let summary = getField(answer.result, 'FIELD_SUMMARY');
        if (title !== sectionsTitles[idx]) {
            console.log(answer.result);
            console.log('Error: section title not matched');
            return;
        }
        if (!sectionType) {
            console.log(answer.result);
            console.log('Error: section type missing');
            return;
        }
        if (!content && !data && !summary) {
            console.log(answer.result);
            console.log('Error: section content/data/sumary missing');
            return;
        }

        if(sectionType === 'text' && !content) {
            console.log(answer.result);
            console.log('Error: section text nissing content');
            return;
        }

        if(sectionType !== 'text' && !data) {
            console.log(answer.result);
            console.log(`Error: section ${sectionType} nissing data`);
            return;
        }

        if (sectionType !== 'text') {
            console.log(`!!! ${sectionType} ${topic.id}`)
        }

        topic.sections.push({
            type: sectionType,
            title,
            content,
            data,
            summary,
        });

        conversion.pop()
        conversion.push({
            role: 'user',
            parts: [{
                text: `Create content for the "${topic.title}" topic, section titled "${sectionsTitles[idx]}"`,
            }],
        });
        conversion.push({
            role: 'model',
            parts: [{
                text: answer.result,
            }],
        });
    }

    updateTopic(topic.id, topic.content);

    for (let i = 0; i < topic.sections.length; i += 1) {
        const s = topic.sections[i];
        await addSection(topic.id, s.type, s.title, s.content || '', s.data || '', s.summary || '');
    };

    // console.log(topic);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
    do {
        try {
            await completeTopic();
        } finally {
            await delay(60 * 1000 * 5);
        }
    } while (true);
}

process.on('SIGINT', async () => {
    await closeDriver();
    process.exit(0);
});

main();

