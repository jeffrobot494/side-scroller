import express from "express";
const app=express();
app.get("/",(q,r)=>r.send("hi"));
const s=app.listen(3401,()=>console.log("LISTENING"));
s.on("error",e=>console.log("ERR",e.code,e.message));
setTimeout(async()=>{try{console.log("fetch:",await(await fetch("http://localhost:3401/")).text())}catch(e){console.log("fetchfail",e.message)}process.exit(0)},1200);
