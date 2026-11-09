'use strict';

/**
 * RadQR — Yengil, mustaqil QR-kod SVG generatori (Zero-dependency)
 * Tibbiy yo'llanmalar va ekspert xulosalarini smartfon orqali tezkor tekshirish uchun.
 */
window.RadQR = (() => {
  // Reed-Solomon Galua maydoni GF(256)
  const GF256_EXP = new Uint8Array(512);
  const GF256_LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF256_EXP[i] = x;
      GF256_EXP[i + 255] = x;
      GF256_LOG[x] = i;
      x <<= 1;
      if (x & 256) x ^= 0x11d;
    }
  })();

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
  }

  function rsGenPoly(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], GF256_EXP[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGenPoly(ecCount);
    const res = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      for (let j = 0; j < ecCount - 1; j++) {
        res[j] = res[j + 1] ^ gfMul(gen[j + 1], factor);
      }
      res[ecCount - 1] = gfMul(gen[ecCount], factor);
    }
    return res;
  }

  // Version 2 (25x25) yoki Version 3 (29x29) QR kod matriksini yaratish
  function generateMatrix(text) {
    const bytes = new TextEncoder().encode(text);
    // V2-M: 25x25, 28 data bytes, 16 EC bytes
    // V3-M: 29x29, 44 data bytes, 26 EC bytes
    const version = bytes.length <= 26 ? 2 : 3;
    const size = version === 2 ? 25 : 29;
    const dataCap = version === 2 ? 28 : 44;
    const ecCount = version === 2 ? 16 : 26;

    // Byte rejimi bit-stream
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    pushBits(0b0100, 4); // Byte mode indicator
    pushBits(bytes.length, 8); // Character count indicator
    for (const b of bytes) pushBits(b, 8);
    // Terminator
    const rem = dataCap * 8 - bits.length;
    for (let i = 0; i < Math.min(4, rem); i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    // Pad bytes
    const padBytes = [0xec, 0x11];
    let pIdx = 0;
    while (bits.length < dataCap * 8) {
      pushBits(padBytes[pIdx % 2], 8);
      pIdx++;
    }

    const dataArr = new Uint8Array(dataCap);
    for (let i = 0; i < dataCap; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      dataArr[i] = b;
    }

    const ecArr = rsEncode(dataArr, ecCount);

    // Matritsani bo'shatish
    const grid = Array.from({ length: size }, () => new Int8Array(size).fill(-1));

    // Finder patterns (3 ta burchakda 7x7)
    const placeFinder = (r0, c0) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBlack = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          grid[r0 + r][c0 + c] = isBlack ? 1 : 0;
        }
      }
      // Separator oq hoshiya
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const gr = r0 + r, gc = c0 + c;
          if (gr >= 0 && gr < size && gc >= 0 && gc < size && grid[gr][gc] === -1) {
            grid[gr][gc] = 0;
          }
        }
      }
    };
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // Alignment pattern (V2 da [18, 18], V3 da [22, 22])
    const alignPos = version === 2 ? 18 : 22;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isB = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        grid[alignPos + r][alignPos + c] = isB ? 1 : 0;
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (grid[6][i] === -1) grid[6][i] = i % 2 === 0 ? 1 : 0;
      if (grid[i][6] === -1) grid[i][6] = i % 2 === 0 ? 1 : 0;
    }
    // Dark module
    grid[4 * version + 9][8] = 1;

    // Format info maydoni (reserved)
    for (let i = 0; i < 9; i++) {
      if (grid[8][i] === -1) grid[8][i] = 0;
      if (grid[i][8] === -1) grid[i][8] = 0;
    }
    for (let i = size - 8; i < size; i++) {
      if (grid[8][i] === -1) grid[8][i] = 0;
      if (grid[i][8] === -1) grid[i][8] = 0;
    }

    // Ma'lumotlarni zigzag joylashtirish
    const allBytes = new Uint8Array(dataCap + ecCount);
    allBytes.set(dataArr, 0);
    allBytes.set(ecArr, dataCap);

    let byteIdx = 0, bitIdx = 7;
    let upward = true;

    for (let c = size - 1; c > 0; c -= 2) {
      if (c === 6) c--; // Timing ustunini aylanib o'tish
      for (let i = 0; i < size; i++) {
        const r = upward ? size - 1 - i : i;
        for (let col = c; col >= c - 1; col--) {
          if (grid[r][col] === -1) {
            let bit = 0;
            if (byteIdx < allBytes.length) {
              bit = (allBytes[byteIdx] >> bitIdx) & 1;
              bitIdx--;
              if (bitIdx < 0) { bitIdx = 7; byteIdx++; }
            }
            // Mask 0: (r + col) % 2 === 0
            if ((r + col) % 2 === 0) bit ^= 1;
            grid[r][col] = bit;
          }
        }
      }
      upward = !upward;
    }

    // Format string (ECC-M, Mask 0 = 0x5412)
    const fmtBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
    const fmtCoords1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const fmtCoords2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
    for (let i = 0; i < 15; i++) {
      grid[fmtCoords1[i][0]][fmtCoords1[i][1]] = fmtBits[i];
      grid[fmtCoords2[i][0]][fmtCoords2[i][1]] = fmtBits[i];
    }

    return { grid, size };
  }

  function toSVG(text, opt = {}) {
    try {
      const { grid, size } = generateMatrix(text);
      const px = opt.size || 120;
      const border = opt.border || 2;
      const total = size + border * 2;
      const fg = opt.fg || '#1e3a8a'; // NMKG ko'k siyohi
      const bg = opt.bg || '#ffffff';

      let rects = '';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (grid[r][c] === 1) {
            rects += `<rect x="${c + border}" y="${r + border}" width="1" height="1" fill="${fg}"/>`;
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" style="border-radius:4px;">
        <rect width="${total}" height="${total}" fill="${bg}"/>
        ${rects}
      </svg>`;
    } catch (err) {
      // Fallback
      return `<svg viewBox="0 0 100 100" width="${opt.size || 100}" height="${opt.size || 100}"><rect width="100" height="100" fill="#f1f5f9"/><text x="50" y="55" font-size="10" text-anchor="middle" fill="#64748b">QR CODE</text></svg>`;
    }
  }

  /**
   * Rasmiy NMKG Tibbiy-Sanitariya Qismi Ko'k Siyohli Dumaloq Muhri (SVG)
   */
  function toStampSVG(docId = 'NMKG-086R') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="130" height="130" style="transform: rotate(-6deg); filter: drop-shadow(1px 1px 1px rgba(30,58,138,0.25));">
      <defs>
        <path id="stampArcTop" d="M 25,100 A 75,75 0 0,1 175,100" fill="none"/>
        <path id="stampArcBottom" d="M 175,100 A 75,75 0 0,1 25,100" fill="none"/>
      </defs>
      <!-- Tashqi va ichki doiralar -->
      <circle cx="100" cy="100" r="94" fill="none" stroke="#1e3a8a" stroke-width="3" stroke-dasharray="8 4"/>
      <circle cx="100" cy="100" r="88" fill="none" stroke="#1e3a8a" stroke-width="2"/>
      <circle cx="100" cy="100" r="60" fill="none" stroke="#1e3a8a" stroke-width="1.5"/>

      <!-- Doiraviy matnlar -->
      <text fill="#1e3a8a" font-size="8.5" font-weight="800" font-family="Arial, sans-serif" letter-spacing="1.2">
        <textPath href="#stampArcTop" startOffset="50%" text-anchor="middle">
          O'ZBEKISTON RESPUBLIKASI SSV
        </textPath>
      </text>
      <text fill="#1e3a8a" font-size="7.5" font-weight="700" font-family="Arial, sans-serif" letter-spacing="0.8">
        <textPath href="#stampArcBottom" startOffset="50%" text-anchor="middle">
          ★ "NMKG" AJ TIBBIY QISMI ★
        </textPath>
      </text>

      <!-- Markazdagi gerbli matn -->
      <g fill="#1e3a8a" text-anchor="middle" font-family="Arial, sans-serif">
        <text x="100" y="82" font-size="14" font-weight="bold">★</text>
        <text x="100" y="97" font-size="8.5" font-weight="900" letter-spacing="1">TASDIQLANDI</text>
        <text x="100" y="110" font-size="7" font-weight="bold">№ 086/R-SHAKL</text>
        <text x="100" y="122" font-size="6.5" font-family="Courier, monospace" font-weight="bold">${docId}</text>
      </g>
    </svg>`;
  }

  return { toSVG, toStampSVG };
})();