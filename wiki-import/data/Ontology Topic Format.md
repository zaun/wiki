This document outlines the **JSON Ontology Node Format**, a structured approach for creating detailed, encyclopedia-style entries for nodes within an ontology. The format is defined by a consistent template (`blank.json.txt`) and exemplified by populated entries (`social.json`). It provides a comprehensive structure to define an node, its relationships, and detailed information across multiple sections, complete with robust citation capabilities.

FIXME: Verify all fields from teh DB are listed here (timestamps). Node the fields that are read-only (updates are ignored).
FIXME: List out the API to get the Node/Sections/etc. This document as a whole is gerneally not retrievable in 1 API call (though maybe it should be?).

---

## Core Principles

The format focuses on a single node, providing a summary, detailed sections, external links, and comprehensive citation management. It aims for a rich, descriptive, and well-sourced entry for each ontological node.

---

## JSON Structure Overview (Based on `blank.json.txt`)

```json
{
    "title": "",                        // Title of the node
    "parentTitle": "",                  // Title of the parent node
    "aliases": [],                      // Array of strings, alternate titles of this node
    "links": [                          // List of external useful resources the viewer may be interested in
        {
            "title": "",                // Page title
            "url": ""                   // Page URL
        }
    ],
    "tags": [],                         // Leave blank for now
    "details": [],                      // Leave blank for now
    "content": "",                      // Summary/definition/introduciton to the node (1-2 paragraphs)
    "sections": [                       // Addtional section for added details on the node (history, current status, location, Purpose, Applications, etc.) Think encyclopedia entry or wiki page.
        {
            "title": "",                // Title of the section
            "type": "",                 // text, sheet-music, data-table
            "content": "",              // Content of the section (3-4 paragraphs)
            "data": {},                 // JSON stat specific to the type
            "summary": "",              // For non text types there is a summary text field
            "citations": [              // Citations for the section
                {
                    "source": {             // A citation source
                        "type": "",         // (required) website | book | journal | etc.
                        "title": "",        // (required) The title of the source (for a website it would be the homepage title)
                        "authors": [],      // Author(s) or the overal source, array of strings
                        "publisher": "",    // Publisher of the source
                        "year": null,           // Year published, 1st copyright year on website, etc.
                        "url": ""           // (required) URL to resource (homepage for website, amazon link to book, etc)
                    },
                    "title": "",            // (required) The deep link title of a website page, a chapter title in a book, etc.
                    "page": "2.1",          // page #, section #, etc.
                    "url": "",              // (required) Deep link to exact article on a website / page if available for online books
                    "quote": "",            // The quoted text from this course instance referenced in the section
                    "note": ""              // General notes, "not a great souce but only one I could fined", etc.
                }
            ]
        }
    ],
    "citations": [                      // Same as a section citation, but for the node content above
        {
            "source": {
                "type": "",
                "title": "",
                "authors": [],
                "publisher": "",
                "year": null,
                "url": ""
            },
            "title": "",
            "page": "2.1",
            "url": "",
            "quote": "",
            "note": ""
        }
    ],
    "relationships": [                  // Optional relationships
        {
            "left": "",                 // The Title of node or SELF
            "relationship": "CONTAINS", // The relationship
            "right": ""                 // The Title of node or SELF
        }
    ]
}
```

---

## Detailed Property Descriptions

### Top-Level node Properties

These properties define the core information about the ontological node.

* **`title`** (string, required): The primary title of the node.
* **`parentTitle`** (string, optional): The title of the parent node in the ontology.
* **`aliases`** (array of strings, optional): An array of alternate titles or common names for this node.
* **`links`** (array of objects, optional): A list of external useful resources the viewer may be interested in.
    * Each object within `links` has:
        * **`title`** (string): The title of the linked page.
        * **`url`** (string): The URL of the linked page.
* **`tags`** (array of strings, optional): Reserved for future use (leave blank for now).
* **`details`** (array, optional): Reserved for future use (leave blank for now).
* **`content`** (string, required): A summary, definition, or introduction to the node, intended to be 1-2 paragraphs in length.
    * *Example from `social.json`*: A comprehensive definition of the "Social" domain, describing its scope and fundamental aspects.
* **`sections`** (array of objects, optional): An array for additional sections providing more detailed information on the node, such as history, current status, location, purpose, or applications. These are designed to function like an encyclopedia entry or wiki page.
* **`citations`** (array of objects, optional): A list of citations specifically for the overall `content` field of the node. These follow the same structure as section citations.
* **`relationships`** (array of objects, optional): Defines optional relationships between this node and other entities in the ontology.
    * Each object within `relationships` has:
        * **`left`** (string, required): The title of the node on the left side of the relationship, or `"SELF"` if referring to the current node.
        * **`relationship`** (string, required): The type of relationship (e.g., `"CONTAINS"`).
        * **`right`** (string, required): The title of the node on the right side of the relationship, or `"SELF"` if referring to the current node.

### Sections (`sections` array)

Each object within the `sections` array describes a specific sub-topic or aspect of the node in detail.

* Each object in the `sections` array has:
    * **`title`** (string, required): The title of the section.
        * *Example from `social.json`*: "Social Entities: Individuals, Groups, and Collectives", "Social Structures: Patterns of Relationships and Stratification", etc.
    * **`content`** (string, required): The detailed content of the section, intended to be 3-4 paragraphs in length.
        * *Example from `social.json`*: Detailed explanations of concepts like dyads, triads, small groups, and formal organizations within the "Social Entities" section.
    * **`citations`** (array of objects, optional): Citations specifically for the information presented within this particular section.

### Citations (Common structure for `sections[].citations` and top-level `citations`)

Citations provide detailed source information for factual claims made within the `content` and `sections[].content` fields.

* Each citation object has:
    * **`source`** (object, required): Describes the source itself.
        * **`type`** (string, required): The type of source (e.g., `"website"`, `"book"`, `"journal"`, etc.).
        * **`title`** (string, required): The main title of the source (for a website, this would be the homepage title).
        * **`authors`** (array of strings, optional): The author(s) of the overall source.
        * **`publisher`** (string, optional): The publisher of the source.
        * **`year`** (number, optional): The publication year, the first copyright year on a website, etc.
        * **`url`** (string, required): The URL to the overall resource (e.g., homepage for a website, Amazon link to a book, etc.).
    * **`title`** (string, required): The deep link title of a specific page on a website, a chapter title in a book, etc.
    * **`page`** (string, optional): Specific page number, section number, or other locator (e.g., "2.1").
    * **`url`** (string, required): A deep link to the exact article on a website or specific page if available for online books.
    * **`quote`** (string, optional): The exact quoted text from this source instance referenced in the section.
    * **`note`** (string, optional): General notes about the citation (e.g., "not a great source but only one I could find", etc.).