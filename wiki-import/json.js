#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import fetch from 'node-fetch'
import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'

const apiKey = 'cfd2f840-32a0-4388-8a93-6cae22e231ed';

const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 --dir <path/to/json-directory> | --file <path/to/json-file>')
    .option('dir', { describe: 'Directory containing one or more .json page files', type: 'string' })
    .option('file', { describe: 'Single .json file to process', type: 'string' })
    .conflicts('dir', 'file')
    .check(argv => {
        if (!argv.dir && !argv.file) {
            throw new Error('You must specify either --dir or --file')
        }
        return true
    })
    .help('h').alias('h', 'help')
    .parse()

const { dir, file } = argv
const API_BASE = 'http://localhost:3000/api'

// Maps to remember created nodes & sections
const uploaded = new Map()                // pageTitle → nodeId
const uploadedSections = new Map()        // `${pageTitle}||${sectionTitle}` → sectionId

// Collect all citations (page‑level and section‑level)
let allCitations = []

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

async function lookupNode(title) {
    const url = `${API_BASE}/search?q=title:"${encodeURIComponent(title)}"`
    const res = await authenticatedFetch(url)
    if (!res.ok) throw new Error(`Lookup for "${title}" failed: ${res.status}`)
    const search = await res.json()
    const entities = search.results.filter(n => n.type !== 'entity')
    const wanted = title.trim().toLowerCase()
    const exact = entities.find(n => n.title?.trim().toLowerCase() === wanted)
    return exact ? exact.id : null
}

