/**
 * @file api/review.js
 * @description Review a new topic before saving
 */

import jwt from 'jsonwebtoken'
import { dbNodeFetch } from '../storage/node.js';

const JWT_SECRET = process.env.JWT_SECRET

const aiKey = process.env.GEMINI_API_KEY || 'AIzaSyDCFLWg2xd8mxPcgTBwk9Pv92IsXJMFx2g';
const aiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-05-20";
const aiVersion = "v1beta";

function signToken(data) {
    return jwt.sign(data, JWT_SECRET, { expiresIn: '1h' });
}

function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET)
        if (decoded.pass === true) {
            return true;
        }
        return false;
    } catch {
        return false;
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

export async function reviewNode(req, res, next) {
    const { id } = req.params; // paretnt node ID.
    const {
        title,
        content,
        token,
    } = req.body;

    // If they allready passed the review, then move to create
    if (token && verifyToken(token) === true) {
        return next();
    }

    try {
        const parentNode = await dbNodeFetch(id, req.userId, req.roles);
        if (!parentNode) {
            return res.status(404).json({ error: 'Not found' });
        }

        let location = '';
        for (let i = 1; i < parentNode.breadcrumbs.length; i += 1) {
            if (location != '') {
                location += ' > ';
            }
            location += parentNode.breadcrumbs[i].title + ( parentNode.breadcrumbs[i].subtitle ? ' (' + parentNode.breadcrumbs[i].subtitle + ')' : '' );
        }
        console.log(location);

        const prompt = `
## Analyze Text for Factual and Logical Issues

**Top Level Domains:**

1. Abstract: The domain encompassing pure abstractions not dependent on physical, mental, or social instantiation. This includes formal systems (such as logic, mathematics, and theoretical computer science constructs like algorithms as abstract procedures), conceptual entities defined by axioms or universal properties (like numbers, sets, categories, topological spaces defined by their properties), and theoretical structures whose existence is solely in the conceptual or formal realm. The focus is on entities and concepts defined by formal rules, logical relations, or abstract properties, existing outside of space-time and causal physical interaction. It is distinct from the information content of instantiated forms (Informational), the subjective mental experience of abstractions (Mental), and the social conventions or institutions that might discuss, develop, or use them (Social).
2. Informational: The domain encompassing information as abstract patterns, structures, representations, and meanings, independent of their specific physical carriers or instantiations. This includes fundamental forms, properties, logical structures, processes of transformation and analysis, and abstract characteristics of information content and representation itself. The focus is on the form, content, encoding, decoding, transmission rules, and interpretation of information, rather than the physical medium or energy used to embody or transmit it.
3. Physical: The fundamental domain of tangible reality and its intrinsic characteristics within space-time. This domain encompasses entities that possess mass, energy, occupy space, and persist through time, as well as the forces, fields, properties, states, structures, and dynamics intrinsic to such physical existence. The focus is on the material instantiation and physical behavior of phenomena and entities within the physical universe, distinct from any information or abstract structure they may carry or represent.
4. Mental: The domain encompassing the subjective, experiential, and internal states, processes, content, and capacities associated with individual conscious agents. This includes consciousness itself, affective states (emotions, moods, feelings), sensory experiences (perceptions, raw qualia), cognitive processes (perception, attention, memory, thinking, reasoning, learning, imagination), volitional processes (motivation, decision-making, intention, self-control), and mental content (beliefs, desires, subjective representations, concepts as mentally held). The focus is on the first-person perspective and the phenomena that constitute inner mental life and individual subjective experience. It is distinct from the physical substrate (e.g., brain, neural activity), the abstract informational structures processed (Informational), and the collective or emergent properties of interacting minds (which belong to the Social domain).
5. Social: The domain encompassing the entities, structures, processes, forms, and emergent phenomena arising from the interaction, relationship, and organization of multiple conscious agents. This includes collective entities (such as dyads, groups, communities, formal organizations, populations), patterned relationships (social networks, hierarchies, statuses, roles), enduring frameworks (institutions like family, economy, polity, law, education, religion; shared culture including norms, values, beliefs, customs, symbolic systems), dynamic interactions (communication, cooperation, competition, conflict, collective action, influence), and integrated collective arrangements (socio-technical systems, economic systems, political systems). The focus is on the collective level of reality, generated by intersubjectivity, interdependence, and coordination among agents. It is distinct from individual mental states (Mental), the physical properties of the agents or their environment (Physical), the abstract information exchanged during interaction (Informational), and the methodologies used to analyze social phenomena (Meta).
6. Meta: The domain encompassing the higher-order concepts, formal languages, methods, processes, models, and frameworks used for constructing, analyzing, managing, evaluating, or understanding entities, systems, or concepts within any other domain. This includes methodologies for inquiry and practice (like the scientific method, engineering processes, research methodologies), formal techniques for specification, verification, and reasoning (formal methods, logic systems applied to other domains), meta-modeling approaches, knowledge organization methods (ontology building, schema design, classification processes), evaluation criteria and techniques (benchmarking, validation), and frameworks for designing or governing complex systems (meta-policies, governance models). The focus is on the tools, processes, and conceptual structures used to operate on or reason about other domains, serving a meta-level or reflective function. It is distinct from the primary subject matter or entities being studied, modeled, or managed. Applied fields (like Medicine, Engineering, Education, Law as practice) are areas that utilize concepts and methods from the Meta domain (among others) but are not themselves kinds of Meta entities; they are complex domains of activity that draw upon multiple fundamental categories.

**Topic for Analysis:**

"""
Location: ${location}
Title: ${title}
Summary: ${content}
"""

**Instructions for Analysis:**

For the provided text, answer the following questions, for the Topic summary. Your response should be a JSON array, each object corresponds to a question and follows the example format provided. Verify JSON array and objects are valid.
**Response Format:** [ RESPONSE_OBJECT, RESPONSE_OBJECT, ... ]

---

1.  **Is-A-Kind-Of Check:** Is the current topic strictly a is-a-kind-of for its location?
    * **Response Format:** \`{"id": 1, "result": TRUE/FALSE, "statement": "Proper location is TRUE", "notes": "Explanation of is-a-kind-of falure if FALSE and where the topic would possibly belong."}\`

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

        const geminiResult = await askGemini(prompt);
        if (geminiResult.success) {
            const review = geminiResult.result;
            let pass = true;
            if (review.length === 14) {
                // Check is-a-kind-of
                if (review[0].result === false) {
                    pass = false;
                } else {
                    delete review[0].note;
                }
                // Check 5 flags
                for (let i = 1; i <= 5; i += 1) {
                    if (review[i].result === true) {
                        pass = false;
                    } else {
                        delete review[i].note;
                    }
                }
                // Check scores
                for (let i = 6; i <= 13; i += 1) {
                    // Skip over question 11
                    if (i !== 11 &&review[i].score < 5) {
                        pass = false;
                    }
                }
            } else {
                console.log(JSON.stringify(review, null, 2));
                pass = false;
            }
            return res.status(202).json({
                title,
                content,
                review,
                pass,
                token: signToken({ pass }),
             });
        } else {
            return res.status(500).json({ error: 'Review Error' });
        }
    } catch (err) {
        console.error(err);
        if (err.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Parent not found' });
        }
        return res.status(500).json({ error: err.message });
    }
}
