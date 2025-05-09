// eslint.config.js
import vueImport from 'eslint-plugin-import';
import vueJSDoc from 'eslint-plugin-jsdoc';
import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

import computedGroupRule from './eslint-rules/computed-group.js';

// disable all rules from eslint-plugin-vue
const disabledVueRules = Object.keys(vuePlugin.rules).reduce((all, name) => {
    all[`vue/${name}`] = 'off';
    return all;
}, {});

// Common rules
const commonRules = {
    // enforce 4‐space JS indentation inside <script>
    indent: ['error', 4, { SwitchCase: 1 }],
      
    // Airbnb-style base rules inlined
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'prefer-const': ['error', { destructuring: 'all' }],
    'arrow-body-style': ['error', 'as-needed'],
    'comma-dangle': ['error', 'always-multiline'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'eol-last': ['error', 'always'],
    'eqeqeq': ['error', 'always'],
    'semi': ['error', 'always'],

    'jsdoc/require-jsdoc': ['warn', {
        require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
        },
    }],

    'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always',
    }],

    // Grouping/newline rule in JS contexts as well
    'custom/computed-group': ['error', {
        alphabetize: { order: 'asc', caseInsensitive: true },
        groups: [
            'use','defineProps','defineEmits',
            'ref','reactive','computed','watch','lifecycle',
        ],
        'newlines-between': 'always',
        'newlines-inside': 'error',
    }],
};

export default [
    // A) Vue SFCs: strip <template>, parse <script> via vue-eslint-parser
    {
        files: ['**/*.vue'],
        plugins: {
            vue: vuePlugin,
            import: vueImport,
            jsdoc: vueJSDoc,
            custom: { rules: { 'computed-group': computedGroupRule } },
        },
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        rules: {
            // turn off everything from eslint-plugin-vue
            ...disabledVueRules,

            // re‑enable Vue template & script indent
            'vue/script-indent': ['error', 4, {
                baseIndent: 0,     // keeps your <script> itself indented 4
                switchCase: 1,     // indent case bodies by one extra level (4 spaces)
                ignores: [],       // your other ignores
            }],

            ...commonRules,
        },
    },

    // B) Plain JS: parse with built‑in Espree
    {
        files: ['**/*.js'],
        plugins: {
            import: vueImport,
            jsdoc: vueJSDoc,
            custom: { rules: { 'computed-group': computedGroupRule } },
        },
        languageOptions: {
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        rules: {
            ...commonRules,
        },
    },
];
