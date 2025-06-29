import { render, screen, cleanup, within } from '@testing-library/vue';
import * as katex from 'katex';
import { afterEach, describe, test, expect, vi } from 'vitest';

import MarkdownRenderer from '../src/components/sections/SimpleMarkdown.vue';

// Mock katex.renderToString to control its output for testing purposes
vi.mock('katex', () => ({
    renderToString: vi.fn((tex, options) => {
        // Return a simplified, identifiable string for assertion
        const mode = options.displayMode ? 'display' : 'inline';
        return `<span data-testid="mock-katex-${mode}">${tex}</span>`;
    }),
}));

describe('MarkdownRenderer.vue', () => {
    // Clean up DOM after each test to prevent interference
    afterEach(() => {
        cleanup();
        // Clear mock calls after each test
        vi.clearAllMocks();
    });

    // Test case: Renders with empty content
    test('renders empty content without errors', () => {
        render(MarkdownRenderer, { props: { content: '' } });
        // The div should exist but be empty
        expect(screen.getByRole('generic', { class: 'markdown-renderer' }))
            .toBeEmptyDOMElement();
    });

    // Test case: Renders with only whitespace
    test('renders content with only whitespace as empty', () => {
        render(MarkdownRenderer, { props: { content: '   \n \t ' } });
        expect(screen.getByRole('generic', { class: 'markdown-renderer' }))
            .toBeEmptyDOMElement();
    });

    // Test suite: Paragraphs
    describe('Paragraph Rendering', () => {
        // Test case: Renders a single-line paragraph
        test('renders a single-line paragraph', () => {
            const content = 'This is a test paragraph.';
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText(content);
            expect(paragraph).toBeInTheDocument();
            expect(paragraph.tagName).toBe('P');
            expect(paragraph).toHaveClass('md-paragraph');
        });

        // Test case: Renders multi-line paragraph (joined by space)
        test('renders multi-line text as a single paragraph, joining lines', () => {
            const content = `Line one\nLine two\nLine three`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText('Line one Line two Line three');
            expect(paragraph).toBeInTheDocument();
            expect(paragraph.tagName).toBe('P');
        });

        // Test case: Renders multiple paragraphs separated by blank lines
        test('renders multiple paragraphs separated by blank lines', () => {
            const content = `First paragraph.\n\nSecond paragraph.`;
            render(MarkdownRenderer, { props: { content } });
            expect(screen.getByText('First paragraph.')).toBeInTheDocument();
            expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
            expect(screen.getAllByRole('paragraph')).toHaveLength(2);
        });

        // Test case: Renders a centered paragraph with custom syntax
        test('renders a centered paragraph using / prefix', () => {
            const content = '/This is a centered paragraph.';
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText('This is a centered paragraph.');
            expect(paragraph).toBeInTheDocument();
            expect(paragraph).toHaveClass('md-paragraph', 'text-center');
        });

        // Test case: Centered paragraph with leading/trailing spaces in prefix
        test('renders a centered paragraph with spaces around /', () => {
            const content = '/   Centered text with spaces.';
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText('Centered text with spaces.');
            expect(paragraph).toBeInTheDocument();
            expect(paragraph).toHaveClass('text-center');
        });
    });

    // Test suite: Inline Elements
    describe('Inline Element Rendering', () => {
        // Test case: Renders bold text
        test('renders bold text using **', () => {
            const content = `This is **bold** text.`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText('This is bold text.');
            const bold = within(paragraph).getByText('bold');
            expect(bold.tagName).toBe('STRONG');
        });

        // Test case: Renders italic text
        test('renders italic text using *', () => {
            const content = `This is *italic* text.`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText('This is italic text.');
            const italic = within(paragraph).getByText('italic');
            expect(italic.tagName).toBe('EM');
        });

        // Test case: Renders highlighted text
        test('renders highlighted text using ==', () => {
            const content = `This is ==highlighted== text.`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText('This is highlighted text.');
            const highlighted = within(paragraph).getByText('highlighted');
            expect(highlighted.tagName).toBe('MARK');
        });

        // Test case: Renders inline code
        test('renders inline code using `', () => {
            const content = `This is \`console.log('hello')\` code.`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText(/This is.*code./); // Match full text
            const code = within(paragraph).getByText(`console.log('hello')`);
            expect(code.tagName).toBe('CODE');
            expect(code).toHaveClass('md-code');
        });

        // Test case: Renders nested inline elements
        test('renders nested inline elements', () => {
            const content = `**Bold with *italic* inside**`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText('Bold with italic inside');
            const bold = within(paragraph).getByText('Bold with italic inside');
            expect(bold.tagName).toBe('STRONG');
            const italic = within(bold).getByText('italic');
            expect(italic.tagName).toBe('EM');
        });

        // Test case: Renders mixed inline elements
        test('renders mixed inline elements in a single paragraph', () => {
            const content = `Some **bold**, *italic*, and ==highlighted== text.`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText(
                'Some bold, italic, and highlighted text.',
            );
            expect(within(paragraph).getByText('bold').tagName).toBe('STRONG');
            expect(within(paragraph).getByText('italic').tagName).toBe('EM');
            expect(within(paragraph).getByText('highlighted').tagName).toBe(
                'MARK',
            );
        });
    });

    // Test suite: Math Expressions (using mocked Katex)
    describe('Math Expression Rendering', () => {
        // Test case: Renders inline math
        test('renders inline math using \\( \\)', () => {
            const content = `Inline math: \\(E=mc^2\\)`;
            render(MarkdownRenderer, { props: { content } });
            // Check if katex.renderToString was called with correct arguments
            expect(katex.renderToString).toHaveBeenCalledWith(
                'E=mc^2',
                expect.objectContaining({ displayMode: false }),
            );
            // Check if the mock output is in the document
            expect(screen.getByTestId('mock-katex-inline')).toHaveTextContent(
                'E=mc^2',
            );
        });

        // Test case: Renders display math
        test('renders display math using $$ $$', () => {
            const content = `Display math:\n$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$`;
            render(MarkdownRenderer, { props: { content } });
            // Check if katex.renderToString was called with correct arguments
            expect(katex.renderToString).toHaveBeenCalledWith(
                'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
                expect.objectContaining({ displayMode: true }),
            );
            // Check if the mock output is in the document
            expect(screen.getByTestId('mock-katex-display')).toHaveTextContent(
                'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
            );
        });

        // Test case: Inline math with content around it
        test('renders inline math with text immediately around it', () => {
            const content = `Text before \\(a^2+b^2=c^2\\) text after.`;
            render(MarkdownRenderer, { props: { content } });
            expect(katex.renderToString).toHaveBeenCalledWith(
                'a^2+b^2=c^2',
                expect.objectContaining({ displayMode: false }),
            );
            expect(screen.getByText(/Text before.*text after./i))
                .toBeInTheDocument();
            expect(screen.getByTestId('mock-katex-inline')).toBeInTheDocument();
        });
    });

    // Test suite: Lists
    describe('List Rendering', () => {
        // Test case: Renders an unordered list
        test('renders an unordered list', () => {
            const content = `* Item 1\n* Item 2`;
            render(MarkdownRenderer, { props: { content } });
            const ul = screen.getByRole('list');
            expect(ul.tagName).toBe('UL');
            expect(ul).toHaveClass('md-list', 'md-list-ul');
            expect(within(ul).getByText('Item 1')).toBeInTheDocument();
            expect(within(ul).getByText('Item 2')).toBeInTheDocument();
            expect(within(ul).getAllByRole('listitem')).toHaveLength(2);
        });

        // Test case: Renders an ordered list
        test('renders an ordered list', () => {
            const content = `1. First item\n2. Second item`;
            render(MarkdownRenderer, { props: { content } });
            const ol = screen.getByRole('list');
            expect(ol.tagName).toBe('OL');
            expect(ol).toHaveClass('md-list', 'md-list-ol');
            expect(within(ol).getByText('First item')).toBeInTheDocument();
            expect(within(ol).getByText('Second item')).toBeInTheDocument();
            expect(within(ol).getAllByRole('listitem')).toHaveLength(2);
        });

        // Test case: Renders nested unordered lists
        test('renders nested unordered lists', () => {
            const content = `* Parent Item\n  * Child Item 1\n  * Child Item 2`;
            render(MarkdownRenderer, { props: { content } });
            const parentUl = screen.getByRole('list');
            const parentItem = within(parentUl).getByText('Parent Item');
            expect(parentItem.tagName).toBe('P'); // List item content is a paragraph
            const nestedUl = within(parentItem.closest('li')).getByRole(
                'list',
            );
            expect(nestedUl.tagName).toBe('UL');
            expect(within(nestedUl).getByText('Child Item 1')).toBeInTheDocument();
        });

        // Test case: Renders mixed nested lists (ordered within unordered)
        test('renders mixed nested lists', () => {
            const content = `* Main item\n  1. Sub-item A\n  2. Sub-item B`;
            render(MarkdownRenderer, { props: { content } });
            const mainUl = screen.getByRole('list', { name: /Main item/ }); // Get the main UL
            expect(mainUl.tagName).toBe('UL');
            const mainItemLi = within(mainUl).getByText('Main item')
                .closest('li');
            const nestedOl = within(mainItemLi).getByRole('list');
            expect(nestedOl.tagName).toBe('OL');
            expect(within(nestedOl).getByText('Sub-item A')).toBeInTheDocument();
        });

        // Test case: Renders list continuation paragraphs
        test('renders continuation paragraph for a list item', () => {
            const content = `* List item one\n  Continued paragraph here.\n  And another line.`;
            render(MarkdownRenderer, { props: { content } });

            const listItem = screen.getByRole('listitem');
            const paragraphs = within(listItem).getAllByRole('paragraph');

            expect(paragraphs).toHaveLength(2);
            expect(paragraphs[0]).toHaveTextContent('List item one');
            expect(paragraphs[1]).toHaveTextContent(
                'Continued paragraph here. And another line.',
            );
        });

        // Test case: Different markers for unordered lists
        test('supports both * and - for unordered lists', () => {
            const content = `* Item with asterisk\n- Item with hyphen`;
            render(MarkdownRenderer, { props: { content } });
            const ul = screen.getByRole('list');
            expect(ul.tagName).toBe('UL');
            expect(within(ul).getByText('Item with asterisk')).toBeInTheDocument();
            expect(within(ul).getByText('Item with hyphen')).toBeInTheDocument();
        });

        // Test case: Paragraph immediately following a list closes the list
        test('paragraph immediately following a list closes the list', () => {
            const content = `* List item\n\nThis is a new paragraph.`;
            render(MarkdownRenderer, { props: { content } });
            // Expect one list and one paragraph at the root level
            expect(screen.getAllByRole('list')).toHaveLength(1);
            expect(screen.getByRole('listitem')).toHaveTextContent('List item');
            expect(screen.getByText('This is a new paragraph.')).toBeInTheDocument();
            // Ensure the new paragraph is not nested within the list
            expect(screen.getByText('This is a new paragraph.').closest('li'))
                .toBeNull();
        });
    });

    // Test suite: Edge Cases and Robustness
    describe('Edge Cases and Robustness', () => {
        // Test case: Unclosed bold marker should revert to literal text
        test('unclosed bold marker renders as literal text', () => {
            const content = `This is **unclosed bold.`;
            render(MarkdownRenderer, { props: { content } });
            expect(screen.getByText('This is **unclosed bold.')).toBeInTheDocument();
            expect(screen.queryByRole('strong')).toBeNull(); // No <strong> element
        });

        // Test case: Unclosed italic marker should revert to literal text
        test('unclosed italic marker renders as literal text', () => {
            const content = `This is *unclosed italic.`;
            render(MarkdownRenderer, { props: { content } });
            expect(screen.getByText('This is *unclosed italic.')).toBeInTheDocument();
            expect(screen.queryByRole('emphasis')).toBeNull(); // No <em> element
        });

        // Test case: Unclosed highlight marker should revert to literal text
        test('unclosed highlight marker renders as literal text', () => {
            const content = `This is ==unclosed highlight.`;
            render(MarkdownRenderer, { props: { content } });
            expect(screen.getByText('This is ==unclosed highlight.')).toBeInTheDocument();
            expect(screen.queryByRole('mark')).toBeNull(); // No <mark> element
        });

        // Test case: `code` backticks not closed
        test('unclosed backtick for code renders as literal text', () => {
            const content = `This is \`code without closing backtick.`;
            render(MarkdownRenderer, { props: { content } });
            expect(screen.getByText('This is `code without closing backtick.'))
                .toBeInTheDocument();
            expect(screen.queryByRole('code')).toBeNull(); // No <code> element
        });

        // Test case: HTML entities in plain text should be escaped
        test('HTML entities in plain text are escaped', () => {
            const content = `Text with < > & " ' characters.`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText(
                'Text with < > & " \' characters.',
            );
            // Check innerHTML for actual escaped characters
            expect(paragraph.innerHTML).toBe(
                'Text with &lt; &gt; &amp; &quot; &#x27; characters.',
            );
        });

        // Test case: HTML entities inside inline code should be escaped
        test('HTML entities inside inline code are escaped', () => {
            const content = `Code: \`<div class="test"></div>\``;
            render(MarkdownRenderer, { props: { content } });
            const codeElement = screen.getByText(`<div class="test"></div>`);
            expect(codeElement.tagName).toBe('CODE');
            expect(codeElement.innerHTML).toBe(
                '&lt;div class=&quot;test&quot;&gt;&lt;/div&gt;',
            );
        });

        // Test case: Empty list item content
        test('empty list item renders a list item with empty paragraph', () => {
            const content = `* `;
            render(MarkdownRenderer, { props: { content } });
            const listItem = screen.getByRole('listitem');
            expect(listItem).toBeInTheDocument();
            expect(within(listItem).getByRole('paragraph')).toBeEmptyDOMElement();
        });

        // Test case: List with inconsistent indentation (should resolve based on closest valid indent)
        test('handles lists with inconsistent but valid indentation', () => {
            const content = `* L1\n  * L2\n    * L3`;
            render(MarkdownRenderer, { props: { content } });
            const l1 = screen.getByText('L1').closest('li');
            const l2 = within(l1).getByText('L2').closest('li');
            const l3 = within(l2).getByText('L3').closest('li');
            expect(l1).toBeInTheDocument();
            expect(l2).toBeInTheDocument();
            expect(l3).toBeInTheDocument();
        });
    });

    // Test suite: Security Checks (XSS Prevention)
    describe('Security Checks (XSS Prevention)', () => {
        // Test case: Script tag injection in plain text
        test('escapes script tags in plain text', () => {
            const content = `Hello <script>alert('xss');</script> World.`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText(
                "Hello <script>alert('xss');</script> World.",
            );
            expect(paragraph.innerHTML).not.toContain('alert');
            expect(paragraph.innerHTML).toContain(
                '&lt;script&gt;alert(&#x27;xss&#x27;);&lt;/script&gt;',
            );
        });

        // Test case: Script tag injection within markdown formatting
        test('escapes script tags within bold formatting', () => {
            const content = `**Bold <script>alert('xss');</script> Text**`;
            render(MarkdownRenderer, { props: { content } });
            const boldElement = screen.getByText(
                "Bold <script>alert('xss');</script> Text",
            );
            expect(boldElement.tagName).toBe('STRONG');
            expect(boldElement.innerHTML).not.toContain('alert');
            expect(boldElement.innerHTML).toContain(
                '&lt;script&gt;alert(&#x27;xss&#x27;);&lt;/script&gt;',
            );
        });

        // Test case: Image tag with onerror attribute
        test('escapes image tags with onerror attributes in plain text', () => {
            const content = `Image: <img src="x" onerror="alert('xss')">`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText(
                `Image: <img src="x" onerror="alert('xss')">`,
            );
            expect(paragraph.innerHTML).not.toContain('onerror');
            expect(paragraph.innerHTML).toContain('&lt;img src=&quot;x&quot;');
        });

        // Test case: Dangling HTML tag
        test('escapes dangling HTML tags', () => {
            const content = `This is <div> and a <p class="foo"> tag.`;
            render(MarkdownRenderer, { props: { content } });
            const paragraph = screen.getByText(
                'This is <div> and a <p class="foo"> tag.',
            );
            expect(paragraph.innerHTML).toContain('&lt;div&gt;');
            expect(paragraph.innerHTML).toContain('&lt;p class=&quot;foo&quot;&gt;');
            expect(paragraph.querySelector('div')).toBeNull(); // Should not create actual elements
            expect(paragraph.querySelector('p')).toBeNull();
        });

        // Test case: HTML inside code block (should be literal)
        test('HTML inside inline code block is rendered literally (escaped)', () => {
            const content = `\`<a href="javascript:alert(1)">Click</a>\``;
            render(MarkdownRenderer, { props: { content } });
            const code = screen.getByText('<a href="javascript:alert(1)">Click</a>');
            expect(code.tagName).toBe('CODE');
            expect(code.innerHTML).toBe(
                '&lt;a href=&quot;javascript:alert(1)&quot;&gt;Click&lt;/a&gt;',
            );
        });
    });
});
