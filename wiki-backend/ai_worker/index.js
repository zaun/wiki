/**
 * @file index.js
 * @description 
 */
import neo4j from 'neo4j-driver';

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

async function askOllama(prompt) {
    const requestBody = {
        model: 'phi4',
        stream: false,
        prompt,
    };

    const controller = new AbortController();
    const duration = 60 * 1000 * 60;
    const timeoutId = setTimeout(() => controller.abort(), duration);
    const start = new Date();

    try {
        console.log(`Asking Ollama...`);
        const url = 'http://192.168.0.206:11434/api/generate';
        const response = await fetch(url, {
            signal: controller.signal,
            headersTimeout: duration,
            bodyTimeout: duration,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false };
        }

        const answer = await response.json();
        try {
            let generatedText = answer.response;
            // Strip ```json and ```
            if (generatedText.startsWith('```json')) {
                generatedText = generatedText.substring(7);
            }
            if (generatedText.endsWith('```')) {
                generatedText = generatedText.substring(0, generatedText.length - 3);
            }
            generatedText = generatedText.trim();

            let parsedJson = JSON.stringify(generatedText);

            const end = new Date();
            const durationMilliseconds = end.getTime() - start.getTime();
            console.log('Duration in ms: ', durationMilliseconds);
            console.log(`Valid response...`);
            return { success: true, result: parsedJson };
        } catch (parseError) {
            const end = new Date();
            const durationMilliseconds = end.getTime() - start.getTime();
            console.log('Duration in ms: ', durationMilliseconds);
            console.log(`Invalid response...  ${parseError}`);
            console.log(generatedText);
            return { success: false };
        }
    } catch (error) {
        const end = new Date();
        const durationMilliseconds = end.getTime() - start.getTime();
        console.log('Duration in ms: ', durationMilliseconds);
        console.error('Fetch error:', error);
        return { success: false };
    }
}


