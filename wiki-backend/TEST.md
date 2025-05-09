# 🧪 Node API Test Routes

Assumes:
- Server is running at `http://localhost:3000`
- API base path is `/api/nodes`
- JSON format for requests
- Root node ID is: `00000000-0000-0000-0000-000000000000`

---

## 1️⃣ Create a Node (child of root)
```bash
curl -X POST http://localhost:3000/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sample Node",
    "summary": "Just a test node.",
    "type": "category",
    "aliases": ["example", "sample"],
    "tags": ["test"],
    "parentId": "00000000-0000-0000-0000-000000000000"
  }'
```

---

## 2️⃣ Get a Node by ID (replace `<id>`)
```bash
curl http://localhost:3000/api/nodes/<id>
```

---

## 3️⃣ Patch a Node (version update)
```bash
curl -X PATCH http://localhost:3000/api/nodes/<id> \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "summary": "Updated summary.",
    "tags": ["updated", "node"]
  }'
```

---

## 4️⃣ Delete a Node (and its version history)
```bash
curl -X DELETE http://localhost:3000/api/nodes/<id>
```

---

## 5️⃣ Get Node Version History
```bash
curl http://localhost:3000/api/nodes/<id>/history
```

---

## 6️⃣ Get Child Nodes
```bash
curl http://localhost:3000/api/nodes/<parentId>/children
```

---

## 7️⃣ Move a Node to a Different Parent
```bash
curl -X POST http://localhost:3000/api/nodes/<id>/move \
  -H "Content-Type: application/json" \
  -d '{
    "newParentId": "00000000-0000-0000-0000-000000000000"
  }'
```

---

## 🧪 Optional: Create the Root Node (if endpoint exists)
```bash
curl -X POST http://localhost:3000/api/nodes/create-root
```
