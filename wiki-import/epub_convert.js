#!/usr/bin/env node
import EPub from 'epub';
import { JSDOM } from 'jsdom';
import { promisify } from 'util';
import { parseFragment } from 'parse5';
import * as csstree from 'css-tree';
import juice from 'juice';
import readability from 'node-readability';

const file = process.argv[2];
if (!file) {
    console.error('Usage: node epub_convert.js <epub-file>');
    process.exit(1);
}

function getDomain(url) {
    const { hostname } = new URL(url);
    return hostname.split('.').slice(-2).join('.');
}

// promisified node-readability
function readAsync(html) {
    return new Promise((resolve, reject) => {
        readability(html, (err, article, meta) => {
            if (err) reject(err);
            else resolve(article);
        });
    });
}

/**
 * htmlToAst(html) → Array of block-nodes:
 *  - { type:'paragraph', children: [inlineNode,…] }
 *  - { type:'list', ordered:bool, items: [ [block,…], … ] }
 *
 * inlineNode is one of:
 *  - { type:'text',     value:string }
 *  - { type:'strong',   children:[…] }
 *  - { type:'emphasis', children:[…] }
 *  - { type:'inlineCode', value:string }
 *  - { type:'highlight', children:[…] }
 *  - { type:'mathInline',  value:string }
 *  - { type:'mathDisplay', value:string }
 */
export function htmlToAst(html) {
    const frag = parseFragment(html);

    // parse inline style → map
    function parseStyles(s) {
        try {
            const dl = csstree.parse(`*{${s}}`, { context: 'declarationList' });
            const map = {};
            dl.children.forEach(d => {
                map[d.property] = csstree.generate(d.value).trim();
            });
            return map;
        } catch {
            return {};
        }
    }

    // build inline nodes
    function buildInline(node) {
        if (node.nodeName === '#text') {
            const txt = node.value;
            if (!txt.trim()) return null;
            return { type: 'text', value: txt };
        }
        if (!node.tagName) return null;

        // children
        const children = (node.childNodes || [])
            .map(buildInline)
            .filter(Boolean);

        // semantic
        switch (node.tagName) {
            case 'strong': case 'b':
                return { type: 'strong', children };
            case 'em': case 'i':
                return { type: 'emphasis', children };
            case 'code':
                return {
                    type: 'code',
                    value: children.map(n => n.type === 'text' ? n.value : '').join('')
                };
            case 'mark':
                return { type: 'highlight', children };
        }

        // style-based
        const styleAttr = node.attrs.find(a => a.name === 'style')?.value || '';
        const style = parseStyles(styleAttr);

        if (
            style['font-weight'] === 'bold' ||
            parseInt(style['font-weight'], 10) >= 600
        ) return { type: 'strong', children };
        if (style['font-style'] === 'italic')
            return { type: 'emphasis', children };
        if (
            style['background-color'] &&
            style['background-color'] !== 'transparent'
        ) return { type: 'highlight', children };

        // math
        const txt = node.textContent || '';
        const mdisp = txt.match(/^\$\$([\s\S]+?)\$\$$/);
        if (mdisp) return { type: 'mathDisplay', value: mdisp[1] };
        const minl = txt.match(/^\\\(([\s\S]+?)\\\)$/);
        if (minl) return { type: 'inlineMath', value: minl[1] };

        // default: flatten children
        if (children.length === 0) return null;
        if (children.length === 1) return children[0];
        return {
            type: 'text',
            value: children.map((n) => n.value || '').join(''),
        };
    }

    // parse a list
    function parseList(node) {
        const ordered = node.tagName === 'ol';
        const items = [];
        for (const li of node.childNodes || []) {
            if (li.tagName !== 'li') continue;
            // recursive: grab inner HTML and re-parse
            const html = (li.childNodes || [li])
                .map(n => n.outerHTML || n.value)
                .join('');
            items.push(htmlToAst(html));
        }
        return { type: 'list', ordered, items };
    }

    // flatten <section> at top
    const top = [];
    frag.childNodes.forEach(n => {
        if (n.tagName === 'section') n.childNodes.forEach(c => top.push(c));
        else top.push(n);
    });

    const out = [];
    top.forEach(n => {
        if (!n.tagName && n.nodeName) {
            out.push(buildInline(n));
            return;
        }

        // paragraphs
        if (n.tagName === 'p') {
            const styleAttr = n.attrs.find(a => a.name === 'style')?.value || '';
            const style = parseStyles(styleAttr);
            const alignAttr = n.attrs.find(a => a.name === 'align')?.value;
            // detect .wst-center or your injected md-center
            const classAttr = n.attrs.find(a => a.name === 'class')?.value || '';
            const isCentered =
                /text-align\s*:\s*center/.test(styleAttr) ||
                alignAttr === 'center' ||
                /\b(?:wst-center|md-center)\b/.test(classAttr);

            const children = (n.childNodes || [])
                .map(buildInline)
                .filter(Boolean);

            if (children.length > 0) {
                out.push({
                    type: 'paragraph',
                    centered: isCentered,
                    children
                });
            }
            return;
        }

        // lists
        if (n.tagName === 'ul' || n.tagName === 'ol') {
            out.push(parseList(n));
            return;
        }

        // unwrap other wrappers
        (n.childNodes || []).forEach(c => {
            if (c.tagName === 'p') {
                const styleAttr = c.attrs.find(a => a.name === 'style')?.value || '';
                const style = parseStyles(styleAttr);
                const alignAttr = c.attrs.find(a => a.name === 'align')?.value;
                const classAttr = c.attrs.find(a => a.name === 'class')?.value || '';
                const isCentered =
                    /text-align\s*:\s*center/.test(styleAttr) ||
                    alignAttr === 'center' ||
                    /\b(?:wst-center|md-center)\b/.test(classAttr);

                const children = (c.childNodes || [])
                    .map(buildInline)
                    .filter(Boolean);

                if (children.length) {
                    out.push({
                        type: 'paragraph',
                        centered: isCentered,
                        children
                    });
                }
            } else if (c.tagName === 'ul' || c.tagName === 'ol') {
                out.push(parseList(c));
            }
        });
    });

    return out;
}

