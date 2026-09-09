(() => {
// Snapshot of the game recruit pool, kept local so this mockup also opens via file://.
const RECRUIT_POOL = [
  {
    "id": "vance",
    "name": "Mara Vance",
    "callsign": "Deadbolt",
    "age": 34,
    "origin": "Detroit, USA",
    "bio": "Ex-SWAT breacher, discharged for putting a captain through a third-floor window. Nobody on Earth is better at a doorway. Nobody is worse at taking an order she disagrees with.",
    "stats": {
      "aim": 8,
      "health": 6,
      "speed": 5,
      "nerve": 6
    },
    "traits": [
      "Steady Hands",
      "Insubordinate"
    ],
    "cost": 320,
    "status": "recruit",
    "record": {
      "missions": 0,
      "kills": 0
    },
    "maxHp": 27
  },
  {
    "id": "osei",
    "name": "Kwame Osei",
    "callsign": "Preacher",
    "age": 41,
    "origin": "Accra, Ghana",
    "bio": "A UN field medic who watched a hospital vanish under alien fire and decided the species was being tested. He walks into the open like the bullets are someone else's business. He does not flinch. Ever.",
    "stats": {
      "aim": 5,
      "health": 7,
      "speed": 4,
      "nerve": 10
    },
    "traits": [
      "Fearless",
      "Zealot"
    ],
    "cost": 300,
    "status": "recruit",
    "record": {
      "missions": 0,
      "kills": 0
    },
    "maxHp": 29
  },
  {
    "id": "tanaka",
    "name": "Yuki Tanaka",
    "callsign": "",
    "age": 22,
    "origin": "Osaka, Japan",
    "bio": "Drone-racing world champion who got bored winning. The fastest hands on the roster and the shortest attention span. Treats incoming fire as a suggestion.",
    "stats": {
      "aim": 7,
      "health": 4,
      "speed": 9,
      "nerve": 4
    },
    "traits": [
      "Reckless",
      "Fast Hands"
    ],
    "cost": 260,
    "status": "recruit",
    "record": {
      "missions": 0,
      "kills": 0
    },
    "maxHp": 23
  },
  {
    "id": "tex",
    "name": "Tex",
    "callsign": "",
    "age": null,
    "origin": "Unknown",
    "bio": "Twenty years a mercenary across four continents. Won't give you his real name, his real age, or a straight answer. Worth every credit — and he is the first to remind you of it.",
    "stats": {
      "aim": 9,
      "health": 8,
      "speed": 3,
      "nerve": 8
    },
    "traits": [
      "Veteran",
      "Mercenary"
    ],
    "cost": 480,
    "status": "recruit",
    "record": {
      "missions": 0,
      "kills": 0
    },
    "maxHp": 31
  },
  {
    "id": "reyes",
    "name": "Ana Reyes",
    "callsign": "",
    "age": 27,
    "origin": "Manila, Philippines",
    "bio": "Lost her whole family in the first raid on the harbor district. Signed the enlistment papers the next morning, still in yesterday's clothes. She is not here for the money.",
    "stats": {
      "aim": 7,
      "health": 6,
      "speed": 6,
      "nerve": 7
    },
    "traits": [
      "Vengeful",
      "Loyal"
    ],
    "cost": 240,
    "status": "recruit",
    "record": {
      "missions": 0,
      "kills": 0
    },
    "maxHp": 27
  },
  {
    "id": "ghost",
    "name": "Ghost",
    "callsign": "",
    "age": 19,
    "origin": "Unknown",
    "bio": "A cyber-orphan who grew up in the city's dead networks. Can talk any machine into opening, but can barely hold a rifle steady. Cheap, green, and quietly terrified.",
    "stats": {
      "aim": 3,
      "health": 4,
      "speed": 7,
      "nerve": 3
    },
    "traits": [
      "Green",
      "Tech-Savvy"
    ],
    "cost": 120,
    "status": "recruit",
    "record": {
      "missions": 0,
      "kills": 0
    },
    "maxHp": 23
  }
];

// Preview state is separate from the campaign. Portraits can be replaced with
// supplied asset paths here, or tried locally using each card's file control.
const portraits = {
  vance: './portraits/mara.png',
  osei: './portraits/kwame.png',
  tanaka: './portraits/yuki.png',
  tex: './portraits/text.png',
  reyes: './portraits/ana.png',
  ghost: './portraits/ghost.png',
};
const soldiers = structuredClone(RECRUIT_POOL);
const enlisted = new Set(['vance', 'osei', 'tanaka']);
const records = { vance: [8, 23], osei: [6, 11], tanaka: [3, 7] };
let credits = 750;
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let noticeTimer;
function notice(message) { $('barracks-notice').textContent = message; $('barracks-notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('barracks-notice').hidden = true, 3500); }

function card(s) {
  const member = enlisted.has(s.id), maxHp = s.maxHp, wounds = s.id === 'tanaka' ? 4 : 0;
  const record = records[s.id] || [0, 0];
  const article = document.createElement('article');
  article.className = 'personnel-card';
  article.innerHTML = `
    <div class="personnel-top">
      <div class="soldier-photo"><img src="${escape(portraits[s.id])}" alt="Portrait of ${escape(s.name)}"></div>
      <div class="personnel-identity"><div class="soldier-status ${member ? '' : 'recruit-status'}">${member ? (wounds ? 'RECOVERING' : 'READY FOR DUTY') : 'AVAILABLE FOR HIRE'}</div>
      <h3>${escape(s.name)}</h3><div class="soldier-callsign">${s.callsign ? '“'+escape(s.callsign)+'”' : '—'}</div><div class="soldier-origin">${s.age ?? 'Age unknown'} · ${escape(s.origin)}</div>
      <div class="soldier-traits">${s.traits.map(t=>`<span>${escape(t)}</span>`).join('')}</div></div>
    </div>
    <p class="soldier-bio">${escape(s.bio)}</p>
    <div class="soldier-attributes">${Object.entries(s.stats).map(([name,value])=>`<div><div class="attribute-label"><span>${name}</span><b>${value}<small>/10</small></b></div><meter min="0" max="10" value="${value}" aria-label="${name}: ${value} out of 10"></meter></div>`).join('')}</div>
    <div class="personnel-bottom">${member ? `<span class="soldier-health ${wounds ? 'wounded' : ''}">HP ${maxHp-wounds} / ${maxHp}</span><span class="service-record">${record[0]} MISSIONS · ${record[1]} KILLS</span>` : `<span class="hire-cost">₡ ${s.cost.toLocaleString()}<small>HIRING COST</small></span><button class="hire-button" ${credits<s.cost?'disabled':''}>${credits<s.cost?'INSUFFICIENT CREDITS':'HIRE SOLDIER +'}<span class="sr-only"> ${escape(s.name)}</span></button>`}</div>`;
  article.querySelector('.hire-button')?.addEventListener('click', () => {
    if(enlisted.has(s.id)||credits<s.cost)return;
    credits-=s.cost;enlisted.add(s.id);render();notice(`${s.name} joined your squad. ${s.cost} credits deducted.`);
    $('squad-list').lastElementChild?.scrollIntoView({block:'nearest',behavior:'smooth'});
  });
  return article;
}
function render() {
  $('squad-list').replaceChildren(...soldiers.filter(s=>enlisted.has(s.id)).map(card));
  const recruits=soldiers.filter(s=>!enlisted.has(s.id));
  $('recruit-list').replaceChildren(...recruits.map(card));
  if(!recruits.length){const empty=document.createElement('p');empty.className='personnel-empty';empty.textContent='All available soldiers have joined your squad.';$('recruit-list').append(empty);}
  $('credits').textContent=credits.toLocaleString();$('personnel').textContent=enlisted.size;
  $('squad-count').textContent=enlisted.size;$('recruit-count').textContent=recruits.length;
}
document.querySelector('[data-page]').onclick=()=>location.href='./operations.html';
document.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>notice(`${b.dataset.room} is outside this Barracks mockup.`));
render();

})();
