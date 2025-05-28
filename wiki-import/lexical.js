import 'dotenv/config'; // For loading your API_KEY
import fetch from 'node-fetch'; // For making HTTP requests
import { promises as fsPromises } from 'fs'; // For promises-based file system operations (writeFile, access, mkdir)
import fs from 'fs'; // For traditional fs functions like createReadStream
import readline from 'readline'; // For reading files line by line
import path from 'path'; // For path manipulation

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash-preview-05-20";
const API_VERSION = "v1beta";
const INPUT_FILE = './data/lexicon/Oxford 5000.txt'; // Your input file with one word per line
const OUTPUT_FILE = './lexical_entries.json'; // Output JSON file
const ERROR_WORDS_FILE = './error_words.txt'; // File to store words that caused parsing errors

// Ensure the directory for the input file exists (if it's in a subdirectory)
const inputDir = path.dirname(INPUT_FILE);
const outputDir = path.dirname(OUTPUT_FILE); // Assuming output is in current or specified dir

if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY not found in .env file.");
    console.error("Please get your API key from https://makersuite.google.com/app/apikey and add it to a .env file.");
    process.exit(1); // Exit if API key is not found
}

// Helper function to introduce a delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGeminiAPIDirectly(words) {
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

    const promptWords = words.join(', '); // Join words for the prompt

    const requestBody = {
        contents: [
            {
                parts: [
                    { text: `I need detailed lexical entries for the following common English words: ${promptWords}. For each word, please provide the following sections, adhering strictly to the JSON format provided.

Crucially, all definitions and explanations must be in your own words, avoiding direct quotes or close paraphrases from existing dictionaries.

Required Information for Each Word:

Title: The English word itself.

Content:

Include a phonetic transcription using the IPA (International Phonetic Alphabet) above the defintions.
Include a pronunciation key explaining the IPA symbols used for that specific word under the phonetic transcription.
Provide a clear, concise definition for each distinct meaning of the word.

Grammatical Information:

Identify the part(s) of speech (e.g., noun, verb, adjective, adverb).
For Nouns: List plural forms (e.g., child → children). If gender/case is relevant in English (rare for common nouns, but specify if it were a general request), mention it.
For Verbs: List principal parts (base, past simple, past participle) and specify if it's transitive (Vt) or intransitive (Vi). Note any irregular forms.
For Adjectives/Adverbs: List comparative and superlative forms (e.g., good → better → best).

Etymology:

Trace the word's historical origin, starting with its immediate predecessor (e.g., Old English, Old French).
Go back as far as possible (e.g., Proto-Germanic, Proto-Indo-European), clearly indicating the source languages or roots.
Briefly explain how the meaning or form evolved if significant.

Usage Examples:

Provide 3-4 clear, distinct sentences for each major definition, demonstrating the word's typical use in context.

Idioms and Phrases:

List common idioms or fixed phrases using the word, along with a brief explanation of their meaning.

Details:

Regional Usage: Common English, British English, American English, etc.
Style: Formal, Informal, Slang, Colloquial, Archaic, Obsolete, Technical, Literary, Offensive, Euphemism
Semantic Field: example (Colors, Body Parts, Emotions, Cooking)
Frequency : State if the word is considered 'very common', 'common', 'less common', or similar, based on general English corpus data.
Formatting Instructions:

Please output the information in a JSON array format, where each word is an object following this structure:

{
    "title": "<WORD>",
    "parentTitle": "English Lexical",
    "content": "<CONTENT>",
    "details": [
        {
            "label": "Region",
            "type": "text",
            "value": "<REGIONAL>"
        },
        {
            "label": "Style",
            "type": "text",
            "value": "<STYLE>"
        },
        {
            "label": "Semantic Fields",
            "type": "text",
            "value": "<SEMANTIC FIELDS>"
        },
        {
            "label": "Frequency",
            "type": "text",
            "value": "<FREQUENCY>"
        }
    ],
    "sections": [
        {
            "title": "Grammatical Information",
            "content": "<GRAMMAR>"
        },
        {
            "title": "Etymology",
            "content": "<ETYMOLOGY>"
        },
        {
            "title": "Usage Examples",
            "content": "<USAGE>"
        },
        {
            "title": "Idioms and Phrases",
            "content": "<IDIOMS>"
        }
    ]
}
` }
                ]
            }
        ]
    };

    try {
        console.log(`Making a direct fetch request to Gemini API for words: ${promptWords}...`);
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

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            let generatedText = data.candidates[0].content.parts[0].text;
            // Strip ```json and ```
            if (generatedText.startsWith('```json')) {
                generatedText = generatedText.substring(7);
            }
            if (generatedText.endsWith('```')) {
                generatedText = generatedText.substring(0, generatedText.length - 3);
            }

            try {
                const parsedJson = JSON.parse(generatedText);
                console.log("\n--- Gemini API Direct Fetch Response (stripped and parsed) ---");
                // Log only a snippet for brevity to avoid flooding console with full JSON
                console.log(JSON.stringify(parsedJson, null, 2).substring(0, 500) + '...');
                console.log("----------------------------------------\n");
                return { success: true, data: parsedJson, words: words }; // Return success and parsed data
            } catch (parseError) {
                console.error(`JSON parsing error for words [${promptWords}]:`, parseError);
                console.error("Generated text that caused error:\n", generatedText);
                return { success: false, words: words, error: parseError.message }; // Return failure and the words
            }
        } else {
            console.warn("API response did not contain expected content for words:", promptWords, JSON.stringify(data, null, 2));
            return { success: false, words: words, error: "Unexpected API response structure" };
        }

    } catch (error) {
        console.error("Error calling Gemini API directly for words [", promptWords, "]:", error);
        if (error.message.includes('HTTP error!') && error.message.includes('message: {') && error.message.includes('"code":')) {
            try {
                const apiError = JSON.parse(error.message.split('message: ')[1]);
                console.error(`Gemini API Error Details: Code: ${apiError.error.code}, Message: ${apiError.error.message}, Status: ${apiError.error.status}`);
            } catch (e) {
                // Couldn't parse JSON error, just log original
            }
        }
        return { success: false, words: words, error: error.message }; // Return failure and the words
    }
}