function renderInline(nodes) {
    return nodes.map(n => {
        switch (n.type) {
            case 'text': return n.value;
            case 'strong': return `**${renderInline(n.children)}**`;
            case 'emphasis': return `*${renderInline(n.children)}*`;
            case 'highlight': return `==${renderInline(n.children)}==`;
            case 'inlineCode': return `\`${n.value}\``;
            case 'mathInline':
                return `\\(${n.value}\\)`;
            case 'mathDisplay':
                return `\$\$${n.value}\$\$`;
            default: return renderInline(n.children || []);
        }
    }).join('');
}

function blockToMarkdown(block) {
    if (block.type === 'paragraph') {
        // just inline + two newlines
        const md = renderInline(block.children);
        return (block.centered ? '/' : '') + md;
    }
    else if (block.type === 'list') {
        console.error(111, block.items);
        // unordered if !ordered, otherwise numbered
        return block.items
            .map((itemBlocks, idx) => {
                // render each block in the list item
                const itemMd = itemBlocks
                    .map(b => blockToMarkdown(b))
                    .join('\n\n');
                const marker = block.ordered ? `${idx + 1}. ` : '- ';
        console.error(222, itemBlocks);
        console.error(333, itemMd);

                // indent multiline items
                return itemMd
                    .split('\n')
                    .map((line, i) => (i === 0 ? marker + line : '  ' + line))
                    .join('\n');
            })
            .join('\n');
    }
    return renderInline([block]);
}

const epub = new EPub(file);
const getChapterRaw = promisify(epub.getChapterRaw.bind(epub));
const getFile = promisify(epub.getFile.bind(epub));

function removeFromStart(remove, text, loose) {
    let r = remove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (loose) r = r.replace(/ /g, '\\s*');
    const re = new RegExp('^' + r + '\\s*', 'i');
    return text.trim().replace(re, '');
}

function stripBracketNumberFromStart(s) {
    const m = s.match(/^\[(\d+)\]\r?\n/);
    if (!m) return { cite: null, stripped: s };
    return { cite: parseInt(m[1], 10), stripped: s.slice(m[0].length) };
}

function stripTitleAcrossBlocks(blocks, chapterTitle) {
    const parts = chapterTitle.split(/[.:]/);
    if (parts.length > 1) {
        parts.forEach((p) => stripTitleAcrossBlocks(blocks, p));
    }


    let rem = chapterTitle.trim();
    let ckeckme = '';
    for (let i = 0; i < blocks.length; i += 1) {
        if (blocks[i].type === 'paragraph' && blocks[i].children.length === 1 && blocks[i].children[0].type === 'text') {
            ckeckme += ' ' + blocks[i].children[0].value;
        } else if (blocks[i].type === 'paragraph' && blocks[i].children.length === 1 && blocks[i].children[0].type === 'strong' && blocks[i].children[0].children.length === 1 && blocks[i].children[0].children[0].type === 'text') {
            ckeckme += ' ' + blocks[i].children[0].children[0].value;
        } else {
            return;
        }

        if (!ckeckme) {
            continue;
        }

        const check = removeFromStart(rem, ckeckme, true);
        if (!check.trim()) {
            blocks.splice(0, i + 1);
        }
    }
}

