#!/bin/sh
set -eu

node server/migrate.mjs

exec node server/index.mjs
