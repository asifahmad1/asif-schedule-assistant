const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const preview=document.querySelector('meta[name="asif-mode"]')?.content==='preview';
const DEFAULTS={name:'Prof. Dr. Asif Ahmad',email:'asifahmad1@gmail.com',timezone:'Asia/Karachi',emailReminders:true,autoSync:true};
let state,weekOffset=0,page='overview',lastSeen=Date.now(),refreshing=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(d,o)=>new Intl.DateTimeFormat('en-PK',{timeZone:'Asia/Karachi',...o}).format(new Date(d));
const dateKey=d=>new Date(new Date(d).getTime()+5*3600000).toISOString().slice(0,10);
const timeKey=d=>new Date(new Date(d).getTime()+5*3600000).toISOString().slice(11,16);
const stamp=d=>fmt(d,{dateStyle:'medium',timeStyle:'short'});
const time=d=>fmt(d,{hour:'numeric',minute:'2-digit',hour12:true});
const empty=(title,text,button='')=>`<div class="empty-state"><div class="empty-symbol" style="margin:auto">◷</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${button}</div>`;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function previewState(){let saved;try{saved=JSON.parse(localStorage.getItem('asif-schedule-preview')||'{}');}catch{saved={};}return {settings:{...DEFAULTS,...saved.settings},events:saved.events||[],inbox:saved.inbox||[],logs:saved.logs||[],connections:{google:{configured:false,connected:false}},sync:{last:null,busy:false},mode:'preview'};}
function savePreview(){localStorage.setItem('asif-schedule-preview',JSON.stringify({settings:state.settings,events:state.events,inbox:state.inbox,logs:state.logs}));}
async function api(endpoint,data){
  if(preview){
    if(endpoint==='/api/state'){state=previewState();return state;}
    if(endpoint==='/api/events'){const e={...data,id:crypto.randomUUID(),status:'scheduled',source:'manual',created:new Date().toISOString()};state.events.push(e);if(data.inboxId)state.inbox=state.inbox.filter(x=>x.id!==data.inboxId);savePreview();return e;}
    if(endpoint==='/api/settings'){state.settings={...state.settings,...data};savePreview();return {ok:true};}
    const m=endpoint.match(/^\/api\/events\/([^/]+)(?:\/(.*))?$/);if(m){const e=state.events.find(e=>e.id===m[1]);if(!e)throw new Error('Event not found.');if(!m[2])Object.assign(e,data);else if(m[2]==='status')e.status=data.status;else throw new Error('Google sync needs the runnable app and Google sign-in.');savePreview();return e;}
    if(endpoint==='/api/inbox/dismiss'){state.inbox=state.inbox.filter(x=>x.id!==data.id);savePreview();return {ok:true};}
    if(endpoint==='/api/import-text'){state.inbox.unshift({id:crypto.randomUUID(),source:data.source,title:data.title||'Invitation to review',body:data.text,received:new Date().toISOString(),confidence:'Choose the date and time in the review form.'});savePreview();return {ok:true};}
    throw new Error('Open the runnable app on your computer to connect accounts. This page is a browser preview.');
  }
  const r=await fetch(endpoint,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Asif-Csrf':state?.csrf||''},body:data===undefined?undefined:JSON.stringify(data)});
  const value=await r.json();if(!r.ok)throw new Error(value.error||'Could not complete the action.');return value;
}
async function refresh(){if(refreshing)return;refreshing=true;try{state=await api('/api/state');$('#error-banner').hidden=true;render();checkNotifications();}catch(e){$('#error-banner').textContent='The app is not responding. Start the reminder process and refresh this page. Existing records shown may be out of date.';$('#error-banner').hidden=false;}finally{refreshing=false;}}
function activeEvents(){return state.events.filter(e=>e.status==='scheduled'&&Date.parse(e.end)>Date.now()).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}
function buttons(e){const done=e.status!=='scheduled';return `<div class="row-actions"><button class="light" data-edit="${esc(e.id)}">Edit</button>${!done?`<button class="light" data-google="${esc(e.id)}">${e.google_id?'Update Google':'Save to Google'}</button><button class="light" data-complete="${esc(e.id)}">Done</button><button class="text-button" data-cancel="${esc(e.id)}">Cancel</button>`:`<span class="badge">${esc(e.status)}</span>`}</div>`;}
function render(){
  $('#today-date').textContent=fmt(new Date(),{weekday:'long',month:'long',day:'numeric',year:'numeric'}).toUpperCase();
  const events=activeEvents(),today=dateKey(new Date());
  $('#stat-today').textContent=state.events.filter(e=>e.status==='scheduled'&&dateKey(e.start)===today).length;
  $('#stat-week').textContent=events.filter(e=>Date.parse(e.start)<Date.now()+7*86400000).length;
  $('#stat-inbox').textContent=state.inbox.length;$('#inbox-count').textContent=state.inbox.length;
  const e=events[0];$('#next-event').innerHTML=e?`<h3 class="next-title">${esc(e.title)}</h3><p class="next-time">${esc(stamp(e.start))} · ${Math.round((Date.parse(e.end)-Date.parse(e.start))/60000)} minutes</p>${e.location?`<p>⌖ ${esc(e.location)}</p>`:''}<div class="next-meta"><span class="badge">${esc(e.kind)}</span><span>◷ Reminder at ${esc(time(Date.parse(e.start)-30*60000))}</span></div>`:`<div class="next-empty"><div class="empty-symbol">◷</div><div><div class="empty-title">Make room for a good day.</div><p>Your next meeting will appear here.<br>Add an event to get started.</p></div></div><button class="light" data-action="new">＋ Add your first event</button>`;
  const google=state.connections.google;
  $('#connection-mini').innerHTML=`<div class="connection-mini-row"><span class="mini-logo">M</span><span>Gmail & Calendar</span><span>${google.connected?'Connected':'Not connected'}</span></div><div class="connection-mini-row"><span class="mini-logo">▦</span><span>Drive worksheet</span><span>${state.sheet?'Synced':'Not created'}</span></div>`;
  renderWeek();renderAgenda();renderInbox();renderConnections();renderHistory();
  if(document.activeElement?.closest('#settings-form'))return;
  const f=$('#settings-form');f.elements.email.value=state.settings.email;for(const k of ['emailReminders','autoSync'])f.elements[k].checked=state.settings[k];
}
function renderWeek(){
  const d=new Date(dateKey(new Date())+'T12:00:00+05:00');const monday=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-monday+weekOffset*7);
  const last=new Date(d.getTime()+6*86400000);$('#week-range').textContent=`${fmt(d,{month:'short',day:'numeric'})} – ${fmt(last,{month:'short',day:'numeric',year:'numeric'})}`;
  $('#week-calendar').innerHTML=Array.from({length:7},(_,i)=>{
    const day=new Date(d.getTime()+i*86400000),key=dateKey(day),events=state.events.filter(e=>e.status==='scheduled'&&dateKey(e.start)===key).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    return `<div class="day ${key===dateKey(new Date())?'today':''}" data-day="${key}"><span class="day-name">${fmt(day,{weekday:'short'}).toUpperCase()}</span><span class="day-number">${fmt(day,{day:'numeric'})}</span>${events.length?events.map(e=>`<div class="calendar-event ${esc(e.kind)}" data-edit="${esc(e.id)}"><small>${esc(time(e.start))}</small><strong>${esc(e.title)}</strong></div>`).join(''):'<p class="day-empty">＋</p>'}</div>`;
  }).join('');
}
function renderAgenda(){
  const query=$('#search').value.toLowerCase(),filter=$('#agenda-filter').value;
  const events=state.events.filter(e=>(!query||(e.title+' '+e.location+' '+e.notes).toLowerCase().includes(query))&&(filter==='all'||(filter==='upcoming'?e.status==='scheduled'&&Date.parse(e.end)>=Date.now():e.status===filter))).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  let day='';$('#agenda-list').innerHTML=events.length?events.map(e=>{const key=dateKey(e.start),header=key!==day?`<div class="agenda-date-label">${esc(fmt(e.start,{weekday:'long',month:'short',day:'numeric',year:'numeric'}))}</div>`:'';day=key;return header+`<div class="agenda-row"><div class="agenda-time">${esc(time(e.start))}<small>${Math.round((Date.parse(e.end)-Date.parse(e.start))/60000)} min</small></div><div class="agenda-info"><strong>${esc(e.title)}</strong><span class="badge">${esc(e.kind)}</span> <span class="small muted">${esc(e.source==='google'?'Google Calendar':e.source)}</span>${e.location?`<p>${esc(e.location)}</p>`:''}<p>Reminder: ${esc(time(Date.parse(e.start)-1800000))} · Pakistan time</p></div>${buttons(e)}</div>`;}).join(''):empty('Nothing on this list yet.','Add a meeting, task, or appointment. Your records will stay here after the event is over.','<button class="primary" data-action="new">＋ Add an event</button>');
}
function renderInbox(){
  $('#inbox-list').innerHTML=state.inbox.length?state.inbox.map(x=>`<article class="panel invite-card"><div class="section-head"><h3>${esc(x.title)}</h3><span class="badge">${esc(x.source)}</span></div><pre>${esc(x.body)}</pre><p class="suggestion">${x.suggested_start?esc(stamp(x.suggested_start))+' · ':''}${esc(x.confidence||'Review the date and time.')}</p><div class="invite-actions"><button class="primary" data-review="${esc(x.id)}">Review & add event</button><button class="light" data-dismiss="${esc(x.id)}">Dismiss</button></div></article>`).join(''):empty('A quieter inbox. A clearer calendar.','Connect Gmail to review invitations, or paste a message manually.');
}
function renderConnections(){
  const g=state.connections.google;
  $('#google-status').textContent=g.connected?'Connected':g.configured?'Ready to sign in':'Not connected';$('#google-status').className='badge '+(g.connected?'connected':g.configured?'pending':'');
  $('#google-account').textContent=g.email||state.settings.email;$('#google-setup').hidden=g.connected;
  $('#google-connect').hidden=g.connected;$('#google-connect').disabled=preview||!g.configured;$('#google-json').disabled=preview;
  $('#google-sync').hidden=!g.connected;$('#google-disconnect').hidden=!g.connected;
  $('#sync-status').textContent=state.sync.error||(state.sync.busy?'Syncing calendar and invitations…':state.sync.last?'Last synced '+stamp(state.sync.last):'Not synced yet.');
  const sh=state.sheet,ss=$('#sheet-status');
  if(ss){ss.textContent=!g.connected?'Needs Google sign-in':sh?(sh.error||'Ready'):'Not created yet';ss.className='badge '+(sh&&!sh.error&&g.connected?'connected':sh&&sh.error?'pending':'');}
  const sl=$('#sheet-link');if(sl){if(sh&&sh.url){sl.href=sh.url;sl.style.display='';}else sl.style.display='none';}
  const sm=$('#sheet-meta');if(sm)sm.textContent=sh&&sh.last?'Last synced '+stamp(sh.last)+(sh.busy?' · syncing…':''):'The worksheet is created in your Google Drive when you connect Google.';
}
function renderHistory(){
  $('#history-list').innerHTML=state.logs.length?state.logs.map(x=>`<div class="history-row"><div><strong>${esc(x.title||'Event reminder')}</strong><p>${esc(x.channel)} · ${esc(stamp(x.created))}</p><p>${esc(x.detail||'')}</p>${x.status==='uncertain'?`<button class="light" data-retry="${esc(x.id)}">Retry reminder</button>`:''}</div><span class="badge ${x.status==='sent'?'connected':'pending'}">${x.status==='sent'?'Accepted':esc(x.status)}</span></div>`).join(''):empty('Every reminder has a record.','Delivery records will appear when an event reaches its 30-minute reminder time.');
}
function showPage(){const hash=location.hash.slice(1);page=['overview','agenda','inbox','connections','history','settings'].includes(hash)?hash:'overview';$$('.page').forEach(x=>x.hidden=x.id!=='page-'+page);$$('nav a').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$('#breadcrumb').textContent='Workspace / '+({agenda:'My schedule',inbox:'Invitation inbox',history:'Reminder history'}[page]||page[0].toUpperCase()+page.slice(1));}
function openEvent(event=null,day=null,inbox=null){
  const f=$('#event-form');f.reset();f.elements.id.value=event?.id||'';f.elements.inboxId.value=inbox?.id||'';
  const future=new Date(Date.now()+3600000),start=event?.start||inbox?.suggested_start||future.toISOString();
  f.elements.title.value=event?.title||inbox?.title||'';f.elements.date.value=day||dateKey(start);f.elements.time.value=timeKey(start);f.elements.kind.value=event?.kind||'meeting';f.elements.location.value=event?.location||'';f.elements.notes.value=event?.notes||inbox?.body||'';
  const duration=event?Math.max(1,Math.round((Date.parse(event.end)-Date.parse(event.start))/60000)):inbox?.suggested_end?Math.round((Date.parse(inbox.suggested_end)-Date.parse(start))/60000):60;
  if(![...f.elements.duration.options].some(x=>Number(x.value)===duration))f.elements.duration.add(new Option(duration+' minutes',duration));f.elements.duration.value=duration;
  $('#event-dialog-title').textContent=event?'Edit event':inbox?'Review invitation':'New event';$('#event-warning').textContent=inbox?'Confirm the suggested date, time, and details before saving.':event?.google_id?'Editing this event also updates Google Calendar when connected.':'';
  $('#event-dialog').showModal();
}
async function action(fn){try{await fn();await refresh();}catch(e){toast(e.message);}}
document.addEventListener('click',e=>{
  const t=e.target.closest('button,[data-edit],[data-day]');if(!t)return;
  if(t.hasAttribute('data-close'))return t.closest('dialog').close();
  if(t.dataset.action==='new')return openEvent();
  if(t.dataset.edit)return openEvent(state.events.find(x=>x.id===t.dataset.edit));
  if(t.dataset.day)return openEvent(null,t.dataset.day);
  if(t.dataset.review)return openEvent(null,null,state.inbox.find(x=>x.id===t.dataset.review));
  if(t.dataset.retry&&confirm('The previous delivery was not confirmed. Retrying may send a duplicate. Send again?'))return void action(async()=>{await api('/api/reminders/'+t.dataset.retry,{});toast('Retry processed. Check reminder history for the result.');});
  if(t.dataset.dismiss)return void action(async()=>{await api('/api/inbox/dismiss',{id:t.dataset.dismiss});toast('Invitation dismissed.');});
  if(t.dataset.google)return void action(async()=>{t.disabled=true;try{await api('/api/events/'+t.dataset.google+'/google',{});toast('Saved to Google with 30-minute popup and email reminders.');}finally{t.disabled=false;}});
  if(t.dataset.complete)return void action(async()=>{await api('/api/events/'+t.dataset.complete+'/status',{status:'completed'});toast('Marked completed. Your record is kept.');});
  if(t.dataset.cancel&&confirm('Cancel this event? If linked and Google is connected, it will also be cancelled in Google Calendar.'))return void action(async()=>{await api('/api/events/'+t.dataset.cancel+'/status',{status:'cancelled'});toast('Event cancelled. Your record is kept.');});
});
$('#event-form').addEventListener('submit',e=>{e.preventDefault();void action(async()=>{
  const f=e.target,b=Object.fromEntries(new FormData(f)),start=new Date(b.date+'T'+b.time+':00+05:00');if(!Number.isFinite(start.getTime()))throw new Error('Choose a valid date and time.');
  const payload={title:b.title,kind:b.kind,start:start.toISOString(),end:new Date(start.getTime()+Number(b.duration)*60000).toISOString(),location:b.location,notes:b.notes,inboxId:b.inboxId};
  const button=f.querySelector('button[type="submit"]');button.disabled=true;try{await api(b.id?'/api/events/'+b.id:'/api/events',payload);$('#event-dialog').close();toast('Event saved. Reminder set for 30 minutes before.');}finally{button.disabled=false;}
});});
$('#paste-invite').onclick=()=>{$('#invite-form').reset();$('#invite-dialog').showModal();};
$('#invite-form').onsubmit=e=>{e.preventDefault();void action(async()=>{await api('/api/import-text',Object.fromEntries(new FormData(e.target)));$('#invite-dialog').close();toast('Invitation added for review.');});};
$('#settings-form').onsubmit=e=>{e.preventDefault();const f=e.target;void action(async()=>{await api('/api/settings',{email:f.elements.email.value,emailReminders:f.elements.emailReminders.checked,autoSync:f.elements.autoSync.checked});toast('Settings saved.');});};
$('#google-json').onchange=e=>void action(async()=>{const file=e.target.files[0];if(!file)return;if(file.size>100000)throw new Error('Upload a Google OAuth JSON under 100 KB.');await api('/api/google/config',JSON.parse(await file.text()));toast('Google client configured. You can sign in now.');e.target.value='';});
$('#google-connect').onclick=()=>void action(async()=>{const r=await api('/api/google/connect',{});location.assign(r.url);});
$('#google-sync').onclick=()=>void action(async()=>{await api('/api/sync',{});toast('Sync started.');});
$('#sheet-sync').onclick=()=>void action(async()=>{await api('/api/sheet/sync',{});toast('Worksheet sync started.');});
$('#google-disconnect').onclick=()=>void action(async()=>{await api('/api/google/disconnect',{});toast('Google disconnected.');});
$('#refresh-connections').onclick=()=>void refresh();$('#search').oninput=renderAgenda;$('#agenda-filter').onchange=renderAgenda;
$('#prev-week').onclick=()=>{weekOffset--;renderWeek();};$('#next-week').onclick=()=>{weekOffset++;renderWeek();};$('#this-week').onclick=()=>{weekOffset=0;renderWeek();};
$('#enable-notifications').onclick=async()=>{if(!('Notification'in window))return toast('This browser does not support notifications.');const p=await Notification.requestPermission();toast(p==='granted'?'Browser notifications enabled. Keep this page open to receive them.':'Notifications were not enabled. You can change this in browser settings.');};
$('#export').onclick=()=>{if(!preview)return location.assign('/api/export');const blob=new Blob([JSON.stringify({exported:new Date().toISOString(),events:state.events,inbox:state.inbox,logs:state.logs},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='asif-schedule-preview-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
function checkNotifications(){
  if(preview){for(const e of state.events.filter(e=>e.status==='scheduled'&&Date.parse(e.start)>Date.now()&&Date.parse(e.start)<=Date.now()+1800000)){if(state.logs.some(l=>l.event_id===e.id&&l.event_start===e.start))continue;state.logs.unshift({id:crypto.randomUUID(),event_id:e.id,event_start:e.start,title:e.title,channel:'dashboard',status:'sent',created:new Date().toISOString(),detail:'Browser preview reminder; email needs the runnable app.'});savePreview();}renderHistory();}
  for(const l of state.logs.filter(x=>x.channel==='dashboard'&&Date.parse(x.created)>lastSeen)){if('Notification'in window&&Notification.permission==='granted')new Notification('Upcoming: '+l.title,{body:'Starts at '+time(l.event_start)+' (Pakistan time)',tag:l.id});toast('Upcoming: '+l.title+' · '+time(l.event_start));}
  lastSeen=Date.now();
}
window.addEventListener('hashchange',showPage);showPage();
if(preview){$('#preview-banner').hidden=false;$('#download-link').href='/Asif-Schedule-Assistant.zip';$('#app-download').href='/Asif-Schedule-Assistant.zip';$('#google-connect').textContent='Sign-in available in runnable app';}else{$('#app-download').href='/setup';$('#app-download').textContent='Read setup guide ↗';}
void refresh();setInterval(()=>void refresh(),preview?15000:5000);