const removePrefixes = [
    'Chapter I', 'Chapter II', 'Chapter III', 'Chapter IV',
    'Chapter V', 'Chapter VI', 'Chapter VII', 'Chapter VIII',
    'Chapter IX', 'Chapter X', 'Chapter XI', 'Chapter XII',
    'Chapter XIII', 'Chapter XIV', 'Chapter XV', 'Chapter XVI',
    'Chapter XVII', 'Chapter XVIII'
].sort((a, b) => b.length - a.length);

function cleanLayout(root) {
    const doc = root.ownerDocument || root;
    const win = doc.defaultView;
    const { NodeFilter } = win;

    // 0) Remove any element with inline display:none
    doc.querySelectorAll('[style]').forEach(el => {
        const raw = el.getAttribute('style') || '';
        if (/display\s*:\s*none/i.test(raw)) {
            el.remove();
        }
    });

    // 1) Convert centered DIVs → <p align="center">…</p> or unwrap
    doc.querySelectorAll('div').forEach(div => {
        const style = div.getAttribute('style') || '';
        const alignAttr = div.getAttribute('align');
        const isCentered =
            /text-align\s*:\s*center/.test(style) ||
            alignAttr === 'center' ||
            div.classList.contains('wst-center');

        if (isCentered) {
            const children = Array.from(div.childNodes);
            const allPs = children.every(n => n.tagName === 'P');
            if (allPs) {
                children.forEach(p => {
                    p.setAttribute('align', 'center');
                    div.parentNode.insertBefore(p, div);
                });
                div.remove();
            } else {
                const p = doc.createElement('p');
                p.setAttribute('align', 'center');
                children.forEach(n => p.appendChild(n));
                div.parentNode.replaceChild(p, div);
            }
        } else {
            // unwrap non-centered divs
            while (div.firstChild) {
                div.parentNode.insertBefore(div.firstChild, div);
            }
            div.remove();
        }
    });

    // 2) Unwrap every <span>
    doc.querySelectorAll('span').forEach(span => {
        while (span.firstChild) {
            span.parentNode.insertBefore(span.firstChild, span);
        }
        span.remove();
    });

    // 2.5) Flatten nested <p> (strip out <p> that contain <p>s)
    doc.querySelectorAll('p').forEach(p => {
        const innerPs = Array.from(p.children).filter(c => c.tagName === 'P');
        if (innerPs.length) {
            const parent = p.parentNode;
            innerPs.forEach(inner => {
                if (p.hasAttribute('align') && !inner.hasAttribute('align')) {
                    inner.setAttribute('align', p.getAttribute('align'));
                }
                parent.insertBefore(inner, p);
            });
            parent.removeChild(p);
        }
    });

    // 3) Remove empty text nodes & empty non-semantic elements
    const walker = doc.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        null,
        false
    );
    let toRemove = [];
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeType === win.Node.TEXT_NODE) {
            if (!node.nodeValue.trim()) toRemove.push(node);
        } else if (node.nodeType === win.Node.ELEMENT_NODE) {
            if (
                !node.hasChildNodes() &&
                !/^(P|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|CODE|IMG|A|BR)$/.test(node.tagName)
            ) {
                toRemove.push(node);
            }
        }
    }
    toRemove.forEach(n => n.parentNode && n.parentNode.removeChild(n));

    // 4) Remove any empty <p> tags
    doc.querySelectorAll('p').forEach(p => {
        if (!p.textContent.trim()) {
            p.remove();
        }
    });

    // 3) Replace <br> tags with a space
    doc.querySelectorAll('br').forEach(br => {
        const spaceTextNode = doc.createTextNode(' ');
        br.parentNode.insertBefore(spaceTextNode, br);
        br.parentNode.removeChild(br);
    });

    // 5) Merge paragraphs based on punctuation and capitalization
    const paragraphs = Array.from(doc.querySelectorAll('p'));
    toRemove = [];
    for (let i = 0; i < paragraphs.length - 1; i++) {
        const current = paragraphs[i];
        const next = paragraphs[i + 1];
        const currentWord = current.textContent
            .trim()
            .replace(/,\s+/g, '<<COMMA_SPACE>>') // Replace ", " with a placeholder
            .split(/\s+/) // Split on spaces
            .map(word => word.replace(/<<COMMA_SPACE>>/, ', ')) // Restore ", "
            .length;

        const endsWithPunctuation = /[.!?]$/.test(current.textContent.trim());
        const startsWithCapital = /^[A-Z]/.test(next.textContent.trim());

        if (currentWord > 10 && !endsWithPunctuation && !startsWithCapital) {
            // Ensure a space is added before merging
            current.textContent = current.textContent + ' ' + next.textContent;
            toRemove.push(next);
            i++; // Skip over next
        }
    }
    console.error(toRemove.length)
    toRemove.forEach(n => n.parentNode && n.parentNode.removeChild(n));
}

