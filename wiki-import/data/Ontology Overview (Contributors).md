# OmniOntos: The Structured Encyclopedia (Contributor Overview)

OmniOntos is a **semantic encyclopedia** that organizes all human knowledge into a navigable, hierarchical structure; "Organize Everything and Understand Anything". Unlike traditional encyclopedias, every article (Topic) has a precise place in a logical hierarchy, and unlike formal ontologies, every entry is written as a comprehensive, accessible article. This bridges the gap between Wikipedia's accessibility and formal knowledge systems' rigor, creating a new category of knowledge organization tool.

# Why OmniOntos?

OmniOntos solves a fundamental problem in knowledge organization: existing systems are either rigorous but inaccessible (formal ontologies) or accessible but unstructured (Wikipedia). 

**OmniOntos provides:**
- **Encyclopedia-quality articles** at every level of detail
- **Systematic navigation** from broad overviews to technical specifics  
- **Semantic structure** that enhances rather than replaces readability
- **Multiple entry points** - approach any topic from your preferred angle
- **Connected understanding** - see how concepts relate across domains

Each Topic is designed as a comprehensive encyclopedia article, with broader topics providing overviews and deeper topics offering technical detail.

# Domains (Top-Level Topics)

OmniOntos begins by classifying reality into six fundamental domains. These broad categories ensure a comprehensive and distinct foundation for all subsequent classification:

1. Abstract: The domain encompassing pure abstractions not dependent on physical, mental, or social instantiation. This includes formal systems (such as logic, mathematics, and theoretical computer science constructs like algorithms as abstract procedures), conceptual entities defined by axioms or universal properties (like numbers, sets, categories, topological spaces defined by their properties), and theoretical structures whose existence is solely in the conceptual or formal realm. The focus is on entities and concepts defined by formal rules, logical relations, or abstract properties, existing outside of space-time and causal physical interaction. It is distinct from the information content of instantiated forms (Informational), the subjective mental experience of abstractions (Mental), and the social conventions or institutions that might discuss, develop, or use them (Social).
2. Informational: The domain encompassing information as abstract patterns, structures, representations, and meanings, independent of their specific physical carriers or instantiations. This includes fundamental forms, properties, logical structures, processes of transformation and analysis, and abstract characteristics of information content and representation itself. The focus is on the form, content, encoding, decoding, transmission rules, and interpretation of information, rather than the physical medium or energy used to embody or transmit it.
3. Physical: The fundamental domain of tangible reality and its intrinsic characteristics within space-time. This domain encompasses entities that possess mass, energy, occupy space, and persist through time, as well as the forces, fields, properties, states, structures, and dynamics intrinsic to such physical existence. The focus is on the material instantiation and physical behavior of phenomena and entities within the physical universe, distinct from any information or abstract structure they may carry or represent.
4. Mental: The domain encompassing the subjective, experiential, and internal states, processes, content, and capacities associated with individual conscious agents. This includes consciousness itself, affective states (emotions, moods, feelings), sensory experiences (perceptions, raw qualia), cognitive processes (perception, attention, memory, thinking, reasoning, learning, imagination), volitional processes (motivation, decision-making, intention, self-control), and mental content (beliefs, desires, subjective representations, concepts as mentally held). The focus is on the first-person perspective and the phenomena that constitute inner mental life and individual subjective experience. It is distinct from the physical substrate (e.g., brain, neural activity), the abstract informational structures processed (Informational), and the collective or emergent properties of interacting minds (which belong to the Social domain).
5. Social: The domain encompassing the entities, structures, processes, forms, and emergent phenomena arising from the interaction, relationship, and organization of multiple conscious agents. This includes collective entities (such as dyads, groups, communities, formal organizations, populations), patterned relationships (social networks, hierarchies, statuses, roles), enduring frameworks (institutions like family, economy, polity, law, education, religion; shared culture including norms, values, beliefs, customs, symbolic systems), dynamic interactions (communication, cooperation, competition, conflict, collective action, influence), and integrated collective arrangements (socio-technical systems, economic systems, political systems). The focus is on the collective level of reality, generated by intersubjectivity, interdependence, and coordination among agents. It is distinct from individual mental states (Mental), the physical properties of the agents or their environment (Physical), the abstract information exchanged during interaction (Informational), and the methodologies used to analyze social phenomena (Meta).
6. Meta: The domain encompassing the higher-order concepts, formal languages, methods, processes, models, and frameworks used for constructing, analyzing, managing, evaluating, or understanding entities, systems, or concepts within any other domain. This includes methodologies for inquiry and practice (like the scientific method, engineering processes, research methodologies), formal techniques for specification, verification, and reasoning (formal methods, logic systems applied to other domains), meta-modeling approaches, knowledge organization methods (ontology building, schema design, classification processes), evaluation criteria and techniques (benchmarking, validation), and frameworks for designing or governing complex systems (meta-policies, governance models). The focus is on the tools, processes, and conceptual structures used to operate on or reason about other domains, serving a meta-level or reflective function. It is distinct from the primary subject matter or entities being studied, modeled, or managed. Applied fields (like Medicine, Engineering, Education, Law as practice) are areas that utilize concepts and methods from the Meta domain (among others) but are not themselves kinds of Meta entities; they are complex domains of activity that draw upon multiple fundamental categories.

# Core Principles and Structure

OmniOntos is built on several key principles that ensure its logical consistency and comprehensive nature:

