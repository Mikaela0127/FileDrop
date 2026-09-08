#!/bin/sh
set -eu

# Match the Vercel release order without placing migration tooling in the
# long-running application image. Validation never prints supplied values.
pnpm deploy:check
pnpm db:migrate:deploy