async function uploadPage(page) {
    // 1) collect page‑level citations
    if (Array.isArray(page.citations)) {
        page.citations.forEach(c => allCitations.push({ ...c, pageTitle: page.title }))
    }

    // 2) create or reuse page node
    const existing = await lookupNode(page.title)
    let nodeId = existing
    if (!existing) {
        const res = await authenticatedFetch(`${API_BASE}/nodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parentId: page.parentId || null,
                title: page.title,
                tags: page.tags || [],
                content: page.content,
                aliases: page.aliases || [],
                links: page.links || [],
                details: page.details || [],
            })
        })
        if (!res.ok) {
            console.error(`✖ failed to create "${page.title}":`, await res.text())
            return
        }
        nodeId = (await res.json()).id
        console.log(`✔ Added "${page.title}" (id ${nodeId})`)
    } else {
        console.log(`ℹ "${page.title}" exists (id ${existing}); using it`)
    }
    uploaded.set(page.title, nodeId)

    // 3) fetch existing sections for this node
    const fetchSec = await authenticatedFetch(`${API_BASE}/nodes/${nodeId}/sections`)
    const existingSecs = fetchSec.ok ? await fetchSec.json() : []
    // map title → {id, ...}
    const existingByTitle = new Map(
        existingSecs.map(s => [s.title.trim().toLowerCase(), s])
    )

    // track which existing we touched
    const seenTitles = new Set()

    // 4) for each incoming section: upsert
    for (const sec of page.sections || []) {
        const key = sec.title.trim().toLowerCase()
        seenTitles.add(key)

        if (existingByTitle.has(key)) {
            // PATCH existing
            const { id: sectionId } = existingByTitle.get(key)
            const patchRes = await authenticatedFetch(`${API_BASE}/nodes/${nodeId}/sections/${sectionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: sec.title,
                    type: sec.type || 'text',
                    content: sec.content,
                })
            })
            if (!patchRes.ok) {
                console.error(`  ✖ failed to update section "${sec.title}":`, await patchRes.text())
                continue
            }
            console.log(`  ↻ Updated section "${sec.title}" (id ${sectionId})`)
            uploadedSections.set(`${page.title}||${sec.title}`, sectionId)

        } else {
            // POST new
            const createRes = await authenticatedFetch(`${API_BASE}/nodes/${nodeId}/sections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: sec.title,
                    type: sec.type || 'text',
                    content: sec.content,
                })
            })
            if (!createRes.ok) {
                console.error(`  ✖ failed to create section "${sec.title}":`, await createRes.text())
                continue
            }
            const { id: sectionId } = await createRes.json()
            console.log(`  ✔ Created section "${sec.title}" (id ${sectionId})`)
            uploadedSections.set(`${page.title}||${sec.title}`, sectionId)
        }

        // collect section‑level citations
        if (Array.isArray(sec.citations)) {
            sec.citations.forEach(c =>
                allCitations.push({
                    ...c,
                    pageTitle: page.title,
                    sectionTitle: sec.title
                })
            )
        }
    }

    // 5) delete any existing sections not present in JSON
    for (const sec of existingSecs) {
        const key = sec.title.trim().toLowerCase()
        if (!seenTitles.has(key)) {
            const delRes = await authenticatedFetch(`${API_BASE}/nodes/${nodeId}/sections/${sec.id}`, {
                method: 'DELETE'
            })
            if (delRes.ok) {
                console.log(`  ─ Deleted stale section "${sec.title}" (id ${sec.id})`)
            } else {
                console.error(`  ✖ failed to delete section "${sec.title}":`, await delRes.text())
            }
        }
    }
}

// Build or update the master list of unique sources
async function processSources() {
    console.log(`\nProcessing ${allCitations.length} source entries…`)

    const seen = new Map()
    for (const cit of allCitations) {
        const src = cit.source || {}
        const key = `${src.title}||${src.url}`
        if (!src.title || !src.url) continue

        if (!seen.has(key)) {
            seen.set(key, {
                type: src.type,
                title: src.title,
                url: src.url,
                publisher: src.publisher,
                year: src.year,
                authors: new Set(src.authors || []),
                id: null,
            })
        } else {
            (src.authors || []).forEach(a => seen.get(key).authors.add(a))
        }
    }

    for (const [key, srcData] of seen) {
        const { type, title, url, publisher, year, authors: authorsSet } = srcData
        const authors = Array.from(authorsSet)

        // try lookup by title, then by url
        let res = await authenticatedFetch(`${API_BASE}/citations?query=title:"${encodeURIComponent(title)}"`)
        let matches = res.ok ? (await res.json()).results : []
        if (matches.length === 0) {
            res = await authenticatedFetch(`${API_BASE}/citations?query=url:"${encodeURIComponent(url)}"`)
            matches = res.ok ? (await res.json()).results : []
        }

        let sourceId
        if (matches.length === 0) {
            const createRes = await authenticatedFetch(`${API_BASE}/citations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, title, url, publisher, year, authors }),
            })
            if (createRes.ok) {
                sourceId = (await createRes.json()).id
                console.log(`✔ Created source            id=${sourceId} title=${title}`)
            } else {
                console.error(`✖ Failed to create source ${title}:`, await createRes.text())
                continue
            }
        } else {
            const existing = matches[0]
            sourceId = existing.id
            // patch authors if needed
            const existingAuthors = new Set(existing.authors || [])
            let changed = false
            for (const a of authors) {
                if (!existingAuthors.has(a)) {
                    existingAuthors.add(a)
                    changed = true
                }
            }
            if (changed) {
                const patchRes = await authenticatedFetch(`${API_BASE}/citations/${sourceId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ authors: Array.from(existingAuthors) }),
                })
                if (patchRes.ok) {
                    console.log(`✔ Updated authors on source id=${sourceId} title=${title}`)
                } else {
                    console.error(`✖ Failed to patch source    id=${sourceId} title=${title}:`, await patchRes.text())
                }
            } else {
                console.log(`ℹ Source already up‑to‑date id=${sourceId} title=${title}`)
            }
        }

        seen.get(key).id = sourceId
    }

    // write back the resolved IDs
    for (const cit of allCitations) {
        const src = cit.source || {}
        const key = `${src.title}||${src.url}`
        if (seen.has(key)) {
            cit.source.id = seen.get(key).id
        }
    }
    console.log(`\nAll sources processed and allCitations updated with source.id.`)
}

// Handle citation instances at both page and section levels
async function processInstances() {
    console.log(`\nProcessing ${allCitations.length} citation instances…`)

    for (const cit of allCitations) {
        const nodeId = uploaded.get(cit.pageTitle)
        const sourceId = cit.source?.id
        if (!nodeId || !sourceId || !cit.quote) {
            console.warn(`⚠ Skipping incomplete citation for "${cit.pageTitle}", require pageTitle, source.id, quote`)
            continue
        }
        if (!cit.url && !cit.page) {
            console.warn(`⚠ Skipping incomplete citation for "${cit.pageTitle}", require page and/or url`)
            continue
        }

        // Determine whether this is a section‐level citation
        let baseUrl = `${API_BASE}/nodes/${nodeId}/citations`
        let listUrl = `${API_BASE}/nodes/${nodeId}/citations`
        if (cit.sectionTitle) {
            const key = `${cit.pageTitle}||${cit.sectionTitle}`
            const sectionId = uploadedSections.get(key)
            if (!sectionId) {
                console.warn(`⚠ No sectionId for ${key}; skipping section citation`)
                continue
            }
            baseUrl = `${API_BASE}/nodes/${nodeId}/sections/${sectionId}/citations`
            listUrl = baseUrl
        }

        // build the instance payload
        const instanceBody = {
            source: { id: sourceId },
            title: cit.title,
            url: cit.url,
            quote: cit.quote,
            note: cit.note || '',
            authors: cit.authors || [],
            page: cit.page || '',
        }

        // fetch existing instances
        let instances = []
        try {
            const listRes = await authenticatedFetch(listUrl)
            if (listRes.ok) instances = await listRes.json()
        } catch (err) {
            console.warn(`  ⚠ Could not fetch existing citations:`, err.message)
        }

        // try match by URL or title
        const match = instances.find(i => i.url === cit.url) || instances.find(i => i.title === cit.title)
        if (match) {
            const patchRes = await authenticatedFetch(`${baseUrl}/${match.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(instanceBody),
            })
            if (patchRes.ok) {
                console.log(`✔ Updated citation instance id=${match.id} title=${cit.title}`)
            } else {
                console.error(`✖ Failed to update instance id=${match.id}:`, await patchRes.text())
            }
        } else {
            const postRes = await authenticatedFetch(baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(instanceBody),
            })
            if (postRes.ok) {
                const j = await postRes.json()
                console.log  (`✔ Created citation instance id=${j.id} title=${cit.title}`)
            } else {
                console.error(`✖ Failed to attach citation instance    title=${cit.title}`, await postRes.text())
            }
        }
    }

    console.log('\nAll citation instances processed.')
}