* Strict Hierarchy ("is-a-kind-of"): The foundational relationship is subsumption: every Sub-Topic is a more specific kind of its parent Topic. This forms a single, unambiguous inheritance structure, ensuring that properties and definitions flow downwards.  (See "The 'Is-A-Kind-Of' Hierarchy" below for more detail.)
* Unlimited Depth & Granularity: The hierarchy extends as deeply as necessary, past a minimum of six levels, to capture all logical distinctions and ensure thorough coverage within each domain.
* No "Catch-All" Categories: Every Topic must have a precise and logically valid place. Generic "Other" or "Miscellaneous" categories are strictly disallowed.
* Self-Contained Topic Definitions: Each Topic is comprehensively defined with its own summary and sections, independent of its parent or sub-topics. This ensures clarity regardless of where a user enters the hierarchy.
* Semantic Classification: OmniOntos is designed to support intelligent classification based on meaning, not just keywords, by integrating with external knowledge resources. This facilitates accurate placement of new entities within the hierarchy.

# The "Is-A-Kind-Of" Hierarchy

At its core, OmniOntos uses a strict, tree-like hierarchy. Every Sub-Topic is a specific kind of its parent Topic. This means any entity or concept under a Sub-Topic is also valid for its parent Topic. All properties and definitions from a parent Topic are inherited by its Sub-Topics. This fundamental "is-a-kind-of" rule strictly defines a Topic's position, ensuring a clear and logical structure from the Top-Level Topics down to the most granular detail.

# Optional Relationships

Beyond the core "is-a-kind-of" hierarchy, OmniOntos allows for optional, directed relationships between Topics. These relationships capture more complex connections, dependencies, or oppositions that aren't expressed by the primary hierarchy alone. They enrich the ontology's semantic network without changing a Topic's fundamental hierarchical placement.

* DEPENDS_ON: When one Topic's existence or function relies on another.
    * Example: A Theorem DEPENDS_ON its Axioms.
* CONTRASTS_WITH: Indicates a significant conceptual distinction between two Topics.
    * Example: Light CONTRASTS_WITH Darkness.
* CONTAINS: Describes a whole-to-part relationship.
    * Example: A Building CONTAINS a Room.
* INVALIDATES: When one Topic renders another obsolete or false.
    * Example: General Relativity INVALIDATES Newtonian Gravity (at high speeds/strong fields).
* CREATED_BY: When one Topic originates or produces another.
    * Example: A Symphony CREATED_BY a Composer.

These relationships are particularly crucial for connecting the decomposed aspects of complex concepts. For instance, understanding "Artificial Intelligence" requires knowledge of its abstract algorithms, physical hardware requirements, mental modeling approaches, and social implications - all connected through DEPENDS_ON relationships while maintaining clean domain boundaries.

# Handling Complex Concepts

Many real-world entities span multiple domains. Rather than forcing artificial choices, OmniOntos decomposes complex concepts into their constituent aspects, placing each where it naturally belongs and connecting them through optional relationships.

**Example: DNA**
- "DNA Molecule" (Physical) → The chemical structure, bonds, molecular properties
- "DNA" (Informational) → The genetic code, information encoding principles
- Connected via: DNA DEPENDS_ON DNA Molecule

**Example: Machine Learning** 
- "Machine Learning" (Mental) → Cognitive modeling, learning processes
- "Neural Network Algorithm" (Abstract) → Mathematical procedures
- "GPU Computing System" (Physical) → Hardware requirements
- Connected via: Machine Learning DEPENDS_ON both algorithms and hardware

This approach ensures every concept has a precise home while capturing full complexity through semantic relationships.

# Topic Structure and Content

Topics in OmniOntos are not free-form text. Each Topic is composed of a Summary, Sections, and Details, all designed for structured content:

**Summary:** A concise overview, typically 1-3 paragraphs, directly on the Topic Node.
Section: Additional content tied to the Topic, with each section having a specific type for formatted data. This ensures content is structured and machine-interpretable, not a massive, uninterpretable Markdown block. Examples of section types include:

  * **"Text":** Allows very limited Markdown (styling, MathML) but no links, tables, or headings.
  * **"Sheet-Music":** Designed to display MusicXML.
  * **"Data-Table":** Allows for Excel-like data representation.
  * **Future plans** include support for "Mermaid.js" for diagrams and other specialized formats.

**Detail:** Key/Value data pairs tied to a Topic for structured data.

Functionally speaking, a Node and its Summary, Sections, and Details together constitute a single Topic.

# Navigation Example

A user interested in electric vehicles might encounter:

- **"Transportation"** (Social) → Broad overview of mobility systems
- **"Electric Vehicles"** (Physical → Vehicles) → Technology, environmental impact
- **"Lithium-Ion Battery"** (Physical → Energy Storage) → Technical specifications
- **"Environmental Impact of EVs"** (Social → Environmental Issues) → Policy implications

Each topic provides comprehensive coverage at its level, with relationships guiding users to related concepts across domains.

# Key Terminology

To ensure clear communication, OmniOntos uses the following terms:

* Domain: The 6 top level Topics.
* Topic: An individual item in the hierarchy.
* Sub-Topics: The item in the hierarchy directly below the current Topic.
* Node: (Technical, not user facing) A single item in the hierarchy.
* Summary: (Technical, visible in the editor) Content directly on a Node, usually 1-3 paragraphs.
* Section: (Technical, visible in the editor) Additional content tied to Topic, can be additional text, data table, sheet music, flow chat, images, etc.
* Detail: (Technical, visible in the editor) Key/Value data pairs tied to a Topic.

