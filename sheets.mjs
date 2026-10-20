// Google Sheets worksheet helpers for Asif Schedule Assistant.
// Pure functions only (no network): easy to unit-test. server.mjs handles
// the live Sheets/Drive API calls.
export const SHEET_TITLE = 'Asif Schedule Assistant';
export const SCHEDULE_TAB = 'Schedule';
export const DASHBOARD_TAB = 'Dashboard';

export const HEADERS = [
  'Title', 'Type', 'Date', 'Start', 'End', 'Duration (min)',
  'Location', 'Status', 'Reminder at', 'Notes', 'Source', 'Updated',
];

function pkDate(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

function pkTime(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));
}

/** One row per event, oldest first. Dates/times are Pakistan time. */
export function buildRows(events) {
  return [...events]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((e) => {
      const dur = Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60000);
      const updated = e.created || new Date().toISOString();
      return [
        e.title,
        e.kind,
        pkDate(e.start),
        pkTime(e.start),
        pkTime(e.end),
        dur,
        e.location || '',
        e.status,
        pkTime(Date.parse(e.start) - 30 * 60000),
        (e.notes || '').slice(0, 500),
        e.source || 'manual',
        `${pkDate(updated)} ${pkTime(updated)}`,
      ];
    });
}

/** Dashboard tab content: labels plus live formulas. */
export function dashboardRows() {
  return [
    ['Asif Schedule Assistant — created by Dr. Asif Ahmad'],
    [],
    ['Metric', 'Value'],
    ['Total entries', `=COUNTA(${SCHEDULE_TAB}!A:A)-1`],
    ['Upcoming (scheduled)', `=COUNTIFS(${SCHEDULE_TAB}!H:H,"scheduled",${SCHEDULE_TAB}!C:C,">="&TODAY())`],
    ['Due today', `=COUNTIFS(${SCHEDULE_TAB}!H:H,"scheduled",${SCHEDULE_TAB}!C:C,"="&TODAY())`],
    ['Completed', `=COUNTIF(${SCHEDULE_TAB}!H:H,"completed")`],
    ['Cancelled', `=COUNTIF(${SCHEDULE_TAB}!H:H,"cancelled")`],
    [],
    ['Last synced', ''],
  ];
}

/** batchUpdate requests: tabs, header style, filters, status colours, widths. */
export function layoutRequests(scheduleSheetId, dashboardSheetId) {
  const headerBg = { red: 0.145, green: 0.22, blue: 0.26 };
  const white = { red: 1, green: 1, blue: 1 };
  return [
    // Header row: dark background, white bold text
    {
      repeatCell: {
        range: { sheetId: scheduleSheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: headerBg,
            textFormat: { foregroundColor: white, bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    // Freeze header + add filter
    {
      updateSheetProperties: {
        properties: { sheetId: scheduleSheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId: scheduleSheetId, startRowIndex: 0, endRowIndex: 1,
            startColumnIndex: 0, endColumnIndex: HEADERS.length,
          },
        },
      },
    },
    // Status colours: scheduled = green, cancelled = red, completed = blue
    ...[
      ['scheduled', { red: 0.85, green: 0.95, blue: 0.87 }],
      ['cancelled', { red: 0.98, green: 0.88, blue: 0.87 }],
      ['completed', { red: 0.87, green: 0.91, blue: 0.97 }],
    ].map(([status, bg]) => ({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: scheduleSheetId, startColumnIndex: 7, endColumnIndex: 8 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: status }] },
            format: { backgroundColor: bg },
          },
        },
        index: 0,
      },
    })),
    // Column widths
    {
      updateDimensionProperties: {
        range: { sheetId: scheduleSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 260 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: scheduleSheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 },
        properties: { pixelSize: 320 },
        fields: 'pixelSize',
      },
    },
    // Dashboard title style
    {
      repeatCell: {
        range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } },
        },
        fields: 'userEnteredFormat(textFormat)',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 2 },
        properties: { pixelSize: 220 },
        fields: 'pixelSize',
      },
    },
  ];
}

export function sheetUrl(id) {
  return `https://docs.google.com/spreadsheets/d/${id}`;
}
