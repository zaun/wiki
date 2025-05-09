/**
 * @file db/neo4j
 * @description Database connector for Neo4j using the official JavaScript driver. Exports a
 * session factory function for use in route handlers.
 */
import neo4j from 'neo4j-driver';

/**
 * @constant {string[]} validLogLevels - Accepted Neo4j logging levels.
 */
const validLogLevels = ['error', 'warn', 'info', 'debug', 'none'];

/**
 * @constant {string} dbUrl - Neo4j connection URL.
 * @constant {string} dbName - Neo4j database (enterprise only).
 * @constant {string} dbUser - Neo4j username.
 * @constant {string} dbLogLevel - Neo4j loggin.
 */
const dbUrl = process.env.DB_URL || 'bolt://localhost:7687';
const dbName = process.env.DB_DATABASE || '';
const dbUser = process.env.DB_USER || 'neo4j';
const dbPassword = process.env.DB_PASSWORD || 'password';
let dbLogLevel = process.env.DB_LOG_LEVEL || 'none';

if (!validLogLevels.includes(dbLogLevel)) {
    console.warn(
        `❌ Invalid DB_LOG_LEVEL "${dbLogLevel}". Defaulting to "none". Valid options: ${validLogLevels.join(', ')}`
    );
    dbLogLevel = 'none';
}

/**
 * @constant {neo4j.Driver} driver - Shared Neo4j driver instance.
 * Reused across sessions.
 */
const driver = neo4j.driver(
    dbUrl,
    neo4j.auth.basic(dbUser, dbPassword),
    {
        encrypted: 'ENCRYPTION_ON',
        logging: dbLogLevel !== 'none' ? {
            level: dbLogLevel,
            logger: (level, message) => {
                console.log(`[neo4j][${level}] ${message}`);
            },
        } : undefined,
    }
);

/**
 * Verifies connectivity to Neo4j on startup.
 * Throws an error if the connection cannot be established.
 *
 * @async
 * @function verifyConnection
 * @returns {Promise<void>}
 */
export async function verifyConnection() {
    try {
        const info = await driver.getServerInfo();
        console.log(`✅ Connected to Neo4j at ${info.address} (version: ${info.agent})`);
    } catch (err) {
        console.error('❌ Failed to connect to Neo4j:', err.message);
        throw err;
    }
}

/**
 * Gracefully closes the shared Neo4j driver.
 * Call this before application shutdown to ensure all connections are closed cleanly.
 *
 * @async
 * @function closeDriver
 * @returns {Promise<void>}
 */
export const closeDriver = async () => {
    await driver.close();
};

/**
 * Creates a new Neo4j session.
 * You must `await session.close()` after using it.
 *
 * @function session
 * @returns {neo4j.Session} a new Neo4j session instance
 */
export const session = () =>
    dbName ? driver.session({ database: dbName }) : driver.session();

/**
 * Creates a read session.
 * @returns {neo4j.Session}
 */
export const readSession = () =>
    dbName ? driver.session({ defaultAccessMode: neo4j.session.READ, database: dbName }) :
        driver.session({ defaultAccessMode: neo4j.session.READ });

/**
 * Creates a write session.
 * @returns {neo4j.Session}
 */
export const writeSession = () =>
    dbName ? driver.session({ defaultAccessMode: neo4j.session.WRITE, database: dbName }) :
        driver.session({ defaultAccessMode: neo4j.session.WRITE });

/**
 * @function createIndexes
 * @description Creates required indexes and constraints for optimal query performance and data integrity.
 */
