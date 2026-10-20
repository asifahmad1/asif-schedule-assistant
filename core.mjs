import {DatabaseSync} from 'node:sqlite';
import {randomUUID, randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as chrono from 'chrono-node';

export const DEFAULTS={name:'Prof. Dr. Asif Ahmad',email:'asifahmad1@gmail.com',timezone:'Asia/Karachi',emailReminders:true,autoSync:true};
export function validateEvent(input){
  const title=String(input.title??'').trim();
  if(!title||title.length>180) throw new Error('Enter a title of 1–180 characters.');
  const start=new Date(input.start); const end=new Date(input.end??start.getTime()+3600000);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start) throw new Error('Choose a valid start and end time.');
  if(end-start>7*86400000) throw new Error('An event cannot be longer than seven days.');
  const kind=['meeting','task','appointment'].includes(input.kind)?input.kind:'meeting';
  return {title,start:start.toISOString(),end:end.toISOString(),kind,location:String(input.location??'').slice(0,500),notes:String(input.notes??'').slice(0,5000)};
}
export function parseSuggestion(text,reference=new Date()){
  const parsed=chrono.parse(String(text).slice(0,6000),{instant:new Date(reference),timezone:300},{forwardDate:true,timezones:{PKT:300}})[0];
  if(!parsed) return {start:null,end:null,confidence:'Review date and time'};
  const start=parsed.start.date(); const end=parsed.end?.date()??new Date(start.getTime()+3600000);
  return {start:start.toISOString(),end:end.toISOString(),confidence:parsed.start.isCertain('hour')?'Review suggested date and time':'Time missing — please choose a time'};
}
export function reminderMessage(e,now=Date.now()){
  const mins=Math.max(0,Math.ceil((Date.parse(e.start)-now)/60000));
  const date=new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Karachi'}).format(new Date(e.start));
  return `Reminder: ${e.title}\nStarts in ${mins} minutes\n${date} (Pakistan time)${e.location?'\nLocation: '+e.location:''}${e.notes?'\n'+e.notes.slice(0,700):''}`;
}
export class Store{
  constructor(dir){
    fs.mkdirSync(dir,{recursive:true,mode:0o700}); this.dir=dir;
    this.db=new DatabaseSync(path.join(dir,'schedule.sqlite')); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,title TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL,kind TEXT NOT NULL,location TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'scheduled',source TEXT NOT NULL DEFAULT 'manual',source_id TEXT,google_id TEXT,created TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS source_unique ON events(source,source_id) WHERE source_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY,source TEXT NOT NULL,source_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,suggested_start TEXT,suggested_end TEXT,confidence TEXT,received TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'review',UNIQUE(source,source_id));
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY,event_id TEXT NOT NULL,event_start TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL,detail TEXT,created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(event_id,event_start,channel));`);
    this.db.prepare("UPDATE deliveries SET status='uncertain',detail='App restarted before provider confirmation; review before retrying.' WHERE status='sending'").run();
    const keyFile=path.join(dir,'local.key'); if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,randomBytes(32),{mode:0o600}); this.key=fs.readFileSync(keyFile);
  }
  get(key,fallback=null){const r=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r?JSON.parse(r.value):fallback;}
  set(key,value){this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  seal(value){const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',this.key,iv);const encrypted=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,encrypted,c.getAuthTag()]).toString('base64');}
  unseal(value){const b=Buffer.from(value,'base64');const d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString());}
  secret(key,value){if(value!==undefined)this.set(key,value===null?null:this.seal(value)); const v=this.get(key);return v?this.unseal(v):null;}
  settings(){return {...DEFAULTS,...this.get('preferences',{})};}
  events(){return this.db.prepare('SELECT * FROM events ORDER BY start DESC').all();}
  event(id){return this.db.prepare('SELECT * FROM events WHERE id=?').get(id);}
  create(input,meta={}){const e=validateEvent(input);const id=meta.id??randomUUID();this.db.prepare('INSERT INTO events(id,title,start,end,kind,location,notes,source,source_id,google_id,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,e.title,e.start,e.end,e.kind,e.location,e.notes,meta.source??'manual',meta.source_id??null,meta.google_id??null,new Date().toISOString());return this.event(id);}
  edit(id,input){if(!this.event(id))throw new Error('Meeting not found.');const e=validateEvent(input);this.db.prepare('UPDATE events SET title=?,start=?,end=?,kind=?,location=?,notes=? WHERE id=?').run(e.title,e.start,e.end,e.kind,e.location,e.notes,id);return this.event(id);}
  mark(id,status){if(!['scheduled','completed','cancelled'].includes(status))throw new Error('Invalid status.');this.db.prepare('UPDATE events SET status=? WHERE id=?').run(status,id);}
  google(id,googleId){this.db.prepare('UPDATE events SET google_id=? WHERE id=?').run(googleId,id);}
  importGoogle(e){
    if(e.status==='cancelled'){this.db.prepare("UPDATE events SET status='cancelled' WHERE google_id=?").run(e.id);return;}
    if(!e.start?.dateTime||!e.end?.dateTime)return; // All-day events need an explicit time before reminders.
    const found=this.db.prepare('SELECT id,kind FROM events WHERE google_id=?').get(e.id);
    const value={title:e.summary||'Untitled meeting',start:e.start.dateTime,end:e.end.dateTime,location:e.location,notes:e.description,kind:found?.kind||'meeting'};
    if(found)this.edit(found.id,value);else this.create(value,{source:'google',source_id:e.id,google_id:e.id});
  }
  suggestion({source,source_id,title,body,received}){const p=parseSuggestion(body,received);this.db.prepare('INSERT OR IGNORE INTO inbox(id,source,source_id,title,body,suggested_start,suggested_end,confidence,received) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(),source,source_id,title.slice(0,180),body.slice(0,6000),p.start,p.end,p.confidence,new Date(received).toISOString());}
  inbox(){return this.db.prepare("SELECT * FROM inbox WHERE status='review' ORDER BY received DESC LIMIT 100").all();}
  review(id,status){this.db.prepare('UPDATE inbox SET status=? WHERE id=?').run(status,id);}
  claim(e,channel,now=Date.now()){
    const stamp=new Date(now).toISOString(); const r=this.db.prepare("INSERT OR IGNORE INTO deliveries(id,event_id,event_start,channel,status,created,updated) VALUES (?,?,?,?,'sending',?,?)").run(randomUUID(),e.id,e.start,channel,stamp,stamp);return Number(r.changes)>0;
  }
  delivery(e,channel,status,detail=''){this.db.prepare('UPDATE deliveries SET status=?,detail=?,updated=? WHERE event_id=? AND event_start=? AND channel=?').run(status,String(detail).slice(0,500),new Date().toISOString(),e.id,e.start,channel);}
  logs(){return this.db.prepare('SELECT d.*,e.title FROM deliveries d LEFT JOIN events e ON e.id=d.event_id ORDER BY d.created DESC LIMIT 100').all();}
  due(now=Date.now()){return this.db.prepare("SELECT * FROM events WHERE status='scheduled' AND start>? AND start<=?").all(new Date(now).toISOString(),new Date(now+30*60000).toISOString());}
  close(){this.db.close();}
}
export async function deliverDue(store,providers,now=Date.now()){
  const settings=store.settings();
  for(const e of store.due(now)){
    for(const channel of ['dashboard','email']){
      if(channel==='email'&&(!settings.emailReminders||!providers.email))continue;
      if(!store.claim(e,channel,now))continue;
      try{if(channel!=='dashboard')await providers[channel](e,reminderMessage(e,now));store.delivery(e,channel,'sent',channel==='dashboard'?'Reminder recorded in dashboard.':'Provider confirmed acceptance.');}
      catch(error){store.delivery(e,channel,'uncertain','Delivery was not confirmed. Review connection; no automatic replay.');}
    }
  }
}
