Latest specifications for the **JSON Layout Format**, a structured approach for defining web page content and visual arrangement using a **recursive Flexbox layout system**. The format emphasize a flexible "Container" and "Block" model, allowing for arbitrary nesting and granular control over content flow and alignment. This format is designed for clarity and enables non-technical content creators to manage and update pages through a visual editor.

---

## Core Principles

The format follows a **"Container -> Item"** hierarchy.

* A **Page**'s `content` is a single, mandatory top-level **Container**.
* A **Container** holds one or more **Items**.
* An **Item** can be:
    * Another **Container** (allowing for nested layouts).
    * A fundamental **Block** of type **Markdown**, **Image**, or **Button**.

This recursive structure provides immense flexibility for complex page layouts, now with a guaranteed Flexbox root.

---

## JSON Structure Overview

```json
{
  "title": "Page Title Here",
  "content": {
    "type": "container",
    "id": "main-page-container",
    "backgroundColor": "optional-color",
    "paddingTop": "16px",
    "paddingBottom": "16px",
    "marginTop": "0px",
    "marginBottom": "0px",
    "flexDirection": "column",
    "justifyContent": "flex-start",
    "alignItems": "stretch",
    "flexWrap": "nowrap",
    "gap": "16px",
    "items": [
      {
        "type": "container",
        "id": "header-container",
        "backgroundColor": "#f8f8f8",
        "padding": "20px",
        "flexDirection": "row",
        "justifyContent": "space-between",
        "alignItems": "center",
        "items": [
          {
            "type": "markdown",
            "id": "page-logo",
            "value": "# My Awesome Site"
          },
          {
            "type": "button",
            "id": "contact-button",
            "label": "Contact Us",
            "url": "/contact",
            "style": "primary"
          }
        ]
      },
      {
        "type": "container",
        "id": "main-content-area",
        "flexDirection": "row",
        "justifyContent": "flex-start",
        "alignItems": "flex-start",
        "gap": "32px",
        "padding": "20px",
        "items": [
          {
            "type": "markdown",
            "id": "intro-text",
            "flexGrow": 2,
            "value": "## Welcome to Our Page!\n\nThis is a sample markdown block, showcasing our services and mission. We believe in providing the best solutions for your needs."
          },
          {
            "type": "image",
            "id": "hero-image",
            "flexGrow": 1,
            "width": "100%",
            "height": "300px",
            "src": "/images/sample.jpg",
            "alt": "A beautiful landscape",
            "caption": "Our amazing view that inspires us daily.",
            "objectFit": "cover"
          }
        ]
      },
      {
        "type": "markdown",
        "id": "footer-markdown",
        "padding": "20px",
        "backgroundColor": "#333",
        "horizontalAlignment": "center",
        "value": "<h5 style='color: white;'>© 2025 All Rights Reserved.</h5>"
      }
    ]
  }
}
```

---

## Detailed Property Descriptions

### Top-Level Page Properties

* **`title`** (string, required): The title of the page, typically displayed in the browser tab.
* **`content`** (object, required): The root container for all page content. This object **must** have its `type` property set to `"container"`. All other top-level page content will reside within the `items` array of this root container.

---

### Item Properties (Common to all items within a container)

Every object within an `items` array is considered an "Item." Items share a common set of Flexbox-related properties that dictate how they behave within their parent container.

