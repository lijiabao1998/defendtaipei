// Procedural canvas textures and shared materials for the city:
// walls (painted render / 二丁掛 tiles with 鐵窗 windows and grime), roads, ground, shop signs and loot containers.
import * as THREE from 'three';
import { shrink } from './texq';

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(shrink(cv));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const WALLC = ['#c9c1b0', '#b8b4a8', '#d8cfbd', '#a9a397', '#c4b49c', '#9fa7a8', '#d1c6b8'];
const wallTexs = WALLC.map((col, wi) =>
  canvasTex(256, 256, c => {
    const tile = wi % 2 === 0; // 二丁掛 tile facades vs. painted render
    c.fillStyle = col;
    c.fillRect(0, 0, 256, 256);
    // v24.18 from street photos: old shop-houses in red brick, and in small white tile (小口磚) with dark grout
    if (wi === 3) {
      c.fillStyle = '#9c8f7e';
      c.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 43; r++)
        for (let k = -1; k < 14; k++) {
          const v = 128 + Math.random() * 44;
          c.fillStyle = `rgb(${v},${v * 0.44},${v * 0.31})`;
          c.fillRect(k * 19 + (r % 2 ? 9 : 0), r * 6, 18, 5);
        }
    } else if (wi === 5) {
      c.fillStyle = '#7f7f78';
      c.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 32; r++)
        for (let k = 0; k < 32; k++) {
          const v = 212 + Math.random() * 30;
          c.fillStyle = `rgb(${v},${v},${v - 6})`;
          c.fillRect(k * 8, r * 8, 7, 7);
        }
    }
    if (tile) {
      c.strokeStyle = 'rgba(70,60,50,.35)';
      c.lineWidth = 1;
      for (let y = 0; y < 256; y += 8) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(256, y);
        c.stroke();
        for (let x = (y / 8) % 2 ? 0 : 12; x < 256; x += 24) {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + 8);
          c.stroke();
        }
      }
      for (let k = 0; k < 40; k++) {
        c.fillStyle = 'rgba(120,120,115,.9)';
        c.fillRect(Math.floor(Math.random() * 10) * 24, Math.floor(Math.random() * 32) * 8, 24, 8);
      }
    } // missing tiles
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(${Math.random() < 0.7 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`;
      c.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 4);
    }
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * 256,
        y0 = Math.random() * 120,
        w = 2 + Math.random() * 10,
        h = 40 + Math.random() * 180;
      const g = c.createLinearGradient(0, y0, 0, y0 + h);
      g.addColorStop(0, 'rgba(40,36,28,.38)');
      g.addColorStop(1, 'rgba(40,36,28,0)');
      c.fillStyle = g;
      c.fillRect(x, y0, w, h);
    } // rain streaks
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * 220,
        y = Math.random() * 220,
        r = 8 + Math.random() * 26;
      c.fillStyle = '#8f8a82';
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2,
          rr = r * (0.5 + Math.random() * 0.6);
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7);
      }
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,.25)';
      c.stroke();
    } // peeling plaster
    const g2 = c.createLinearGradient(0, 190, 0, 256);
    g2.addColorStop(0, 'rgba(30,40,25,0)');
    g2.addColorStop(1, 'rgba(30,40,25,.55)');
    c.fillStyle = g2;
    c.fillRect(0, 190, 256, 66); // damp / mould at base
    // window with rusty iron bars (鐵窗); some broken
    const broken = wi % 3 === 1;
    c.fillStyle = '#1e252c';
    c.fillRect(60, 46, 136, 108);
    c.fillStyle = broken ? '#20262c' : '#4e6478';
    c.fillRect(66, 52, 124, 96);
    if (broken) {
      c.fillStyle = '#0c0e10';
      c.beginPath();
      c.moveTo(80, 60);
      c.lineTo(150, 70);
      c.lineTo(120, 130);
      c.lineTo(90, 110);
      c.fill();
      c.strokeStyle = 'rgba(200,220,235,.7)';
      c.lineWidth = 1;
      for (let k = 0; k < 10; k++) {
        c.beginPath();
        c.moveTo(120, 95);
        c.lineTo(120 + (Math.random() - 0.5) * 120, 95 + (Math.random() - 0.5) * 90);
        c.stroke();
      }
      c.fillStyle = '#5a6a7a';
      c.fillRect(150, 52, 40, 96);
    } else {
      c.fillStyle = 'rgba(255,255,255,.12)';
      c.fillRect(70, 56, 30, 88);
    }
    c.strokeStyle = '#5a3018';
    c.lineWidth = 5;
    c.strokeRect(54, 40, 148, 120);
    c.lineWidth = 3;
    for (let x = 66; x < 200; x += 14) {
      c.beginPath();
      c.moveTo(x, 40);
      c.lineTo(x, 160);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(54, 100);
    c.lineTo(202, 100);
    c.stroke();
    // long-term grime: grey cement-dust streaks under the sill, black water stains from the slab edge, rust bleeding from the 鐵窗
    for (let i = 0; i < 26; i++) {
      const x = 50 + Math.random() * 160;
      const g = c.createLinearGradient(0, 158, 0, 256);
      g.addColorStop(0, 'rgba(105,100,92,.55)');
      g.addColorStop(1, 'rgba(105,100,92,0)');
      c.fillStyle = g;
      c.fillRect(x, 158, 1 + Math.random() * 5, 40 + Math.random() * 98);
    }
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * 256;
      const g = c.createLinearGradient(0, 0, 0, 90);
      g.addColorStop(0, 'rgba(20,20,18,.6)');
      g.addColorStop(1, 'rgba(20,20,18,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 6 + Math.random() * 14, 0);
      c.lineTo(x + 3 + Math.random() * 4, 30 + Math.random() * 60);
      c.fill();
    }
    {
      const g = c.createLinearGradient(0, 0, 0, 18);
      g.addColorStop(0, 'rgba(25,25,22,.7)');
      g.addColorStop(1, 'rgba(25,25,22,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 18);
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * 230,
        y = 165 + Math.random() * 60;
      c.fillStyle = 'rgba(60,55,50,.25)';
      c.beginPath();
      c.ellipse(x, y, 10 + Math.random() * 18, 6 + Math.random() * 10, 0, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 9; i++) {
      const x = 56 + Math.random() * 146;
      const g = c.createLinearGradient(0, 160, 0, 230);
      g.addColorStop(0, 'rgba(120,60,20,.6)');
      g.addColorStop(1, 'rgba(120,60,20,0)');
      c.fillStyle = g;
      c.fillRect(x, 160, 2 + Math.random() * 3, 30 + Math.random() * 60);
    } // rust drips
  }),
);
export const wallMats = wallTexs.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
export const wallMatsT = wallTexs.map(
  t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false }),
);
export const tinMat = new THREE.MeshStandardMaterial({ color: 0x7f9fb0, roughness: 0.6, metalness: 0.3 });
export const tankMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5, metalness: 0.4 });
export const floorMat = new THREE.MeshStandardMaterial({
  map: canvasTex(64, 64, c => {
    c.fillStyle = '#b9ad98';
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = '#8f8572';
    c.strokeRect(0, 0, 32, 32);
    c.strokeRect(32, 32, 32, 32);
    c.strokeRect(0, 32, 32, 32);
    c.strokeRect(32, 0, 32, 32);
  }),
  side: THREE.DoubleSide,
});
export const roadTex = canvasTex(256, 256, c => {
  c.fillStyle = '#3c3e41';
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`;
    c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  for (let i = 0; i < 5; i++) {
    c.fillStyle = `rgba(${20 + Math.random() * 30},${20 + Math.random() * 30},${25 + Math.random() * 30},.6)`;
    c.fillRect(Math.random() * 220, Math.random() * 220, 20 + Math.random() * 60, 15 + Math.random() * 40);
  } // asphalt patches
  c.strokeStyle = 'rgba(25,25,25,.22)';
  c.lineWidth = 0.7;
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * 256,
      y = Math.random() * 256;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (Math.random() - 0.5) * 14;
      y += (Math.random() - 0.5) * 14;
      c.lineTo(x, y);
    }
    c.stroke();
  } // hairline cracks
  for (let i = 0; i < 6; i++) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 20);
    g.addColorStop(0, 'rgba(10,10,12,.16)');
    g.addColorStop(1, 'rgba(10,10,12,0)');
    c.save();
    c.translate(Math.random() * 256, Math.random() * 256);
    c.scale(1, 0.6);
    c.fillStyle = g;
    c.fillRect(-20, -20, 40, 40);
    c.restore();
  }
}); // oil stains
export const groundTex = canvasTex(256, 256, c => {
  c.fillStyle = '#55565a';
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`;
    c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  for (let i = 0; i < 7; i++) {
    c.fillStyle = `rgba(${95 + Math.random() * 30},${95 + Math.random() * 25},${90 + Math.random() * 20},.55)`;
    c.fillRect(Math.random() * 230, Math.random() * 230, 20 + Math.random() * 70, 15 + Math.random() * 50);
  } // poured-cement patches
  c.strokeStyle = 'rgba(20,20,20,.2)';
  c.lineWidth = 0.7;
  for (let i = 0; i < 10; i++) {
    let x = Math.random() * 256,
      y = Math.random() * 256;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (Math.random() - 0.5) * 30;
      y += (Math.random() - 0.5) * 30;
      c.lineTo(x, y);
    }
    c.stroke();
  }
});
export const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
export const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });

// shop signs (parody names)
const SIGN: Record<string, [string, string, string]> = {
  store: ['7-12', '#e8eef0', '#d23a1e'],
  pharmacy: ['康是福藥局', '#1d8a5a', '#ffffff'],
  police: ['派出所', '#1d3f8a', '#ffffff'],
};
export const signTex: Record<string, THREE.Texture> = {};
for (const k in SIGN) {
  const [t, bg, fg] = SIGN[k];
  signTex[k] = canvasTex(256, 64, c => {
    c.fillStyle = bg;
    c.fillRect(0, 0, 256, 64);
    if (k === 'store') {
      c.fillStyle = '#f08a1c';
      c.fillRect(0, 0, 256, 10);
      c.fillStyle = '#1c9a4a';
      c.fillRect(0, 54, 256, 10);
    }
    c.fillStyle = fg;
    c.font = 'bold 40px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t, 128, 34);
  });
}
export const b2sign: Record<string, [string, string, string]> = {
  store: ['7-12', '', ''],
  pharmacy: ['', '', ''],
  grocery: ['金來雜貨店', '#b8241c', '#fff2a0'],
  breakfast: ['晨光早餐', '#f2a81c', '#7a1a10'],
  betel: ['檳榔・香菸', '#111111', '#33ff66'],
  market: ['全民福利超市', '#1a4aa8', '#ffffff'],
  hardware: ['永興五金行', '#f0c020', '#1a1a1a'],
};
export const extraSign: Record<string, THREE.Texture> = {};
const PARODY = [
  '阿嬤小吃',
  '金萬華當舖',
  '老牌麵線',
  '西門電玩',
  '幸福理容',
  '大眾五金',
  '青草茶',
  '鐘錶行',
  '刺青',
  '金紙香舖',
];
export const shopSignTex = PARODY.map((t, i) =>
  canvasTex(256, 64, c => {
    c.fillStyle = ['#a8221e', '#20344f', '#c9971c', '#6a2a8a', '#2a6a3a'][i % 5];
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#fff6d0';
    c.font = 'bold 38px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t, 128, 34);
  }),
);

// loot container materials
export const contMat = {
  shelf: new THREE.MeshStandardMaterial({ color: 0xd9d9d9 }),
  fridge: new THREE.MeshStandardMaterial({ color: 0xeef4f8, roughness: 0.3 }),
  cab: new THREE.MeshStandardMaterial({ color: 0x8a5a34 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x4f5a2a }),
};
