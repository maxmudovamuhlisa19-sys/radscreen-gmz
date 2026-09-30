'use strict';

/**
 * RadSkrin — ma'lumotlar ombori
 * Avval server API (/api/...), agar javob bo'lmasa — localStorage fallback.
 */
window.Store = (() => {
  const LS = {
    patients: 'radscreen_patients',
    referrals: 'radscreen_referrals'
  };

  const lsGet = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
  };
  const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const authHeaders = () => {
    const t = window.Auth && window.Auth.getToken ? window.Auth.getToken() : '';
    return t ? { Authorization: 'Bearer ' + t } : {};
  };

  async function req(method, path, body) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      clearTimeout(to);
      if (res.status === 401) {
        const e = new Error('Kirish talab qilinadi');
        e.auth = true;
        if (window.Auth && window.Auth.onUnauthorized) window.Auth.onUnauthorized();
        throw e;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      clearTimeout(to);
      throw e;
    }
  }

  const fallback = (e, fn) => {
    if (e && e.auth) throw e;   // sessiya tugagan — localStorage ga yozmaymiz
    return fn();
  };

  function make(resource, lsKey) {
    return {
      async list() {
        try { return await req('GET', `/api/${resource}`); }
        catch (e) { return fallback(e, () => lsGet(lsKey)); }
      },
      async create(data) {
        try { return await req('POST', `/api/${resource}`, data); }
        catch (e) {
          return fallback(e, () => {
            const rows = lsGet(lsKey);
            const row = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), createdAt: new Date().toISOString(), ...data };
            rows.push(row); lsSet(lsKey, rows); return row;
          });
        }
      },
      async update(id, patch) {
        try { return await req('PATCH', `/api/${resource}/${id}`, patch); }
        catch (e) {
          return fallback(e, () => {
            const rows = lsGet(lsKey);
            const i = rows.findIndex((r) => r.id === id);
            if (i === -1) return null;
            rows[i] = { ...rows[i], ...patch, updatedAt: new Date().toISOString() };
            lsSet(lsKey, rows); return rows[i];
          });
        }
      },
      async remove(id) {
        try { return await req('DELETE', `/api/${resource}/${id}`); }
        catch (e) {
          return fallback(e, () => {
            lsSet(lsKey, lsGet(lsKey).filter((r) => r.id !== id));
            return { ok: true };
          });
        }
      },
      async clear() {
        try {
          const rows = await this.list();
          await Promise.all(rows.map((r) => this.remove(r.id)));
        } catch (e) {
          if (e && e.auth) throw e;
          lsSet(lsKey, []);
        }
      }
    };
  }

  return {
    patients: make('patients', LS.patients),
    referrals: make('referrals', LS.referrals),

    /** CSV eksport */
    exportCsv(rows, filename) {
      if (!rows || !rows.length) return false;
      const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object');
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = '﻿' + [keys.join(';'), ...rows.map((r) => keys.map((k) => esc(r[k])).join(';'))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      return true;
    }
  };
})();
