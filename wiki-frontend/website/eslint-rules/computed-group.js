export default {
    meta: {
        type: 'layout',
        docs: {
            description: 'ensure calls (computed, watch, ref, reactive, etc.) are grouped and ordered, and variable declarations alphabetized by identifier',
            category: 'Stylistic Issues',
            recommended: false,
        },
        schema: [
            {
                type: 'object',
                properties: {
                    alphabetize: {
                        type: 'object',
                        properties: {
                            order: { type: 'string', enum: ['asc', 'desc'] },
                            caseInsensitive: { type: 'boolean' },
                        },
                        additionalProperties: false,
                    },
                    groups: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    'newlines-between': {
                        type: 'string',
                        enum: ['always', 'never'],
                    },
                    'newlines-inside': {
                        type: 'string',
                        enum: ['always', 'never', 'error'],
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            wrongOrder: 'Calls of "{{current}}" should come before calls of "{{prev}}".',
            notAlphabetical: 'Declarations in group "{{group}}" are not alphabetized by identifier.',
            missingBlankLine: 'Expected blank line between groups "{{prev}}" and "{{current}}".',
            unexpectedBlankLine: 'Unexpected blank line inside group "{{group}}".',
        },
    },
    create(context) {
        const sourceCode = context.getSourceCode();
        const options = context.options[0] || {};
        const defaultGroups = ['use', 'defineProps', 'defineEmits', 'ref', 'reactive', 'computed', 'watch', 'lifecycle'];
        const groupsOrder = options.groups || defaultGroups;
        const alphabetize = options.alphabetize;
        const newlineBetween = options['newlines-between'];
        const newlineInside = options['newlines-inside'];

        const lifecycleHooks = [
            'onBeforeMount', 'onMounted', 'onBeforeUpdate', 'onUpdated',
            'onBeforeUnmount', 'onUnmounted', 'onServerPrefetch',
            'onErrorCaptured', 'onActivated', 'onDeactivated',
            'onRenderTracked', 'onRenderTriggered',
        ];

        return {
            Program(node) {
                const decls = [];
                node.body.forEach((stmt, idx) => {
                    // collect VariableDeclaration calls
                    if (stmt.type === 'VariableDeclaration') {
                        stmt.declarations.forEach(d => {
                            if (!d.init || d.init.type !== 'CallExpression') return;
                            const callee = d.init.callee;
                            if (callee.type !== 'Identifier') return;
                            const callName = callee.name;
                            const varName = d.id && d.id.name;
                            let group = null;
                            if (callName.startsWith('use') && groupsOrder.includes('use')) {
                                group = 'use';
                            } else if (groupsOrder.includes(callName)) {
                                group = callName;
                            }
                            if (group && varName) {
                                decls.push({ node: stmt, callName, varName, group, index: idx });
                            }
                        });
                    }
                    // collect bare CallExpression statements (lifecycle hooks, etc.)
                    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
                        const callee = stmt.expression.callee;
                        if (callee.type !== 'Identifier') return;
                        const callName = callee.name;
                        let group = null;
                        if (lifecycleHooks.includes(callName) && groupsOrder.includes('lifecycle')) {
                            group = 'lifecycle';
                        } else if (callName.startsWith('use') && groupsOrder.includes('use')) {
                            group = 'use';
                        } else if (groupsOrder.includes(callName)) {
                            group = callName;
                        }
                        if (group) {
                            decls.push({ node: stmt, callName, varName: null, group, index: idx });
                        }
                    }
                });

                if (!decls.length) return;

                // 1) Enforce group order
                let lastGroupIdx = -1;
                decls.forEach(({ node: stmt, group }) => {
                    const currentIdx = groupsOrder.indexOf(group);
                    if (currentIdx < lastGroupIdx) {
                        context.report({
                            node: stmt,
                            messageId: 'wrongOrder',
                            data: { current: group, prev: groupsOrder[lastGroupIdx] },
                        });
                    }
                    lastGroupIdx = currentIdx;
                });

                // 2) Alphabetize within groups
                if (alphabetize) {
                    groupsOrder.forEach(grp => {
                        const items = decls.filter(d => d.group === grp && d.varName);
                        if (items.length > 1) {
                            const names = items.map(d => d.varName);
                            const sorted = [...names].sort((a, b) => {
                                if (alphabetize.caseInsensitive) {
                                    return a.toLowerCase().localeCompare(b.toLowerCase());
                                }
                                return a.localeCompare(b);
                            });
                            if (names.join() !== sorted.join()) {
                                context.report({
                                    node: items[0].node,
                                    messageId: 'notAlphabetical',
                                    data: { group: grp },
                                });
                            }
                        }
                    });
                }

                // 3) Newline rules
                if (newlineBetween === 'always' || newlineInside) {
                    const lines = sourceCode.getText().split('\n');
                    decls.sort((a, b) => a.index - b.index);

                    for (let i = 1; i < decls.length; i++) {
                        const prev = decls[i - 1];
                        const curr = decls[i];
                        const prevEnd = prev.node.loc.end.line;
                        const currStart = curr.node.loc.start.line;
                        const gap = currStart - prevEnd - 1;
                        const sameGroup = prev.group === curr.group;

                        // require blank line between different groups
                        if (newlineBetween === 'always' && !sameGroup && gap < 1) {
                            context.report({
                                node: curr.node,
                                messageId: 'missingBlankLine',
                                data: { prev: prev.group, current: curr.group },
                            });
                        }

                        // enforce no blank line inside group, except if comments-only gap
                        if (newlineInside === 'error' && sameGroup && gap > 0) {
                            // check if all intervening lines are comments or blank
                            const intervening = lines.slice(prevEnd, currStart - 1);
                            const onlyCommentsOrBlank = intervening.every(line => {
                                const t = line.trim();
                                return !t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.endsWith('*/');
                            });
                            const hasComment = intervening.some(line => {
                                const t = line.trim();
                                return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.endsWith('*/');
                            });
                            // allow exactly this case, otherwise error
                            if (!(onlyCommentsOrBlank && hasComment)) {
                                context.report({
                                    node: curr.node,
                                    messageId: 'unexpectedBlankLine',
                                    data: { group: curr.group },
                                });
                            }
                        }

                        // if you also use newlineInside: 'always', that behavior is untouched
                        if (newlineInside === 'always' && sameGroup && gap < 1) {
                            context.report({
                                node: curr.node,
                                messageId: 'missingBlankLine',
                                data: { prev: prev.group, current: curr.group },
                            });
                        }
                    }
                }
            },
        };
    },
};
