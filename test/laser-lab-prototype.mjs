// Standalone prototype regression checks. Run: node test/laser-lab-prototype.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../design/laser-lab.mockup.html',import.meta.url),'utf8');
const nodes={};
const node=()=>({value:'',style:{},checked:false,textContent:'',append(){},replaceChildren(){},addEventListener(){},getContext(){return {}}});
for(const id of html.matchAll(/id="([^"]+)"/g))nodes[id[1]]=node();
nodes.pattern.value='static';
const script=html.split('<script>')[1].split('</script>')[0].replace('preset(1);',`globalThis.t={preset,derive,step,reset,clearInput,emit,get state(){return {reservoir,reserved,charge,heat,shots,damage,model,targets,locked}},hold(v){held=v},release(){held=false;releaseShot=true},run(){paused=false},pause(){paused=true},aimAt(x,y){aim={x,y}}};preset(1);`);
const box={document:{getElementById:id=>nodes[id],createElement:node,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},matchMedia:()=>({matches:false}),performance:{now:()=>0},requestAnimationFrame(){}};
vm.runInNewContext(script,box);
const t=box.t,tick=n=>{for(let i=0;i<n;i++)t.step(1/120)};
for(let i=0;i<3;i++){
 t.preset(i);t.run();tick(120);let q=t.state;
 assert(Math.abs(q.charge+q.reservoir-q.model.battery.capacity)<1e-6,'charging conserves energy');
 t.hold(true);tick(30);
 if(i===1){assert(t.state.reserved>0);assert.equal(t.state.shots,0);t.release();tick(1);assert.equal(t.state.shots,1)}else assert(t.state.shots>0);
 assert(t.state.charge>=0&&t.state.reservoir>=0);
}
t.preset(1);t.run();tick(120);t.hold(true);tick(20);
const before=t.state.reserved+t.state.reservoir;t.clearInput();assert(Math.abs(t.state.reservoir-before)<1e-6);assert.equal(t.state.reserved,0);
const charge=t.state.charge;t.pause();tick(120);assert.equal(t.state.charge,charge);
// Direct firing isolates width interception from player skill and target motion.
t.preset(0);nodes.pattern.value='static';t.reset();t.aimAt(700,343);
function target(active=true){t.state.targets.splice(0,3,{x:600,y:343,r:7,hp:1000,maxHp:1000,active,dead:0})}
target();t.state.model.optics.error=0;t.state.model.width=4;t.emit(100);const focused=t.state.damage;
t.reset();target();t.state.model.width=60;t.emit(100);assert(t.state.damage<focused,'wide beam wastes energy outside small targets');
t.reset();target(false);t.emit(100);assert.equal(t.state.damage,0,'shield blocks damage');
t.reset();target();t.emit(100000);assert(t.state.locked,'heat locks weapon');
nodes.pattern.value='drones';t.reset();assert.equal(t.state.targets[0].r,7);
console.log('PASS: three modes, energy conservation, early release, cancellation, pause, beam concentration, shields, thermal lockout, scenarios.');