async function main() {
    // load pages
    let pages = []
    if (file) {
        const raw = await fs.readFile(file, 'utf8')
        const doc = JSON.parse(raw)
        pages = Array.isArray(doc) ? doc : [doc]
    } else {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const e of entries) {
            if (e.isFile() && e.name.endsWith('.json')) {
                const raw = await fs.readFile(path.join(dir, e.name), 'utf8')
                const doc = JSON.parse(raw)
                pages.push(...(Array.isArray(doc) ? doc : [doc]))
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
        const existingId = await lookupNode(title)
        if (existingId) {
            uploaded.set(title, existingId)
            console.log(`ℹ Resolved existing parent "${title}" → id ${existingId}`)
        }
    }

    // upload pages & sections in dependency order
    let pending = [...pages]
    while (pending.length) {
        let madeProgress = false
        for (let i = pending.length - 1; i >= 0; i--) {
            const page = pending[i]
            if (!page.parentTitle || uploaded.has(page.parentTitle)) {
                if (page.parentTitle) page.parentId = uploaded.get(page.parentTitle)
                await uploadPage(page)
                pending.splice(i, 1)
                madeProgress = true
            }
        }
        if (!madeProgress) {
            console.error('Could not resolve parents for:', pending.map(p => p.title))
            process.exit(1)
        }
    }

    // now handle sources and citation‑instances
    await processSources()
    await processInstances()
    console.log('\nAll pages, sources, and citation‑instances processed.')
}

main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
})
