/**
 * @file index.js
 * @description Main entrypoint for the Wiki backend API server. Supports HTTPS with HTTP
 * redirection, CORS, and versioned REST endpoints.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import http from 'http';
import https from 'https';
import * as AuthHelpers from './api/auth.js';
import * as PageHandler from './api/page.js';
import * as NodeHandlers from './api/nodes.js';
import * as SectionHandlers from './api/sections.js';
import * as SearchHandlers from './api/search.js';
import * as CitationHandlers from './api/citations.js';
import * as ImageHandlers from './api/images.js';
import * as UserHandlers from './api/users.js';
import * as UtilHelpers from './api/util.js';
import * as ExportHandlers from './api/export.js';
import { verifyConnection, createIndexes, closeDriver } from './storage/neo4j.js';
import {
    createRootNode,
    createRootImage,
    createUserRoot,
    createPageNode,
} from './storage/special.js';

process.on('SIGINT', async () => {
    await closeDriver();
    process.exit(0);
});

/**
 * @constant {number} port - HTTP port for the server or redirector.
 * @constant {number} httpsPort - HTTPS server port (default 3030).
 * @constant {string} origin - Allowed CORS origin, or empty to allow all.
 * @constant {string} certPath - Path to TLS certificate file.
 * @constant {string} keyPath - Path to TLS private key file.
 * @constant {string} forceStandard - MOVE method is replaced wiht POST.
 */
const port = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT || 3030;
const origin = process.env.CORS_ORIGIN || '';
const certPath = process.env.TLS_CERTIFICATE || '';
const keyPath = process.env.TLS_KEY || '';
const forceStandard = (process.env.FORCE_STANDARD_METHODS || '').toLowerCase() === 'true';

/**
 * @constant {boolean} hasTLS - Whether TLS cert and key files exist and are usable.
 */
const hasTLS = certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath);

// fail early if DB is unreachable
await verifyConnection();

// create any indexes
await createIndexes();

// Make sure the root exists
await createRootNode();
await createRootImage();
await createUserRoot()
await createPageNode();

/**
 * Express router that handles all API routes.
 * Mounted at /api
 */
const router = express.Router();


// Auth and related function
router.use(AuthHelpers.verifyAuth);
router.get('/auth/register/options', AuthHelpers.registerOptions);
router.post('/auth/register', AuthHelpers.register);
router.get('/auth/login/options', AuthHelpers.loginOptions);
router.post('/auth/login', AuthHelpers.login);
router.get('/auth/recover/options', AuthHelpers.registerOptions);
router.post('/auth/recover', AuthHelpers.recover);
router.get('/auth/link/options', AuthHelpers.registerOptions);
router.post('/auth/link', AuthHelpers.link);
router.get('/auth/link/code', AuthHelpers.requireRegistered, AuthHelpers.generateLinkCode);

// Route level security
router.use((req, res, next) => {
  if (['DELETE', 'MOVE', 'PATCH', 'POST', 'PUT'].includes(req.method)) {
    return AuthHelpers.requireRegistered(req, res, next);
  }
  next();
});

// Users
router.get('/user/:id', AuthHelpers.requireRegistered, UserHandlers.getUserDetails);
router.patch('/user/:id', UserHandlers.updateUserProfile);
router.patch('/user/:userId/credentials/:credentialId', UserHandlers.updateCredentialDetails);
// router.delete('/user/:userId/credentials/:credentialId', UserHandlers.deleteCredential);

// Page routes
router.post('/pages', PageHandler.createPage);
router.get('/pages/:id', PageHandler.getPage);
router.patch('/pages/:id', AuthHelpers.requireRegistered, PageHandler.patchPage);
router.delete('/pages/:id', AuthHelpers.requireRegistered, PageHandler.deletePage);

// Export
router.get('/export/node/:id', ExportHandlers.exportNode);
router.get('/export/tree/:id', ExportHandlers.exportTree);

// Nodes
router.post('/nodes', NodeHandlers.createNode);
router.get('/nodes/:id', NodeHandlers.getNode);
router.patch('/nodes/:id', NodeHandlers.patchNode);
router.delete('/nodes/:id', NodeHandlers.deleteNode);
router.get('/nodes/:id/history', NodeHandlers.getNodeHistory);
router.get('/nodes/:id/children', NodeHandlers.getChildNodes);
if (forceStandard) {
    router.post('/nodes/:id', NodeHandlers.moveNode);
} else {
    router.use('/nodes/:id', (req, res, next) => {
        if (req.method === 'MOVE') {
            return NodeHandlers.moveNode(req, res);
        }
        next();
    });
}

