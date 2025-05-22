<!--
@file MarkdownRenderer.vue
@description Renders a subset of Markdown syntax to HTML: bold, italic, inline code, lists, and paragraphs. Escapes HTML and supports escaped asterisks.
-->

<template>
    <div class="markdown-renderer" v-html="html"></div>
</template>

<script setup>
// MarkdownRenderer.vue (script setup)
import katex from 'katex';
import { computed } from 'vue';
import 'katex/dist/katex.min.css';

const props = defineProps({
    content: { type: String, required: true, default: '' },
});

const html = computed(() => {
    const blocks = parseBlocks(props.content);
    return renderBlocks(blocks);
});

/** AST node types **/
/** @typedef {{
 *    type: 'paragraph',
 *    text: string
 * }} ParagraphNode
 *
 * @typedef {{
 *    type: 'list',
 *    ordered: boolean,
 *    items: BlockNode[][]
 * }} ListNode
 *
 * @typedef {ParagraphNode|ListNode} BlockNode
 *
 * @typedef {{
 *    type: 'text',
 *    content: string
 * }} TextNode
 *
 * @typedef {{
 *    type: 'strong'|'em'|'code'|'math-inline'|'math-display',
 *    children?: InlineNode[],
 *    content?: string
 * }} InlineNode
 *
 * @typedef {TextNode|InlineNode} InlineNode
 **/

/** BLOCK PARSER **/
function parseBlocks(markdown) {
    const lines = markdown.split('\n');
    const blocks = [];
    let paraLines = [];
    const listStack = [];

    function flushParagraph() {
        if (!paraLines.length) return;
        blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
        paraLines = [];
    }

    function closeLists(minIndent = 0) {
        while (
            listStack.length &&
            listStack[listStack.length - 1].indent >= minIndent
        ) {
            const { node } = listStack.pop();
            if (listStack.length) {
                listStack[listStack.length - 1].node.items.push(node.items);
            } else {
                blocks.push(node);
            }
        }
    }

    lines.forEach((line) => {
        const item = /^(\s*)([*-]|\d+\.)\s+(.*)/.exec(line);
        if (item) {
            const [, spaces, marker, content] = item;
            const indent = spaces.length;
            flushParagraph();
            // close deeper or same-level lists of different type
            while (
                listStack.length &&
                (listStack[listStack.length - 1].indent > indent ||
                    (listStack[listStack.length - 1].indent === indent &&
                        listStack[listStack.length - 1].node.ordered !==
                        !!marker.match(/\d+\./)))
            ) {
                closeLists(indent);
            }
            const ordered = !!marker.match(/\d+\./);
            let top = listStack[listStack.length - 1];
            if (!top || top.indent < indent) {
                const newList = { type: 'list', ordered, items: [] };
                listStack.push({ indent, node: newList });
                top = listStack[listStack.length - 1];
            }
            top.node.items.push([{ type: 'paragraph', text: content.trim() }]);
        } else if (!line.trim()) {
            flushParagraph();
        } else {
            flushParagraph();

            const plainTextIndent = line.match(/^(\s*)/)[0].length;
            let listToClose = null;

            if (listStack.length > 0) {
                const currentActiveList = listStack[listStack.length - 1];
                // If the plain text line's indentation is less than or equal to
                // the indentation of the current list itself, it signifies
                // that this line is not part of that list.
                if (plainTextIndent <= currentActiveList.indent) {
                    listToClose = currentActiveList;
                }
            }

            if (listToClose) {
                // Close the identified list and any lists nested deeper than it.
                closeLists(listToClose.indent);
            }

            // After potentially closing lists, check the stack again.
            const newTopList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
            if (newTopList && plainTextIndent >= newTopList.indent) {
                // This line is indented enough to be a continuation paragraph
                // for an item in the list that's now on top of the stack.
                const lastListItemBlocks = newTopList.node.items[newTopList.node.items.length - 1];
                lastListItemBlocks.push({ type: 'paragraph', text: line.trim() });
            } else {
                // Not part of any list
                paraLines.push(line.trim());
            }
        }
    });

    flushParagraph();
    closeLists(0);
    return blocks;
}

