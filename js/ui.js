'use strict';

/**
 * RadSkrin — UI yordamchilari: dozometr shkalasi, grafiklar, toast, modal, jadvallar
 */
window.UI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (v, d = 2) => Number(v ?? 0).toFixed(d);
  const pad = (n) => String(n).padStart(2, '0');

  const timeStr = (t = Date.now()) => {
    const d = new Date(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const dateStr = (t = Date.now()) => {
    const d = new Date(t);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  /* --------------------------------- Toast --------------------------------- */
  function toast(msg, type = 'info', ms = 3800) {
    let box = $('#toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-dot"></span><span>${msg}</span>`;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  /* ------------------------- Dozometr shkalasi (SVG) ------------------------ */
  function gauge(value, maxValue, unit, label) {
    const size = 240, cx = size / 2, cy = size / 2 + 10, r = 92;
    const start = Math.PI * 0.75, end = Math.PI * 2.25; // 270°
    const t = Math.max(0, Math.min(1, value / maxValue));
    const ang = start + (end - start) * t;

    const pt = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const arc = (a0, a1, rad) => {
      const [x0, y0] = pt.call(null, a0);
      const [x1, y1] = pt.call(null, a1);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      return `M ${cx + rad * Math.cos(a0)} ${cy + rad * Math.sin(a0)} A ${rad} ${rad} 0 ${large} 1 ${cx + rad * Math.cos(a1)} ${cy + rad * Math.sin(a1)}`;
    };

    const bg = `M ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)} A ${r} ${r} 0 1 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)}`;
    const fg = t <= 0.001 ? '' : `M ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)} A ${r} ${r} 0 ${ang - start > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(ang)} ${cy + r * Math.sin(ang)}`;

    // bo'linmalar
    let ticks = '';
    for (let i = 0; i <= 10; i++) {
      const a = start + ((end - start) * i) / 10;
      const x0 = cx + (r - 7) * Math.cos(a), y0 = cy + (r - 7) * Math.sin(a);
      const x1 = cx + (r - (i % 5 === 0 ? 16 : 11)) * Math.cos(a);
      const y1 = cy + (r - (i % 5 === 0 ? 16 : 11)) * Math.sin(a);
      ticks += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="rgba(148,163,184,.55)" stroke-width="${i % 5 === 0 ? 2 : 1}"/>`;
    }

    return `
      <svg viewBox="0 0 ${size} ${size}" class="gauge-svg" role="img" aria-label="${label || ''}">
        <path d="${bg}" fill="none" stroke="rgba(148,163,184,.18)" stroke-width="16" stroke-linecap="round"/>
        <path d="${fg}" fill="none" stroke="var(--gauge-color,#22c55e)" stroke-width="16" stroke-linecap="round" style="transition:d .5s"/>
        ${ticks}
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="gauge-value">${value < 100 ? fmt(value, value < 10 ? 3 : 2) : Math.round(value)}</text>
        <text x="${cx}" y="${cy + 20}" text-anchor="middle" class="gauge-unit">${unit}</text>
        <text x="${cx}" y="${cy + 46}" text-anchor="middle" class="gauge-label">${label || ''}</text>
      </svg>`;
  }

  /* ---------------------------- Chiziqli grafik ----------------------------- */
  /**
   * lineChart(canvas, data[{t,v}], opts)
   */
  function lineChart(canvas, data, opts = {}) {
    if (!canvas || !data || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 220;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const padL = 46, padR = 12, padT = 14, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    const maxV = Math.max(...data.map((d) => d.v), opts.min || 0.1) * 1.15;
    const minV = opts.baseline || 0;
    const x = (i) => padL + (iw * i) / (data.length - 1);
    const y = (v) => padT + ih - ((v - minV) / (maxV - minV)) * ih;

    // background grid
    g.strokeStyle = 'rgba(148,163,184,.14)';
    g.fillStyle = 'rgba(148,163,184,.75)';
    g.font = '11px ui-monospace, monospace';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = padT + (ih * i) / 4;
      g.beginPath(); g.moveTo(padL, yy); g.lineTo(w - padR, yy); g.stroke();
      const v = maxV - ((maxV - minV) * i) / 4;
      g.fillText(v.toFixed(v < 10 ? 2 : 1), 6, yy + 4);
    }
    for (let i = 0; i <= 4; i++) {
      const idx = Math.round(((data.length - 1) * i) / 4);
      const d = new Date(data[idx].t);
      g.fillText(`${pad(d.getHours())}:${pad(d.getMinutes())}`, x(idx) - 14, h - 8);
    }

    // chegara chizig'i (fon)
    if (opts.threshold != null && opts.threshold <= maxV) {
      g.strokeStyle = 'rgba(239,68,68,.7)';
      g.setLineDash([6, 5]);
      g.beginPath(); g.moveTo(padL, y(opts.threshold)); g.lineTo(w - padR, y(opts.threshold)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(248,113,113,.9)';
      g.fillText('chegara', w - padR - 48, y(opts.threshold) - 5);
    }

    // maydon
    const grad = g.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, 'rgba(34,211,238,.35)');
    grad.addColorStop(1, 'rgba(34,211,238,0)');
    g.beginPath();
    data.forEach((d, i) => (i ? g.lineTo(x(i), y(d.v)) : g.moveTo(x(i), y(d.v))));
    g.lineTo(x(data.length - 1), h - padB);
    g.lineTo(x(0), h - padB);
    g.closePath();
    g.fillStyle = grad; g.fill();

    // chiziq
    g.beginPath();
    data.forEach((d, i) => (i ? g.lineTo(x(i), y(d.v)) : g.moveTo(x(i), y(d.v))));
    g.strokeStyle = opts.color || '#22d3ee';
    g.lineWidth = 2;
    g.stroke();

    // oxirgi nuqta
    const last = data[data.length - 1];
    g.fillStyle = opts.color || '#22d3ee';
    g.beginPath(); g.arc(x(data.length - 1), y(last.v), 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(34,211,238,.35)';
    g.beginPath(); g.arc(x(data.length - 1), y(last.v), 9, 0, Math.PI * 2); g.stroke();
  }

  /* -------------------------------- Progress -------------------------------- */
  function progress(el, pct, color) {
    if (!el) return;
    el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (color) el.style.background = color;
  }

  /* --------------------------------- Modal ---------------------------------- */
  function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('open'); document.body.classList.add('no-scroll'); }
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove('open'); document.body.classList.remove('no-scroll'); }
  }

  /* ------------------------------- Jadvallar -------------------------------- */
  function renderRows(tbody, rows, cols, emptyText = "Ma'lumot yo'q") {
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="empty">${emptyText}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map((r) => `<tr>${cols.map((c) => `<td>${c.render(r)}</td>`).join('')}</tr>`)
      .join('');
  }

  const badge = (text, color) =>
    `<span class="badge" style="--b:${color}">${text}</span>`;

  function confirmBox(msg) {
    return window.confirm(msg);
  }

  return { $, $$, fmt, dateStr, timeStr, toast, gauge, lineChart, progress, openModal, closeModal, renderRows, badge, confirmBox };
})();
