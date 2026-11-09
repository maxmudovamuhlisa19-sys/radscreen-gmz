'use strict';

/**
 * RadSkrin — UI yordamchilari: professional dozometr, silliq grafiklar,
 * interaktiv tooltip, toast, modal, biometrik rPPG to'lqin vizualizatsiyasi.
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
    const icons = {
      ok: '✓',
      info: 'ℹ',
      warn: '⚠',
      error: '✕'
    };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span class="toast-dot">${icons[type] || '•'}</span>
      <div class="toast-content">${msg}</div>
      <button class="toast-close" type="button">✕</button>
      <div class="toast-bar" style="animation-duration:${ms}ms"></div>
    `;
    const closeBtn = el.querySelector('.toast-close');
    if (closeBtn) closeBtn.onclick = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    };

    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      if (el.parentNode) {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
      }
    }, ms);
  }

  /* ------------------------- Dozometr shkalasi (SVG) ------------------------ */
  function gauge(value, maxValue, unit, label) {
    const size = 260, cx = size / 2, cy = size / 2 + 14, r = 98;
    const start = Math.PI * 0.75, end = Math.PI * 2.25; // 270° aylana yoyi
    const t = Math.max(0, Math.min(1, value / maxValue));
    const ang = start + (end - start) * t;

    // Doza darajasiga ko'ra rang gradienti
    let glowColor = '#22c55e';
    if (value > 0.5) glowColor = '#eab308';
    if (value > 1.2) glowColor = '#f97316';
    if (value > 5.0) glowColor = '#ef4444';

    const bgArc = `M ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)} A ${r} ${r} 0 1 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)}`;
    const fgArc = t <= 0.001 ? '' : `M ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)} A ${r} ${r} 0 ${ang - start > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(ang)} ${cy + r * Math.sin(ang)}`;

    // Bo'linmalar (ticks)
    let ticks = '';
    for (let i = 0; i <= 20; i++) {
      const a = start + ((end - start) * i) / 20;
      const isMajor = i % 5 === 0;
      const tickLen = isMajor ? 14 : 7;
      const x0 = cx + (r - 4) * Math.cos(a);
      const y0 = cy + (r - 4) * Math.sin(a);
      const x1 = cx + (r - 4 - tickLen) * Math.cos(a);
      const y1 = cy + (r - 4 - tickLen) * Math.sin(a);
      const tickColor = isMajor ? 'rgba(226,232,240,.7)' : 'rgba(148,163,184,.35)';
      ticks += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${tickColor}" stroke-width="${isMajor ? 2.2 : 1.2}"/>`;
    }

    // Mil uchi (needle dot)
    const nx = cx + (r - 2) * Math.cos(ang);
    const ny = cy + (r - 2) * Math.sin(ang);

    return `
      <svg viewBox="0 0 ${size} ${size}" class="gauge-svg" role="img" aria-label="${label || ''}">
        <defs>
          <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#22c55e" />
            <stop offset="35%" stop-color="#eab308" />
            <stop offset="70%" stop-color="#f97316" />
            <stop offset="100%" stop-color="#ef4444" />
          </linearGradient>
        </defs>

        <!-- Orqa yoy -->
        <path d="${bgArc}" fill="none" stroke="rgba(148,163,184,.14)" stroke-width="16" stroke-linecap="round"/>

        <!-- Qiymat yoyi (glowing) -->
        ${fgArc ? `<path d="${fgArc}" fill="none" stroke="${glowColor}" stroke-width="16" stroke-linecap="round" filter="url(#gaugeGlow)" opacity="0.45"/>` : ''}
        ${fgArc ? `<path d="${fgArc}" fill="none" stroke="${glowColor}" stroke-width="14" stroke-linecap="round" style="transition:all .35s ease"/>` : ''}

        ${ticks}

        <!-- Mil uchi -->
        <circle cx="${nx}" cy="${ny}" r="6.5" fill="#ffffff" stroke="${glowColor}" stroke-width="3" filter="url(#gaugeGlow)" />

        <!-- Markaziy qiymat -->
        <text x="${cx}" y="${cy - 8}" text-anchor="middle" class="gauge-value">${value < 100 ? fmt(value, value < 10 ? 3 : 2) : Math.round(value)}</text>
        <text x="${cx}" y="${cy + 18}" text-anchor="middle" class="gauge-unit">${unit}</text>
        <text x="${cx}" y="${cy + 42}" text-anchor="middle" class="gauge-label">${label || ''}</text>
      </svg>`;
  }

  /* ---------------------------- Chiziqli grafik ----------------------------- */
  /**
   * lineChart(canvas, data[{t,v}], opts)
   * High-DPI, spline egri chiziq, interaktiv tooltip va crosshair bilan.
   */
  const chartListeners = new WeakMap();

  function lineChart(canvas, data, opts = {}) {
    if (!canvas || !data || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 220;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const padL = 46, padR = 14, padT = 16, padB = 28;
    const iw = w - padL - padR, ih = h - padT - padB;
    const maxVal = Math.max(...data.map((d) => d.v), opts.min || 0.1);
    const maxV = maxVal * 1.25;
    const minV = opts.baseline || 0;
    const x = (i) => padL + (iw * i) / (data.length - 1);
    const y = (v) => padT + ih - ((v - minV) / (maxV - minV || 1)) * ih;

    // To'r (Grid lines)
    g.strokeStyle = 'rgba(148,163,184,.10)';
    g.fillStyle = 'rgba(148,163,184,.75)';
    g.font = '10px ui-monospace, monospace';
    g.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const yy = padT + (ih * i) / 4;
      g.beginPath();
      g.moveTo(padL, yy);
      g.lineTo(w - padR, yy);
      g.stroke();
      const v = maxV - ((maxV - minV) * i) / 4;
      g.fillText(v.toFixed(v < 10 ? 2 : 1), 6, yy + 3);
    }

    for (let i = 0; i <= 4; i++) {
      const idx = Math.round(((data.length - 1) * i) / 4);
      const d = new Date(data[idx].t);
      g.fillText(`${pad(d.getHours())}:${pad(d.getMinutes())}`, x(idx) - 14, h - 8);
    }

    // Chegara chizig'i (threshold)
    if (opts.threshold != null && opts.threshold <= maxV) {
      g.strokeStyle = 'rgba(239,68,68,.75)';
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(padL, y(opts.threshold));
      g.lineTo(w - padR, y(opts.threshold));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(248,113,113,.9)';
      g.fillText(`chegara ${opts.threshold} µSv/h`, w - padR - 85, y(opts.threshold) - 5);
    }

    // Silliq egri chiziq (Catmull-Rom spline)
    const points = data.map((d, i) => ({ x: x(i), y: y(d.v), v: d.v, t: d.t }));

    function drawSpline(pts) {
      if (pts.length < 2) return;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i === 0 ? i : i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2 >= pts.length ? i + 1 : i + 2];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    }

    // Maydonni to'ldirish (Gradient)
    const grad = g.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, 'rgba(34,211,238,.32)');
    grad.addColorStop(0.7, 'rgba(34,211,238,.08)');
    grad.addColorStop(1, 'rgba(34,211,238,0)');

    drawSpline(points);
    g.lineTo(points[points.length - 1].x, h - padB);
    g.lineTo(points[0].x, h - padB);
    g.closePath();
    g.fillStyle = grad;
    g.fill();

    // Chiziqning o'zi (neon glow)
    g.save();
    g.shadowColor = 'rgba(34,211,238,.55)';
    g.shadowBlur = 8;
    drawSpline(points);
    g.strokeStyle = opts.color || '#22d3ee';
    g.lineWidth = 2.2;
    g.stroke();
    g.restore();

    // Oxirgi joriy nuqta
    const last = points[points.length - 1];
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(last.x, last.y, 4.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#22d3ee';
    g.lineWidth = 2;
    g.stroke();

    // Tashqi puls halqasi
    g.strokeStyle = 'rgba(34,211,238,.4)';
    g.beginPath();
    g.arc(last.x, last.y, 9, 0, Math.PI * 2);
    g.stroke();

    // Interaktiv kursorni sozlash (hover crosshair & tooltip)
    if (!chartListeners.has(canvas)) {
      let hoveredIndex = -1;

      const handleMove = (e) => {
        const cRect = canvas.getBoundingClientRect();
        const mx = e.clientX - cRect.left;
        if (mx < padL || mx > w - padR) {
          if (hoveredIndex !== -1) {
            hoveredIndex = -1;
            lineChart(canvas, data, opts);
          }
          return;
        }

        // Eng yaqin nuqtani topish
        const ratio = (mx - padL) / iw;
        const targetIdx = Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1))));
        if (targetIdx !== hoveredIndex) {
          hoveredIndex = targetIdx;
          lineChart(canvas, data, { ...opts, activeIndex: hoveredIndex });
        }
      };

      const handleLeave = () => {
        if (hoveredIndex !== -1) {
          hoveredIndex = -1;
          lineChart(canvas, data, opts);
        }
      };

      canvas.addEventListener('mousemove', handleMove);
      canvas.addEventListener('mouseleave', handleLeave);
      chartListeners.set(canvas, { handleMove, handleLeave });
    }

    // Agar kursor nuqta ustida tursa — crosshair va tooltip chizish
    if (opts.activeIndex != null && opts.activeIndex >= 0 && opts.activeIndex < points.length) {
      const activePt = points[opts.activeIndex];
      const d = data[opts.activeIndex];

      // Vertikal chiziq
      g.strokeStyle = 'rgba(255,255,255,.45)';
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(activePt.x, padT);
      g.lineTo(activePt.x, h - padB);
      g.stroke();
      g.setLineDash([]);

      // Nuqta
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(activePt.x, activePt.y, 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#22d3ee';
      g.lineWidth = 3;
      g.stroke();

      // Tooltip qutisi
      const timeTxt = timeStr(d.t);
      const valTxt = `${fmt(d.v, 3)} µSv/h`;
      const ratioTxt = `${(d.v / 0.16).toFixed(1)}× fon`;

      const tipW = 110, tipH = 46;
      let tipX = activePt.x - tipW / 2;
      let tipY = activePt.y - tipH - 10;
      if (tipX < 10) tipX = 10;
      if (tipX + tipW > w - 10) tipX = w - tipW - 10;
      if (tipY < padT) tipY = activePt.y + 12;

      g.fillStyle = 'rgba(15, 23, 42, 0.92)';
      g.strokeStyle = 'rgba(34, 211, 238, 0.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.roundRect(tipX, tipY, tipW, tipH, 6);
      g.fill();
      g.stroke();

      g.fillStyle = '#e2e8f0';
      g.font = 'bold 11px ui-monospace, monospace';
      g.fillText(valTxt, tipX + 8, tipY + 16);
      g.fillStyle = '#94a3b8';
      g.font = '10px "Segoe UI", sans-serif';
      g.fillText(`${timeTxt} · ${ratioTxt}`, tipX + 8, tipY + 34);
    }
  }

  /* ---------------------- rPPG Puls to'lqini (EKG-uslubida) ------------------ */
  /**
   * Biometrik puls to'lqinini kadrlar asosida jonli chizish
   */
  function pulseWave(canvas, buffer, opts = {}) {
    if (!canvas || !buffer || buffer.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 70;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // EKG panjarasi
    g.strokeStyle = 'rgba(34, 197, 94, 0.12)';
    g.lineWidth = 1;
    for (let x = 0; x < w; x += 15) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let y = 0; y < h; y += 15) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }

    // Min va Max qiymatlarni aniqlash
    const min = Math.min(...buffer);
    const max = Math.max(...buffer);
    const range = max - min || 1;

    g.save();
    g.strokeStyle = opts.color || '#22c55e';
    g.lineWidth = 2;
    g.shadowColor = opts.color || '#22c55e';
    g.shadowBlur = 6;
    g.beginPath();

    const step = w / (buffer.length - 1);
    buffer.forEach((val, i) => {
      const px = i * step;
      const norm = (val - min) / range;
      const py = h - 6 - norm * (h - 12);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.stroke();
    g.restore();

    // Oxirgi nuqta (skaner kursor)
    const lastX = w;
    const lastNorm = (buffer[buffer.length - 1] - min) / range;
    const lastY = h - 6 - lastNorm * (h - 12);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(lastX - 2, lastY, 3.5, 0, Math.PI * 2);
    g.fill();
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
    if (m) {
      m.classList.add('open');
      document.body.classList.add('no-scroll');
      if (window.RadAudio) window.RadAudio.playUiClick();
    }
  }

  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.remove('open');
      document.body.classList.remove('no-scroll');
      if (window.RadAudio) window.RadAudio.playUiClick();
    }
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
    `<span class="badge" style="--b:${color}; background:rgba(${hexToRgb(color)},0.15); border:1px solid ${color};">${text}</span>`;

  function hexToRgb(hex) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
  }

  function confirmBox(msg) {
    return window.confirm(msg);
  }

  return {
    $,
    $$,
    fmt,
    dateStr,
    timeStr,
    toast,
    gauge,
    lineChart,
    pulseWave,
    progress,
    openModal,
    closeModal,
    renderRows,
    badge,
    confirmBox
  };
})();
