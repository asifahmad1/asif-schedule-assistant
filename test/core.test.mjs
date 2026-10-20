import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,deliverDue,parseSuggestion,validateEvent,reminderMessage} from '../core.mjs';
function fixture(t){const dir=mkdtempSync(path.join(os.tmpdir(),'asif-test-'));const s=new Store(dir);t.after(()=>{s.close();rmSync(dir,{recursive:true,force:true});});return s;}
const now=Date.parse('2026-10-14T10:00:00Z');
const event=offset=>({title:'Research meeting',start:new Date(now+offset*60000).toISOString(),end:new Date(now+(offset+60)*60000).toISOString(),location:'IFNS office'});
test('no early notification; notify exactly 30 minutes before, once per channel',async t=>{
  const s=fixture(t);s.create(event(30));let email=0;
  const p={email:async()=>email++};
  await deliverDue(s,p,now-1);assert.equal(s.logs().length,0);
  await deliverDue(s,p,now);await deliverDue(s,p,now+15000);assert.equal(email,1);assert.equal(s.logs().length,2);
});
test('cancelled, completed, past and more-than-30-minute events do not remind',async t=>{
  const s=fixture(t);s.create(event(31));s.create(event(-1));const a=s.create(event(15));s.mark(a.id,'cancelled');const b=s.create(event(20));s.mark(b.id,'completed');await deliverDue(s,{email:async()=>assert.fail('unexpected notification')},now);assert.equal(s.logs().length,0);
});
test('disconnected channels stay pending until connected; dashboard remains available',async t=>{
  const s=fixture(t);s.create(event(20));await deliverDue(s,{},now);assert.equal(s.logs().length,1);let sent=0;await deliverDue(s,{email:async()=>sent++},now+60000);assert.equal(sent,1);assert.equal(s.logs().length,2);
});
test('provider timeout is recorded as uncertain and never silently replayed',async t=>{
  const s=fixture(t);s.create(event(20));let calls=0;const p={email:async()=>{calls++;throw Error('timeout');}};await deliverDue(s,p,now);await deliverDue(s,p,now+10000);assert.equal(calls,1);assert.equal(s.logs().find(x=>x.channel==='email').status,'uncertain');
});
test('editing an event reschedules its reminder without reusing the old occurrence',async t=>{
  const s=fixture(t);const e=s.create(event(20));let calls=0;await deliverDue(s,{email:async()=>calls++},now);s.edit(e.id,event(40));await deliverDue(s,{email:async()=>calls++},now);assert.equal(calls,1);await deliverDue(s,{email:async()=>calls++},now+10*60000);assert.equal(calls,2);
});
test('English invitation parsing uses Pakistan timezone, not the computer timezone',()=>{
  const p=parseSuggestion('Meeting tomorrow at 3 pm PKT','2026-10-14T10:00:00Z');assert.equal(p.start,'2026-10-15T10:00:00.000Z');assert.equal(parseSuggestion('No scheduled date here').start,null);
});
test('invalid event timestamps and reversed end times are rejected',()=>{
  assert.throws(()=>validateEvent({title:'',start:'2026-01-01'}));assert.throws(()=>validateEvent({title:'X',start:'bad'}));assert.throws(()=>validateEvent({title:'X',start:'2026-01-01T10:00Z',end:'2026-01-01T09:00Z'}));
});
test('Google sync is idempotent, keeps app task types, and handles cancellation',t=>{
  const s=fixture(t),g={id:'google123',summary:'Lab task',start:{dateTime:event(30).start},end:{dateTime:event(30).end}};s.importGoogle(g);s.importGoogle(g);assert.equal(s.events().length,1);const e=s.events()[0];s.edit(e.id,{...e,kind:'task'});s.importGoogle(g);assert.equal(s.event(e.id).kind,'task');s.importGoogle({id:g.id,status:'cancelled'});assert.equal(s.event(e.id).status,'cancelled');s.importGoogle({id:'allday',start:{date:'2026-10-15'},end:{date:'2026-10-16'}});assert.equal(s.events().length,1);
});
test('secrets are encrypted and recoverable after reopening; records persist',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'asif-persist-'));let s=new Store(dir);const e=s.create(event(25));s.secret('test_secret',{refresh_token:'private-test-value'});assert.ok(!s.get('test_secret').includes('private-test-value'));s.close();s=new Store(dir);assert.equal(s.event(e.id).title,'Research meeting');assert.deepEqual(s.secret('test_secret'),{refresh_token:'private-test-value'});s.close();rmSync(dir,{recursive:true,force:true});
});
test('uncertain in-flight deliveries survive restart and are not repeated',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'asif-restart-'));let s=new Store(dir);const e=s.create(event(25));s.claim(e,'email',now);s.close();s=new Store(dir);assert.equal(s.logs()[0].status,'uncertain');assert.equal(s.claim(e,'email',now),false);s.close();rmSync(dir,{recursive:true,force:true});
});
test('reminder wording reflects late startup instead of falsely saying 30 minutes',()=>{
  assert.match(reminderMessage(event(10),now),/Starts in 10 minutes/);assert.match(reminderMessage(event(10),now),/Pakistan time/);
});
