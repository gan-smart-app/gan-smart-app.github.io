// JSON backup: export, validation, import preview and apply. Tokens, device
// ids, AI keys and diagnostics are never part of a backup. Imports write
// through the store, so they get queued for sync like any local change.

import { SYNCED_KINDS } from './store.mjs';

export const BACKUP_FORMAT = 'gan-smart-backup';
export const BACKUP_VERSION = 1;
const SECRET = /token|secret|password|apikey|api_key|credential/i;
const PENALTIES = new Set([null, '+2', 'DNF']);

function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!SECRET.test(k)) o[k] = scrub(x);
    return o;
  }
  return v;
}

export async function exportBackup(store, { now = () => new Date() } = {}) {
  const data = {};
  for (const k of SYNCED_KINDS) data[k] = scrub(await store.all(k, { includeDeleted: true }));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now().toISOString(),
    data,
    conflicts: scrub(await store.conflicts()),
  };
}

export function backupFileName(date = new Date()) {
  return 'gan-smart-' + date.toISOString().slice(0, 10) + '.json';
}

function validRecord(kind, r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 200) return 'شناسه ندارد';
  if (kind === 'solves') {
    if (!Number.isFinite(r.rawMs) || r.rawMs < 0 || r.rawMs > 86400000) return 'زمان نامعتبر';
    if (!PENALTIES.has(r.penalty ?? null)) return 'جریمهٔ نامعتبر';
    if (r.moves !== undefined && !Array.isArray(r.moves)) return 'فهرست حرکت نامعتبر';
    if (typeof r.createdAt !== 'string' || Number.isNaN(Date.parse(r.createdAt))) return 'تاریخ نامعتبر';
  }
  return null;
}

// Parses text or object into { ok, errors, data }.
export function validateBackup(input) {
  let obj = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch {
      return { ok: false, errors: ['فایل JSON قابل خواندن نیست.'], data: null };
    }
  }
  if (!obj || obj.format !== BACKUP_FORMAT) return { ok: false, errors: ['این فایل پشتیبان این برنامه نیست.'], data: null };
  if (obj.version > BACKUP_VERSION) return { ok: false, errors: ['نسخهٔ فایل پشتیبان جدیدتر از این برنامه است.'], data: null };
  if (!obj.data || typeof obj.data !== 'object') return { ok: false, errors: ['بخش داده در فایل نیست.'], data: null };
  const errors = [];
  for (const k of Object.keys(obj.data)) if (!SYNCED_KINDS.includes(k)) errors.push('بخش ناشناخته نادیده گرفته شد: ' + k);
  return { ok: true, errors, data: obj.data };
}

const content = (r) => {
  const { rev, updatedAt, deletedAt, ...rest } = r;
  return JSON.stringify(rest, Object.keys(rest).sort());
};

// Classifies each incoming record against local data.
export async function previewImport(store, input) {
  const v = validateBackup(input);
  const counts = { new: 0, duplicate: 0, conflicting: 0, invalid: 0, tombstoned: 0, deletedInFile: 0 };
  const items = [];
  if (!v.ok) return { ok: false, errors: v.errors, counts, items };
  for (const kind of SYNCED_KINDS) {
    const list = v.data[kind];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      v.errors.push('بخش ' + kind + ' فهرست نیست.');
      continue;
    }
    for (const raw of list) {
      const reason = validRecord(kind, raw);
      if (reason) {
        counts.invalid++;
        items.push({ kind, id: raw?.id ?? null, status: 'invalid', reason });
        continue;
      }
      const record = scrub(raw);
      if (record.deleted) {
        counts.deletedInFile++;
        items.push({ kind, id: record.id, status: 'deletedInFile', record });
        continue;
      }
      const local = await store.get(kind, record.id);
      let status;
      if (!local) status = 'new';
      else if (local.deleted) status = 'tombstoned';
      else if (content(local) === content({ ...record, deleted: false })) status = 'duplicate';
      else status = 'conflicting';
      counts[status]++;
      items.push({ kind, id: record.id, status, record });
    }
  }
  return { ok: true, errors: v.errors, counts, items };
}

// Writes new records; conflicting ones only with { conflicting: 'replace' }.
// Duplicates, invalid rows, tombstoned and deleted-in-file rows are skipped.
export async function applyImport(store, preview, { conflicting = 'skip' } = {}) {
  let written = 0;
  for (const it of preview.items) {
    if (it.status === 'new' || (it.status === 'conflicting' && conflicting === 'replace')) {
      const { rev, updatedAt, deleted, deletedAt, ...rec } = it.record;
      if (await store.put(it.kind, rec)) written++;
    }
  }
  return { written };
}
