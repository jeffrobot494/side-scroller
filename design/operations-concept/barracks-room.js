(() => {
  const canvas=document.getElementById('barracks-room'),ctx=canvas.getContext('2d');
  let w=0,h=0,queue=[],pending=false,target=[0,1,0],azimuth=.25,elevation=.2,distance=14,active='';
  const paint='#a39a7d',light='#f0dbb4';
  const staff=[['vance','MARA VANCE','mara.png'],['osei','KWAME OSEI','kwame.png'],['tanaka','YUKI TANAKA','yuki.png'],['tex','TEX','text.png'],['reyes','ANA REYES','ana.png'],['ghost','GHOST','ghost.png']];
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const n=Math.hypot(...a);return a.map(v=>v/n)};
  let eye,right,up,forward;
  function project(v){const q=sub(v,eye),z=dot(q,forward),scale=Math.min(w*.85,h*1.1)/Math.max(.15,z);return{x:w*.54+dot(q,right)*scale,y:h*.39-dot(q,up)*scale,z,scale}}
  function clipNear(vertices){const out=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],za=dot(sub(a,eye),forward),zb=dot(sub(b,eye),forward);if(za>=.15)out.push(a);if((za>=.15)!==(zb>=.15)){const t=(.15-za)/(zb-za);out.push(a.map((v,k)=>v+(b[k]-v)*t))}}return out}
  function face(vertices,fill,stroke){vertices=clipNear(vertices);if(vertices.length<3)return;const p=vertices.map(project);queue.push({z:p.reduce((s,v)=>s+v.z,0)/p.length,paint(){ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.stroke()}}})}
  function line(a,b,color,width=1){const za=dot(sub(a,eye),forward),zb=dot(sub(b,eye),forward);if(za<.15&&zb<.15)return;if(za<.15){const t=(.15-za)/(zb-za);a=a.map((v,k)=>v+(b[k]-v)*t)}else if(zb<.15){const t=(.15-zb)/(za-zb);b=b.map((v,k)=>v+(a[k]-v)*t)}const p=project(a),q=project(b);queue.push({z:(p.z+q.z)/2-.01,paint(){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.shadowColor=color;ctx.shadowBlur=color===light?5:0;ctx.stroke();ctx.shadowBlur=0}})}
  function shade(hex,f){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.min(255,Math.round(v*f)).toString(16).padStart(2,'0')).join('')}
  function box(x,y,z,dx,dy,dz,color='#5e656c'){const a=[x,y,z],b=[x+dx,y,z],c=[x+dx,y+dy,z],d=[x,y+dy,z],e=[x,y,z+dz],f=[x+dx,y,z+dz],g=[x+dx,y+dy,z+dz],j=[x,y+dy,z+dz];face([a,b,c,d],shade(color,.82),'#333a40');face([e,f,g,j],color,'#41464b');face([a,e,j,d],shade(color,.62),'#30363c');face([b,f,g,c],shade(color,.78),'#383e43');face([d,c,g,j],shade(color,1.16),'#798086')}
  function text(label,pos,color=paint,size=11){const p=project(pos);queue.push({z:p.z-.9,paint(){ctx.font=`${size}px monospace`;ctx.textAlign='center';ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=0;ctx.fillText(label,p.x,p.y);ctx.shadowBlur=0;ctx.textAlign='left'}})}
  const stars=Array.from({length:160},(_,i)=>({x:(Math.sin(i*127.1)*43758.54)%1,y:(Math.sin(i*311.7)*23916.21)%1}));
  function render(){if(!w)return;ctx.fillStyle='#060c13';ctx.fillRect(0,0,w,h);const neb=ctx.createRadialGradient(w*.7,h*.2,0,w*.7,h*.2,w*.6);neb.addColorStop(0,'#1d25463b');neb.addColorStop(1,'#07101900');ctx.fillStyle=neb;ctx.fillRect(0,0,w,h);stars.forEach((s,i)=>{ctx.fillStyle=i%5?'#8dbdbb55':'#bdd7e588';ctx.fillRect(Math.abs(s.x)*w,Math.abs(s.y)*h,1,1)});
    eye=[target[0]+Math.sin(azimuth)*Math.cos(elevation)*distance,target[1]+Math.sin(elevation)*distance,target[2]+Math.cos(azimuth)*Math.cos(elevation)*distance];forward=norm(sub(target,eye));right=norm(cross(forward,[0,1,0]));up=cross(right,forward);queue=[];
    // Camera sits inside a sealed room. Only the back-wall window openings
    // reveal the starfield. Clip enclosing surfaces at the camera near plane.
    face([[-8,-.2,-5],[8,-.2,-5],[8,-.2,18],[-8,-.2,18]],'#30343a');
    face([[-8,7,-5],[-8,7,18],[8,7,18],[8,7,-5]],'#55575a');
    face([[-8,-.2,-5],[-8,-.2,18],[-8,7,18],[-8,7,-5]],'#4d5359');
    face([[8,-.2,-5],[8,7,-5],[8,7,18],[8,-.2,18]],'#62666a');
    face([[-8,-.2,18],[8,-.2,18],[8,7,18],[-8,7,18]],'#4d5359');
    face([[-8,-.2,-5],[8,-.2,-5],[8,1.1,-5],[-8,1.1,-5]],'#555d65');
    face([[-8,4.7,-5],[8,4.7,-5],[8,7,-5],[-8,7,-5]],'#737579');
    // Draw the room shell first; furnishings and floor markings sit inside it.
    queue.sort((a,b)=>b.z-a.z).forEach(p=>p.paint());queue=[];
    for(let x=-8;x<=8;x+=2)line([x,-.19,-5],[x,-.19,18],'#20252b');
    for(let z=-5;z<=18;z+=2)line([-8,-.19,z],[8,-.19,z],'#20252b');
    for(const x of [-8,-4,0,4,8])box(x-.07,1.1,-5,.14,3.6,.16);
    line([-8,1.14,-4.8],[8,1.14,-4.8],'#899099',1.5);line([-8,4.68,-4.8],[8,4.68,-4.8],light,2.5);
    for(const x of [-7.95,7.95]){line([x,.08,-5],[x,.08,18],paint,1.4);line([x,6.9,-5],[x,6.9,18],light,2);for(let z=-4;z<18;z+=4)line([x,0,z],[x,7,z],'#333b43')}
    for(const x of [-4,4])line([x,6.98,-4],[x,6.98,16],light,2.5);
    // Paired bunks and personal lockers.
    for(let k=0;k<3;k++){const z=-3+k*2.8;box(-7.8,.3,z,2.2,.25,2.2);box(-7.65,.55,z+.1,1.9,.15,1.9,'#686b5a');box(-7.8,2,z,2.2,.18,2.2);box(-7.65,2.18,z+.1,1.9,.13,1.9,'#686b5a');line([-5.6,2.17,z],[-5.6,2.17,z+2.2],paint,1.4)}
    staff.slice(0,3).forEach(([id,name],i)=>{const x=-3.5+i*2.25,lit=active===id;box(x,0,-3.85,1.6,2.6,.8,lit?'#69716d':'#69716d');line([x,2.65,-2.99],[x+1.6,2.65,-2.99],lit?'#b0ffcf':paint,lit?3:1.5);text(name,[x+.8,.56,-2.98],lit?'#ceffe1':paint,10);line([x+.17,.2,-2.98],[x+1.42,.2,-2.98],paint,1)});
    // Metal benches, canvas equipment bags, and a painted floor stencil.
    box(-4,.2,2.7,3,.55,.8);box(2,.2,2.7,3,.55,.8);box(-3.7,.75,2.9,.65,.3,.4,'#79654d');box(3.6,.75,2.9,.8,.25,.4,'#79654d');
    const emblem=[[-1.4,0,0],[0,0,-1.25],[1.4,0,0],[0,0,1.25],[-1.4,0,0]];for(let i=0;i<4;i++)line(emblem[i],emblem[i+1],paint,2);line([-.55,.01,-.45],[.55,.01,.45],paint,2);line([.55,.01,-.45],[-.55,.01,.45],paint,2);text('TASK FORCE / MUSTER',[0,.02,1.7],paint,10);
    queue.sort((a,b)=>b.z-a.z).forEach(p=>p.paint());
  }
  function draw(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;render()})}
  new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);w=rect.width;h=rect.height;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw()}).observe(canvas);
})();
