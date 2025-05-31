#!/usr/bin/env bash
set -e

node import_page.js --file ./data/pages/code.json
node import_page.js --file ./data/pages/contact.json
node import_page.js --file ./data/pages/privacy.json
node import_page.js --file ./data/pages/todo.json
node import_page.js --file ./data/pages/welcome.json
node import_node.js --file ./data/List.json
node import_node.js --dir ./data/nodes --exclude List.json
# node import_node.js --dir ./data/wiki

