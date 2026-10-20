import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {google} from 'googleapis';
import {Store,deliverDue,DEFAULTS} from './core.mjs';
import {SHEET_TITLE,SCHEDULE_TAB,DASHBOARD_TAB,HEADERS,buildRows,dashboardRows,layoutRequests,sheetUrl} from './sheets.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4318);
// ASIF_BIND=lan lets the app be reached from your phone on the same Wi-Fi.
// Default stays localhost-only.
const bindLan=process.env.ASIF_BIND==='lan';
const listenAddr=bindLan?'0.0.0.0':'127.0.0.1';
const base=`http://127.0.0.1:${port}`;
function lanIPv4(){
  const out=[];
  for(const nets of Object.values(os.networkInterfaces()||{}))for(const n of nets||[]){
    if(n.family==='IPv4'&&!n.internal)out.push(n.address);
  }
  return out;
}
function allowedHosts(){
  return new Set([`127.0.0.1:${port}`,`localhost:${port}`,...lanIPv4().map(ip=>`${ip}:${port}`)]);
}
const data=process.env.ASIF_DATA_DIR||path.join(process.env.LOCALAPPDATA||process.env.HOME||root,'AsifScheduleAssistant');
const store=new Store(data);
const csrf=randomBytes(32).toString('hex');
let syncing=false,ticking=false;
let lastSync=null,syncError=null,sheetError=null,sheetSyncing=false,sheetTimer=null;
const flows=new Map();
const scopes=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/spreadsheets'];

