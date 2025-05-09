<!--
@file MarkdownRenderer.vue
@description Renders a subset of Markdown syntax to HTML: bold, italic, inline code, lists, and paragraphs. Escapes HTML and supports escaped asterisks.
-->

<template>
    <div class="markdown-renderer" v-html="html"></div>
</template>

<script setup>
import { computed } from 'vue';

/**
 * Props for MarkdownRenderer
 * @typedef {Object} MarkdownRendererProps
 * @property {string} content - The markdown string to render.
 */

/**
 * @type {import('vue').ExtractPropTypes<{
 *   content: { type: StringConstructor; required: true; default: ''; }
 * }>}
 */
const props = defineProps({
    content: {
        type: String,
        required: true,
        default: '',
    },
});

/**
 * Computed HTML output from the markdown content.
 * @type {import('vue').ComputedRef<string>}
 */
const html = computed(() => parseBasicMarkdown(props.content));

/**
 * Escape HTML special characters to prevent injection.
 * @param {string} str - Input string potentially containing HTML.
 * @returns {string} - Escaped string with &amp;, &lt;, &gt; entities.
 */
const escapeHtml = (str) =>
    str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

/**
 * Parse inline markdown elements: escaped asterisks, inline code, bold, italic,
 * and preserve raw angle brackets.
 *
 * @param {string} text - Single-line text to parse.
 * @returns {string} - HTML string with <strong>, <em>, and <code> tags.
 */
function parseInline(text) {
    // Protect escaped asterisks
    text = text.replace(/\\\*/g, '__AST__');
    // Preserve raw angle brackets
    text = text.replace(/</g, '__LT_ALL__').replace(/>/g, '__GT_ALL__');

    // Extract inline code segments
    /** @type {string[]} */
    const codeSegments = [];
    let idx = 0;
    text = text.replace(/`(.+?)`/g, (_, content) => {
        codeSegments.push(content);
        return `__CODE${idx++}__`;
    });

    // Escape remaining HTML
    let result = escapeHtml(text);

    // Apply bold (**text**) and italic (*text*)
    result = result
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Restore code segments safely
    codeSegments.forEach((content, i) => {
        const safe = escapeHtml(content);
        result = result.replace(
            `__CODE${i}__`,
            `<code class="md-code">${safe}</code>`,
        );
    });

    // Restore escaped asterisks and raw angle brackets
    return result
        .replace(/__AST__/g, '*')
        .replace(/__LT_ALL__/g, '&lt;')
        .replace(/__GT_ALL__/g, '&gt;');
}

/**
 * Parse basic markdown block elements: paragraphs, unordered/ordered lists.
 *
 * Supported:
 *  - Paragraphs separated by blank lines
 *  - Unordered list items starting with '-' or '*'
 *  - Ordered list items starting with '1.', '2.', etc.
 *
 * @param {string} text - Full markdown text, possibly multiline.
 * @returns {string} - HTML string representing the parsed content.
 */
function parseBasicMarkdown(text) {
    let html = '';
    /** @type {{type: 'ul'|'ol', indent: number}[]} */
    const listStack = [];
    /** @type {string[]} */
    let paraLines = [];

    /**
     * Flush accumulated paragraph lines as a `<p>` element.
     */
    function flushParagraph() {
        if (paraLines.length) {
            const paraText = paraLines.join(' ');
            html += `<p class="md-paragraph">${parseInline(paraText)}</p>`;
            paraLines = [];
        }
    }

    /**
     * Close open lists until the top of the stack has indent ≤ minIndent.
     * @param {number} minIndent
     */
    function closeLists(minIndent = 0) {
        while (listStack.length && listStack[listStack.length - 1].indent > minIndent) {
            const { type } = listStack.pop();
            html += `</${type}>`;
        }
    }

    /**
     * Close all open lists.
     */
    function closeAllLists() {
        while (listStack.length) {
            const { type } = listStack.pop();
            html += `</${type}>`;
        }
    }

    // Process each line
    text.split('\n').forEach((line) => {
        const trimmed = line.trim();
        const itemMatch = /^(\s*)([*-]|\d+\.)\s+(.*)/.exec(line);

        if (itemMatch) {
            // List item
            const [, spaces, marker, content] = itemMatch;
            const indent = spaces.length;
            closeLists(indent);
            flushParagraph();

            const type = /^\d+\./.test(marker) ? 'ol' : 'ul';
            const top = listStack[listStack.length - 1];
            if (!top || indent > top.indent || type !== top.type) {
                html += `<${type} class="md-list md-list-${type}">`;
                listStack.push({ type, indent });
            }
            html += `<li class="md-list-item">${parseInline(content.trim())}</li>`;

        } else if (!trimmed) {
            // Blank line: end current paragraph
            flushParagraph();

        } else {
            // Regular text: part of a paragraph
            closeAllLists();
            paraLines.push(trimmed);
        }
    });

    // Close any remaining lists and flush final paragraph
    closeAllLists();
    flushParagraph();
    return html;
}
</script>

<style scoped>
.markdown-renderer ::v-deep .md-list {
    margin: 1em 0;
    padding-left: 1.5em;
    list-style-position: inside;
}

.markdown-renderer ::v-deep .md-list-ul {
    list-style-type: disc;
}

.markdown-renderer ::v-deep .md-list-ol {
    list-style-type: decimal;
}

.markdown-renderer ::v-deep .md-list-item {
    margin-bottom: 0.5em;
}

.markdown-renderer ::v-deep .md-list .md-list {
    margin: 0.5em 0;
}

.markdown-renderer ::v-deep .md-paragraph {
    margin: 0.5em 0;
}

.markdown-renderer ::v-deep .md-code {
    background-color: #f5f5f5;
    font-family: monospace;
    padding: 0.2em 0.4em;
    border-radius: 3px;
}
</style>