async function processWordsFile() {
    console.log(`Attempting to create input directory: ${path.resolve(inputDir)}`);
    await fsPromises.mkdir(inputDir, { recursive: true });
    console.log(`Attempting to create output directory: ${path.resolve(outputDir)}`);
    await fsPromises.mkdir(outputDir, { recursive: true });
    console.log("Input and output directories ensured.");

    let allWords = [];
    try {
        // Use the traditional 'fs' for createReadStream
        const fileStream = fs.createReadStream(INPUT_FILE);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (line.trim() !== '') {
                allWords.push(line.trim());
            }
        }
        console.log(`Successfully loaded ${allWords.length} words from ${INPUT_FILE}.`);
    } catch (error) {
        console.error(`Error reading input file ${INPUT_FILE}:`, error);
        return;
    }

    // --- RESUMABILITY LOGIC STARTS HERE ---

    // 1. Initialize lexical_entries from existing file if it exists
    let compiledLexicalEntries = [];
    try {
        const existingOutput = await fsPromises.readFile(OUTPUT_FILE, 'utf8');
        compiledLexicalEntries = JSON.parse(existingOutput);
        console.log(`Loaded ${compiledLexicalEntries.length} existing entries from ${OUTPUT_FILE}.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Starting with an empty ${OUTPUT_FILE} as it does not exist.`);
        } else {
            console.warn(`Could not read or parse existing ${OUTPUT_FILE}:`, error);
            console.warn("Starting with an empty output file to prevent data corruption.");
            compiledLexicalEntries = []; // Reset if parsing failed to avoid appending to corrupt data
        }
    }


    // 2. Initialize errored_words from existing file if it exists
    let erroredWords = [];
    try {
        const existingErrorWords = await fsPromises.readFile(ERROR_WORDS_FILE, 'utf8');
        erroredWords = existingErrorWords.split('\n').filter(word => word.trim() !== '');
        console.log(`Loaded ${erroredWords.length} existing error words from ${ERROR_WORDS_FILE}.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Starting with an empty ${ERROR_WORDS_FILE} as it does not exist.`);
        } else {
            console.warn(`Could not read or parse existing ${ERROR_WORDS_FILE}:`, error);
            console.warn("Starting with an empty error words list.");
            erroredWords = [];
        }
    }

    // Create Sets for efficient lookup of already processed words
    const processedWordsTitles = new Set(compiledLexicalEntries.map(entry => entry.title));
    const processedErrorWords = new Set(erroredWords);

    // 3. Filter out words that have already been processed successfully or failed previously
    const wordsToProcess = allWords.filter(word =>
        !processedWordsTitles.has(word) && !processedErrorWords.has(word)
    );

    console.log(`Found ${wordsToProcess.length} words to process (skipping ${allWords.length - wordsToProcess.length} already processed/failed words).`);


    // Check if there are any words left to process
    if (wordsToProcess.length === 0) {
        if (compiledLexicalEntries.length > 0 || erroredWords.length > 0) {
            console.log("All words from the input file have already been processed (successfully or with errors). Exiting.");
        } else {
            console.log("No new words to process from the input file. Exiting.");
        }
        return; // Exit the function if nothing to do
    }
    // --- RESUMABILITY LOGIC ENDS HERE ---


    const groupSize = 10;

    for (let i = 0; i < wordsToProcess.length; i += groupSize) {
        const currentWordsGroup = wordsToProcess.slice(i, i + groupSize);
        console.log(`Processing group ${Math.floor(i / groupSize) + 1} of ${Math.ceil(wordsToProcess.length / groupSize)} words: ${currentWordsGroup.join(', ')}`);

        const result = await callGeminiAPIDirectly(currentWordsGroup);

        if (result.success) {
            compiledLexicalEntries.push(...result.data);
            // Save after each successful batch
            try {
                await fsPromises.writeFile(OUTPUT_FILE, JSON.stringify(compiledLexicalEntries, null, 2));
                console.log(`✅ Appended new entries to ${OUTPUT_FILE}. Current total: ${compiledLexicalEntries.length}`);
            } catch (error) {
                console.error(`Error writing output file ${OUTPUT_FILE} after batch:`, error);
                // Even if writing fails, we don't add to error_words, as generation was successful
            }
        } else {
            console.error(`Failed to process or parse response for words: ${result.words.join(', ')}`);
            // Add only the specific words from the failed group that haven't been logged as errors before
            result.words.forEach(word => {
                if (!processedErrorWords.has(word)) {
                    erroredWords.push(word);
                    processedErrorWords.add(word); // Add to set to mark as processed error
                }
            });
            // Save error words immediately
            try {
                // Ensure unique error words in the file (though the Set should help here)
                await fsPromises.writeFile(ERROR_WORDS_FILE, Array.from(erroredWords).join('\n'));
                console.warn(`⚠️ Appended failed words to ${ERROR_WORDS_FILE}. Current total failed: ${erroredWords.length}`);
            } catch (error) {
                console.error(`Error writing error words file ${ERROR_WORDS_FILE} after batch:`, error);
            }
        }

        // Wait 10 seconds before the next prompt, unless it's the last group
        if (i + groupSize < wordsToProcess.length) {
            console.log("Waiting for 10 seconds before the next group...");
            await delay(10000);
        }
    }

    console.log(`\n--- Processing Complete ---`);
    console.log(`Final total successfully processed entries: ${compiledLexicalEntries.length}`);
    console.log(`Final total words with parsing/API errors: ${Array.from(erroredWords).length}`); // Use Array.from(Set) to ensure unique count
    console.log(`Output written to ${OUTPUT_FILE}`);
    console.log(`Error words written to ${ERROR_WORDS_FILE}`);
}

// Run the main process
(async () => {
    console.log(`Script starting. Current working directory: ${process.cwd()}`);
    console.log(`Expected input file path: ${path.resolve(INPUT_FILE)}`);
    console.log(`Expected output file path: ${path.resolve(OUTPUT_FILE)}`);
    console.log(`Expected error words file path: ${path.resolve(ERROR_WORDS_FILE)}`);

    try {
        await processWordsFile();
        console.log("Script finished successfully.");
    } catch (err) {
        console.error("An unhandled error occurred during processing:", err);
        process.exit(1); // Exit with an error code
    }
})();
