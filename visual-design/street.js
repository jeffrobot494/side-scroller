import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A repeatable, entirely procedural stage: x is the playable horizontal axis.
let seed=93;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const scene=new THREE.Scene();
scene.background=new THREE.Color('#07121e');
scene.fog=new THREE.FogExp2('#102633',0.017);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
document.body.prepend(renderer.domElement);
const camera=new THREE.PerspectiveCamera(37,innerWidth/innerHeight,0.1,220);
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.65,0.65,0.85));
composer.addPass(new OutputPass());
scene.add(new THREE.HemisphereLight('#7ca8c3','#14212a',1.35));
const moon=new THREE.DirectionalLight('#8facdb',1.7);moon.position.set(-30,50,20);scene.add(moon);
const materials={};
function mat(color,emissive=false){const key=color+emissive;return materials[key]??=emissive?new THREE.MeshBasicMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:0.72,metalness:0.25});}
const cube=new THREE.BoxGeometry(1,1,1);
function box(x,y,z,w,h,d,color,emissive=false){const m=new THREE.Mesh(cube,mat(color,emissive));m.position.set(x,y,z);m.scale.set(w,h,d);scene.add(m);return m;}
function cylinder(x,y,z,r,h,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,8),mat(color));m.position.set(x,y,z);scene.add(m);return m;}
function canvasTexture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);return new THREE.CanvasTexture(c);}
const glow=canvasTexture(128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,255,255,.8)');g.addColorStop(.15,'rgba(255,255,255,.25)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
function halo(x,y,z,color,size){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));s.position.set(x,y,z);s.scale.set(size,size,1);scene.add(s);}
function sign(text,x,y,z,w,h,color){box(x,y,z,w+.25,h+.22,.2,'#101b24');const tex=canvasTexture(768,128,(c,W,H)=>{c.fillStyle='#08141b';c.fillRect(0,0,W,H);c.fillStyle=color;c.font='500 67px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(text,W/2,H/2);});tex.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex}));m.position.set(x,y,z+.12);scene.add(m);}

// Distant towers are painted onto three planes at different depths for parallax.

function windowAt(x,y,z,w,h,color){box(x,y,z,w,h,.035,color,true);}
for(let layer=0;layer<3;layer++){
  const texture=canvasTexture(4096,1024,(ctx,W,H)=>{
  const sx=W/220,sy=H/52;
  for(let x=-95;x<100;){
    const w=5+rand()*7,h=13+rand()*24+(2-layer)*4,d=5+rand()*4;
    const left=(x-w/2+110)*sx,top=H-h*sy;
    ctx.fillStyle=['#122534','#172b38','#20313c'][layer];ctx.fillRect(left,top,w*sx,h*sy);
    ctx.fillStyle='#304452';ctx.fillRect(left-2,top,w*sx+4,3);
    if(rand()>.45){ctx.fillStyle='#172b38';ctx.fillRect(left+w*sx*.25,top-2*sy,w*sx*.45,2*sy);ctx.fillRect(left+w*sx*.5,top-5*sy,1,4*sy);}
    for(let xx=x-w/2+.6;xx<x+w/2-.35;xx+=.95)for(let yy=2;yy<h-.5;yy+=1.35){
      const lit=rand();ctx.fillStyle=lit>.65?(rand()>.4?'#d3aa70':'#7cafbd'):'#253b48';ctx.fillRect((xx+110)*sx,H-(yy+.66)*sy,.38*sx,.66*sy);
    }
    ctx.fillStyle='#10212e';for(let xx=x-w/2;xx<=x+w/2;xx+=w/4)ctx.fillRect((xx+110)*sx,top,1,h*sy);
    x+=w+1.2+rand()*2;
  }
  });
  texture.colorSpace=THREE.SRGBColorSpace;
  const skyline=new THREE.Mesh(new THREE.PlaneGeometry(220,52),new THREE.MeshBasicMaterial({map:texture,alphaTest:.5}));
  skyline.position.set(0,26,-53+layer*17);skyline.userData.skyline=true;scene.add(skyline);
}
// Street-facing masonry blocks leave a strong, uninterrupted stage floor.
const storefronts=[[-39,12,12],[-25,13,17],[-10,13,12],[6,15,15],[24,14,19],[41,15,13]];
for(const [x,w,h] of storefronts){
  box(x,h/2+.45,-7,w,h,8,'#28333c');
  for(let yy=5.8;yy<h;yy+=2.5){
    box(x,yy-1.1,-2.92,w+.15,.12,.2,'#45505a');
    for(let xx=x-w/2+1;xx<x+w/2-.5;xx+=2.1){
      box(xx,yy,-2.85,1.23,1.75,.16,'#101a24');
      windowAt(xx,yy,-2.75,.95,1.48,rand()>.42?'#be9a67':'#345363');
      box(xx,yy,-2.64,.05,1.5,.08,'#27333a');box(xx,yy,-2.64,1,.06,.08,'#27333a');
    }
  }
  box(x,h+.5,-6.5,w+.6,.3,8.7,'#4a5156');
  for(let xx=x-w/2+.3;xx<x+w/2;xx+=3){
    box(xx+1,2,-2.8,2.5,2.8,.13,'#18333d');
    box(xx+1,2,-2.7,1.95,2.25,.08,'#846e4d',true);
    box(xx+1,2,-2.6,.09,2.5,.1,'#192e37');
    box(xx-.3,2,-2.55,.2,3.3,.3,'#35424a');
  }
  box(x,3.8,-2.1,w+.4,.35,2,'#172a32');
  box(x,3.6,-1.06,w,.065,.07,'#ba9d6c',true);
}
sign('NIGHT OWL',-10,4.6,-1.8,6,.65,'#e5b37b');
sign('24 / LAUNDRY',6,4.5,-1.8,7,.7,'#94dfdf');
sign('RECORDS',-25,4.5,-1.8,6,.65,'#d1a898');
sign('HOTEL',24,5,-1.8,5,.8,'#e7a777');
box(16,9,-1.7,1.35,6,.6,'#172830');
for(let i=0;i<5;i++)sign('HOTEL'[i],16,11-i,-1.32,.8,.8,'#fc997e');
halo(16,8,-1,'#ef705b',9);
// Fire escapes, drainpipes and rooftop equipment establish real geometry.
for(const x of [-28,3,28]){
  cylinder(x+2,7,-2.5,.075,13,'#53616b');
  for(let y=5.5;y<13;y+=2.5){box(x,y,-1.95,2.5,.13,1.7,'#17232b');box(x,y+.6,-1.1,2.5,.08,.07,'#53616b');for(let a=-1;a<=1;a+=.4)box(x+a,y+.3,-1.1,.035,.6,.04,'#49535a');const rail=box(x+.3,y+1.2,-1.4,.08,3.1,.1,'#354650');rail.rotation.z=-.6;}
}
box(0,-.3,3,230,.5,25,'#14212a');
box(0,.05,-.1,230,.35,5,'#39464d');
box(0,.16,2.4,230,.35,.25,'#657179');
for(let x=-100;x<100;x+=2.7)box(x,.234,-.1,.025,.01,4.7,'#1c303a');
for(let x=-100;x<100;x+=5)box(x,-.035,8,2.3,.015,.085,'#a79563');
for(let x=32;x<39;x+=1)box(x,-.025,5.5,.48,.02,5,'#717976');

// Broken, elongated pools of colored light on wet asphalt.

function reflection(x,z,color,w,length){
  for(let i=0;i<28;i++){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w*(.25+rand()*.75),.04+rand()*.19),new THREE.MeshBasicMaterial({color,transparent:true,opacity:(1-i/32)*.19,depthWrite:false,blending:THREE.AdditiveBlending}));
    m.rotation.x=-Math.PI/2;m.position.set(x+(rand()-.5)*w*.7,-.018+i*.0005,z+i/28*length);scene.add(m);
  }
}
for(const x of [-40,-21,-2,18,38]){
  cylinder(x,3.4,1.6,.09,6.4,'#26353f');box(x+.6,6.55,1.6,1.3,.12,.14,'#48565c');
  box(x+1.15,6.49,1.6,.7,.07,.4,'#ffe0a0',true);halo(x+1.15,6.4,1.7,'#ffce82',3);
  const light=new THREE.PointLight('#ffcc87',65,13,2);light.position.set(x+1.15,5.8,1.8);scene.add(light);
  const cone=new THREE.Mesh(new THREE.ConeGeometry(2.6,6.1,32,1,true),new THREE.MeshBasicMaterial({color:'#cfbc8c',transparent:true,opacity:.025,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));cone.position.set(x+1.15,3.35,1.6);scene.add(cone);
  reflection(x+1.15,2.65,'#e3b67a',2.4,9);
}
reflection(6,2.6,'#64c4ce',6,8);reflection(16,2.6,'#ef826d',2,9);reflection(-10,2.6,'#c39259',5,8);
for(const x of [-34,13,32]){box(x,.55,.3,1.4,.8,.7,'#172c31');box(x,1,.3,1.5,.1,.8,'#344b4e');}
for(const x of [-17,10]){box(x,.7,.6,2.5,.13,.65,'#5b5148');box(x,1.15,.25,2.5,.6,.1,'#504d46');for(const a of [-.9,.9])box(x+a,.4,.6,.09,.6,.5,'#233039');}
// Merge static street details by material properties and 16-unit section.
// Vertex colors preserve individual colors while sharing a single material.
const sectionGroups=new Map(),batchBuckets=new Map();
let staticMeshCount=0;
for(const object of [...scene.children]){
  if(!object.isMesh||object.userData.skyline||object.scale.x>100)continue;
  const section=Math.floor(object.position.x/16),material=object.material;
  if(!sectionGroups.has(section)){const group=new THREE.Group();scene.add(group);sectionGroups.set(section,group);}
  const group=sectionGroups.get(section);
  if(material.map){group.attach(object);continue;}
  const additive=material.blending===THREE.AdditiveBlending;
  const key=[section,material.type,material.transparent,additive?1:material.opacity,material.blending,material.side,material.depthWrite].join('|');
  if(!batchBuckets.has(key)){
    const shared=material.clone();shared.color.set('#ffffff');shared.vertexColors=true;if(additive)shared.opacity=1;
    batchBuckets.set(key,{group,material:shared,geometries:[]});
  }
  object.updateMatrixWorld(true);
  const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
  geometry.applyMatrix4(object.matrixWorld);
  const colors=new Float32Array(geometry.attributes.position.count*3),color=material.color.clone();
  if(additive)color.multiplyScalar(material.opacity);
  for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  batchBuckets.get(key).geometries.push(geometry);scene.remove(object);staticMeshCount++;
}
for(const {group,material,geometries} of batchBuckets.values()){
  const merged=mergeGeometries(geometries);merged.computeBoundingSphere();
  group.add(new THREE.Mesh(merged,material));geometries.forEach(g=>g.dispose());
}
const sections=[...sectionGroups.values()].map(group=>({group,bounds:new THREE.Box3().setFromObject(group).expandByScalar(3)}));
const viewFrustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4();
console.info(`Street batching: ${staticMeshCount} meshes -> ${batchBuckets.size} batches; ${sections.length} sections; 3 skyline planes.`);
// Fine diagonal rain moves in world space, across foreground and skyline.
const count=6500,positions=new Float32Array(count*6),drops=[];
for(let i=0;i<count;i++)drops.push({x:rand()*150-75,y:rand()*48,z:rand()*70-42,s:10+rand()*13});
const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
const rainMat=new THREE.LineBasicMaterial({color:'#aecad3',transparent:true,opacity:.23,depthWrite:false});
const rainMesh=new THREE.LineSegments(rainGeo,rainMat);rainMesh.frustumCulled=false;scene.add(rainMesh);
const ripples=[];
const ringGeo=new THREE.RingGeometry(.93,1,24);
for(let i=0;i<65;i++){const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:'#a7c8d1',transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(rand()*110-55,-.009,3+rand()*9);scene.add(m);ripples.push({m,phase:rand()});}

let pan=0,auto=false,paused=false,time=0,rainAmount=.7,dragging=false,lastX=0;
const keys=new Set();
const rainInput=document.querySelector('#rain'),tour=document.querySelector('#tour'),pause=document.querySelector('#pause');
rainInput.oninput=()=>rainAmount=Number(rainInput.value);
tour.onclick=()=>{auto=!auto;tour.textContent=auto?'STOP PAN':'AUTO PAN';tour.setAttribute('aria-pressed',auto);};
pause.onclick=()=>{paused=!paused;pause.textContent=paused?'RESUME':'PAUSE';pause.setAttribute('aria-pressed',paused);};
document.querySelector('#reset').onclick=()=>{pan=0;time=0;auto=false;paused=false;rainAmount=.7;rainInput.value=.7;tour.textContent='AUTO PAN';pause.textContent='PAUSE';tour.setAttribute('aria-pressed','false');pause.setAttribute('aria-pressed','false');};
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(['ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();keys.add(e.key);if(e.key.toLowerCase()==='h')document.body.classList.toggle('clean');});
window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>{keys.clear();dragging=false;});
renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(dragging){pan-=(e.clientX-lastX)*.045;lastX=e.clientX;}});
renderer.domElement.addEventListener('pointerup',()=>dragging=false);renderer.domElement.addEventListener('pointercancel',()=>dragging=false);
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}
window.addEventListener('resize',resize);
const clock=new THREE.Clock();
const fpsMeter=document.querySelector('#fps');
let fpsFrames=0,fpsStart=performance.now();
document.addEventListener('visibilitychange',()=>{fpsFrames=0;fpsStart=performance.now();});
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);
  if(!paused){time+=dt;if(auto)pan+=dt*1.5;if(keys.has('ArrowLeft'))pan-=dt*9;if(keys.has('ArrowRight'))pan+=dt*9;}
  pan=THREE.MathUtils.clamp(pan,-30,30);
  camera.position.set(pan,11.5,innerWidth<650?57:42);camera.lookAt(pan,8,-8);
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  viewFrustum.setFromProjectionMatrix(viewProjection);
  for(const {group,bounds} of sections)group.visible=viewFrustum.intersectsBox(bounds);
  rainGeo.setDrawRange(0,Math.floor(count*rainAmount)*2);
  for(let i=0;i<count;i++){const d=drops[i];if(!paused){d.y-=dt*d.s;d.x-=dt*3.5;if(d.y<0){d.y=48;d.x=rand()*150-75;}}const j=i*6;positions[j]=d.x;positions[j+1]=d.y;positions[j+2]=d.z;positions[j+3]=d.x-.1;positions[j+4]=d.y-.65;positions[j+5]=d.z;}
  rainGeo.attributes.position.needsUpdate=true;
  for(const {m,phase} of ripples){const p=(time*.65+phase)%1;m.scale.setScalar(.1+p*.5);m.material.opacity=(1-p)*.2*rainAmount;}
  composer.render();
  fpsFrames++;
  const now=performance.now(),elapsed=now-fpsStart;
  if(elapsed>=500){fpsMeter.textContent=`${Math.round(fpsFrames*1000/elapsed)} FPS`;fpsFrames=0;fpsStart=now;}
}
document.querySelector('#status').hidden=true;
animate();