/** INLINE PARSER **/
function tokenizeInline(text) {
    const tokens = [];
    const regex = /(\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|`[^`]+`|\*\*|[*])/g;
    let last = 0;
    let m;
    while ((m = regex.exec(text))) {
        if (m.index > last) {
            tokens.push({ type: 'text', content: text.slice(last, m.index) });
        }
        tokens.push({ type: 'mark', content: m[0] });
        last = regex.lastIndex;
    }
    if (last < text.length) {
        tokens.push({ type: 'text', content: text.slice(last) });
    }
    return tokens;
}

function parseInline(text) {
    // A dummy root node that holds all top-level inlines
    const root = { children: [] };
    const stack = [root];

    const tokens = tokenizeInline(text);
    tokens.forEach((tk) => {
        // always an object with .children
        const container = stack[stack.length - 1];

        if (tk.type === 'text') {
            container.children.push({
                type: 'text',
                content: escapeHtml(tk.content),
            });
        } else if (tk.content === '**') {
            // toggle strong
            if (container.marker === '**') {
                // close
                delete container.marker;
                stack.pop();
            } else {
                // open
                const node = { type: 'strong', children: [], marker: '**' };
                container.children.push(node);
                stack.push(node);
            }
        } else if (tk.content === '*') {
            // toggle em
            if (container.marker === '*') {
                delete container.marker;
                stack.pop();
            } else {
                const node = { type: 'em', children: [], marker: '*' };
                container.children.push(node);
                stack.push(node);
            }
        } else if (tk.content.startsWith('`')) {
            // code span
            const code = tk.content.slice(1, -1);
            container.children.push({
                type: 'code',
                content: escapeHtml(code),
            });
        } else if (tk.content.startsWith('$$')) {
            const tex = tk.content.slice(2, -2);
            container.children.push({
                type: 'math-display',
                content: tex,
            });
        } else if (tk.content.startsWith('\\(')) {
            const tex = tk.content.slice(2, -2);
            container.children.push({
                type: 'math-inline',
                content: tex,
            });
        }
    });

    // Any unclosed markers: collapse them back into text
    while (stack.length > 1) {
        const node = stack.pop();
        const literal = node.children
            .map((n) => (n.type === 'text' ? n.content : ''))
            .join('');
        stack[stack.length - 1].children.push({
            type: 'text',
            content: escapeHtml(node.marker + literal + node.marker),
        });
    }

    return root.children;
}


/** RENDERERS **/
function renderBlocks(blocks) {
    return blocks
        .map((blk) => {
            if (blk.type === 'paragraph') {
                const inln = parseInline(blk.text);
                return `<p class="md-paragraph">${renderInline(inln)}</p>`;
            } else if (blk.type === 'list') {
                const tag = blk.ordered ? 'ol' : 'ul';
                const items = blk.items
                    .map((itemBlocks) =>`<li class="md-list-item">${itemBlocks
                        .map((b) => renderBlocks([b]))
                        .join('')}</li>`)
                    .join('');
                return `<${tag} class="md-list md-list-${tag}">${items}</${tag}>`;
            }
        })
        .join('');
}

function renderInline(nodes) {
    return nodes
        .map((n) => {
            switch (n.type) {
                case 'text':
                    return n.content;
                case 'strong':
                    return `<strong>${renderInline(n.children)}</strong>`;
                case 'em':
                    return `<em>${renderInline(n.children)}</em>`;
                case 'code':
                    return `<code class="md-code">${n.content}</code>`;
                case 'math-inline':
                    return katex.renderToString(n.content, {
                        throwOnError: false,
                        displayMode: false,
                    });
                case 'math-display':
                    return katex.renderToString(n.content, {
                        throwOnError: false,
                        displayMode: true,
                    });
            }
        })
        .join('');
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

</script>

<style scoped>
.markdown-renderer :deep(.md-list) {
    margin: 1em 0;
    padding-left: 1.5em;
    list-style-position: inside;
}

.markdown-renderer :deep(.md-list-ul) {
    list-style-type: disc;
}

.markdown-renderer :deep(.md-list-ol) {
    list-style-type: decimal;
}

.markdown-renderer :deep(.md-list-item) {
    margin-bottom: 0.5em;
}

.markdown-renderer :deep(.md-list .md-list) {
    margin: 0.5em 0;
}

.markdown-renderer :deep(.md-paragraph) {
    margin: 0.5em 0;
}

.markdown-renderer :deep(.md-code) {
    background-color: #f5f5f5;
    font-family: monospace;
    padding: 0.2em 0.4em;
    border-radius: 3px;
}
</style>
