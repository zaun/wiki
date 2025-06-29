<!--
@file PageView.vue
@description Displays a CMS page
-->

<template>
    <div class="page" :style="{ width: maxWidth }">
        <NotFound v-if="!loading && notFound" />

        <div v-else-if="!loading" v-html="content" class="page-content"></div>

        <v-container v-else class="d-flex justify-center pa-10">
            <v-progress-circular indeterminate size="48" />
        </v-container>
    </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';

import NotFound from '@/components/NotFound.vue';
import { useApi } from '@/stores/api';

const api = useApi();
const route = useRoute();

const content = ref('');
const loading = ref(true);
const maxWidth = ref(null);
const notFound = ref(false);

watch(() => route.params.id, load);


/** AST node types **/
/**
 * 
 * @typedef {{
 *    type: 'header',
 *    level: 1|2,
 *    text: string
 * }} HeaderNode
 * 
 * @typedef {{
 *    type: 'paragraph',
 *    text: string
 * }} ParagraphNode
 *
 * @typedef {{
 *    type: 'list',
 *    ordered: boolean,
 *    todo?: boolean
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
 *    href?: string
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

    /**
     * FIXME
     */
    function flushParagraph() {
        if (!paraLines.length) return;
        blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
        paraLines = [];
    }

    /**
     * FIXME
     */
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
        const todoItem = /^(\s*)\[([xX ]?)\]\s*(.*)/.exec(line);

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
                listStack.push({ indent, node: newList, todo: false });
                top = listStack[listStack.length - 1];
            }
            top.node.items.push([{ type: 'paragraph', text: content.trim() }]);
        } else if (todoItem) {
            const [, spaces, checkbox, content] = todoItem;
            const indent = spaces.length;
            flushParagraph(); // Flush any accumulated paragraph lines

            // Close lists that are deeper or are not the current todo list type
            while (
                listStack.length &&
                (listStack[listStack.length - 1].indent > indent ||
                    listStack[listStack.length - 1].node.todo === false) // Close if it's not a todo list
            ) {
                closeLists(indent);
            }

            let top = listStack[listStack.length - 1];
            if (!top || top.indent < indent || top.node.todo === false) {
                const newList = { type: 'list', ordered: false, items: [], todo: true };
                listStack.push({ indent, node: newList, todo: true });
                top = listStack[listStack.length - 1];
            }
            top.node.items.push([{ type: 'paragraph', checked: checkbox.trim().toLowerCase() === 'x', text: content.trim() }]);
            return; // Consume the line, do not process as continuation
        } else if (line.startsWith('### ')) {
            flushParagraph();
            blocks.push({ type: 'header', level: 3, text: line.substring(3).trim() });
        } else if (line.startsWith('## ')) {
            flushParagraph();
            blocks.push({ type: 'header', level: 2, text: line.substring(3).trim() });
        } else if (line.startsWith('# ')) {
            flushParagraph();
            blocks.push({ type: 'header', level: 1, text: line.substring(2).trim() });
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
    const regex = /(\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|`[^`]+`|\*\*|[*]|==|\[([^\]]+?)\]\((.+?)\))/g;
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

/**
 * Parse a line
 */
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
        } else if (tk.content === '==') {
            if (container.marker === '==') {
                delete container.marker;
                stack.pop();
            } else {
                const node = { type: 'highlight', children: [], marker: '==' };
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
        } else if (tk.content.startsWith('[')) {
            // Link
            const linkMatch = /^\[([^\]]+?)\]\((.+?)\)$/.exec(tk.content);
            if (linkMatch) {
                const [, linkText, href] = linkMatch;
                const parsedLinkText = parseInline(linkText);
                container.children.push({
                    type: 'link',
                    children: parsedLinkText,
                    href: escapeHtml(href),
                });
            }
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
            if (blk.type === 'header') {
                const inln = parseInline(blk.text);
                const tag = (blk.level === 1) ? 'h1' : (blk.level === 2) ? 'h2' : 'h3';
                return `<${tag}>${renderInline(inln)}</${tag}>`;
            } else if (blk.type === 'paragraph') {
                const inln = parseInline(blk.text);
                return `<p class="md-paragraph">${renderInline(inln)}</p>`;
            } else if (blk.type === 'list') {
                const tag = blk.ordered ? 'ol' : 'ul';
                const items = blk.items
                    .map((itemBlocks) => {
                        // Determine if this is a "todo" list item based on the first block's 'checked' property
                        const firstBlock = itemBlocks[0];
                        const isTodoItem = firstBlock && firstBlock.type === 'paragraph' && typeof firstBlock.checked === 'boolean';

                        // Apply the class 'checked' or 'unchecked' to the <li> element
                        // ONLY if it's identified as a todo item.
                        let itemClass = '';
                        if (isTodoItem) {
                            itemClass = firstBlock.checked ? 'checked' : 'unchecked';
                        }

                        // Render the content of the list item (all its blocks)
                        const renderedContent = itemBlocks
                            .map((b) => renderBlocks([b]))
                            .join('');

                        return `<li class="md-list-item ${itemClass.trim()}">${renderedContent}</li>`; // Use .trim() to avoid double spaces if itemClass is empty
                    })
                    .join('');
                return `<${tag} class="md-list md-list-${tag}">${items}</${tag}>`;
            }
        })
        .join('');
}

/**
 * FIXME
 */
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
                case 'highlight':
                    return `<mark>${renderInline(n.children)}</mark>`;
                case 'link':
                    return `<a href="${n.href}">${renderInline(n.children)}</a>`;
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

/**
 * FIXME
 */
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Converts a JSON layout object into an HTML string with inline Flexbox styles.
 *
 * @param {object} jsonData - The JSON object representing the page layout.
 * @returns {string} The generated HTML string.
 */

/**
 * Helper function to convert camelCase to kebab-case for CSS properties
 */
function camelToKebab(name) {
    return name.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Helper function to build inline styles from an object
 */
function buildInlineStyles(styleObject) {
    const styles = [];
    for (const key in styleObject) {
        if (styleObject.hasOwnProperty(key)) {
            styles.push(`${camelToKebab(key)}: ${styleObject[key]};`);
        }
    }
    return styles.join(' ');
}

/**
 * Function to process a single item (Container or Block) recursively
 */
function processItem(item) {
    const commonStyles = {};
    const elementAttrs = [`id="${item.id}"`];

    // Apply common item properties that belong to the *item's main block container*
    if (item.flexGrow !== undefined) commonStyles.flexGrow = item.flexGrow;
    if (item.flexShrink !== undefined) commonStyles.flexShrink = item.flexShrink;
    if (item.flexBasis !== undefined) commonStyles.flexBasis = item.flexBasis;
    if (item.order !== undefined) commonStyles.order = item.order;
    if (item.margin !== undefined) commonStyles.margin = item.margin;
    if (item.padding !== undefined) commonStyles.padding = item.padding;
    if (item.backgroundColor !== undefined) commonStyles.backgroundColor = item.backgroundColor;
    if (item.verticalAlignment !== undefined) commonStyles.alignSelf = item.verticalAlignment;
    if (item.width !== undefined) commonStyles.width = item.width;
    if (item.height !== undefined) commonStyles.height = item.height;


    // Determine the HTML element and its specific attributes/styles based on item type
    if (item.type === 'container') {
        const containerStyles = {
            display: 'flex',
        };
        if (item.flexDirection !== undefined) containerStyles.flexDirection = item.flexDirection;
        if (item.justifyContent !== undefined) containerStyles.justifyContent = item.justifyContent;
        if (item.alignItems !== undefined) containerStyles.alignItems = item.alignItems;
        if (item.flexWrap !== undefined) containerStyles.flexWrap = item.flexWrap;
        if (item.gap !== undefined) {
            containerStyles.gap = item.gap;
        } else {
            containerStyles.gap = 0;
        }

        // Combine common and container-specific styles
        const styles = { ...commonStyles, ...containerStyles };
        elementAttrs.push(`style="${buildInlineStyles(styles)}"`);

        let innerHtml = '';
        // Recursively process child items
        if (item.items && Array.isArray(item.items)) {
            innerHtml = item.items.map(child => processItem(child)).join('');
        }
        return `<div ${elementAttrs.join(' ')}>${innerHtml}</div>`;
    } else if (item.type === 'markdown') {
        const styles = { ...commonStyles };
        if (item.horizontalAlignment) styles.textAlign = item.horizontalAlignment;
        if (item.color) styles.color = item.color;
        elementAttrs.push(`style="${buildInlineStyles(styles)}"`);
        const blocks = parseBlocks(item.value);
        return `<div ${elementAttrs.join(' ')}>${renderBlocks(blocks)}</div>`;
    } else if (item.type === 'icon') {
        let iconName = item.name;
        if (!iconName.startsWith('mdi')) {
            iconName = 'mdi-' + iconName;
        }
        let size = item.size;
        if (!size) {
            size = '32px';
        }
        let color = item.foregroundColor;
        if (!color) {
            color = '#000';
        }
        return `<i class="mdi ${iconName}" style="display: inline-flex; align-items: center; justify-content: center; width: ${size}; height: ${size}; min-width: ${size}; min-height: ${size};  max-width: ${size}; max-height: ${size};font-size: ${size}; overflow: hidden; color: ${color}"></i>`;
    } else if (item.type === 'image') {
        const imageWrapperStyles = { ...commonStyles };
        delete imageWrapperStyles.height; // Remove height from the wrapper

        // Ensure the wrapper is a block element for text-align and margin:auto to work
        imageWrapperStyles.display = imageWrapperStyles.display || 'block';

        // Apply horizontalAlignment as text-align to the wrapper div to center its contents
        if (item.horizontalAlignment) {
            imageWrapperStyles.textAlign = item.horizontalAlignment;
        }

        // Styles for the inner div that will hold the background image
        const innerImageDivStyles = {
            width: '100%', // Inner div always fills the wrapper's width
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center center',
        };

        // Apply item.height directly to the inner image div
        if (item.height !== undefined) {
            innerImageDivStyles.height = item.height;
        }

        if (item.src) {
            innerImageDivStyles.backgroundImage = `url('${item.src}')`;
        }

        // Map objectFit to background-size for the inner image div
        if (item.objectFit !== undefined) {
            if (item.objectFit === 'fill') {
                innerImageDivStyles.backgroundSize = '100% 100%';
            } else if (item.objectFit === 'contain') {
                innerImageDivStyles.backgroundSize = 'contain';
            } else if (item.objectFit === 'cover') {
                innerImageDivStyles.backgroundSize = 'cover';
            } else if (item.objectFit === 'none') {
                innerImageDivStyles.backgroundSize = 'auto';
            } else if (item.objectFit === 'scale-down') {
                // For background-size, 'scale-down' is best approximated by 'contain'
                // as it ensures the image scales down to fit while maintaining aspect ratio.
                innerImageDivStyles.backgroundSize = 'contain';
            }
        }

        // Add alt text as aria-label for accessibility to the outer wrapper div
        if (item.alt) {
            elementAttrs.push(`aria-label="${item.alt}"`);
            elementAttrs.push(`role="img"`); // Indicate it's an image for screen readers
        }

        const innerImageDivHtml = `<div style="${buildInlineStyles(innerImageDivStyles)}"></div>`;
        const captionHtml = item.caption ? `<p style="margin-top: 5px; font-size: 0.9em; color: #555;">${item.caption}</p>` : '';

        // Build the style attribute for the outer wrapper div
        elementAttrs.push(`style="${buildInlineStyles(imageWrapperStyles)}"`);

        // Return the outer div containing the inner image div and the caption as siblings
        return `<div ${elementAttrs.join(' ')}>${innerImageDivHtml}${captionHtml}</div>`;

    } else if (item.type === "button") {
        const styles = { ...commonStyles };
        // Default button styles
        styles.display = 'inline-block'; // Buttons are inline-block by default, so text-align on parent works
        styles.padding = styles.padding || '10px 20px';
        styles.border = styles.border || 'none';
        styles.borderRadius = styles.borderRadius || '5px';
        styles.cursor = styles.cursor || 'pointer';
        styles.textDecoration = styles.textDecoration || 'none';
        styles.fontSize = styles.fontSize || '1em';
        styles.fontWeight = styles.fontWeight || 'bold';
        styles.textAlign = styles.textAlign || 'center'; // Text inside button

        // Apply specific styles based on the 'style' hint
        if (item.style === 'primary') {
            styles.backgroundColor = styles.backgroundColor || '#007bff';
            styles.color = styles.color || 'white';
        } else if (item.style === 'secondary') {
            styles.backgroundColor = styles.backgroundColor || '#6c757d';
            styles.color = styles.color || 'white';
        } else if (item.style === 'outline') {
            styles.backgroundColor = styles.backgroundColor || 'transparent';
            styles.color = styles.color || '#007bff';
            styles.border = styles.border || '1px solid #007bff';
        } else if (item.style === 'link') {
            styles.backgroundColor = styles.backgroundColor || 'transparent';
            styles.color = styles.color || '#007bff';
            styles.textDecoration = styles.textDecoration || 'underline';
            styles.padding = styles.padding || '0';
            styles.fontWeight = styles.fontWeight || 'normal';
        } else { // Default if no specific style or unknown
            styles.backgroundColor = styles.backgroundColor || '#007bff';
            styles.color = styles.color || 'white';
        }

        elementAttrs.push(`href="${item.url}" target="${item.target || '_self'}"`);
        elementAttrs.push(`style="${buildInlineStyles(styles)}"`);
        return `<a ${elementAttrs.join(' ')}>${item.label}</a>`;
    } else {
        console.log(`Unknow type: ${item.type}`);
    }

    return ''; // Should not happen if item type is always valid
}

/**
 * Fetches node data from the store and handles loading/404 state.
 * @returns {Promise<void>}
 */
async function load() {
    loading.value = true;
    notFound.value = false;

    const result = await api.getPage(route.params.id);
    if (result.status !== 200) {
        content.value = '';
    } else {
        content.value = processItem(result.data.content);
    }

    document.title = `OmniOntos: ${result.data?.title ?? 'Page not found'}`;
    maxWidth.value = result.data?.maxWidth;
    if (!maxWidth.value) {
        maxWidth.value = '900px';
    }

    loading.value = false;
}

// Initial load on mount
onMounted(load);
</script>

<style scoped>
.page {
    margin: 0 auto;
}

.page-content {
    margin: 0;
}


/* Ordered and Unordered Lists */
.page-content :deep(ol),
.page-content :deep(ul) {
    margin-left: 20px;
    /* Indent lists for readability */
    margin-bottom: 1em;
    /* Space after the list */
    list-style-position: outside;
    /* Puts markers outside the content flow */
}

/* Specifics for Unordered Lists */
.page-content :deep(ul) {
    list-style-type: disc;
    /* Common default for unordered lists */
}

/* Specifics for Ordered Lists */
.page-content :deep(ol) {
    list-style-type: decimal;
    /* Common default for ordered lists */
}

/* List Items */
.page-content :deep(li) {
    margin-bottom: 0.5em;
    line-height: 1.5;
}

/* Style for unchecked todo items: change the bullet to an open square */
.page-content :deep(li.unchecked) {
    margin-left: -1em;
    list-style-type: none; /* Remove the default bullet (dot, square, etc.) */
    position: relative; /* Needed for positioning the ::before pseudo-element */
    padding-left: 1.5em; /* Create space for the custom bullet on the left */
}

.page-content :deep(li.unchecked)::before {
    content: '☐'; /* Unicode character for an empty square (U+2610) */
    position: absolute; /* Position it relative to the li */
    left: 0; /* Place it at the start of the padding-left space */
    top: 0; /* Align to the top of the line */
    font-size: 1em; /* Adjust size if needed, usually matches text size */
}

/* Style for checked todo items: (optional) change the bullet to a checked square */
.page-content :deep(li.checked) {
    margin-left: -1em;
    list-style-type: none; /* Also remove default bullet if using custom icon */
    position: relative;
    padding-left: 1.5em;
}

.page-content :deep(li.checked)::before {
    content: '☑'; /* Unicode character for a checked square (U+2611) */
    position: absolute;
    left: 0;
    top: 0;
    font-size: 1em;
}

/* Nested Lists (Optional, but good practice) */
.page-content :deep(ol ol),
.page-content :deep(ul ul),
.page-content :deep(ol ul),
.page-content :deep(ul ol) {
    margin-top: 0.5em;
    /* Add a bit of space before nested lists */
    margin-bottom: 0;
    /* No extra space after nested lists */
}

/* Remove bottom margin from the last list item within a list */
.page-content :deep(li:last-child) {
    margin-bottom: 0;
}
</style>
