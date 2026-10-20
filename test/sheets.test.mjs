import test from 'node:test';
import assert from 'node:assert/strict';
import {SHEET_TITLE,HEADERS,buildRows,dashboardRows,layoutRequests,sheetUrl} from '../sheets.mjs';

test('sheet rows carry one row per event in Pakistan time', () => {
  const rows = buildRows([
    {title: 'Lab meeting', kind: 'meeting', start: '2026-10-15T10:00:00.000Z', end: '2026-10-15T11:00:00.000Z', location: 'IFNS', status: 'scheduled', notes: 'Bring samples', source: 'manual', created: '2026-10-14T10:00:00.000Z'},
  ]);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r[0], 'Lab meeting');
  assert.equal(r[2], '2026-10-15'); // date in PK
  assert.equal(r[3], '15:00'); // 10:00 UTC = 15:00 PKT
  assert.equal(r[5], 60);
  assert.equal(r[7], 'scheduled');
  assert.equal(r[8], '14:30'); // reminder 30 min before
  assert.equal(r.length, HEADERS.length);
});

test('dashboard has live formulas and creator credit', () => {
  const rows = dashboardRows();
  assert.match(rows[0][0], /Dr\. Asif Ahmad/);
  const upcoming = rows.find(r => r[0] === 'Upcoming (scheduled)');
  assert.match(upcoming[1], /COUNTIFS/);
  assert.match(upcoming[1], /TODAY/);
});

test('layout requests cover headers, filters and status colours', () => {
  const reqs = layoutRequests(111, 222);
  assert.ok(reqs.length > 5);
  const json = JSON.stringify(reqs);
  assert.match(json, /scheduled/);
  assert.match(json, /cancelled/);
  assert.match(json, /frozenRowCount/);
  assert.equal(SHEET_TITLE, 'Asif Schedule Assistant');
  assert.equal(sheetUrl('abc123'), 'https://docs.google.com/spreadsheets/d/abc123');
});
