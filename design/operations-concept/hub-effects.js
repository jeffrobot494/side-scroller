(() => {
  const body=document.body;
  body.classList.add('ui-effects');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const strip=document.createElement('div');strip.className='ambient-telemetry';strip.setAttribute('aria-hidden','true');
  strip.innerHTML='<span class="telemetry-light"></span><span class="telemetry-text"></span><span class="telemetry-cursor">▍</span><span class="telemetry-mode">SECURE / ENCRYPTED</span>';
  document.querySelector('.heading').after(strip);
  const toggle=document.createElement('button');toggle.className='effects-toggle';toggle.textContent='FX ON';toggle.setAttribute('aria-label','Toggle interface animations');toggle.setAttribute('aria-pressed','true');document.querySelector('.heading').append(toggle);
  let enabled=!reduce.matches,timer=null,line=0,position=0;
  const messages=['PERSONNEL UPLINK ESTABLISHED // DECK 04','VERIFYING BIOMETRICS… ALL RECORDS MATCH','SQUAD CHANNEL SECURE // STANDING BY','MEDICAL TELEMETRY RECEIVED // RECORDS CURRENT','RECRUITMENT FEED SYNCHRONIZED','EQUIPMENT DIAGNOSTICS COMPLETE // SYSTEMS NOMINAL'];
  const output=strip.querySelector('.telemetry-text');
  function type(){clearTimeout(timer);if(!enabled||document.hidden)return;const message=messages[line];output.textContent=message.slice(0,position++);if(position>message.length){position=0;line=(line+1)%messages.length;timer=setTimeout(type,3300)}else timer=setTimeout(type,35)}
  function apply(){body.classList.toggle('effects-paused',!enabled);toggle.textContent=enabled?'FX ON':'FX OFF';toggle.setAttribute('aria-pressed',String(enabled));if(enabled)type();else{clearTimeout(timer);output.textContent='PERSONNEL UPLINK ESTABLISHED // DECK 04'}}
  toggle.onclick=()=>{enabled=!enabled;apply()};reduce.addEventListener('change',e=>{enabled=!e.matches;apply()});document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if(enabled)type()});
  function wireCards(){document.querySelectorAll('.personnel-card:not([data-effects])').forEach((card,i)=>{
    card.dataset.effects='ready';card.style.setProperty('--fx-delay',`${-(i*2.7)}s`);
    const activity=document.createElement('div');activity.className='card-activity';activity.setAttribute('aria-hidden','true');activity.innerHTML='<span class="activity-bars"><i></i><i></i><i></i><i></i><i></i></span><span class="activity-label">RECORD VERIFIED</span><span class="activity-id">'+String(i+1).padStart(3,'0')+'</span>';card.append(activity);
    const label=activity.querySelector('.activity-label');let leaveTimer;
    card.addEventListener('pointerenter',()=>{clearTimeout(leaveTimer);card.classList.remove('fx-release');label.textContent='PERSONNEL FILE OPEN'});
    card.addEventListener('pointerleave',()=>{card.classList.add('fx-release');label.textContent='SECURING RECORD…';leaveTimer=setTimeout(()=>{label.textContent='RECORD VERIFIED';card.classList.remove('fx-release')},600)});
  })}
  wireCards();new MutationObserver(wireCards).observe(document.querySelector('.barracks-columns'),{childList:true,subtree:true});
  // Delegated interaction effects survive card replacement after hiring.
  document.addEventListener('pointerdown',e=>{if(!enabled)return;const button=e.target.closest('button');if(!button||button.disabled)return;const ripple=document.createElement('span');ripple.className='button-ripple';ripple.setAttribute('aria-hidden','true');button.append(ripple);ripple.addEventListener('animationend',()=>ripple.remove(),{once:true});setTimeout(()=>ripple.remove(),900)});
  apply();
})();
