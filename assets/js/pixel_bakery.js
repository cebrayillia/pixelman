(function(){
  'use strict';
  const PSO = window.PSO = window.PSO || {};

  // Color manipulation helpers for crisp 16/32-bit pixel shading & dithering
  function hexToRgb(hex){
    const n = parseInt(hex.replace('#',''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt){
    const [r,g,b] = hexToRgb(hex);
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
    return `rgb(${clamp(r+amt)},${clamp(g+amt)},${clamp(b+amt)})`;
  }
  function makeCanvas(w, h, drawFn){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    drawFn(x, w, h);
    return c;
  }
  // 1px dark outline pass around non-transparent pixels for authentic crisp pixel art!
  function addOutline(c, outlineCol='#06070d'){
    const w = c.width, h = c.height;
    const x = c.getContext('2d');
    const src = x.getImageData(0, 0, w, h);
    const out = makeCanvas(w, h, ox => {
      ox.fillStyle = outlineCol;
      const d = src.data;
      const isSolid = (px, py) => px>=0 && py>=0 && px<w && py<h && d[(py*w+px)*4+3] > 20;
      for(let y=0; y<h; y++){
        for(let x0=0; x0<w; x0++){
          if(isSolid(x0, y)) continue;
          if(isSolid(x0-1,y) || isSolid(x0+1,y) || isSolid(x0,y-1) || isSolid(x0,y+1)){
            ox.fillRect(x0, y, 1, 1);
          }
        }
      }
      ox.drawImage(c, 0, 0);
    });
    return out;
  }

  const Bakery = PSO.Bakery = {
    tiles: {},
    props: {},
    weapons: [],
    avatars: [],
    coins: [],
    medkits: {},
    ready: false
  };

  // =========================================================================
  // 1. HIGH-DENSITY 32x32 BIOME TILEMAPS (WITH BEVELS, CRACKS & DITHERING)
  // =========================================================================
  function bakeTiles(){
    // Exterior Street Asphalt + Concrete Sidewalk Curb
    Bakery.tiles.exterior = makeCanvas(32, 32, x => {
      x.fillStyle = '#181c29'; x.fillRect(0,0,32,32);
      // Concrete curb top with highlight & shadow bevel
      x.fillStyle = '#94a3b8'; x.fillRect(0,0,32,2);
      x.fillStyle = '#64748b'; x.fillRect(0,2,32,4);
      x.fillStyle = '#334155'; x.fillRect(0,6,32,2);
      x.fillStyle = '#475569'; x.fillRect(15,0,2,7); // Curb joint
      // Asphalt dithered grain & crack
      for(let y=8;y<32;y+=2) for(let i=0;i<32;i+=2){
        if(((i*7 + y*13) % 11) === 0){ x.fillStyle='#252c40'; x.fillRect(i,y,2,1); }
        else if(((i*5 + y*17) % 13) === 0){ x.fillStyle='#10131e'; x.fillRect(i,y,1,2); }
      }
      // Yellow painted road dash
      x.fillStyle = '#ca8a04'; x.fillRect(4,16,14,3);
      x.fillStyle = '#facc15'; x.fillRect(5,16,12,2);
    });

    // Exterior Building Brick Wall (32x32 dense staggered masonry)
    Bakery.tiles.brick = makeCanvas(32, 32, x => {
      x.fillStyle = '#151826'; x.fillRect(0,0,32,32); // Mortar
      const cols = ['#2b324d','#323a59','#262c45','#384163'];
      for(let r=0; r<4; r++){
        const off = (r % 2) * 8;
        for(let c=-1; c<3; c++){
          const bx = c*16 + off + 1, by = r*8 + 1;
          const col = cols[(r*3 + c + 4) % cols.length];
          x.fillStyle = col; x.fillRect(bx, by, 14, 6);
          x.fillStyle = shade(col, 20); x.fillRect(bx, by, 14, 1);
          x.fillStyle = shade(col, -18); x.fillRect(bx, by+5, 14, 1);
        }
      }
    });

    // Corporate Office Polished Floor Tile
    Bakery.tiles.office = makeCanvas(32, 32, x => {
      x.fillStyle = '#1e293b'; x.fillRect(0,0,32,32);
      x.fillStyle = '#94a3b8'; x.fillRect(0,0,32,2);
      x.fillStyle = '#475569'; x.fillRect(0,2,32,4);
      x.fillStyle = '#334155'; x.fillRect(1,7,14,11); x.fillRect(17,19,14,12);
      x.fillStyle = '#293548'; x.fillRect(17,7,14,11); x.fillRect(1,19,14,12);
      // Specular sheen
      x.fillStyle = 'rgba(224,242,254,0.12)'; x.fillRect(2,8,10,2); x.fillRect(18,20,10,2);
    });

    // Academy / School Checkered Floor
    Bakery.tiles.school = makeCanvas(32, 32, x => {
      x.fillStyle = '#2d293b'; x.fillRect(0,0,32,32);
      x.fillStyle = '#e2e8f0'; x.fillRect(0,0,32,2);
      x.fillStyle = '#94a3b8'; x.fillRect(0,2,32,3);
      for(let r=0;r<2;r++) for(let c=0;c<2;c++){
        x.fillStyle = (r+c)%2 ? '#4c465e' : '#353042';
        x.fillRect(c*16, 6+r*13, 16, 13);
        x.fillStyle = 'rgba(255,255,255,0.06)';
        x.fillRect(c*16+1, 7+r*13, 14, 2);
      }
    });

    // Grand Hotel Crimson Carpet & Gold Brass Trim
    Bakery.tiles.hotel = makeCanvas(32, 32, x => {
      x.fillStyle = '#3b0910'; x.fillRect(0,0,32,32);
      x.fillStyle = '#dc2626'; x.fillRect(0,0,32,4);
      x.fillStyle = '#facc15'; x.fillRect(0,4,32,2);
      x.fillStyle = '#854d0e'; x.fillRect(0,6,32,1);
      // Carpet diamond embroidery
      x.fillStyle = '#7f1d1d'; x.fillRect(4,10,10,10); x.fillRect(18,18,10,10);
      x.fillStyle = '#b45309'; x.fillRect(8,14,2,2); x.fillRect(22,22,2,2);
    });

    // Underground Crystal Mine Stone & Ore Veins
    Bakery.tiles.mine = makeCanvas(32, 32, x => {
      x.fillStyle = '#1c1917'; x.fillRect(0,0,32,32);
      x.fillStyle = '#78716c'; x.fillRect(0,0,32,2);
      x.fillStyle = '#57534e'; x.fillRect(0,2,32,4);
      // Irregular stone blocks
      x.fillStyle = '#3d3733'; x.fillRect(1,7,13,10); x.fillRect(16,8,15,12); x.fillRect(2,19,17,11); x.fillRect(21,22,10,9);
      x.fillStyle = '#524b46'; x.fillRect(2,8,11,2); x.fillRect(17,9,13,2); x.fillRect(3,20,15,2);
      // Glowing cyan & gold ore pixels
      x.fillStyle = '#22d3ee'; x.fillRect(6,11,3,3); x.fillStyle = '#cffafe'; x.fillRect(7,11,1,1);
      x.fillStyle = '#f59e0b'; x.fillRect(23,14,3,2); x.fillStyle = '#fef08a'; x.fillRect(24,14,1,1);
    });

    // Underground Metro Platform Concrete & Yellow Tactile Safety Strip
    Bakery.tiles.metro = makeCanvas(32, 32, x => {
      x.fillStyle = '#151d28'; x.fillRect(0,0,32,32);
      x.fillStyle = '#fde047'; x.fillRect(0,0,32,5);
      x.fillStyle = '#a16207';
      for(let i=2;i<32;i+=4){ x.fillRect(i,1,2,1); x.fillRect(i,3,2,1); }
      x.fillStyle = '#334155'; x.fillRect(0,5,32,2);
      x.fillStyle = '#253142'; x.fillRect(1,8,14,11); x.fillRect(17,8,14,11); x.fillRect(8,21,16,10);
      x.fillStyle = '#1e293b'; x.fillRect(0,19,32,2);
    });

    // Boss Arena Obsidian & Glowing Runes
    Bakery.tiles.boss = makeCanvas(32, 32, x => {
      x.fillStyle = '#12081a'; x.fillRect(0,0,32,32);
      x.fillStyle = '#f43f5e'; x.fillRect(0,0,32,2);
      x.fillStyle = '#4c1d95'; x.fillRect(0,2,32,4);
      x.fillStyle = '#241236'; x.fillRect(1,7,14,12); x.fillRect(17,7,14,12); x.fillRect(1,21,30,10);
      x.fillStyle = '#be123c'; x.fillRect(7,12,2,2); x.fillRect(23,12,2,2);
    });
  }

  // =========================================================================
  // 2. 40 INDIVIDUALLY BAKED HIGH-DETAIL PIXEL WEAPON SPRITES (52x26 px)
  // =========================================================================
  function bakeWeapons(){
    Bakery.weapons = PSO.WEAPONS.map(wp => {
      const elCol = PSO.ELEMENTS[wp.element].color;
      const hiCol = shade(wp.edgeCol, 45);
      const shCol = shade(wp.edgeCol, -45);
      const raw = makeCanvas(54, 28, x => {
        const cy = 14;
        // 1. Pommel & Wrapped Grip
        x.fillStyle = '#facc15'; x.fillRect(2, cy-2, 3, 4);
        x.fillStyle = '#334155'; x.fillRect(5, cy-2, 8, 4);
        x.fillStyle = '#1e293b'; x.fillRect(7, cy-2, 1, 4); x.fillRect(10, cy-2, 1, 4);

        // 2. Guard Geometry by guardStyle
        x.fillStyle = wp.rarity >= 4 ? '#facc15' : '#94a3b8';
        if(wp.guard === 'wing'){
          x.fillRect(12, cy-7, 4, 14); x.fillRect(15, cy-9, 3, 4); x.fillRect(15, cy+5, 3, 4);
        } else if(wp.guard === 'flame'){
          x.fillStyle = '#f97316'; x.fillRect(12, cy-6, 4, 12); x.fillStyle='#fef08a'; x.fillRect(13, cy-4, 2, 8);
        } else if(wp.guard === 'tech'){
          x.fillStyle = '#1e293b'; x.fillRect(12, cy-6, 5, 12); x.fillStyle = elCol; x.fillRect(14, cy-4, 2, 8);
        } else if(wp.guard === 'tsuba'){
          x.fillRect(13, cy-5, 2, 10);
        } else {
          x.fillRect(12, cy-5, 3, 10);
        }

        // 3. Blade / Head Geometry by Weapon Class (High-Density Pixel Detail)
        if(wp.type === 'dagger'){
          x.fillStyle = shCol; x.fillRect(15, cy-3, 16, 6);
          x.fillStyle = wp.edgeCol; x.fillRect(15, cy-3, 16, 3);
          x.fillStyle = hiCol; x.fillRect(16, cy-2, 14, 1);
          x.fillStyle = wp.coreCol; x.fillRect(17, cy, 10, 1);
          x.fillStyle = wp.edgeCol; x.fillRect(31, cy-2, 3, 4); x.fillRect(34, cy-1, 3, 2);
        }
        else if(wp.type === 'katana'){
          // Subtle upward pixel curve!
          for(let i=0;i<32;i++){
            const curve = i > 18 ? -Math.floor((i-18)/6) : 0;
            x.fillStyle = shCol; x.fillRect(15+i, cy-1+curve, 1, 3);
            x.fillStyle = hiCol; x.fillRect(15+i, cy-2+curve, 1, 2);
            if(wp.rarity>=3 && i%5===0){ x.fillStyle = elCol; x.fillRect(15+i, cy+curve, 2, 1); }
          }
          x.fillStyle = '#fff'; x.fillRect(47, cy-4, 3, 2);
        }
        else if(wp.type === 'blade'){
          x.fillStyle = shCol; x.fillRect(15, cy-4, 26, 8);
          x.fillStyle = wp.edgeCol; x.fillRect(15, cy-4, 26, 4);
          x.fillStyle = hiCol; x.fillRect(16, cy-3, 24, 1);
          x.fillStyle = wp.coreCol; x.fillRect(17, cy-1, 20, 2); // Fuller groove
          if(wp.rarity >= 4){ x.fillStyle = elCol; for(let r=19;r<36;r+=4) x.fillRect(r, cy-1, 2, 2); }
          x.fillStyle = wp.edgeCol; x.fillRect(41, cy-3, 4, 6); x.fillRect(45, cy-2, 4, 4); x.fillRect(49, cy-1, 3, 2);
        }
        else if(wp.type === 'cyber'){
          x.fillStyle = '#0f172a'; x.fillRect(16, cy-4, 27, 8);
          x.fillStyle = wp.edgeCol; x.fillRect(17, cy-4, 26, 2); x.fillRect(17, cy+2, 24, 2);
          x.fillStyle = elCol; x.fillRect(18, cy-1, 23, 2);
          x.fillStyle = '#fff'; x.fillRect(20, cy-1, 18, 1);
          x.fillStyle = wp.edgeCol; x.fillRect(43, cy-3, 4, 5); x.fillRect(47, cy-2, 4, 3);
        }
        else if(wp.type === 'spear'){
          x.fillStyle = '#78350f'; x.fillRect(2, cy-1, 32, 3);
          x.fillStyle = '#b45309'; x.fillRect(2, cy-1, 32, 1);
          x.fillStyle = '#facc15'; x.fillRect(32, cy-3, 3, 6);
          x.fillStyle = shCol; x.fillRect(35, cy-5, 10, 10);
          x.fillStyle = wp.edgeCol; x.fillRect(35, cy-5, 10, 5);
          x.fillStyle = hiCol; x.fillRect(36, cy-3, 9, 2);
          x.fillStyle = wp.edgeCol; x.fillRect(45, cy-3, 4, 6); x.fillRect(49, cy-1, 4, 2);
        }
        else if(wp.type === 'axe'){
          x.fillStyle = '#78350f'; x.fillRect(3, cy-2, 30, 4);
          x.fillStyle = '#a16207'; x.fillRect(3, cy-2, 30, 1);
          // Double-bit / curved battle axe blade
          x.fillStyle = shCol; x.fillRect(24, cy-11, 15, 22);
          x.fillStyle = wp.edgeCol; x.fillRect(25, cy-11, 13, 18);
          x.fillStyle = wp.coreCol; x.fillRect(26, cy-5, 6, 10);
          x.fillStyle = hiCol; x.fillRect(37, cy-10, 3, 20);
          x.fillStyle = '#fff'; x.fillRect(39, cy-9, 2, 18);
          if(wp.rarity>=3){ x.fillStyle = elCol; x.fillRect(28, cy-2, 3, 4); }
        }
        else if(wp.type === 'hammer'){
          x.fillStyle = '#78350f'; x.fillRect(3, cy-2, 28, 4);
          x.fillStyle = shCol; x.fillRect(24, cy-11, 18, 22);
          x.fillStyle = wp.edgeCol; x.fillRect(25, cy-10, 16, 10);
          x.fillStyle = hiCol; x.fillRect(26, cy-10, 14, 2);
          x.fillStyle = wp.coreCol; x.fillRect(28, cy-7, 10, 14);
          x.fillStyle = elCol; x.fillRect(31, cy-4, 4, 8);
          x.fillStyle = '#facc15'; x.fillRect(24, cy-11, 18, 2); x.fillRect(24, cy+9, 18, 2);
        }
        else if(wp.type === 'scythe'){
          x.fillStyle = '#1e293b'; x.fillRect(2, cy-1, 34, 3);
          x.fillStyle = '#475569'; x.fillRect(2, cy-1, 34, 1);
          // Sweeping crescent reaper blade
          x.fillStyle = shCol; x.fillRect(32, cy-3, 10, 14); x.fillRect(26, cy+8, 12, 6); x.fillRect(19, cy+11, 9, 4);
          x.fillStyle = wp.edgeCol; x.fillRect(34, cy-2, 8, 12); x.fillRect(28, cy+8, 10, 4);
          x.fillStyle = hiCol; x.fillRect(40, cy-2, 2, 12); x.fillRect(20, cy+13, 16, 2);
          x.fillStyle = elCol; x.fillRect(33, cy-1, 3, 5);
        }
        else { // staff
          x.fillStyle = '#3b0764'; x.fillRect(3, cy-2, 32, 4);
          x.fillStyle = '#facc15'; x.fillRect(32, cy-6, 4, 12); x.fillRect(36, cy-8, 3, 3); x.fillRect(36, cy+5, 3, 3);
          x.fillStyle = wp.coreCol; x.fillRect(36, cy-5, 10, 10);
          x.fillStyle = wp.edgeCol; x.fillRect(38, cy-4, 7, 8);
          x.fillStyle = '#fff'; x.fillRect(39, cy-3, 3, 3);
        }
      });
      return addOutline(raw);
    });
  }

  // =========================================================================
  // 3. PROPS, ANIMATED COINS (6 FRAMES), MEDKITS (+20/+50/+100) & 16 AVATARS
  // =========================================================================
  function bakeProps(){
    // Destructible Wooden Crate (Intact & Cracked)
    Bakery.props.crate = addOutline(makeCanvas(28, 28, x => {
      x.fillStyle = '#78350f'; x.fillRect(1,1,26,26);
      x.fillStyle = '#b45309'; x.fillRect(3,3,22,22);
      x.fillStyle = '#92400e'; x.fillRect(5,5,18,18);
      // Wood planks + diagonal brace
      x.fillStyle = '#d97706'; x.fillRect(3,3,22,3); x.fillRect(3,22,22,3); x.fillRect(3,3,3,22); x.fillRect(22,3,3,22);
      for(let i=5;i<21;i++){ x.fillStyle='#b45309'; x.fillRect(i,i,3,3); }
      x.fillStyle = '#451a03'; x.fillRect(4,4,2,2); x.fillRect(22,4,2,2); x.fillRect(4,22,2,2); x.fillRect(22,22,2,2);
    }));

    // 6-Frame Spinning Pixel Gold Coin
    const widths = [12, 10, 6, 3, 6, 10];
    Bakery.coins = widths.map(w => addOutline(makeCanvas(16, 16, x => {
      const ox = Math.floor((16 - w) / 2);
      x.fillStyle = '#b45309'; x.fillRect(ox, 2, w, 12);
      x.fillStyle = '#f59e0b'; x.fillRect(ox+1, 2, Math.max(1,w-2), 11);
      if(w >= 6){
        x.fillStyle = '#fef08a'; x.fillRect(ox+2, 3, Math.max(1,w-5), 8);
        x.fillStyle = '#ca8a04'; x.fillRect(ox+Math.floor(w/2), 5, 1, 6);
      }
    })));

    // 3 Distinct Medkits (+20 Green Pouch, +50 Cyan Field Kit, +100 Red Trauma Box)
    const medSpec = [
      ['hp20',  '#16a34a', '#4ade80', '#dcfce7'],
      ['hp50',  '#0284c7', '#38bdf8', '#e0f2fe'],
      ['hp100', '#be123c', '#fb7185', '#ffe4e6']
    ];
    medSpec.forEach(([key, dark, mid, light]) => {
      Bakery.medkits[key] = addOutline(makeCanvas(22, 18, x => {
        x.fillStyle = '#334155'; x.fillRect(7, 1, 8, 3); // Handle
        x.fillStyle = dark; x.fillRect(2, 4, 18, 13);
        x.fillStyle = mid; x.fillRect(3, 5, 16, 10);
        x.fillStyle = light; x.fillRect(3, 5, 16, 2);
        // White medical cross
        x.fillStyle = '#ffffff'; x.fillRect(9, 7, 4, 8); x.fillRect(7, 9, 8, 4);
      }));
    });

    // 16 High-Detail 32x32 Pixel Avatars
    Bakery.avatars = PSO.AVATARS.map(av => makeCanvas(32, 32, x => {
      // Background gradient + scanlines
      x.fillStyle = av.c2; x.fillRect(0,0,32,32);
      x.fillStyle = shade(av.c2, -20);
      for(let y=0;y<32;y+=4) x.fillRect(0,y,32,2);
      // Radial backlight
      x.fillStyle = shade(av.c1, -45); x.fillRect(6,6,20,20);
      // Shoulders & Armor
      x.fillStyle = '#0f172a'; x.fillRect(3,23,26,9);
      x.fillStyle = av.c1; x.fillRect(5,24,22,8);
      x.fillStyle = av.accent; x.fillRect(12,24,8,4);
      // Head silhouette
      x.fillStyle = '#090d1a'; x.fillRect(8,7,16,16);
      x.fillStyle = av.c1; x.fillRect(9,8,14,7);
      x.fillStyle = shade(av.c1, 30); x.fillRect(10,8,12,2);
      // Eyes / Visor
      x.fillStyle = '#020617'; x.fillRect(10,14,12,5);
      x.fillStyle = '#ffffff'; x.fillRect(11,15,3,3); x.fillRect(18,15,3,3);
      x.fillStyle = av.accent; x.fillRect(12,16,2,2); x.fillRect(19,16,2,2);
      // Distinct Headgear per Avatar
      if(av.helm === 'band'){ x.fillStyle = av.accent; x.fillRect(7,11,18,2); x.fillRect(24,12,4,5); }
      else if(av.helm === 'crown'){ x.fillStyle='#facc15'; x.fillRect(9,4,3,5); x.fillRect(14,2,4,7); x.fillRect(20,4,3,5); x.fillRect(9,7,14,2); }
      else if(av.helm === 'horns'){ x.fillStyle=av.accent; x.fillRect(6,3,3,7); x.fillRect(23,3,3,7); x.fillRect(7,7,3,3); x.fillRect(22,7,3,3); }
      else if(av.helm === 'visor'){ x.fillStyle=av.accent; x.fillRect(9,14,14,4); x.fillStyle='#fff'; x.fillRect(11,15,6,1); }
      else if(av.helm === 'mech'){ x.fillStyle='#94a3b8'; x.fillRect(7,6,18,16); x.fillStyle=av.accent; x.fillRect(10,13,12,4); x.fillRect(15,2,2,5); }
      else if(av.helm === 'reaper'){ x.fillStyle='#1e1b4b'; x.fillRect(6,5,20,18); x.fillStyle='#020617'; x.fillRect(9,10,14,11); x.fillStyle=av.accent; x.fillRect(11,14,3,3); x.fillRect(18,14,3,3); }
      else if(av.helm === 'halo'){ x.strokeStyle='#facc15'; x.lineWidth=2; x.strokeRect(9,3,14,3); }
      else if(av.helm === 'wings'){ x.fillStyle=av.accent; x.fillRect(2,8,6,4); x.fillRect(24,8,6,4); x.fillRect(3,13,5,3); x.fillRect(24,13,5,3); }
    }));
  }

  Bakery.init = function(){
    if(Bakery.ready) return;
    bakeTiles();
    bakeWeapons();
    bakeProps();
    Bakery.ready = true;
  };
})();