* **`type`** (string, required): The type of the item. Must be one of: `"container"`, `"markdown"`, `"image"`, `"button"`.
* **`id`** (string, required): A unique identifier for the item. Useful for internal linking, referencing, or content management system integration.
* **`flexGrow`** (number, optional): Defines the ability for this item to grow if necessary. It accepts a unitless value serving as a proportion.
* **`flexShrink`** (number, optional): Defines the ability for this item to shrink if necessary. It accepts a unitless value serving as a proportion.
* **`flexBasis`** (string, optional): Defines the default size of this item before remaining space is distributed. It can be a length (e.g., `"200px"`) or a keyword (`"auto"`).
* **`width`** (string, optional): A fixed width for the item. Accepts CSS width values (e.g., `"50%"`, `"300px"`). Overrides `flexBasis` if both are set and `flexBasis` is `auto`.
* **`height`** (string, optional): A fixed height for the item. Accepts CSS height values (e.g., `"auto"`, `"100px"`, `"50vh"`).
* **`order`** (integer, optional): Controls the order in which this item appears in its parent flex container. Items with lower `order` values appear before items with higher values.
* **`margin`** (string, optional): Defines the outer space around the item. Accepts standard CSS `margin` values (e.g., `"0 auto"` for horizontal centering, `"10px 0"` for vertical spacing).
* **`padding`** (string, optional): Defines the inner space around the item's content. Accepts standard CSS `padding` values (e.g., `"10px 20px"`, `"5%"`).
* **`backgroundColor`** (string, optional): Defines the background color.
* **`horizontalAlignment`** (string, optional): Controls the horizontal alignment of the direct content *within* this item (e.g., text in a markdown block, or the image within an image block).
    * Accepted values: `"left"`, `"center"`, `"right"`.
* **`verticalAlignment`** (string, optional): Controls the vertical alignment of the direct content *within* this item.
    * Accepted values: `"top"` | `"middle"` | `"bottom"`.

---

### Container Type Properties (`type: "container"`)

A **Container** item acts as a flex container for its own children.

* **`items`** (array of objects, required): An array containing the child items (**Containers** or **Blocks**) within this container. This is where the recursion happens.
* **`flexDirection`** (string, optional): Defines the main axis and the direction (normal or reversed) of its children.
    * Accepted values: `"row"` (default), `"row-reverse"`, `"column"`, `"column-reverse"`.
* **`justifyContent`** (string, optional): Defines the alignment of its children along the main axis. It helps distribute extra free space.
    * Accepted values: `"flex-start"` (default), `"flex-end"`, `"center"`, `"space-between"`, `"space-around"`, `"space-evenly"`.
* **`alignItems`** (string, optional): Defines the default behavior for how its children are laid out along the cross axis on the current line.
    * Accepted values: `"stretch"` (default), `"flex-start"`, `"flex-end"`, `"center"`, `"baseline"`.
* **`flexWrap`** (string, optional): Controls whether its children are forced onto one line or can wrap onto multiple lines.
    * Accepted values: `"nowrap"` (default), `"wrap"`, `"wrap-reverse"`.
* **`gap`** (string, optional): Defines the space between its direct children. Can accept CSS length values (e.g., `"16px"`, `"1rem"`). This combines `row-gap` and `column-gap`.

---

### Block Type Properties

These are the fundamental content units that terminate the nesting.

1.  **`type: "markdown"`**
    * **`backgroundColor`** (string, optional): Defines the font color.
    * **`value`** (string, required): The actual content of the block, written in Markdown format. This can include headings (`#`, `##`), paragraphs, bold text (`**text**`), italics (`*text*`), lists, etc. Does not support HTML.

2.  **`type: "image"`**
    * **`src`** (string, required): The URL or path to the image file.
    * **`alt`** (string, required): Alternative text for the image, crucial for accessibility.
    * **`caption`** (string, optional): A short description or caption to display below the image.
    * **`objectFit`** (string, optional): How the image content should fit its container. This directly maps to the CSS `object-fit` property.
        * Accepted values: `"fill"`, `"contain"`, `"cover"`, `"none"`, `"scale-down"`.

3.  **`type: "button"`**
    * **`label`** (string, required): The text displayed on the button.
    * **`url`** (string, required): The URL the button links to when clicked.
    * **`style`** (string, optional): A hint for visual styling (e.g., `"primary"`, `"secondary"`, `"outline"`, `"link"`).
    * **`target`** (string, optional): Specifies where to open the linked URL.
        * Accepted values: `"_self"` (default, current Browse context), `"_blank"` (new Browse context), `"_parent"` (parent frame), `"_top"` (full body of the window).



---


Using the above JSON format and https://placehold.co/800x400/b3d9ff/000000?text=Innovative+Solutions style images placeholders, create a proper privacy policy page. The page should not have a top navigation bar as that is included on all site pages automatically.
