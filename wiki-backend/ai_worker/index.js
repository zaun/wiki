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


const getNode = async () => {
    const s = session();

    try {
        const result = await s.run(`
            MATCH (n:Node)
            WHERE n.title IS NOT NULL AND n.title <> ''
                AND n.content IS NOT NULL AND n.content <> ''
                AND n.aiReview IS NULL
                AND n.status IS NOT NULL AND n.status = 'complete'
            RETURN n
            LIMIT 1
        `);

        const record = result.records[0];
        if (record) {
            const node = record.get('n');
            return node?.properties ?? null;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await s.close();
    }
}

async function saveNodeReview({ id, review, flag }) {
    const s = session();
    try {
        await s.run(`
            MATCH (n:Node {id: $id})
            SET n.aiReview = $review
            SET n.aiFlag = $flag
        `, { id, review: JSON.stringify(review), flag });
        console.log('Saved...')
    } finally {
        await s.close();
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

const reviewNode = async () => {

    const node = await getNode();
    if (!node) {
        return;
    }

    if (node.aiReview) {
        console.log('Already reviewed');
        return;
    }

    console.log(`Reviwing: ${node.title} ${node.id}`);

    const prompt = `
## Analyze Text for Factual and Logical Issues

**Text for Analysis:**

"""
Title: ${node.title}

${node.content}
"""

**Instructions for Analysis:**

For the provided text, answer the following questions. Your response should be a JSON array, where each object corresponds to a question and follows the example format provided. Verify JSON array and objects are valid.

---

1.  **Factual Claims Check:** Is there any information presented that directly contradicts widely accepted facts or information likely to be found in mainstream, reputable sources?
    * **Response Format:** \`{"id": 1, "result": TRUE/FALSE, "statement": "Contradictory statement if TRUE", "notes": "Explanation of contradiction if TRUE"}\`

2.  **Internal Consistency Check:** Are there any logical inconsistencies or direct contradictions within the provided text itself?
    * **Response Format:** \`{"id": 2, "result": TRUE/FALSE, "statement": "Contradictory statements if TRUE", "notes": "Explanation if TRUE"}\`

3.  **Reference Fabrication/Misrepresentation Check:** Does this text refer to studies, data, or external sources that appear to be fabricated or misrepresented?
    * **Response Format:** \`{"id": 3, "result": TRUE/FALSE, "statement": "Fabricated/misrepresented reference if TRUE", "notes": "Explanation if TRUE"}\`

4.  **Bias/Subjectivity Check:** Does the text contain strong subjective opinions, unsubstantiated claims, or language that demonstrates clear bias, deviating from an objective or neutral tone?
    * **Response Format:** \`{"id": 4, "result": TRUE/FALSE, "statement": "Biased statement if TRUE", "notes": "Explanation if TRUE"}\`

5.  **Sensitive Content Check:** Does the text discuss any potentially sensitive, offensive, or highly controversial topics without adequate context or a neutral stance?
    * **Response Format:** \`{"id": 5, "result": TRUE/FALSE, "statement": "Sensitive content if TRUE", "notes": "Explanation if TRUE"}\`

6.  **Clarity & Readability Score:** Rate the clarity and readability of the following text on a scale of 1 to 10, where 1 is extremely unclear/difficult to read and 10 is exceptionally clear and easy to understand.
    * **Response Format:** \`{"id": 6, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

7.  **Coherence & Flow Score:** Considering the logical progression of ideas and transitions between sentences and paragraphs, rate the coherence and flow of the following text on a scale of 1 to 10.
    * **Response Format:** \`{"id": 7, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

8.  **Completeness/Thoroughness Score:** Based on the apparent intent of this section, rate how thoroughly it addresses its implied topic or sub-topic on a scale of 1 to 10, where 1 is incomplete/superficial and 10 is comprehensive/thorough within its scope.
    * **Response Format:** \`{"id": 8, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

9.  **Grammar, Spelling & Punctuation Score:** Rate the correctness of grammar, spelling, and punctuation in the following text on a scale of 1 to 10, where 1 indicates numerous errors and 10 is virtually flawless.
    * **Response Format:** \`{"id": 9, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

10. **Engagement Score:** Rate the overall engagement and appeal of the following text for a general audience on a scale of 1 to 10, where 1 is very dull/unengaging and 10 is captivating/highly engaging.
    * **Response Format:** \`{"id": 10, "score": NUMBER (1 as lowest quality, 10 as highest), "notes": "Explanation if SCORE"}\`

---

    `;

    const response = await askGemini(prompt);

    if (response.success && Array.isArray(response.result)) {
        const review = response.result;

        if (review.length !== 10) {
            console.log('Review length not 10');
            console.log(response.result);
            return;
        }

        let pass = true;
        let flag = false
        for (let idx = 0; idx <review.length; idx++) {
            if (review[idx].id !== idx + 1) {
                pass = false;
                console.log('Review id invalid');
            }

            if (idx < 5 && review[idx].result === false) {
                delete review[idx].statement
                delete review[idx].notes
            }

            if (idx < 5 && review[idx].result === true) {
                flag = true;
            }
        }

        if (!pass) {
            console.log(response.result);
            return;
        }

        await saveNodeReview({ id: node.id, review, flag });
    }
    
    return;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
    do {
        try {
            await reviewNode();
        } finally {
            await delay(30 * 1000);
        }
    } while (true);
}

process.on('SIGINT', async () => {
    await closeDriver();
    process.exit(0);
});

main();
