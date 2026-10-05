# RUN.world SDK (vendored)

The `api` entry of `@series-inc/rundot-game-sdk` **v5.29.1**, copied unmodified
from the npm package's `dist/` — `rundot-game-api/index.js` and the seven
chunks it imports, nothing else. Committed rather than installed because the
repo has no dependencies (`CLAUDE.md`).

| | |
|---|---|
| Why | run.world's host waits for the SDK to report ready, and fails the load after about a minute without it. Importing this entry initialises the SDK and reports ready on its own; the game calls nothing in it. |
| Where it loads | Only in the run.world build: `build.mjs` adds it to `dist/index.html` as its own module script. `index.html`, `npm start` and Fly never load it. |
| Licence | `LICENSE.md` (RUN Repository Supplemental License): RUN use only, so `.dockerignore` keeps it out of the Fly image. Keep the licence file with the code. |

Update: `npm pack @series-inc/rundot-game-sdk@latest` in a scratch folder,
then replace these files with `dist/rundot-game-api/index.js` and every chunk
it reaches by relative import (chunk names are hashed and change per release),
and bump the version above.