// Sections
router.post('/nodes/:nodeId/sections', SectionHandlers.createSection);
router.get('/nodes/:nodeId/sections', SectionHandlers.getSections);
router.get('/nodes/:nodeId/sections/:id', SectionHandlers.getSection);
router.patch('/nodes/:nodeId/sections/:id', SectionHandlers.patchSection);
router.get('/nodes/:nodeId/sections/:id/history', SectionHandlers.getSectionHistory);
router.delete('/nodes/:nodeId/sections/:id', SectionHandlers.deleteSection);
if (forceStandard) {
    router.post('/nodes/:nodeId/sections', SectionHandlers.bulkReorderSections);
    router.post('/nodes/:nodeId/sections/:id', SectionHandlers.moveSection);
} else {
    router.use('/nodes/:nodeId/sections', (req, res, next) => {
        if (req.method === 'MOVE') {
            return SectionHandlers.bulkReorderSections(req, res);
        }
        next();
    });
    router.use('/nodes/:nodeId/sections/:id', (req, res, next) => {
        if (req.method === 'MOVE') {
            return SectionHandlers.moveSection(req, res);
        }
        next();
    });
}

// Image routes
router.post('/images', ImageHandlers.createImage);
router.get('/images', ImageHandlers.searchImage);
router.get('/images/:id', ImageHandlers.getImage);

// Search
router.get('/search', SearchHandlers.search);

// Citation Sources
router.post('/citations', CitationHandlers.createCitation);
router.get('/citations', CitationHandlers.listCitations);
router.get('/citations/:id', CitationHandlers.getCitation);
router.patch('/citations/:id', CitationHandlers.updateCitation);
router.delete('/citations/:id', CitationHandlers.deleteCitation);

// Citation Merge
router.post('/citations/:destId/merge/:sourceId', CitationHandlers.mergeCitations);

// Citation Instances
router.get('/citations/:id/instances', CitationHandlers.listInstancesByCitation);

// Node Citation Attachments
router.get('/nodes/:nodeId/citations', CitationHandlers.listNodeCitations);
router.post('/nodes/:nodeId/citations', CitationHandlers.createNodeCitationInstance);
router.patch('/nodes/:nodeId/citations/:id', CitationHandlers.updateNodeCitationInstance);
router.delete('/nodes/:nodeId/citations/:id', CitationHandlers.deleteNodeCitationInstance);

// Section Citation Attachments
router.get('/nodes/:nodeId/sections/:sectionId/citations', CitationHandlers.listSectionCitations);
router.post('/nodes/:nodeId/sections/:sectionId/citations', CitationHandlers.createSectionCitationInstance);
router.patch('/nodes/:nodeId/sections/:sectionId/citations/:id', CitationHandlers.updateSectionCitationInstance);
router.delete('/nodes/:nodeId/sections/:sectionId/citations/:id', CitationHandlers.deleteSectionCitationInstance);

// Utility routes
router.get('/utility/fetchTitle', UtilHelpers.fetchTitle);

/**
 * Main Express application instance
 */
const app = express();

/**
 * Enable CORS (optionally restricting to specified origin)
 */
const corsOptions = {
    origin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'MOVE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
if (origin) {
    corsOptions.origin = origin;
}
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
    console.log(`${req.method} - ${req.path}`);
    next();
});
app.use('/api', router);

/**
 * Enforce HSTS (HTTPS only) if TLS is available
 */
if (hasTLS) {
    app.use((req, res, next) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        next();
    });

    const credentials = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
    };

    /**
     * Launch HTTPS server
     */
    https.createServer(credentials, app).listen(httpsPort, () => {
        console.log(`🔒 HTTPS server running at https://localhost:${httpsPort}`);
    });

    /**
     * HTTP redirector -> HTTPS
     */
    const redirectApp = express();
    redirectApp.use((req, res) => {
        const host = req.headers.host?.replace(/:\d+$/, '');
        const usePort = httpsPort === '443' ? '' : `:${httpsPort}`;
        res.redirect(301, `https://${host}${usePort}${req.url}`);
    });

    http.createServer(redirectApp).listen(port, () => {
        console.log(`🌐 HTTP redirecting to HTTPS on port ${port}`);
    });
} else {
    /**
     * Fallback: run plain HTTP server
     */
    app.listen(port, () => {
        console.warn('❌ TLS not configured — running in HTTP mode only');
        console.log(`🌐 HTTP server running at http://localhost:${port}`);
    });
}
