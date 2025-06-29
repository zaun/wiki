
**SYSTEM OVERRIDE: STRICT OUTPUT FORMATTING PROTOCOL ENGAGED**

For the **entirety** of the remainder of this current conversation, effective immediately:

1.  **ALL** output you generate, without any exception, **MUST** be entirely encapsulated within a **single** Markdown code block.
2.  This Markdown code block **MUST** begin with the precise string \`\`\`markdown on its own line.
3.  The Markdown code block **MUST** end with the precise string \`\`\` on its own line.
4.  This directive is **ABSOLUTE** and **OVERRIDES** all other implicit or default formatting behaviors for every subsequent response in this session.
5.  The content within the Markdown block should adhere to the previously specified supported Markdown types:
    *   bold
    *   italics
    *   ordered lists
    *   unordered lists
    *   nested lists
    *   inline math (e.g., \(a^2 + b^2 = c^2\))
    *   display math (e.g., $$ \oint_C \mathbf{E} \cdot d\mathbf{l} = - \frac{d\Phi_B}{dt} $$)

---

# For the "Data Model Specification" topic:
* Write a comprehensive summary that includes the definition of the topic and an overview of the topic as a whole in 2-3 paragraphs.
* **Response Format:** { "title": "TOPIC TITLE", "content": "SUMMARY MARKDOWN" }
* **Marksdown:**
    *   Do not indent paragraphs
    *   bold, italics, ordered lists, unordered lists, nested lists
    *   inline math (e.g., \(a^2 + b^2 = c^2\))
    *   display math (e.g., $$ \oint_C \mathbf{E} \cdot d\mathbf{l} = - \frac{d\Phi_B}{dt} $$)

---

# For the "Data Model Specification" topic:
* What 4-15 sections would you include in an encyclopedia-style entry, not including a summary or examples?
* Sections should be in a logical order.
* Do **not** use a biased number os sections, the topic should dictate the number of sections.
* Sections choesen should be broad enough to contain 3-10 paragraphs on the subject.
* If including information on key sub-topics, limit this to a single section.
* **Response Format:** [ "SECTION TITLE", "SECTION TITLE", ... ]

---

# For the "Data Model Specification" topic, section titled "Phases and Lifecycle":
* Complete the content of this section in 3-8 paragraphs.
* Response **must** be in one of the formats listed. For the provided section title, analyze the content implied by the title and select the most appropriate response format from the options available. Your choice should be based on which format best clarifies and illustrates the information presented in that section.
* **Response Format (markdown only):** { "type": "text", "title": "TOPIC TITLE", "content": "CONTENT MARKDOWN" }
* **Response Format (markdown and packet diagram):** { "type": "packet", "title": "TOPIC TITLE", "content": "PRE-DIAGRAM MARKDOWN", data: "PACKET MARKUP", "summary": "POST-DIAGRAM MARKDOWN" }
* **Response Format (markdown and state diagram):** { "type": "state", "title": "TOPIC TITLE", "content": "PRE-DIAGRAM MARKDOWN", data: "STATE MARKUP", "summary": "POST-DIAGRAM MARKDOWN" }
* **Response Format (markdown and sequence diagram):** { "type": "sequence", "title": "TOPIC TITLE", "content": "PRE-DIAGRAM MARKDOWN", data: "SEQUENCE MARKUP", "summary": "POST-DIAGRAM MARKDOWN" }
* **Response Format (markdown and flowchart diagram):** { "type": "flowchart", "title": "TOPIC TITLE", "content": "PRE-DIAGRAM MARKDOWN", data: "FLOWCHART MARKUP", "summary": "POST-DIAGRAM MARKDOWN" }
* **MARKDOWN**
    *   Do **not** indent paragraphs
    *   Do **not** include headers
    *   bold, italics, ordered lists, unordered lists, nested lists
    *   inline math (e.g., \(a^2 + b^2 = c^2\))
    *   display math (e.g., $$ \oint_C \mathbf{E} \cdot d\mathbf{l} = - \frac{d\Phi_B}{dt} $$)
* **PACKET MARKUP EXAMPLE**
    *   title UDP Packet\n0-15: "Source Port"\n16-31: "Destination Port"\n32-47: "Length"\n48-63: "Checksum"\n64-95: "Data (variable length)"\n
* **STATE MARKUP EXAMPLE**
    *   [*] --> Still\nStill --> [*]\nStill --> Moving\nMoving --> Still\nMoving --> Crash\nCrash --> [*]\n
    *   [*] --> IsPositive\nIsPositive --> if_state\nif_state --> False: if n < 0\nif_state --> True : if n >= 0\nTrue --> PASS\n False --> Send Error
* **SEQUENCE MARKUP EXAMPLE**
    *   Alice->>John: Hello John, how are you? /* Solid Line*/\nJohn-->>Alice: Great! /* Dashed Line*/\nAlice-)John: See you later!  /* Curved arrowhead */\nJohn->>Stacy: Hi!
* **FLOWCHART MARKUP EXAMPLE**
    *   A --> B /* arrow line */
    *   A <--> B /* double arrow line */
    *   A ==> B /* arrow bold line */
    *   A <==> B /* dowble arrow bold line */
    *   A -.-> B /* arrow dotted line */
    *   A <-.-> B /* double arrow dotted line */
    *   A --- B /* line */
    *   A === B /* bold line */
    *   A -.- B /* dotted line */
    *   A ===|label| B /* bold line with a label */
    *   A -.-|label| B /* dotted line with a label */
    *   A /* rectagle A labeled A /*
    *   A[label] /* rectagle A labeled label /*
    *   A{label} /* diamond A labeled label /*
    *   A{{label}} /* hexagon A labeled label /*
    *   A[/label/] /* parallelogram A labeled label /*
    *   A[/label\] /* trapezoid A labeled label /*
    *   A[Start] --> B{Is it?}\nB -->|Yes| C[OK]\nC --> D[Rethink]\nD --> B\nB ---->|No| E[End]

---

For the "Cayley's Theorem" entity:
Include an example section with 5 examples from a broad range of subjects within the entity.
No two examples should be in similar subjects with the entity.
All should clearly illustrate the defining characteristics of the entity.
For each example explain why it fits within this entity.
Do not referense other sub-categories.
Do not include the section header.
Use the following format:

**entity**

*Why if fits:* Reason

---

For the "Cayley's Theorem" entity provide a list of key-value pairs of
details and specific imformation related to the entity. Values should be no
more than 2-3 words or a number, year, date, amount.

---

Provide a list of 3 to 5 links the user may be interested in related to this topic. These are not sources but rather related links to more information about the topic in generl. Use the following format in an array:

{
    "url": "URL TO RESOURCE",
    "title": "TITLE OF RESROUCE"
}

---

Can you provide a concrete example using markdown and mathml
