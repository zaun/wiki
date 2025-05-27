import rdf from '@zazuko/env-node'
import fs from 'fs/promises'
import { Parser, Store } from 'n3'
import SHACLValidator from 'rdf-validate-shacl'

async function validateOntology() {
    const schemaFile = './data/turtle/schema.ttl'
    const dataFile = './data/turtle/atom.ttl'

    console.log('Starting SHACL validation…')

    // 1. Read schema + data
    const [schemaTtl, dataTtl] = await Promise.all([
        fs.readFile(schemaFile, 'utf8'),
        fs.readFile(dataFile, 'utf8'),
    ])

    // 2. Parse into N3 stores
    const parser = new Parser({ factory: rdf })
    const shapesStore = new Store({ factory: rdf })
    const dataStore = new Store({ factory: rdf })

    await new Promise((res, rej) =>
        parser.parse(schemaTtl, (err, quad) =>
            err ? rej(err) : quad ? shapesStore.addQuad(quad) : res()
        )
    )
    await new Promise((res, rej) =>
        parser.parse(dataTtl, (err, quad) =>
            err ? rej(err) : quad ? dataStore.addQuad(quad) : res()
        )
    )

    // 3. Validate
    const validator = new SHACLValidator(shapesStore, { factory: rdf, rdf })
    const report = await validator.validate(dataStore)

    if (report.conforms) {
        console.log('✅ Validation successful! Data conforms to the schema.')
        process.exit(0)
    }

    console.error('❌ Validation failed! Data does NOT conform:')
    console.error('--- Validation Report ---')
    for (const r of report.results) {
        const msgs = (Array.isArray(r.message) ? r.message : [r.message])
            .map(lit => lit.value).join('; ');
        const severity = Array.isArray(r.severity)
            ? r.severity[0].value
            : r.severity.value;
        const focus = r.focusNode;
        const path = r.path;
        const shape = r.sourceShape;

        console.error(`Message     : ${msgs}`);
        console.error(`Severity    : ${severity.split('#').pop()}`);
        console.error(`Result Path : ${path.value}`);

        const offending = dataStore.getQuads(focus, path, null, null);
        for (const q of offending) {
            console.error(`Value       : ${q.object.value}`);
        }
        console.error('-------------------------')
    }
    process.exit(1)
}

validateOntology().catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
})
