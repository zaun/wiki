#!/usr/bin/env node

import fetch from 'node-fetch'
import wtf from 'wtf_wikipedia'
import fs from 'fs/promises'
import path from 'path'
import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 --title <string> [--parent <string>] [--tags <tag1,tag2,...>] [--rename <string>] [--out <file>]')
  .option('title', {
    describe: 'Wikipedia page title to fetch',
    type: 'string',
    demandOption: true,
  })
  .option('parent', {
    describe: 'Optional parent node TITLE (we will look up its ID)',
    type: 'string',
  })
  .option('tags', {
    describe: 'Comma-separated list of tags',
    type: 'string',
  })
  .option('rename', {
    describe: 'Override the node title (instead of the fetched Wikipedia title)',
    type: 'string',
  })
  .option('out', {
    describe: 'Write the extracted JSON to this file instead of uploading',
    type: 'string',
  })
  .help('h')
  .alias('h', 'help')
  .parse()

const {
  title: wikiTitle,
  parent: parentTitle,
  tags: tagsString,
  rename,
  out: outFile,
} = argv

const tags = tagsString
  ? tagsString.split(',').map(t => t.trim()).filter(t => t.length)
  : []

/**
 * Returns the first node ID matching the given title, or null if none.
 * (Unused when --out is provided)
 */
async function lookupNode(title) {
  const url = 'http://localhost:3000/api/search?title=' + encodeURIComponent(title)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `Lookup for "${title}" failed: ${res.status} ${res.statusText}`
    )
  }
  const nodes = await res.json()
  const wanted = title.trim().toLowerCase()
  const exact = nodes.find(n =>
    typeof n.title === 'string' &&
    n.title.trim().toLowerCase() === wanted
  )
  return exact ? exact.id : null
}

async function main() {
  // Parent lookup (only for upload mode)
  let parentId = null
  if (parentTitle && !outFile) {
    parentId = await lookupNode(parentTitle)
    if (!parentId) {
      console.error(`Parent titled "${parentTitle}" not found.`)
      process.exit(1)
    }
  }

  // Fetch Wikipedia
  const doc = await wtf.fetch(wikiTitle)

  // Extract raw section data
  const rawSections = doc.sections().map((sec) => ({
    order: sec.index(),
    title: sec.title(),
    type: 'text',
    content: sec.text(),
    // links: sec.links().map(lnk => ({
    //   title: lnk.text() || '',
    //   url: lnk.page() ? `https://en.wikipedia.org/wiki/${encodeURIComponent(lnk.page())}` : ''
    // })),
  }))

  // Decide on node title: either --rename or fetched title
  const rootTitle = rename || doc.title()
  const details = []

  const ib = doc.infobox()
  const infoData = ib.json() || {}
  for (const [key, value] of Object.entries(infoData)) {
    switch (key) {
      case 'country':
        details.push({
          type: 'text',
          label: 'Country of Origin',
          value: value.text,
        })
        break
      case 'creator':
        details.push({
          type: 'text',
          label: 'Created By',
          value: value.text,
        })
        break
      case 'language':
        details.push({
          type: 'text',
          label: 'Original Language',
          value: value.text,
        })
        break
      case 'num_seasons':
        details.push({
          type: 'number',
          label: 'No. of Seasons',
          value: value.number,
        })
        break
      case 'num_episodes':
        details.push({
          type: 'number',
          label: 'No. of Episodes',
          value: value.number,
        })
        break
      default:
        break
    }
  }

  // Build root object
  const root = {
    parentId,
    title: rootTitle,
    tags,
    content: rawSections[0]?.content || '',
    links: rawSections[0]?.links || [],
    details,
  }

  // Prepare sections array
  const sections = rawSections
    .filter((_, i) => i > 0) // drop the first section (used as root.content)
    .filter(s => s.title && s.title.trim() && s.content && s.content.trim())
    .filter(s => !['external links', 'works cited', 'see also'].includes(s.title.toLowerCase()))
    .sort((a, b) => a.order - b.order)
    .map(({ order, links, ...keep }) => keep)

  // If --out provided: dump JSON and exit
  if (outFile) {

    const output = {
      title: root.title,
      parentTitle: parentTitle || null,
      aliases: [],           // fill in if you have any aliases
      links: root.links.map(l => ({ title: l.title, url: l.url })),
      tags: root.tags,
      details: root.details,
      content: root.content,
      sections: sections.map(s => ({
        title: s.title,
        content: s.content,
      })),
    }

    await fs.mkdir(path.dirname(outFile), { recursive: true })
    await fs.writeFile(outFile, JSON.stringify(output, null, 2), 'utf-8')
    console.log(`Wrote JSON to ${outFile}`)
    process.exit(0)
  }

  // --- upload logic (unchanged) ---
  // Check for existing node
  const existingId = await lookupNode(root.title)
  if (existingId) {
    console.log(`Updated: "${root.title}"`)
  } else {
    // Create new node
    const createRes = await fetch('http://localhost:3000/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(root),
    })
    const body = await createRes.json()
    if (!body.id) {
      console.error('Failed to create node:', body)
      console.log(JSON.stringify(root, null, 2))
      process.exit(1)
    }
    const newId = body.id

    // Insert sections
    for (const sec of sections) {
      const secRes = await fetch(
        `http://localhost:3000/api/nodes/${newId}/sections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sec),
        }
      )
      if (!secRes.ok) {
        console.error(`Failed to insert section "${sec.title}":`, await secRes.text())
      }
    }
    console.log(`Added: "${root.title}"`)
  }
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
