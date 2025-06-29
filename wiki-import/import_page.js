#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import fetch from 'node-fetch'
import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'

const apiKey = 'dd94df9a-61b0-4e86-ada6-a661fbc7bbae';

const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 --dir <path/to/json-directory> | --file <path/to/json-file>')
    .option('dir', { describe: 'Directory containing one or more .json page files', type: 'string' })
    .option('file', { describe: 'Single .json file to process', type: 'string' })
    .option('exclude', {
        describe: 'Filename to exclude when --dir is used (e.g., "excluded_page.json")',
        type: 'string',
        implies: 'dir' // This option only makes sense if --dir is used
    })
    .conflicts('dir', 'file')
    .check(argv => {
        if (!argv.dir && !argv.file) {
            throw new Error('You must specify either --dir or --file')
        }
        return true
    })
    .help('h').alias('h', 'help')
    .parse()

const { dir, file, exclude } = argv
const API_BASE = 'http://localhost:3000/api'

async function authenticatedFetch(url, options = {}) {
    const headers = {
        ...options.headers, // Start with any existing headers
        'Authorization': `ApiKey ${apiKey}`, // Add or overwrite the Authorization header
    };

    const response = await fetch(url, {
        ...options,
        headers: headers,
    });

    return response;
}

async function lookupPage(title) {
    try {
        const id = title.replace(/\s+/g, '-').toLowerCase();
        const url = `${API_BASE}/pages/${id}`
        const res = await authenticatedFetch(url)
        if (!res.ok) throw new Error(`Lookup for "${title}" failed: ${res.status}: ${await res.text()}`)
        return res.status === 200 ? id : false
    } catch (err) {
        return null;
    }
}

async function uploadPage(page) {
    // Create or reuse page node
    const existing = await lookupPage(page.title)
    let pageId = existing
    if (!existing) {
        const res = await authenticatedFetch(`${API_BASE}/pages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: page.title,
                subtitle: page.subtitle,
                content: page.content,
            })
        })
        if (!res.ok) {
            console.error(`❎ failed to create "${page.title}":`, await res.text())
            return
        }
        console.log(`✅ Added "${page.title}" (id ${pageId})`)
    } else {
        const res = await authenticatedFetch(`${API_BASE}/pages/${pageId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: page.title,
                subtitle: page.subtitle,
                content: page.content,
            })
        })
        if (!res.ok) {
            console.error(`❎ failed to update "${page.title}":`, await res.text())
            return
        }
        console.log(`✅ Updated "${page.title}" (id ${pageId})`)
    }
}

async function main() {
    // load pages
    let pages = []
    if (file) {
        const raw = await fs.readFile(file, 'utf8');
        const doc = JSON.parse(raw);
        pages = Array.isArray(doc) ? doc : [doc]
    } else {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const e of entries) {
            if (e.isFile() && e.name.endsWith('.json')) {
                if (exclude && e.name === exclude) {
                    console.log('Excluding file: ' + e.name);
                } else {
                    console.log('Parsing file: ' + e.name);
                    const raw = await fs.readFile(path.join(dir, e.name), 'utf8')
                    const doc = JSON.parse(raw)
                    pages.push(...(Array.isArray(doc) ? doc : [doc]))
                }
            }
        }
    }
    if (pages.length === 0) {
        console.error('No pages to process.')
        process.exit(1)
    }

    // resolve parents for multi‑level uploads
    const parentTitles = new Set(pages.map(p => p.parentTitle).filter(Boolean))
    for (const title of parentTitles) {
        const existingId = await lookupPage(title)
        if (existingId) {
            console.log(`ℹ️ Resolved existing parent "${title}" ➡️ id ${existingId}`)
        }
    }

    // upload pages
    while (pages.length) {
        for (let i = pages.length - 1; i >= 0; i--) {
            const page = pages[i]
            await uploadPage(page)
            pages.splice(i, 1)
        }
    }

    console.log('\nAll pages.')
}

main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
})
