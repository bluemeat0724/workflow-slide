#!/bin/sh
set -eu

if [ "${STORAGE_DRIVER:-postgres}" = "sqlite" ]; then
  node server/migrate-sqlite.mjs
else
  node server/migrate.mjs
fi

exec node server/index.mjs