function auth(persist=true){
  const cfg=store.secret('google_client');if(!cfg)throw new Error('Upload your Google Desktop OAuth client JSON in Connections first.');
  // Google sign-in always uses the loopback address, even when the app is
  // reached from a phone on the LAN (Google only allows loopback redirects
  // for Desktop clients). Do this step from the laptop browser.
  const a=new google.auth.OAuth2(cfg.client_id,cfg.client_secret,`http://127.0.0.1:${port}/oauth/google/callback`);
  const tokens=store.secret('google_tokens');if(tokens)a.setCredentials(tokens);
  if(persist)a.on('tokens',t=>store.secret('google_tokens',{...store.secret('google_tokens'),...t}));return a;
}
function googleReady(){return !!store.secret('google_tokens');}
function textBody(payload){
  const found=[];const visit=p=>{if(p.mimeType==='text/plain'&&p.body?.data)found.push(Buffer.from(p.body.data,'base64url').toString());for(const x of p.parts||[])visit(x);};visit(payload);return found.join('\n').slice(0,6000);
}
async function syncGoogle(){
  if(syncing||!googleReady())return;syncing=true;syncError=null;
  try{
    const a=auth(),calendar=google.calendar({version:'v3',auth:a});let pageToken;
    for(let page=0;page<10;page++){
      const r=await calendar.events.list({calendarId:'primary',timeMin:new Date(Date.now()-86400000).toISOString(),timeMax:new Date(Date.now()+90*86400000).toISOString(),singleEvents:true,showDeleted:true,maxResults:250,pageToken});
      for(const e of r.data.items||[])store.importGoogle(e);pageToken=r.data.nextPageToken;if(!pageToken)break;
    }
    const gmail=google.gmail({version:'v1',auth:a});
    const r=await gmail.users.messages.list({userId:'me',maxResults:40,q:'newer_than:14d -in:sent -in:trash (meeting OR appointment OR schedule OR webinar OR invitation OR "zoom.us" OR "meet.google.com")'});
    for(const m of r.data.messages||[]){
      if(store.db.prepare("SELECT id FROM inbox WHERE source='gmail' AND source_id=?").get(m.id))continue;
      const full=await gmail.users.messages.get({userId:'me',id:m.id,format:'full'});
      const h=full.data.payload?.headers||[];const title=h.find(x=>x.name.toLowerCase()==='subject')?.value||'Email invitation';
      const body=textBody(full.data.payload||{})||full.data.snippet||'';
      store.suggestion({source:'gmail',source_id:m.id,title,body:title+'\n'+body,received:new Date(Number(full.data.internalDate)||Date.now())});
    }
    lastSync=new Date().toISOString();store.set('last_sync',lastSync);scheduleSheetSync();
  }catch(e){syncError='Google sync failed. Check your sign-in, API access and internet connection.';}
  finally{syncing=false;}
}
// ---- Google Sheets worksheet: every schedule entry is kept as a row ----
async function ensureSheet(){
  let id = store.get('sheet_id');
  const a = auth(), sheets = google.sheets({version:'v4', auth:a});
  if(id){
    try{ await sheets.spreadsheets.get({spreadsheetId:id, fields:'spreadsheetId'}); return id; }
    catch{ id = null; }
  }
  const drive = google.drive({version:'v3', auth:a});
  const found = await drive.files.list({
    q:`name='${SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields:'files(id)', pageSize:1,
  });
  if(found.data.files && found.data.files.length){ id = found.data.files[0].id; }
  else{
    const created = await sheets.spreadsheets.create({requestBody:{
      properties:{title:SHEET_TITLE, locale:'en_PK', timeZone:'Asia/Karachi'},
      sheets:[{properties:{title:SCHEDULE_TAB}},{properties:{title:DASHBOARD_TAB}}],
    }});
    id = created.data.spreadsheetId;
  }
  store.set('sheet_id', id);
  await setupSheetLayout(id);
  return id;
}
async function setupSheetLayout(id){
  const a = auth(), sheets = google.sheets({version:'v4', auth:a});
  const meta = await sheets.spreadsheets.get({spreadsheetId:id, fields:'sheets.properties'});
  const tabId = (title)=>{
    const s = (meta.data.sheets||[]).find(x=>x.properties.title===title);
    return s ? s.properties.sheetId : null;
  };
  let scheduleId = tabId(SCHEDULE_TAB), dashboardId = tabId(DASHBOARD_TAB);
  const add = [];
  if(scheduleId===null) add.push({addSheet:{properties:{title:SCHEDULE_TAB}}});
  if(dashboardId===null) add.push({addSheet:{properties:{title:DASHBOARD_TAB}}});
  if(add.length){
    const r = await sheets.spreadsheets.batchUpdate({spreadsheetId:id, requestBody:{requests:add}});
    for(const x of r.data.replies||[]){
      if(x.addSheet.properties.title===SCHEDULE_TAB) scheduleId = x.addSheet.properties.sheetId;
      if(x.addSheet.properties.title===DASHBOARD_TAB) dashboardId = x.addSheet.properties.sheetId;
    }
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId:id, range:`${SCHEDULE_TAB}!A1`, valueInputOption:'RAW',
    requestBody:{values:[HEADERS]},
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId:id, range:`${DASHBOARD_TAB}!A1`, valueInputOption:'USER_ENTERED',
    requestBody:{values:dashboardRows()},
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId:id, requestBody:{requests:layoutRequests(scheduleId, dashboardId)},
  });
}
async function syncSheet(){
  if(sheetSyncing || !googleReady()) return;
  sheetSyncing = true; sheetError = null;
  try{
    const id = await ensureSheet();
    const sheets = google.sheets({version:'v4', auth:auth()});
    const rows = buildRows(store.events());
    await sheets.spreadsheets.values.clear({spreadsheetId:id, range:`${SCHEDULE_TAB}!A2:L`});
    if(rows.length){
      await sheets.spreadsheets.values.update({
        spreadsheetId:id, range:`${SCHEDULE_TAB}!A2:L${rows.length+1}`,
        valueInputOption:'USER_ENTERED', requestBody:{values:rows},
      });
    }
    const stamp = new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Karachi'}).format(new Date());
    await sheets.spreadsheets.values.update({
      spreadsheetId:id, range:`${DASHBOARD_TAB}!B10`, valueInputOption:'RAW',
      requestBody:{values:[[stamp + ' (Pakistan time)']]},
    });
    store.set('sheet_last', new Date().toISOString());
  }catch(e){
    sheetError = 'Worksheet sync failed. Check your Google sign-in and that Drive/Sheets APIs are enabled.';
  }finally{ sheetSyncing = false; }
}
// Debounced: many quick edits trigger a single sheet update a few seconds later.
function scheduleSheetSync(){
  if(sheetTimer || !googleReady()) return;
  sheetTimer = setTimeout(()=>{ sheetTimer = null; void syncSheet(); }, 4000);
}
async function sendEmail(e,message){
  const to=store.settings().email;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||/[\r\n]/.test(to))throw new Error('Invalid recipient');
  const raw=Buffer.from(`To: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from('30-minute reminder: '+e.title).toString('base64')}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(message).toString('base64')}\r\n`).toString('base64url');
  await google.gmail({version:'v1',auth:auth()}).users.messages.send({userId:'me',requestBody:{raw}});
}
async function tick(){
  if(ticking)return;ticking=true;
  try{await deliverDue(store,{email:googleReady()?sendEmail:null});}
  finally{ticking=false;}
}
function respond(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){let b='';for await(const x of req){b+=x;if(b.length>150000)throw new Error('Request too large.');}return b?JSON.parse(b):{};}
function security(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  const host=req.headers.host;
  if(!allowedHosts().has(host)){respond(res,403,{error:'Use the app address shown by the app on this computer.'});return false;}
  const reqBase=`http://${host}`;
  if(!['GET','HEAD'].includes(req.method)&&(req.headers.origin!==reqBase||req.headers['x-asif-csrf']!==csrf)){respond(res,403,{error:'This request must come from the app.'});return false;}
  return true;
}
const STATIC_FILES={
  '/':['index.html','text/html'],
  '/app.js':['app.js','text/javascript'],
  '/style.css':['style.css','text/css'],
  '/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'],
  '/icon-192.png':['icon-192.png','image/png'],
  '/icon-512.png':['icon-512.png','image/png'],
};
const server=http.createServer(async(req,res)=>{
  if(!security(req,res))return;
  const url=new URL(req.url,base);
  try{
    if(req.method==='GET'&&url.pathname==='/api/state'){const sheetId=store.get('sheet_id');return respond(res,200,{csrf,settings:store.settings(),events:store.events(),inbox:store.inbox(),logs:store.logs(),connections:{google:{configured:!!store.secret('google_client'),connected:googleReady(),email:store.get('google_email')}},sheet:sheetId?{id:sheetId,url:sheetUrl(sheetId),last:store.get('sheet_last'),error:sheetError,busy:sheetSyncing}:null,sync:{busy:syncing,last:lastSync||store.get('last_sync'),error:syncError},mode:'desktop'});}
    if(req.method==='GET'&&url.pathname==='/oauth/google/callback'){
      const state=url.searchParams.get('state'),flow=flows.get(state);flows.delete(state);
      if(!flow||flow.expires<Date.now())throw new Error('Google sign-in expired. Start again from Connections.');
      if(url.searchParams.has('error'))throw new Error('Google sign-in was cancelled.');
      const a=auth(false);const {tokens}=await a.getToken({code:url.searchParams.get('code'),codeVerifier:flow.verifier,redirect_uri:`http://127.0.0.1:${port}/oauth/google/callback`});
      a.setCredentials(tokens);const profile=await google.gmail({version:'v1',auth:a}).users.getProfile({userId:'me'});
      if(profile.data.emailAddress.toLowerCase()!==store.settings().email.toLowerCase())throw new Error('Choose '+store.settings().email+' when signing in, or update your email in Settings first.');
      store.secret('google_tokens',tokens);store.set('google_email',profile.data.emailAddress);void syncGoogle();res.writeHead(302,{Location:'/#connections'});return res.end();
    }
    if(req.method==='POST'&&url.pathname==='/api/google/config'){
      const b=await body(req);const cfg=b.installed;
      if(!cfg?.client_id||!cfg?.client_secret)throw new Error('Upload a Google OAuth JSON for a Desktop app (installed), not a service account.');
      store.secret('google_client',{client_id:cfg.client_id,client_secret:cfg.client_secret});return respond(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/google/connect'){
      const a=auth(),state=randomBytes(24).toString('base64url'),verifier=randomBytes(48).toString('base64url');flows.set(state,{verifier,expires:Date.now()+10*60000});
      return respond(res,200,{url:a.generateAuthUrl({access_type:'offline',prompt:'consent',scope:scopes,state,login_hint:store.settings().email,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})});
    }
    if(req.method==='POST'&&url.pathname==='/api/google/disconnect'){const tokens=store.secret('google_tokens');if(tokens?.access_token)await auth().revokeToken(tokens.access_token).catch(()=>{});store.secret('google_tokens',null);store.set('google_email',null);return respond(res,200,{ok:true});}
    if(req.method==='POST'&&url.pathname==='/api/sync'){void syncGoogle();return respond(res,202,{ok:true});}
    if(req.method==='POST'&&url.pathname==='/api/sheet/sync'){void syncSheet();return respond(res,202,{ok:true});}
    if(req.method==='POST'&&url.pathname==='/api/settings'){
      const b=await body(req),old=store.settings();const email=String(b.email||old.email).trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n]/.test(email))throw new Error('Enter a valid email.');
      if(googleReady()&&email!==old.email)throw new Error('Disconnect Google before changing your email.');
      store.set('preferences',{...old,email,emailReminders:b.emailReminders!==false,autoSync:b.autoSync!==false});return respond(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/events'){const b=await body(req);const e=store.create(b);if(b.inboxId)store.review(b.inboxId,'accepted');scheduleSheetSync();return respond(res,201,e);}
    const m=url.pathname.match(/^\/api\/events\/([^/]+)(?:\/(.*))?$/);
    if(m&&req.method==='POST'){
      const id=decodeURIComponent(m[1]),e=store.event(id);if(!e)return respond(res,404,{error:'Meeting not found.'});
      const b=await body(req);
      if(!m[2]){
        if(e.google_id){
          if(!googleReady())throw new Error('Connect Google before editing this linked event.');
          const {validateEvent}=await import('./core.mjs');const value=validateEvent(b);
          await google.calendar({version:'v3',auth:auth()}).events.patch({calendarId:'primary',eventId:e.google_id,requestBody:{summary:value.title,description:value.notes,location:value.location,start:{dateTime:value.start,timeZone:'Asia/Karachi'},end:{dateTime:value.end,timeZone:'Asia/Karachi'}},sendUpdates:'none'});
        }
        const updated=store.edit(id,b);scheduleSheetSync();return respond(res,200,updated);
      }
      if(m[2]==='status'){
        if(!['scheduled','completed','cancelled'].includes(b.status))throw new Error('Enter a valid event status.');
        if(b.status==='cancelled'&&e.google_id){if(!googleReady())throw new Error('Connect Google to cancel this linked event and stop its Google reminders.');await google.calendar({version:'v3',auth:auth()}).events.delete({calendarId:'primary',eventId:e.google_id,sendUpdates:'none'});}
        store.mark(id,b.status);scheduleSheetSync();return respond(res,200,{ok:true});
      }
      if(m[2]==='google'){
        if(!googleReady())throw new Error('Connect Google first.');const calendar=google.calendar({version:'v3',auth:auth()});
        const payload={summary:e.title,description:e.notes,location:e.location,start:{dateTime:e.start,timeZone:'Asia/Karachi'},end:{dateTime:e.end,timeZone:'Asia/Karachi'},reminders:{useDefault:false,overrides:[{method:'popup',minutes:30},{method:'email',minutes:30}]}};
        if(e.google_id)await calendar.events.patch({calendarId:'primary',eventId:e.google_id,requestBody:payload,sendUpdates:'none'});
        else{
          const googleId='asif'+id.replace(/-/g,'');
          try{await calendar.events.insert({calendarId:'primary',requestBody:{...payload,id:googleId},sendUpdates:'none'});}
          catch(error){if(error.code!==409)throw error;await calendar.events.get({calendarId:'primary',eventId:googleId});}
          store.google(id,googleId);
        }
        return respond(res,200,{ok:true});
      }
    }
    if(req.method==='POST'&&url.pathname.startsWith('/api/reminders/')){
      const id=url.pathname.split('/')[3];const log=store.db.prepare('SELECT * FROM deliveries WHERE id=?').get(id);if(!log||log.status!=='uncertain')throw new Error('Enter an unconfirmed reminder to retry.');
      const e=store.event(log.event_id);if(!e||e.status!=='scheduled'||Date.parse(e.start)<=Date.now()||e.start!==log.event_start)throw new Error('Meeting changed or has already started; this reminder cannot be retried.');
      const send=log.channel==='email'&&googleReady()?sendEmail:null;if(!send)throw new Error('Connect Google before retrying.');
      store.delivery(e,log.channel,'sending');
      try{const {reminderMessage}=await import('./core.mjs');await send(e,reminderMessage(e));store.delivery(e,log.channel,'sent','Provider confirmed acceptance after manual retry.');}
      catch(error){store.delivery(e,log.channel,'uncertain','Delivery was not confirmed after manual retry.');}
      return respond(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/inbox/dismiss'){const b=await body(req);store.review(b.id,'dismissed');return respond(res,200,{ok:true});}
    if(req.method==='POST'&&url.pathname==='/api/import-text'){const b=await body(req);if(!String(b.text||'').trim())throw new Error('Paste a meeting invitation.');store.suggestion({source:['email','text'].includes(b.source)?b.source:'text',source_id:randomBytes(12).toString('hex'),title:String(b.title||'Invitation to review'),body:String(b.text),received:new Date()});return respond(res,201,{ok:true});}
    if(req.method==='GET'&&url.pathname==='/api/export'){res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="asif-schedule-backup.json"','Cache-Control':'no-store'});return res.end(JSON.stringify({exported:new Date().toISOString(),events:store.events(),inbox:store.inbox(),logs:store.logs()},null,2));}
    if(req.method==='GET'&&url.pathname==='/setup'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return fs.createReadStream(path.join(root,'SETUP.md')).pipe(res);}
    if(req.method==='GET'&&STATIC_FILES[url.pathname]){
      const [file,type]=STATIC_FILES[url.pathname];
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return fs.createReadStream(path.join(root,'public',file)).pipe(res);
    }
    respond(res,404,{error:'Not found.'});
  }catch(e){respond(res,400,{error:e.message?.startsWith('Choose ')||/^(Enter|Upload|Connect|Google sign-in|The scanned|Meeting|Disconnect|An event|Request|This|Paste)/.test(e.message||'')?e.message:'The action could not be completed. Check your connection and try again.'});}
});
server.listen(port,listenAddr,()=>{
  const lan=bindLan?lanIPv4():[];
  console.log(`\nAsif Schedule Assistant\nOpen ${base}\n`+(lan.length?`On your phone (same Wi-Fi), open: ${lan.map(ip=>`http://${ip}:${port}`).join('  or  ')}\n`:'')+`Keep this process running for Gmail reminders.\n`);
  if(googleReady())void syncGoogle();
});
const reminderTimer=setInterval(()=>void tick().catch(()=>{}),15000);
const syncTimer=setInterval(()=>{if(store.settings().autoSync)void syncGoogle();},5*60000);
void tick().catch(()=>{});
async function shutdown(){clearInterval(reminderTimer);clearInterval(syncTimer);if(sheetTimer)clearTimeout(sheetTimer);server.close();store.close();process.exit(0);}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