export async function createIndexes() {
    const s = session();

    try {
        const statements = [
			// 🧠 Node indexes and constraints
			`CREATE CONSTRAINT node_id_unique IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE`,
			`CREATE INDEX node_title_index IF NOT EXISTS FOR (n:Node) ON (n.title)`,
			`CREATE INDEX node_aliases_index IF NOT EXISTS FOR (n:Node) ON (n.aliases)`,
			`CREATE INDEX node_tags_index IF NOT EXISTS FOR (n:Node) ON (n.tags)`,
			`CREATE INDEX node_createdAt_index IF NOT EXISTS FOR (n:Node) ON (n.createdAt)`,
			`CREATE INDEX node_status_index IF NOT EXISTS FOR (n:Node) ON (n.status)`,
			`CREATE INDEX node_type_index IF NOT EXISTS FOR (n:Node) ON (n.type)`,

            // Node detail indexes and contraints
            `CREATE CONSTRAINT detail_id_unique IF NOT EXISTS FOR (d:Detail) REQUIRE d.id IS UNIQUE;`,
            `CREATE INDEX detail_label_index IF NOT EXISTS FOR (d:Detail) ON (d.label);`,
            `CREATE INDEX detail_type_index IF NOT EXISTS FOR (d:Detail) ON (d.type);`,
            `CREATE INDEX detail_createdAt_index IF NOT EXISTS FOR (d:Detail) ON (d.createdAt);`,

			// 📄 Section indexes and constraints
			`CREATE CONSTRAINT section_id_unique IF NOT EXISTS FOR (s:Section) REQUIRE s.id IS UNIQUE`,
			`CREATE INDEX section_title_index IF NOT EXISTS FOR (s:Section) ON (s.title)`,
			`CREATE INDEX section_createdAt_index IF NOT EXISTS FOR (s:Section) ON (s.createdAt)`,
			`CREATE INDEX section_type_index IF NOT EXISTS FOR (s:Section) ON (s.type)`,
			`CREATE INDEX section_status_index IF NOT EXISTS FOR (s:Section) ON (s.status)`,

            // 📚 Citation source indexes and constraints
            `CREATE CONSTRAINT citation_id_unique IF NOT EXISTS FOR (c:Citation) REQUIRE c.id IS UNIQUE;`,
            `CREATE INDEX citation_title_index IF NOT EXISTS FOR (c:Citation) ON (c.title);`,
            `CREATE INDEX citation_type_index IF NOT EXISTS FOR (c:Citation) ON (c.type);`,
            `CREATE INDEX citation_author_index IF NOT EXISTS FOR (c:Citation) ON (c.author);`,
            `CREATE INDEX citation_publisher_index IF NOT EXISTS FOR (c:Citation) ON (c.publisher);`,
            `CREATE INDEX citation_year_index IF NOT EXISTS FOR (c:Citation) ON (c.year);`,
            `CREATE INDEX citation_createdAt_index IF NOT EXISTS FOR (c:Citation) ON (c.createdAt);`,

            // 📝 Citation instance indexes and constraints
            `CREATE CONSTRAINT citation_instance_id_unique IF NOT EXISTS FOR (i:CitationInstance) REQUIRE i.id IS UNIQUE;`,
            `CREATE INDEX citation_instance_quote_index IF NOT EXISTS FOR (i:CitationInstance) ON (i.quote);`,
            `CREATE INDEX citation_instance_page_index IF NOT EXISTS FOR (i:CitationInstance) ON (i.page);`,
            `CREATE INDEX citation_instance_createdAt_index IF NOT EXISTS FOR (i:CitationInstance) ON (i.createdAt);`,

			// 🔗 Relationship properties
			`CREATE INDEX has_section_order_index IF NOT EXISTS FOR ()-[r:HAS_SECTION]-() ON (r.order)`,
        ];

        for (const stmt of statements) {
            await s.run(stmt);
        }

        const fullTextIndexes = [{
            name: 'citation_fulltext_index',
            label: 'Citation',
            properties: ['title', 'type', 'author', 'publisher'],
        },
        {
            name: 'node_fulltext_index',
            label: 'Node',
            properties: ['title', 'content', 'aliases'],
        },
        {
            name: 'section_fulltext_index',
            label: 'Section',
            properties: ['title', 'content'],
        }];

        for (const { name, label, properties } of fullTextIndexes) {
            const result = await s.run(`
                SHOW INDEXES YIELD name, type
                WHERE name = $name AND type = 'FULLTEXT'
                RETURN count(*) AS found
            `, { name });
        
            if (result.records[0].get('found').toInt() === 0) {
                const propList = properties.map(p => `n.${p}`).join(', ');
                const cypher = `CREATE FULLTEXT INDEX ${name} IF NOT EXISTS FOR (n:${label}) ON EACH [${propList}]`;
                await s.run(cypher);
                console.log(`🔍 Created full-text index: ${name}`);
            }
        }

        console.log('✅ Neo4j indexes and constraints created.');
    } catch (err) {
        console.error('❌ Failed to create indexes:', err.message);
        throw err;
    } finally {
        await s.close();
    }
}
