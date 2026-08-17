import {spawn} from "node:child_process";
const p=spawn(process.execPath,["server.js"],{cwd:process.cwd(),env:{...process.env,PORT:"3555"},stdio:["ignore","pipe","pipe"]});
p.stdout.on("data",d=>process.stdout.write("[OUT] "+d));
p.stderr.on("data",d=>process.stdout.write("[ERR] "+d));
p.on("error",e=>console.log("[SPAWN ERROR]",e.message));
p.on("exit",(c,s)=>console.log("[EXIT] code="+c+" signal="+s));
setTimeout(async()=>{try{const r=await fetch("http://localhost:3555/api/status");console.log("[FETCH]",await r.text())}catch(e){console.log("[FETCH FAIL]",e.message, e.cause&&e.cause.code)}p.kill();process.exit(0)},4000);
