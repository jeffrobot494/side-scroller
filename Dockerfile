# ---------------------------------------------------------------------------
# THE GAME, AS A PROCESS.
#
# `server.mjs` serves the static site AND holds the rooms — the campaign since
# tech/multiplayer-service.md V1, and the mission itself since
# tech/multiplayer-missions.md J8. A host runs a process and expects it to bind
# $PORT; it does not serve a folder. That is the whole reason this file exists.
#
# No `npm install` line, and that is not an omission: the repo has zero
# dependencies and no build step (CLAUDE.md). Copy the files, run node.
# ---------------------------------------------------------------------------

FROM node:22-alpine

WORKDIR /app
COPY . .

# Overridden wherever a host injects its own.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