async function askGemini(prompt) {
    const url = `https://generativelanguage.googleapis.com/${aiVersion}/models/${aiModel}:generateContent?key=${aiKey}`;

    const requestBody = {
        contents: [
            {
                parts: [
                    { text: prompt }
                ]
            }
        ]
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

            // Strip ```json and ```
            if (generatedText.startsWith('```json')) {
                generatedText = generatedText.substring(7);
            }
            if (generatedText.endsWith('```')) {
                generatedText = generatedText.substring(0, generatedText.length - 3);
            }
            generatedText = generatedText.trim();

            try {
                const parsedJson = JSON.parse(generatedText);
                console.log(`Valid response...`);
                return { success: true, result: parsedJson };
            } catch (parseError) {
                console.log(`Invalid response...  ${parseError}`);
                console.log(generatedText);
                return { success: false };
            }
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
            AND n.content IS NOT NULL AND n.content <> ''
            // AND n.id = '01976093-bd3f-73fc-a6a4-6b7d37286af3'
            AND n.aiReview IS NULL
            AND n.status IS NOT NULL AND n.status <> 'archived'
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

async function saveNodeReview(id, review, flag) {
    const s = session();
    try {
        await s.run(`
            MATCH (n:Node {id: $id})
            SET n.aiReview = $review
            SET n.aiFlag = $flag
        `, { id, review: JSON.stringify(review), flag });
        console.log('  Saved node review...')
    } finally {
        await s.close();
    }
}

async function saveSectionReview(id, review, flag) {
    const s = session();
    try {
        await s.run(`
            MATCH (s:Section {id: $id})
            SET s.aiReview = $review
            SET s.aiFlag = $flag
        `, { id, review: JSON.stringify(review), flag });
        console.log('  Saved section review...')
    } finally {
        await s.close();
    }
}

async function reviewTopic () {
    const topic = await getTopic();
    if (!topic) {
        console.log(`Topic not found`);
        return;
    }
    console.log(`Reviewing: ${topic.title} - ${topic.id}`);

    let document = `Section ID: 0\n\nTitle: ${topic.title}\n\nSummary:\n${topic.content}\n\n`;
    topic.sections.forEach((s, idx) => {
        document += `---\n\nSection ID: ${idx + 1}\n\nSection Title: ${s.title}\n\nContent:\n${s.content}\n\n${s.summary}\n\n`;
    });

    const prompt = `
## Analyze Text for Factual and Logical Issues

**Text for Analysis:**

"""
${document}
"""

**Instructions for Analysis:**

For the provided text, answer the following questions, for the Topic symmary and for each Topic Section. Your response should be a JSON array, where each object corrisponds to a part of the Topic beinf reviews. Each objec should have an array where each object corresponds to a question and follows the example format provided. Verify JSON array and objects are valid.
**Response Format:** [{ sectionID: SECTION_ID, results: RESULT_ARRAY }]

---

1.  **Is-A-Kind-Of Check:** Is the current topic strictly a is-a-kind-of for its location?
    * **Response Format:** \`{"id": 1, "result": TRUE/FALSE, "statement": "Proper location is FALSE", "notes": "Explanation of is-a-kind-of falure if FALSE"}\`

2.  **Factual Claims Check:** Is there any information presented that directly contradicts widely accepted facts or information likely to be found in mainstream, reputable sources?
    * **Response Format:** \`{"id": 2, "result": TRUE/FALSE, "statement": "Contradictory statement if TRUE", "notes": "Explanation of contradiction if TRUE"}\`

3.  **Internal Consistency Check:** Are there any logical inconsistencies or direct contradictions within the provided text itself?
    * **Response Format:** \`{"id": 3, "result": TRUE/FALSE, "statement": "Contradictory statements if TRUE", "notes": "Explanation if TRUE"}\`

4.  **Reference Fabrication/Misrepresentation Check:** Does this text refer to studies, data, or external sources that appear to be fabricated or misrepresented?
    * **Response Format:** \`{"id": 4, "result": TRUE/FALSE, "statement": "Fabricated/misrepresented reference if TRUE", "notes": "Explanation if TRUE"}\`

5.  **Bias/Subjectivity Check:** Does the text contain strong subjective opinions, unsubstantiated claims, or language that demonstrates clear bias, deviating from an objective or neutral tone? The subject matter should be taken into account, for example music may includes subjective opinions and value judgments while acknowledging differing views,
    * **Response Format:** \`{"id": 5, "result": TRUE/FALSE, "statement": "Biased statement if TRUE", "notes": "Explanation if TRUE"}\`

6.  **Sensitive Content Check:** Does the text discuss any potentially sensitive, offensive, or highly controversial topics without adequate context or a neutral stance?
    * **Response Format:** \`{"id": 6, "result": TRUE/FALSE, "statement": "Sensitive content if TRUE", "notes": "Explanation if TRUE"}\`

7.  **Clarity & Readability Score:** Rate the clarity and readability of the following text on a scale of 1 to 10, where 1 is extremely unclear/difficult to read and 10 is exceptionally clear and easy to understand.
    * **Response Format:** \`{"id": 7, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

8.  **Coherence & Flow Score:** Considering the logical progression of ideas and transitions between sentences and paragraphs, rate the coherence and flow of the following text on a scale of 1 to 10.
    * **Response Format:** \`{"id": 8, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

9.  **Completeness/Thoroughness Score:** Based on the apparent intent of this section, rate how thoroughly it addresses its implied topic or sub-topic on a scale of 1 to 10, where 1 is incomplete/superficial and 10 is comprehensive/thorough within its scope.
    * **Response Format:** \`{"id": 9, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

10.  **Grammar, Spelling & Punctuation Score:** Rate the correctness of grammar, spelling, and punctuation in the following text on a scale of 1 to 10, where 1 indicates numerous errors and 10 is virtually flawless.
    * **Response Format:** \`{"id": 10, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

11. **Engagement Score:** Rate the overall engagement and appeal of the following text for a general audience on a scale of 1 to 10, where 1 is very dull/unengaging and 10 is captivating/highly engaging.
    * **Response Format:** \`{"id": 11, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

12. **Comprehensibility Score (ISCED Level 2: Lower Secondary Education):** On a scale of 1 to 10, how comprehensible is this text for a student in lower secondary education (typically ages 12-15)?
    * **Response Format:** \`{"id": 12, "title": "Comprehensibility Score (ISCED Level 2: Lower Secondary Education)", "score": NUMBER (1 as lowest comprehensibility, 10 as highest), "notes": "Explanation of the score for this audience."}\`

13. **Comprehensibility Score (ISCED Level 3: Upper Secondary Education):** On a scale of 1 to 10, how comprehensible is this text for a student in lower secondary education (typically ages 16-18)?
    * **Response Format:** \`{"id": 13, "title": "Comprehensibility Score (ISCED Level 3: Upper Secondary Education)", "score": NUMBER (1 as lowest comprehensibility, 10 as highest), "notes": "Explanation of the score for this audience."}\`

14. **Comprehensibility Score (ISCED Level 6: Bachelor's or equivalent level):** On a scale of 1 to 10, how comprehensible is this text for a student at the bachelor's degree level or equivalent?
    * **Response Format:** \`{"id": 14, "title": "Comprehensibility Score (ISCED Level 6: Bachelor's or equivalent level)", "score": NUMBER (1 as lowest comprehensibility, 10 as highest), "notes": "Explanation of the score for this audience."}\`

---

**Verify output is valid JSON**

---

    `;

    // const review = await askOllama(prompt);
    const answer = await askGemini(prompt);
    if (answer.success) {
        const reviews = answer.result;
        if (reviews.length !== topic.sections.length + 1) {
            console.log('Invalid Length');
            return;
        }
        let foundZ = 0;
        for (let i = 0; i < reviews.length; i += 1) {
            if (reviews[i].sectionID === 0) {
                foundZ += 1;
            } else if (topic.sections[reviews[i].sectionID - 1] === undefined) {
                console.log(`Review ID Issue: ${i} - ${reviews[i].sectionID} - ${reviews[i].sectionID - 1} - ${topic.sections.length}`);
                return;
            }
        }

        if (foundZ === 0 || foundZ > 1) {
            console.log('Multi-Zero ID');
            return;
        }

        for (let i = 0; i < reviews.length; i += 1) {
            const review = reviews[i].results;
            let flag = false
            for (let idx = 0; idx <review.length; idx++) {
                if (idx < 5 && review[idx].result === false) {
                    delete review[idx].statement
                    delete review[idx].notes
                }

                if (idx < 5 && review[idx].result === true) {
                    flag = true;
                }
            }

            if (reviews[i].sectionID === 0) {
                await saveNodeReview(topic.id, review, flag);
            } else {
                await saveSectionReview(topic.sections[reviews[i].sectionID - 1].id, review, flag);
            }
        }
    }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
    do {
        try {
            await reviewTopic();
        } finally {
            await delay(60 * 1000);
        }
    } while (true);
}

process.on('SIGINT', async () => {
    await closeDriver();
    process.exit(0);
});

main();
