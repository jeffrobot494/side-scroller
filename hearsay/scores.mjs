import * as store from "./lib/store.js";
import {embed,topK} from "./lib/embed.js";
for (const [who,q] of [["agent_tam","tell me about couriers and their horses"],["agent_bell","what happened to the dispatch pouch on the north road"],["agent_maren","is there enough barley"]]) {
  const pool=store.beliefsFor(who).filter(b=>b.vec);
  const qv=await embed(q);
  console.log("\n"+store.getAgent(who).name+": "+q);
  for (const h of topK(qv,pool,5)) console.log("   "+h.score.toFixed(3)+"  "+h.content.slice(0,64));
}
