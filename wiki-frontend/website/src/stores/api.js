// src/stores/api.js
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';

/**
 * @typedef {Object} ApiClient
 * @property {(id: string) => Promise<import("axios").AxiosResponse>} getNode
 *   Fetches a node by its ID.
 * @property {(payload: Object) => Promise<import("axios").AxiosResponse>} createNode
 *   Creates a new node with the given payload.
 * @property {(id: string, payload: Object) => Promise<import("axios").AxiosResponse>} updateNode
 *   Updates the node with the given ID.
 * @property {(id: string) => Promise<import("axios").AxiosResponse>} deleteNode
 *   Deletes the node with the given ID.
 * @property {(id: string, newParentId: string) => Promise<import("axios").AxiosResponse>} moveNode
 *   Moves a node to a new parent.
 *
 * @property {(nodeId: string) => Promise<import("axios").AxiosResponse>} listNodeCitations
 *   Lists all citations for a given node.
 * @property {(nodeId: string, payload: Object) => Promise<import("axios").AxiosResponse>} createNodeCitation
 *   Creates a new citation under the specified node.
 * @property {(nodeId: string, citationId: string, payload: Object) => Promise<import("axios").AxiosResponse>} updateNodeCitation
 *   Updates a citation under the specified node.
 * @property {(nodeId: string, citationId: string) => Promise<import("axios").AxiosResponse>} deleteNodeCitation
 *   Deletes a citation under the specified node.
 *
 * @property {(nodeId: string) => Promise<import("axios").AxiosResponse>} listSections
 *   Lists all sections under a node.
 * @property {(nodeId: string, sectionId: string) => Promise<import("axios").AxiosResponse>} getSection
 *   Fetches a specific section under a node.
 * @property {(nodeId: string, payload: Object) => Promise<import("axios").AxiosResponse>} createSection
 *   Creates a section under the specified node.
 * @property {(nodeId: string, sectionId: string, payload: Object) => Promise<import("axios").AxiosResponse>} updateSection
 *   Updates a section under the specified node.
 * @property {(nodeId: string, sectionId: string) => Promise<import("axios").AxiosResponse>} deleteSection
 *   Deletes a section under the specified node.
 *
 * @property {(nodeId: string, sectionId: string) => Promise<import("axios").AxiosResponse>} listSectionCitations
 *   Lists all citations within a given section.
 * @property {(nodeId: string, sectionId: string, payload: Object) => Promise<import("axios").AxiosResponse>} createSectionCitation
 *   Creates a citation within the specified section.
 * @property {(nodeId: string, sectionId: string, payload: {id: string}) => Promise<import("axios").AxiosResponse>} updateSectionCitation
 *   Updates a citation within the specified section.
 * @property {(nodeId: string, sectionId: string, citationId: string) => Promise<import("axios").AxiosResponse>} deleteSectionCitation
 *   Deletes a citation within the specified section.
 *
 * @property {(payload: Object) => Promise<import("axios").AxiosResponse>} createCitationSource
 *   Creates a standalone citation source.
 * @property {(id: string, payload: Object) => Promise<import("axios").AxiosResponse>} updateCitationSource
 *   Updates a standalone citation source.
 *
 * @property {(payload: Object) => Promise<import("axios").AxiosResponse>} createImage
 *   Uploads a new image.
 * @property {(name: string) => Promise<import("axios").AxiosResponse>} searchImage
 *   Searches images by name.
 * @property {(id: string) => string} getImageUrl
 *   Builds a publicly accessible image URL.
 *
 * @property {(query: string) => Promise<import("axios").AxiosResponse>} search
 *   Runs a text search query against the API.
 * @property {(params: Object) => Promise<import("axios").AxiosResponse>} fetchTitle
 *   Utility to fetch page title metadata for a given URL.
 */

/**
 * Factory for the API client.
 *
 * @returns {ApiClient} A set of methods for interacting with your backend REST API.
 */
export function useApi() {
    const client = axios.create({ baseURL: API_BASE });

    return {
    // Nodes
        getNode(id) { return client.get(`/nodes/${id}`); },
        createNode(payload) { return client.post('/nodes', payload); },
        updateNode(id, payload) { return client.patch(`/nodes/${id}`, payload); },
        deleteNode(id) { return client.delete(`/nodes/${id}`); },
        moveNode(id, newParentId) { return client.request({ method: 'MOVE', url: `/nodes/${id}`, data: { newParentId } }); },

        // Noce Citations
        listNodeCitations(nodeId) { return client.get(`/nodes/${nodeId}/citations`); },
        createNodeCitation(nodeId, payload) { return client.post(`/nodes/${nodeId}/citations`, payload); },
        updateNodeCitation(nodeId, id, payload) { return client.patch(`/nodes/${nodeId}/citations/${id}`, payload); },
        deleteNodeCitation(nodeId, id) { return client.delete(`/nodes/${nodeId}/citations/${id}`); },

        // Sections
        listSections(nodeId) { return client.get(`/nodes/${nodeId}/sections`); },
        getSection(nodeId, id) { return client.get(`/nodes/${nodeId}/sections/${id}`); },
        createSection(nodeId, payload) { return client.post(`/nodes/${nodeId}/sections`, payload); },
        updateSection(nodeId, id, payload) { return client.patch(`/nodes/${nodeId}/sections/${id}`, payload); },
        deleteSection(nodeId, id) { return client.delete(`/nodes/${nodeId}/sections/${id}`); },

        // Section Citations
        listSectionCitations(nodeId, sectionId) { return client.get(`/nodes/${nodeId}/sections/${sectionId}/citations`); },
        createSectionCitation(nodeId, sectionId, payload) { return client.post(`/nodes/${nodeId}/sections/${sectionId}/citations`, payload); },
        updateSectionCitation(nodeId, sectionId, payload) { return client.patch(`/nodes/${nodeId}/sections/${sectionId}/citations/${payload.id}`, payload); },
        deleteSectionCitation(nodeId, sectionId, id) { return client.delete(`/nodes/${nodeId}/sections/${sectionId}/citations/${id}`); },

        // Citation Source
        createCitationSource(payload) { return client.post('/citations', payload); },
        updateCitationSource(id, payload) { return client.patch(`/citations/${id}`, payload); },

        // Citation Instance
        createNodeCitation(nodeId, payload) { return client.post(`/nodes/${nodeId}/citations`, payload); },
        updateNodeCitation(nodeId, payload) { return client.patch(`/nodes/${nodeId}/citations/${payload.id}`, payload); },
        deleteNodeCitation(nodeId, id) { return client.delete(`/nodes/${nodeId}/citations/${id}`); },

        // Images
        createImage(payload) { return client.post('/images', payload); },
        searchImage(name) { return client.post('/images', { name }); },
        getImageUrl(id) { return `${API_BASE}/images/${id}`; },

        // Search
        search(query) { return client.get('/search', { params: { q: query } }); },

        // Utilities
        fetchTitle(params) { return client.get('/utility/fetchTitle', { params }); },
    };
}