epub.on('end', async () => {
    const topic = {
        title: epub.metadata.title,
        parentTitle: '',
        details: [],
        links: [{
            title: `${epub.metadata.title} @ ${getDomain(epub.metadata.source)}`,
            url: epub.metadata.source
        }],
        sections: []
    };

    // grab and concat all EPUB CSS
    let css = '';
    for (const [id, item] of Object.entries(epub.manifest)) {
        if (item['media-type'] === 'text/css') {
            const buf = await getFile(id);
            css += buf.toString('utf8') + '\n';
        }
    }

    // console.error(epub.manifest);
    let cCount = 0;
    for (let cIdx = 0; cIdx < epub.toc.length; cIdx += 1) {
        const chapter = epub.toc[cIdx];
        const href = chapter.href.split('#')[0];

        let cId = '';
        for (let key in epub.manifest) {
            if (epub.manifest[key].href === href) {
                cId = epub.manifest[key].id;
            } 
        }

        if (chapter.title.toLowerCase() === 'title page') {
            continue;
        }

        cCount += 1;
        try {
            // get raw HTML
            const rawHtml = await getChapterRaw(cId);

            // inline ALL EPUB CSS + chapter‐embedded <style>
            const dom = new JSDOM(rawHtml);
            const doc = dom.window.document;

            let inlineCSS = '';
            for (const se of doc.querySelectorAll('style')) {
                let t = se.textContent || '';
                t = t.replace(/^\s*<!\[CDATA\[\s*/, '').replace(/\s*\]\]>\s*$/, '');
                inlineCSS += '\n' + t;
            }

            const head = doc.head || doc.body.parentNode.insertBefore(
                doc.createElement('head'), doc.body
            );
            const styleEl = doc.createElement('style');
            styleEl.textContent = css + '\n' + inlineCSS;
            head.appendChild(styleEl);

            const inlinedHtml = juice.inlineContent(dom.serialize(), css + '\n' + inlineCSS, {
                removeStyleTags: true,
                preserveMediaQueries: false,
                applyAttributesTable: false
            });

            // annotate any center alignment
            const inDom = new JSDOM(inlinedHtml);
            inDom.window.document
                .querySelectorAll('[style]')
                .forEach(el => {
                    if (el.style.textAlign === 'center') {
                        el.setAttribute('align', 'center');
                    }
                });

            cleanLayout(inDom.window.document);
            const ast = htmlToAst(inDom.window.document.body.innerHTML);

            // console.error(chapter.title);
            if (chapter.title === 'The Protestant Ethic and the Spirit of Capitalism') {
                // console.error(111, rawHtml); // Raw from epub
                // console.error(111, inlinedHtml); // Inlines styles
                // console.error(111, inDom.window.document.body.innerHTML); // After cleanup
                // console.error(111, JSON.stringify(ast, null, 2)); // Converted to AST
            }

            stripTitleAcrossBlocks(ast, chapter.title);
            if (ast[0].type === 'paragraph' && ast[0].children.length && ast[0].children[0].type === 'text') {
                let txt = ast[0].children[0].value;
                removePrefixes.forEach(pre => {
                    txt = removeFromStart(pre, txt, true);
                });
                if (txt.trim()) {
                    ast[0].children[0].value = txt.trim();
                } else {
                    ast.splice(0, 1);
                }
            }
            stripTitleAcrossBlocks(ast, chapter.title);

            let content = '';
            for (let i = 0; i < ast.length; i += 1) {
                const blk = ast[i];
                content += blockToMarkdown(blk);
                content += '\n\n';
            }

            if (cCount === 1) {
                topic.content = content.trim();
            } else {
                console.error(chapter.title);
                topic.sections.push({
                    title: chapter.title,
                    content: content.trim()
                });
            }
        } catch (err) {
            console.error(`Error processing ${chapter.id}:`, err);
        }
    }
    console.error('DONE');

    console.log(JSON.stringify(topic, null, 2));
});

epub.parse();