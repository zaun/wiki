#!/usr/bin/env bash
set -e

node json.js --file ./data/List.json
node json.js --dir ./data/nodes --exclude List.json
# node json.js --dir ./data/wiki

