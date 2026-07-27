// graph.js — pure link-graph over the parsed docs. No DOM.
//
// buildGraph(docs) where docs: [{ id, links: [slug...], ... }]
//   -> { nodes, edges, backlinks, wanted }
//     nodes     : the input docs (unchanged), keyed access via byId
//     edges     : [{ from, to }] for links whose target exists
//     backlinks : Map slug -> [slug...] (who points at me)
//     wanted    : [{ slug, from: [slug...] }] link targets with no doc yet
//                 (a [[link]] to a page not written = a page worth writing)

export function buildGraph(docs) {
  const ids = new Set(docs.map((d) => d.id));
  const edges = [];
  const backlinks = new Map();
  const wantedMap = new Map();

  for (const d of docs) {
    for (const to of d.links || []) {
      if (to === d.id) continue; // ignore self-links
      if (ids.has(to)) {
        edges.push({ from: d.id, to });
        if (!backlinks.has(to)) backlinks.set(to, []);
        if (!backlinks.get(to).includes(d.id)) backlinks.get(to).push(d.id);
      } else {
        if (!wantedMap.has(to)) wantedMap.set(to, []);
        if (!wantedMap.get(to).includes(d.id)) wantedMap.get(to).push(d.id);
      }
    }
  }

  const wanted = [...wantedMap.entries()].map(([slug, from]) => ({ slug, from }));
  return { nodes: docs, edges, backlinks, wanted };
}

// Convenience: outgoing existing-doc targets for one node.
export function outgoing(graph, id) {
  return graph.edges.filter((e) => e.from === id).map((e) => e.to);
}
