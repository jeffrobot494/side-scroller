# ---------------------------------------------------------------------------
# ONE IMAGE, EVERY HOST.
#
# The whole point of deploying this folder to more than one provider is to
# compare paths. A nixpacks build on one and a Fly-generated image on the other
# would put a build difference inside that comparison, so both run this.
#
# No `npm install` line, and that is not an omission: netproto has zero
# dependencies, like the repo it sits in. Copy the files, run node.
# ---------------------------------------------------------------------------

FROM node:22-alpine

WORKDIR /app
COPY . .

# Overridden by the host wherever one is injected (Railway sets $PORT itself).
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
