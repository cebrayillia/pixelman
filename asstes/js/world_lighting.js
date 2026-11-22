(function(){
  'use strict';
  const PSO = window.PSO = window.PSO || {};

  PSO.LOG_W = 960;
  PSO.LOG_H = 540;
  PSO.GROUND_Y = 472;

  // Deterministic PRNG per level so every one of the 100 levels has a unique, repeatable layout
  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Offscreen half-res dynamic 2D lightmap (480x270 scaled smoothly -> 60 FPS on mobile WebView)
  const LIGHT_SCALE = 0.5;
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = Math.round(PSO.LOG_W * LIGHT_SCALE);
  lightCanvas.height = Math.round(PSO.LOG_H * LIGHT_SCALE);
  const lctx = lightCanvas.getContext('2d');

  // =========================================================================
  // 1. MONSTER & BOSS FACTORIES (6 ARCHETYPES + 2-PHASE BOSSES)
  // =========================================================================
  function makeMonster(lv, x, y, kind, tint){
    // Exponential curve ensures character/weapon upgrades & dungeon farming become essential
    const sHp = Math.pow(1.095, lv - 1);
    const sAtk = Math.pow(1.067, lv - 1);
    const cfg = {
      brawler:  { hp:1.10, atk:1.00, spd:2.05, poise:48,  w:26, h:42, col:'#f97316' },
      assassin: { hp:0.92, atk:1.22, spd:3.35, poise:34,  w:24, h:40, col:'#f43f5e' },
      shield:   { hp:1.85, atk:1.25, spd:1.25, poise:92,  w:32, h:46, col:'#64748b' },
      brute:    { hp:2.15, atk:1.45, spd:1.45, poise:115, w:36, h:50, col:'#dc2626' },
      caster:   { hp:1.05, atk:1.18, spd:1.75, poise:38,  w:26, h:42, col:'#a855f7' },
      flyer:    { hp:0.85, atk:1.12, spd:2.55, poise:30,  w:30, h:26, col:'#22d3ee' }
    }[kind] || { hp:1.0, atk:1.0, spd:2.0, poise:45, w:26, h:42, col:'#f97316' };

    const maxHp = Math.round(46 * sHp * cfg.hp);
    const maxPoise = Math.round(cfg.poise * (1 + lv * 0.02));
    return {
      x, y, vx:0, vy:0, w:cfg.w, h:cfg.h,
      kind, isBoss:false,
      hp:maxHp, maxHp,
      poise:maxPoise, maxPoise,
      atk:+(6.5 * sAtk * cfg.atk).toFixed(1),
      spd:cfg.spd + Math.min(1.1, lv * 0.01),
      facing:-1, patrolX:x, patrolY:y, range:180,
      cd:30 + Math.floor(Math.random() * 40),
      telegraph:0, bossMove:'', phase:1,
      atkAnim:0, hitFlash:0, freeze:0, burn:0, slow:0, staggerTimer:0,
      auraElem:null, auraTimer:0, shredTimer:0,
      animT:Math.random() * 60,
      color:tint || cfg.col
    };
  }

  function makeBoss(lv, x, y, name, hp, atk, tint, dungeonId){
    const maxPoise = Math.round(240 + lv * 9);
    return {
      x, y, vx:0, vy:0, w:50, h:70,
      kind:'boss', isBoss:true, name,
      dungeonId: dungeonId !== undefined ? dungeonId : -1,
      hp, maxHp:hp,
      poise:maxPoise, maxPoise,
      atk, spd:2.35 + Math.min(1.8, lv * 0.016),
      facing:-1, patrolX:x, patrolY:y, range:520,
      cd:50, telegraph:0, bossMove:'charge', phase:1,
      atkAnim:0, hitFlash:0, freeze:0, burn:0, slow:0, staggerTimer:0,
      auraElem:null, auraTimer:0, shredTimer:0,
      animT:0, color:tint || '#f43f5e'
    };
  }

  // =========================================================================
  // 2. PROCEDURAL 100-LEVEL & 5-DUNGEON MULTI-ZONE BUILDER
  // =========================================================================
  function makeDecos(theme, width, rng){
    const decos = [];
    let x = 50;
    while(x < width - 100){
      const w = 120 + Math.floor(rng() * 95);
      const h = 165 + Math.floor(rng() * 190);
      decos.push({
        x, w, h,
        variant: Math.floor(rng() * 5),
        roomNum: 101 + Math.floor(rng() * 420),
        neonCol: ['#38bdf8','#f43f5e','#facc15','#a855f7','#22c55e'][Math.floor(rng() * 5)],
        hasSign: rng() < 0.55,
        hasLamp: rng() < 0.65,
        flickerSeed: Math.floor(rng() * 1000)
      });
      x += w + 55 + Math.floor(rng() * 75);
    }
    return decos;
  }

  function makeWeather(theme, lvNum){
    const list = [];
    let type = 'dust';
    if(theme === 'exterior' || theme === 'boss'){
      if(lvNum <= 20) type = 'rain';
      else if(lvNum <= 40) type = 'dust';
      else if(lvNum <= 60) type = 'sparks';
      else if(lvNum <= 80) type = 'snow';
      else type = 'embers';
    } else if(theme === 'mine'){
      type = 'sparks';
    } else if(theme === 'metro'){
      type = 'dust';
    } else {
      type = 'none';
    }
    if(type === 'none') return { type, items:[] };
    const count = type === 'rain' ? 58 : type === 'snow' ? 42 : 28;
    for(let i = 0; i < count; i++){
      list.push({
        x: Math.random() * PSO.LOG_W,
        y: Math.random() * PSO.LOG_H,
        vx: type === 'rain' ? -2.4 : type === 'snow' ? -0.6 + Math.random() * 1.2 : (Math.random() - 0.5) * 0.8,
        vy: type === 'rain' ? 11 + Math.random() * 4 : type === 'snow' ? 1.1 + Math.random() * 1.2 : -0.5 - Math.random() * 1.0,
        sz: type === 'rain' ? 10 : (1 + Math.floor(Math.random() * 2.5))
      });
    }
    return { type, items:list };
  }

  function buildLevel(lvNum, dungeonObj){
    const GY = PSO.GROUND_Y;

    // --- DUNGEON MODE (5 SPECIALIZED MATERIAL BOSS ARENAS) ---
    if(dungeonObj){
      const w = 1760;
      const rng = mulberry32(dungeonObj.id * 997 + 13);
      const plats = [
        {x:0, y:GY, w:w, h:80},
        {x:250, y:352, w:210, h:18},
        {x:680, y:268, w:260, h:18},
        {x:1120, y:352, w:210, h:18}
      ];
      const ladders = [
        {x:320, y1:352, y2:GY},
        {x:790, y1:268, y2:GY},
        {x:1260, y1:352, y2:GY}
      ];
      const elevators = [
        {x:540, y:GY - 18, w:84, h:18, minY:268, maxY:GY - 18, dir:-1, spd:1.6, prevY:GY - 18}
      ];
      const hazards = dungeonObj.id === 0
        ? [{x:480, y:GY - 10, w:64, kind:'lava'}, {x:1000, y:GY - 10, w:64, kind:'lava'}]
        : dungeonObj.id === 2
        ? [{x:480, y:GY - 10, w:64, kind:'electric'}, {x:1000, y:GY - 10, w:64, kind:'electric'}]
        : [];
      const crates = [
        {x:280, y:352 - 28, hp:2, drop:'hp50'},
        {x:800, y:268 - 28, hp:2, drop:'hp100'},
        {x:1150, y:352 - 28, hp:2, drop:'hp50'}
      ];
      const mobs = [
        makeMonster(dungeonObj.recLv, 420, GY - 24, 'shield', dungeonObj.color),
        makeMonster(dungeonObj.recLv, 760, 268 - 22, 'caster', dungeonObj.color),
        makeMonster(dungeonObj.recLv, 980, 200, 'flyer', dungeonObj.color),
        makeBoss(dungeonObj.recLv, 1460, GY - 36, dungeonObj.boss, dungeonObj.hp, dungeonObj.atk, dungeonObj.color, dungeonObj.id)
      ];
      return {
        isDungeon:true, dungeon:dungeonObj, levelNum:dungeonObj.recLv,
        district: PSO.getDistrict(dungeonObj.recLv),
        zones:[{
          id:0, theme:dungeonObj.bg, label:dungeonObj.name, width:w,
          plats, ladders, elevators, hazards, crates, mobs, items:[], portals:[],
          checkpoints:[{x:110, y:GY, id:0, active:true}],
          decos: makeDecos(dungeonObj.bg, w, rng),
          weather: makeWeather(dungeonObj.bg, dungeonObj.recLv)
        }]
      };
    }

    // --- 100-LEVEL CAMPAIGN MODE (LONG 4-ZONE ODYSSEY WITH 3 CHECKPOINTS) ---
    const rng = mulberry32(lvNum * 7919 + 104729);
    const district = PSO.getDistrict(lvNum);
    const intTheme = ['office','school','hotel'][(lvNum - 1) % 3];
    const undTheme = ['mine','metro'][(lvNum - 1) % 2];

    // Long, rich levels that grow with level progression
    const extW = 2450 + Math.min(850, lvNum * 8);
    const intW = 2350 + Math.min(850, lvNum * 8);
    const undW = 2450 + Math.min(850, lvNum * 8);
    const bossW = 1520;

    // Pool of enemy archetypes expands cleanly as levels rise
    const mobPool = lvNum < 3 ? ['brawler','assassin','flyer']
      : lvNum < 7 ? ['brawler','assassin','shield','caster','flyer']
      : ['brawler','assassin','shield','brute','caster','flyer'];
    const pickMob = () => mobPool[Math.floor(rng() * mobPool.length)];

    function genZone(id, theme, width){
      const plats = [{x:0, y:GY, w:width, h:80}];
      const ladders = [], elevators = [], hazards = [], crates = [], mobs = [], items = [], portals = [], checkpoints = [];

      if(id === 0){
        // ZONE 0: EXTERIOR STREET (Closed building facades, rooftops, wall-jump walls, street hazards)
        let cx = 270;
        while(cx < width - 420){
          const pw = 135 + Math.floor(rng() * 135);
          const py = 255 + Math.floor(rng() * 125);
          plats.push({x:cx, y:py, w:pw, h:18});
          if(rng() < 0.48) ladders.push({x:cx + 26, y1:py, y2:GY});

          // Coin arc over platform
          const coinCount = 3 + Math.floor(rng() * 3);
          for(let i = 0; i < coinCount; i++){
            items.push({x:cx + 22 + i * 28, y:py - 28 - Math.sin((i / coinCount) * Math.PI) * 14, type:'gold', val:Math.round(10 + lvNum * 4.6), taken:false});
          }
          // Destructible crate with gold or +20/+50/+100 HP
          if(rng() < 0.42){
            const dr = rng();
            crates.push({x:cx + pw - 36, y:py - 28, hp:2, drop: dr < 0.25 ? 'hp20' : dr < 0.36 ? 'hp50' : 'gold'});
          }
          // Ground spikes/electric hazards
          if(rng() < 0.34){
            hazards.push({x:cx + 35, y:GY - 10, w:52, kind: lvNum > 40 ? 'electric' : 'spikes'});
          }
          // Street & rooftop enemies
          const mk1 = pickMob();
          mobs.push(makeMonster(lvNum, cx + 65, mk1 === 'flyer' ? py - 70 : GY - 22, mk1));
          if(rng() < 0.54){
            const mk2 = pickMob();
            mobs.push(makeMonster(lvNum, cx + pw * 0.52, mk2 === 'flyer' ? py - 80 : py - 22, mk2));
          }
          cx += pw + 125 + Math.floor(rng() * 95);
        }
        // Checkpoint 1/3
        const cpX = Math.floor(width * 0.52);
        checkpoints.push({x:cpX, y:GY, id:0, active:false});
        items.push({x:cpX + 58, y:GY - 26, type:'hp50', taken:false});

        // Entrance Door / Exterior Glass Elevator into Building
        portals.push({
          x: width - 135, y: GY,
          kind: lvNum % 2 === 0 ? 'elevator' : 'door',
          targetZone: 1,
          label: PSO.I18N.TR.interiors[intTheme] + ' GİRİŞ'
        });
      }
      else if(id === 1){
        // ZONE 1: 2-STORY BUILDING INTERIOR (Working Cab Elevators + Staircase Ladders + 2nd Floor!)
        const f2Y = 266;
        // Upper floor split into 3 wings connected by moving elevators & ladders
        plats.push({x:185, y:f2Y, w:560, h:22});
        plats.push({x:885, y:f2Y, w:660, h:22});
        plats.push({x:1685, y:f2Y, w:width - 1740, h:22});

        // 3 Working Moving Elevators between 1F and 2F
        elevators.push({x:88,   y:GY - 18, w:84, h:18, minY:f2Y, maxY:GY - 18, dir:-1, spd:1.75, prevY:GY - 18});
        elevators.push({x:772,  y:f2Y,     w:88, h:18, minY:f2Y, maxY:GY - 18, dir:1,  spd:1.85, prevY:f2Y});
        elevators.push({x:1572, y:GY - 18, w:88, h:18, minY:f2Y, maxY:GY - 18, dir:-1, spd:1.95, prevY:GY - 18});

        // Climbable service ladders between floors
        ladders.push({x:480, y1:f2Y, y2:GY}, {x:1220, y1:f2Y, y2:GY}, {x:1940, y1:f2Y, y2:GY});

        // Populate both 1st and 2nd floor with enemies, coins, and crates
        for(let x = 250; x < width - 290; x += 215){
          const y1 = GY, y2 = f2Y;
          const mFloor = rng() < 0.55 ? y2 : y1;
          const mk = pickMob();
          mobs.push(makeMonster(lvNum, x, mk === 'flyer' ? mFloor - 70 : mFloor - 22, mk));
          if(rng() < 0.38){
            const otherY = mFloor === y2 ? y1 : y2;
            mobs.push(makeMonster(lvNum, x + 65, otherY - 22, pickMob()));
          }
          // Coins on both floors
          items.push({x:x + 24, y:y1 - 26, type:'gold', val:Math.round(12 + lvNum * 5), taken:false});
          items.push({x:x + 24, y:y2 - 26, type:'gold', val:Math.round(12 + lvNum * 5), taken:false});
          if(rng() < 0.36){
            const r = rng();
            crates.push({x:x + 85, y:(rng() < 0.5 ? y2 : y1) - 28, hp:2, drop: r < 0.32 ? 'hp50' : r < 0.48 ? 'hp20' : 'gold'});
          }
        }
        // Checkpoint 2/3 on 2nd Floor!
        const cpX = Math.floor(width * 0.53);
        checkpoints.push({x:cpX, y:f2Y, id:1, active:false});
        items.push({x:cpX + 58, y:f2Y - 26, type:'hp50', taken:false});

        // Basement Underground Hatch Ladder at right end of 1st floor
        portals.push({
          x: width - 135, y: GY,
          kind: 'ladder_down',
          targetZone: 2,
          label: PSO.I18N.TR.undergrounds[undTheme] + ' İNİŞ'
        });
      }
      else if(id === 2){
        // ZONE 2: UNDERGROUND (DARK MINE OR METRO TUNNEL WITH TRAIN CARS & DYNAMIC LANTERNS)
        // Entry Ladder coming down from the ceiling!
        ladders.push({x:72, y1:20, y2:GY});
        let cx = 240;
        while(cx < width - 410){
          const isTrain = theme === 'metro';
          const pw = isTrain ? 275 : (145 + Math.floor(rng() * 115));
          const py = isTrain ? 344 : (255 + Math.floor(rng() * 120));
          plats.push({x:cx, y:py, w:pw, h:isTrain ? 22 : 18, isTrain});
          if(rng() < 0.65) ladders.push({x:cx + 24, y1:py, y2:GY});

          // Mine lift between deep ledges
          if(!isTrain && rng() < 0.25 && cx + pw + 110 < width - 360){
            elevators.push({x:cx + pw + 18, y:GY - 18, w:74, h:18, minY:py, maxY:GY - 18, dir:-1, spd:1.5, prevY:GY - 18});
          }
          // Hazards: Lava pools in Mine, Live Electric Third-Rail in Metro
          if(rng() < 0.48){
            hazards.push({x:cx + pw * 0.45, y:GY - 10, w:60, kind: theme === 'mine' ? 'lava' : 'electric'});
          }
          // Rich underground loot
          for(let i = 0; i < 3; i++){
            items.push({x:cx + 42 + i * 44, y:py - 28, type:'gold', val:Math.round(14 + lvNum * 5.4), taken:false});
          }
          if(rng() < 0.44){
            const r = rng();
            crates.push({x:cx + pw - 42, y:py - 28, hp:2, drop: r < 0.28 ? 'hp100' : r < 0.56 ? 'hp50' : 'gold'});
          }
          const mkTop = pickMob();
          mobs.push(makeMonster(lvNum, cx + 85, mkTop === 'flyer' ? py - 70 : py - 22, mkTop));
          mobs.push(makeMonster(lvNum, cx + 150, GY - 22, pickMob()));
          cx += pw + 145 + Math.floor(rng() * 85);
        }
        // Checkpoint 3/3
        const cpX = Math.floor(width * 0.52);
        checkpoints.push({x:cpX, y:GY, id:2, active:false});
        items.push({x:cpX + 58, y:GY - 26, type:'hp100', taken:false});

        // Ladder up out of underground into the Boss Arena!
        portals.push({
          x: width - 135, y: GY,
          kind: 'ladder_up',
          targetZone: 3,
          label: 'BOSS ARENASINA ÇIK'
        });
      }
      else {
        // ZONE 3: DRAMATIC BOSS ARENA
        plats.push({x:190, y:348, w:215, h:18}, {x:635, y:260, w:250, h:18}, {x:1115, y:348, w:215, h:18});
        ladders.push({x:255, y1:348, y2:GY}, {x:1265, y1:348, y2:GY});
        crates.push({x:210, y:348 - 28, hp:2, drop:'hp50'}, {x:1285, y:348 - 28, hp:2, drop:'hp100'});

        const bTitle = PSO.BOSS_TITLES[(lvNum - 1) % PSO.BOSS_TITLES.length];
        const bName = `SV.${lvNum} ${bTitle}`;
        const bHp = Math.round(320 * Math.pow(1.098, lvNum - 1));
        const bAtk = +(11.5 * Math.pow(1.069, lvNum - 1)).toFixed(1);
        mobs.push(makeBoss(lvNum, 1180, GY - 36, bName, bHp, bAtk, district.moon));
      }

      return {
        id, theme, width,
        plats, ladders, elevators, hazards, crates, mobs, items, portals, checkpoints,
        decos: makeDecos(theme, width, rng),
        weather: makeWeather(theme, lvNum)
      };
    }

    return {
      isDungeon:false, levelNum:lvNum, district,
      zones:[
        genZone(0, 'exterior', extW),
        genZone(1, intTheme, intW),
        genZone(2, undTheme, undW),
        genZone(3, 'boss', bossW)
      ]
    };
  }

  // =========================================================================
  // 3. HIGH-DETAIL BIOME BACKDROP & ARCHITECTURE RENDERER
  // =========================================================================
  function fillTiled(ctx, tex, x, y, w, h){
    if(!tex) return;
    const tw = tex.width, th = tex.height;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for(let yy = y; yy < y + h; yy += th){
      for(let xx = x; xx < x + w; xx += tw){
        ctx.drawImage(tex, xx, yy);
      }
    }
    ctx.restore();
  }

  function drawBackdrop(ctx, z, district, camX, timeMs, lights){
    const W = PSO.LOG_W, H = PSO.LOG_H, GY = PSO.GROUND_Y;
    const th = z.theme;
    const sec = timeMs * 0.001;

    if(th === 'exterior' || th === 'boss'){
      // 1. Multi-stop District Sky Gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if(th === 'boss'){
        g.addColorStop(0, '#1f0616'); g.addColorStop(0.55, '#3b0a24'); g.addColorStop(1, '#11071a');
      } else {
        g.addColorStop(0, district.skyTop); g.addColorStop(0.65, district.skyBot); g.addColorStop(1, '#0e1021');
      }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Pixel Moon / Crimson Eclipse & Twinkling Stars
      const mx = 795, my = 62;
      ctx.fillStyle = th === 'boss' ? '#f43f5e' : district.moon;
      ctx.fillRect(mx - 20, my - 20, 40, 40);
      if(th === 'boss'){
        ctx.fillStyle = '#1f0616'; ctx.fillRect(mx - 14, my - 14, 28, 28);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(mx - 10, my - 6, 10, 8); ctx.fillRect(mx + 4, my + 6, 8, 8);
      }
      ctx.fillStyle = '#ffffff';
      for(let i = 0; i < 36; i++){
        const tw = Math.sin(sec * 2.5 + i * 3) > -0.3 ? 1 : 0.25;
        ctx.globalAlpha = tw;
        ctx.fillRect((i * 113) % W, (i * 47) % 210, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
      }
      ctx.globalAlpha = 1;

      // 2. Far Parallax City Skyline (Layer 1 - 0.14x)
      ctx.fillStyle = th === 'boss' ? '#17071a' : '#0d132b';
      for(let i = 0; i < 18; i++){
        const bx = ((i * 110 - camX * 0.14) % (W + 240) + (W + 240)) % (W + 240) - 120;
        const bh = 110 + ((i * 67) % 190);
        ctx.fillRect(Math.round(bx), GY - bh, 88, bh);
        if(i % 3 === 0){ // Rooftop antenna + blinking red beacon
          ctx.fillRect(Math.round(bx) + 42, GY - bh - 26, 2, 26);
          if(Math.sin(sec * 3 + i) > 0){ ctx.fillStyle = '#ef4444'; ctx.fillRect(Math.round(bx) + 41, GY - bh - 28, 4, 4); ctx.fillStyle = th === 'boss' ? '#17071a' : '#0d132b'; }
        }
      }

      // 3. Mid Parallax Buildings (Layer 2 - 0.35x)
      ctx.fillStyle = th === 'boss' ? '#240b24' : '#161f3d';
      for(let i = 0; i < 14; i++){
        const bx = ((i * 155 - camX * 0.35) % (W + 300) + (W + 300)) % (W + 300) - 150;
        const bh = 140 + ((i * 89) % 160);
        ctx.fillRect(Math.round(bx), GY - bh, 118, bh);
        ctx.fillStyle = 'rgba(250,204,21,0.16)';
        for(let wy = GY - bh + 18; wy < GY - 40; wy += 24){
          for(let wx = Math.round(bx) + 12; wx < Math.round(bx) + 100; wx += 22){
            if((wx + wy + i) % 3 === 0) ctx.fillRect(wx, wy, 8, 12);
          }
        }
        ctx.fillStyle = th === 'boss' ? '#240b24' : '#161f3d';
      }

      // 4. Foreground Exterior Brick Walls ONLY (Interiors strictly hidden from outside!)
      for(const d of z.decos){
        const sx = Math.round(d.x - camX * 0.78);
        if(sx + d.w < -40 || sx > W + 40) continue;
        if(th === 'boss'){
          // Obsidian Boss Arena Pillars & Runic Banners
          ctx.fillStyle = '#1e102e'; ctx.fillRect(sx + 20, 40, 34, GY - 40);
          ctx.fillStyle = '#3b0764'; ctx.fillRect(sx + 24, 40, 26, GY - 40);
          ctx.fillStyle = '#f43f5e'; ctx.fillRect(sx + 34, 120, 6, 40);
          lights.push({x:sx + 37, y:140, r:90, col:'rgba(244,63,94,0.45)'});
          continue;
        }
        fillTiled(ctx, PSO.Bakery.tiles.brick, sx, GY - d.h, d.w, d.h);
        // Cornice & Roofline
        ctx.fillStyle = '#0f1322'; ctx.fillRect(sx - 4, GY - d.h, d.w + 8, 10);
        ctx.fillStyle = '#475569'; ctx.fillRect(sx - 4, GY - d.h, d.w + 8, 2);
        // Closed Exterior Windows (opaque glass reflection, no interior visible)
        for(let wy = GY - d.h + 22; wy < GY - 42; wy += 32){
          for(let wx = sx + 14; wx < sx + d.w - 24; wx += 26){
            ctx.fillStyle = '#090d1a'; ctx.fillRect(wx - 1, wy - 1, 14, 20);
            ctx.fillStyle = ((wx + wy + d.variant) % 5 === 0) ? '#38bdf8' : '#1e293b';
            ctx.fillRect(wx, wy, 12, 18);
            ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(wx + 2, wy + 2, 3, 8);
          }
        }
        // Neon Exterior Signboard
        if(d.hasSign){
          const flick = Math.sin(sec * 11 + d.flickerSeed) > -0.82 ? 1 : 0.25;
          ctx.save(); ctx.globalAlpha = flick;
          ctx.fillStyle = '#090d1a'; ctx.fillRect(sx + 10, GY - 92, 58, 20);
          ctx.strokeStyle = d.neonCol; ctx.lineWidth = 2; ctx.strokeRect(sx + 10, GY - 92, 58, 20);
          ctx.fillStyle = d.neonCol; ctx.fillRect(sx + 16, GY - 85, 46, 6);
          ctx.restore();
          if(flick > 0.5) lights.push({x:sx + 39, y:GY - 82, r:85, col:d.neonCol});
        }
        // Street Lamp Post
        if(d.hasLamp){
          const lx = sx - 16;
          ctx.fillStyle = '#334155'; ctx.fillRect(lx, GY - 102, 4, 102); ctx.fillRect(lx, GY - 102, 18, 4);
          ctx.fillStyle = '#fef08a'; ctx.fillRect(lx + 11, GY - 98, 8, 5);
          lights.push({x:lx + 15, y:GY - 92, r:125, col:'rgba(254,240,138,0.65)'});
        }
      }
    }
    else if(th === 'office'){
      // CORPORATE TOWER INTERIOR (2 FLOORS: 1F & 2F)
      ctx.fillStyle = '#141e2e'; ctx.fillRect(0, 0, W, H);
      // Ceiling beams & 2nd floor divider slab line
      ctx.fillStyle = '#0b111c'; ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, 262, W, 8);
      for(let x = 35 - ((camX * 0.9) % 210); x < W + 40; x += 210){
        [24, 286].forEach(ly => {
          ctx.fillStyle = '#e0f2fe'; ctx.fillRect(Math.round(x), ly, 82, 5);
          lights.push({x:Math.round(x) + 41, y:ly + 16, r:140, col:'rgba(224,242,254,0.45)'});
        });
      }
      for(const d of z.decos){
        const sx = Math.round(d.x - camX);
        if(sx + 160 < -40 || sx > W + 40) continue;
        [GY, 266].forEach(fy => {
          // Tall Office Panorama Glass Window showing distant city lights
          ctx.fillStyle = '#0f172a'; ctx.fillRect(sx, fy - 165, 118, 120);
          ctx.fillStyle = '#1e3a5f'; ctx.fillRect(sx + 4, fy - 161, 110, 112);
          ctx.fillStyle = 'rgba(56,189,248,0.16)'; ctx.fillRect(sx + 8, fy - 157, 40, 104);
          ctx.fillStyle = '#334155'; ctx.fillRect(sx + 58, fy - 165, 4, 120);
          // Server Rack with blinking LEDs OR Desk + Dual PC Monitors
          if(d.variant % 2 === 0){
            ctx.fillStyle = '#1e293b'; ctx.fillRect(sx + 14, fy - 96, 44, 96);
            ctx.fillStyle = '#090d1a'; ctx.fillRect(sx + 18, fy - 90, 36, 84);
            for(let r = 0; r < 6; r++){
              const on = ((Math.floor(sec * 4) + r + d.variant) % 3) === 0;
              ctx.fillStyle = on ? '#22d3ee' : '#10b981';
              ctx.fillRect(sx + 22, fy - 84 + r * 13, 6, 3);
              ctx.fillStyle = '#475569'; ctx.fillRect(sx + 32, fy - 84 + r * 13, 18, 3);
            }
          } else {
            ctx.fillStyle = '#78350f'; ctx.fillRect(sx + 10, fy - 38, 98, 7);
            ctx.fillRect(sx + 14, fy - 31, 6, 31); ctx.fillRect(sx + 98, fy - 31, 6, 31);
            // Dual glowing PC Monitors
            ctx.fillStyle = '#090d1a'; ctx.fillRect(sx + 24, fy - 66, 32, 22); ctx.fillRect(sx + 60, fy - 66, 32, 22);
            ctx.fillStyle = '#38bdf8'; ctx.fillRect(sx + 27, fy - 63, 26, 16);
            ctx.fillStyle = '#22d3ee'; ctx.fillRect(sx + 63, fy - 63, 26, 16);
            lights.push({x:sx + 58, y:fy - 55, r:65, col:'rgba(56,189,248,0.4)'});
          }
        });
      }
    }
    else if(th === 'school'){
      // ACADEMY / SCHOOL HALLWAY INTERIOR (2 FLOORS)
      ctx.fillStyle = '#262336'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#39344d'; ctx.fillRect(0, GY - 102, W, 102); ctx.fillRect(0, 266 - 92, W, 92);
      ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, GY - 104, W, 3); ctx.fillRect(0, 266 - 94, W, 3);
      for(let x = 50 - ((camX * 0.9) % 220); x < W + 40; x += 220){
        [22, 286].forEach(ly => {
          ctx.fillStyle = '#fef9c3'; ctx.fillRect(Math.round(x), ly, 68, 5);
          lights.push({x:Math.round(x) + 34, y:ly + 14, r:135, col:'rgba(254,249,195,0.42)'});
        });
      }
      for(const d of z.decos){
        const sx = Math.round(d.x - camX);
        if(sx + 160 < -40 || sx > W + 40) continue;
        [GY, 266].forEach(fy => {
          // Green Chalkboard with chalk math equations
          ctx.fillStyle = '#78350f'; ctx.fillRect(sx, fy - 154, 126, 68);
          ctx.fillStyle = '#14532d'; ctx.fillRect(sx + 5, fy - 149, 116, 58);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(sx + 14, fy - 135, 38, 2); ctx.fillRect(sx + 14, fy - 125, 62, 2);
          ctx.fillRect(sx + 84, fy - 136, 26, 22);
          // Blue Metal School Lockers
          for(let l = 0; l < 3; l++){
            const lx = sx + 8 + l * 28;
            ctx.fillStyle = l % 2 === 0 ? '#2563eb' : '#1d4ed8';
            ctx.fillRect(lx, fy - 82, 25, 82);
            ctx.fillStyle = '#93c5fd'; ctx.fillRect(lx + 4, fy - 74, 17, 3); ctx.fillRect(lx + 4, fy - 68, 17, 3);
            ctx.fillStyle = '#0f172a'; ctx.fillRect(lx + 19, fy - 48, 3, 8);
          }
          // Wall Clock
          ctx.fillStyle = '#f8fafc'; ctx.fillRect(sx + 102, fy - 76, 16, 16);
          ctx.fillStyle = '#0f172a'; ctx.fillRect(sx + 109, fy - 72, 2, 6); ctx.fillRect(sx + 109, fy - 68, 5, 2);
        });
      }
    }
    else if(th === 'hotel'){
      // GRAND LUXURY HOTEL INTERIOR (2 FLOORS)
      ctx.fillStyle = '#240c15'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#361320';
      for(let x = -((camX * 0.6) % 38); x < W; x += 38) ctx.fillRect(Math.round(x), 0, 14, GY);
      for(const d of z.decos){
        const sx = Math.round(d.x - camX);
        if(sx + 160 < -40 || sx > W + 40) continue;
        [GY, 266].forEach(fy => {
          // Ornate Oak Suite Door with Gold Room Number Plaque
          ctx.fillStyle = '#451a03'; ctx.fillRect(sx + 16, fy - 104, 62, 104);
          ctx.fillStyle = '#78350f'; ctx.fillRect(sx + 20, fy - 100, 54, 100);
          ctx.fillStyle = '#92400e'; ctx.fillRect(sx + 26, fy - 92, 42, 36); ctx.fillRect(sx + 26, fy - 46, 42, 36);
          ctx.fillStyle = '#facc15'; ctx.fillRect(sx + 38, fy - 86, 18, 9); // Room plaque
          ctx.fillRect(sx + 64, fy - 52, 6, 6); // Brass knob
          // Framed Gold Painting beside door
          ctx.fillStyle = '#ca8a04'; ctx.fillRect(sx + 92, fy - 118, 44, 52);
          ctx.fillStyle = '#1e3a8a'; ctx.fillRect(sx + 96, fy - 114, 36, 44);
          ctx.fillStyle = '#facc15'; ctx.fillRect(sx + 104, fy - 102, 16, 16);
          // Warm Golden Chandelier
          ctx.fillStyle = '#facc15'; ctx.fillRect(sx + 46, fy - 196, 4, 24); ctx.fillRect(sx + 24, fy - 172, 48, 7);
          ctx.fillStyle = '#fef08a'; ctx.fillRect(sx + 26, fy - 178, 5, 6); ctx.fillRect(sx + 45, fy - 180, 6, 8); ctx.fillRect(sx + 65, fy - 178, 5, 6);
          lights.push({x:sx + 48, y:fy - 168, r:145, col:'rgba(253,224,71,0.55)'});
        });
      }
    }
    else if(th === 'mine'){
      // UNDERGROUND CRYSTAL MINE (Timber beams, swaying oil lanterns, glowing ore crystals)
      ctx.fillStyle = '#100d0b'; ctx.fillRect(0, 0, W, H);
      for(let x = -((camX * 0.4) % 104); x < W; x += 104){
        ctx.fillStyle = '#1c1613'; ctx.fillRect(Math.round(x), 18, 74, GY - 18);
      }
      for(const d of z.decos){
        const sx = Math.round(d.x - camX);
        if(sx + 180 < -40 || sx > W + 40) continue;
        // Heavy Mine Support Timbers
        ctx.fillStyle = '#451a03'; ctx.fillRect(sx, 0, 20, GY); ctx.fillRect(sx + 132, 0, 20, GY); ctx.fillRect(sx - 10, 36, 172, 20);
        ctx.fillStyle = '#78350f'; ctx.fillRect(sx + 4, 0, 10, GY); ctx.fillRect(sx + 136, 0, 10, GY); ctx.fillRect(sx - 6, 40, 164, 10);
        // Hanging Swaying Oil Lantern
        const sway = Math.sin(sec * 2.2 + d.flickerSeed) * 3;
        ctx.fillStyle = '#64748b'; ctx.fillRect(sx + 74, 56, 2, 16);
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(Math.round(sx + 70 + sway), 72, 10, 14);
        ctx.fillStyle = '#fef08a'; ctx.fillRect(Math.round(sx + 72 + sway), 75, 6, 8);
        lights.push({x:sx + 75 + sway, y:80, r:165, col:'rgba(251,146,60,0.72)'});
        // Glowing Cyan / Amethyst Crystal Cluster
        const cCol = d.variant % 2 === 0 ? '#22d3ee' : '#c084fc';
        ctx.fillStyle = cCol;
        ctx.fillRect(sx + 34, 210, 10, 24); ctx.fillRect(sx + 44, 220, 8, 16); ctx.fillRect(sx + 26, 224, 8, 12);
        lights.push({x:sx + 38, y:222, r:90, col:cCol});
      }
    }
    else if(th === 'metro'){
      // UNDERGROUND ABANDONED METRO TUNNEL (Tiled walls, station signs, flickering tubes)
      ctx.fillStyle = '#090e14'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#131d29';
      for(let y = 32; y < GY; y += 28) ctx.fillRect(0, y, W, 2);
      for(const d of z.decos){
        const sx = Math.round(d.x - camX);
        if(sx + 180 < -40 || sx > W + 40) continue;
        // Steel I-Beam Pillar
        ctx.fillStyle = '#1e293b'; ctx.fillRect(sx, 0, 24, GY);
        ctx.fillStyle = '#334155'; ctx.fillRect(sx + 5, 0, 14, GY);
        // Illuminated Metro Station Sign
        ctx.fillStyle = '#0369a1'; ctx.fillRect(sx + 42, 82, 114, 30);
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(sx + 42, 82, 114, 4);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px monospace';
        ctx.fillText('METRO M' + (1 + (d.variant % 4)) + ' ➔', sx + 54, 102);
        // Flickering Fluorescent Tube
        const on = Math.sin(sec * 16 + d.flickerSeed) > -0.75;
        if(on){
          ctx.fillStyle = '#e0f2fe'; ctx.fillRect(sx + 52, 24, 92, 5);
          lights.push({x:sx + 98, y:44, r:170, col:'rgba(186,230,253,0.58)'});
        }
      }
    }
  }

  // =========================================================================
  // 4. PLATFORMS, ELEVATORS, LADDERS, TRAINS, CHECKPOINTS, PORTALS & PICKUPS
  // =========================================================================
  function drawLevelGeometry(ctx, z, camX, timeMs, lights){
    const W = PSO.LOG_W, GY = PSO.GROUND_Y;
    const tileTex = PSO.Bakery.tiles[z.theme] || PSO.Bakery.tiles.exterior;

    // 1. Platforms & Parked Metro Subway Cars
    for(const pl of z.plats){
      const sx = Math.round(pl.x - camX);
      if(sx + pl.w < -40 || sx > W + 40) continue;
      if(pl.isTrain){
        const th = GY - pl.y - 6;
        ctx.fillStyle = '#1e3a8a'; ctx.fillRect(sx, pl.y, pl.w, th);
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(sx, pl.y, pl.w, 8);
        ctx.fillStyle = '#475569'; ctx.fillRect(sx, pl.y + 8, pl.w, 4);
        ctx.fillStyle = '#facc15'; ctx.fillRect(sx, pl.y + 46, pl.w, 6);
        // Glowing Subway Windows & Doors
        for(let wx = sx + 16; wx < sx + pl.w - 36; wx += 48){
          ctx.fillStyle = '#0f172a'; ctx.fillRect(wx, pl.y + 16, 34, 24);
          ctx.fillStyle = '#38bdf8'; ctx.fillRect(wx + 2, pl.y + 18, 30, 20);
          ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(wx + 4, pl.y + 20, 8, 16);
        }
        // Headlight glow
        ctx.fillStyle = '#fef08a'; ctx.fillRect(sx + pl.w - 6, pl.y + 62, 6, 12);
        lights.push({x:sx + pl.w + 35, y:pl.y + 68, r:110, col:'rgba(254,240,138,0.55)'});
      } else {
        fillTiled(ctx, tileTex, sx, pl.y, pl.w, pl.h);
        if(pl.y < GY){
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx, pl.y + pl.h, pl.w, 4);
        }
      }
    }

    // 2. Working Cab Elevators (Cables, Overhead Frame, Glowing Direction Arrow)
    for(const el of z.elevators){
      const sx = Math.round(el.x - camX);
      if(sx + el.w < -40 || sx > W + 40) continue;
      // Twin Steel Cables
      ctx.fillStyle = '#475569';
      ctx.fillRect(sx + 10, 0, 2, el.y);
      ctx.fillRect(sx + el.w - 12, 0, 2, el.y);
      // Cab Frame Background
      ctx.fillStyle = 'rgba(15,23,42,0.55)'; ctx.fillRect(sx + 4, el.y - 62, el.w - 8, 62);
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.strokeRect(sx + 4, el.y - 62, el.w - 8, 62);
      // Direction LED Indicator
      ctx.fillStyle = el.dir < 0 ? '#22c55e' : '#f59e0b';
      ctx.fillRect(sx + el.w / 2 - 8, el.y - 58, 16, 7);
      // Solid Elevator Platform Deck
      ctx.fillStyle = '#0284c7'; ctx.fillRect(sx, el.y, el.w, el.h);
      ctx.fillStyle = '#7dd3fc'; ctx.fillRect(sx + 2, el.y + 2, el.w - 4, 4);
      ctx.fillStyle = '#facc15';
      for(let i = sx + 6; i < sx + el.w - 10; i += 14) ctx.fillRect(i, el.y + el.h - 4, 8, 3);
      lights.push({x:sx + el.w / 2, y:el.y - 30, r:75, col:'rgba(56,189,248,0.45)'});
    }

    // 3. Climbable Ladders
    for(const l of z.ladders){
      const sx = Math.round(l.x - camX);
      if(sx < -30 || sx > W + 30) continue;
      ctx.fillStyle = '#090d1a'; ctx.fillRect(sx - 14, l.y1, 6, l.y2 - l.y1); ctx.fillRect(sx + 8, l.y1, 6, l.y2 - l.y1);
      ctx.fillStyle = '#b45309'; ctx.fillRect(sx - 13, l.y1, 4, l.y2 - l.y1); ctx.fillRect(sx + 9, l.y1, 4, l.y2 - l.y1);
      for(let y = l.y1 + 8; y < l.y2; y += 14){
        ctx.fillStyle = '#090d1a'; ctx.fillRect(sx - 11, y - 1, 22, 6);
        ctx.fillStyle = '#fbbf24'; ctx.fillRect(sx - 10, y, 20, 4);
      }
    }

    // 4. Hazards (Lava, Electric Rail, Steel Spikes)
    for(const hz of z.hazards){
      const sx = Math.round(hz.x - camX);
      if(sx + hz.w < -20 || sx > W + 20) continue;
      if(hz.kind === 'lava'){
        ctx.fillStyle = '#ea580c'; ctx.fillRect(sx, hz.y, hz.w, 12);
        ctx.fillStyle = '#fef08a'; ctx.fillRect(sx + 4, hz.y + 2, hz.w - 8, 3);
        lights.push({x:sx + hz.w / 2, y:hz.y, r:85, col:'rgba(249,115,22,0.65)'});
      } else if(hz.kind === 'electric'){
        ctx.fillStyle = '#0284c7'; ctx.fillRect(sx, hz.y + 4, hz.w, 6);
        const arcX = sx + Math.floor((timeMs * 0.15) % Math.max(8, hz.w - 14));
        ctx.fillStyle = '#e0f2fe'; ctx.fillRect(arcX, hz.y, 14, 4);
        lights.push({x:sx + hz.w / 2, y:hz.y, r:80, col:'rgba(34,211,238,0.65)'});
      } else {
        ctx.fillStyle = '#94a3b8';
        for(let x = sx; x < sx + hz.w; x += 10){
          ctx.beginPath(); ctx.moveTo(x, hz.y + 10); ctx.lineTo(x + 5, hz.y - 3); ctx.lineTo(x + 10, hz.y + 10); ctx.fill();
        }
      }
    }

    // 5. Destructible Crates
    for(const cr of z.crates){
      const sx = Math.round(cr.x - camX);
      if(sx < -32 || sx > W + 32) continue;
      ctx.drawImage(PSO.Bakery.props.crate, sx, cr.y);
      if(cr.hp === 1){ // Visible crack after 1st hit
        ctx.fillStyle = '#090d1a'; ctx.fillRect(sx + 10, cr.y + 6, 3, 14); ctx.fillRect(sx + 13, cr.y + 12, 8, 2);
      }
    }

    // 6. Checkpoints (Glowing Sci-Fi / Pixel Beacon Flags)
    for(const cp of z.checkpoints){
      const sx = Math.round(cp.x - camX);
      if(sx < -40 || sx > W + 40) continue;
      ctx.fillStyle = '#334155'; ctx.fillRect(sx - 10, cp.y - 6, 20, 6);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(sx - 2, cp.y - 64, 4, 60);
      ctx.fillStyle = cp.active ? '#10b981' : '#64748b';
      ctx.fillRect(sx + 2, cp.y - 62, 28, 18);
      ctx.fillStyle = cp.active ? '#a7f3d0' : '#94a3b8';
      ctx.fillRect(sx + 6, cp.y - 57, 16, 4);
      if(cp.active){
        lights.push({x:sx + 6, y:cp.y - 48, r:115, col:'rgba(16,185,129,0.65)'});
      }
    }

    // 7. Zone Portals (Building Entrance Door, Glass Elevator, Underground Hatch)
    for(const pt of z.portals){
      const sx = Math.round(pt.x - camX);
      if(sx < -50 || sx > W + 50) continue;
      if(pt.kind === 'door' || pt.kind === 'elevator'){
        ctx.fillStyle = '#090d1a'; ctx.fillRect(sx - 28, pt.y - 86, 56, 86);
        const rim = pt.kind === 'elevator' ? '#38bdf8' : '#facc15';
        ctx.strokeStyle = rim; ctx.lineWidth = 3; ctx.strokeRect(sx - 28, pt.y - 86, 56, 86);
        ctx.fillStyle = pt.kind === 'elevator' ? '#1e3a8a' : '#451a03';
        ctx.fillRect(sx - 24, pt.y - 82, 22, 80); ctx.fillRect(sx + 2, pt.y - 82, 22, 80);
        ctx.fillStyle = rim; ctx.fillRect(sx - 12, pt.y - 100, 24, 11);
        lights.push({x:sx, y:pt.y - 50, r:115, col:rim});
      } else {
        // Underground Hatch Ladder Down / Boss Exit Ladder Up
        ctx.fillStyle = '#b45309'; ctx.fillRect(sx - 16, pt.y - 102, 5, 102); ctx.fillRect(sx + 11, pt.y - 102, 5, 102);
        ctx.fillStyle = '#fbbf24';
        for(let y = pt.y - 94; y < pt.y; y += 14) ctx.fillRect(sx - 13, y, 26, 4);
        if(pt.kind === 'ladder_down'){
          ctx.fillStyle = '#020617'; ctx.fillRect(sx - 28, pt.y - 5, 56, 14);
          ctx.fillStyle = '#facc15'; ctx.fillRect(sx - 28, pt.y - 7, 56, 3);
        }
        lights.push({x:sx, y:pt.y - 52, r:100, col:'rgba(250,204,21,0.55)'});
      }
    }

    // 8. Spinning Gold Coins & Detailed Medkits (+20 / +50 / +100)
    const coinFrame = Math.floor(timeMs * 0.01) % PSO.Bakery.coins.length;
    const bob = Math.sin(timeMs * 0.006);
    for(const it of z.items){
      if(it.taken) continue;
      const sx = Math.round(it.x - camX);
      if(sx < -24 || sx > W + 24) continue;
      const sy = Math.round(it.y + Math.sin(timeMs * 0.006 + it.x * 0.04) * 3);
      if(it.type === 'gold'){
        ctx.drawImage(PSO.Bakery.coins[coinFrame], sx - 8, sy - 8);
      } else {
        const sprite = PSO.Bakery.medkits[it.type];
        if(sprite) ctx.drawImage(sprite, sx - 11, sy - 9);
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#000'; ctx.fillText(it.type === 'hp20' ? '+20' : it.type === 'hp50' ? '+50' : '+100', sx - 10, sy - 11);
        ctx.fillStyle = '#fff'; ctx.fillText(it.type === 'hp20' ? '+20' : it.type === 'hp50' ? '+50' : '+100', sx - 11, sy - 12);
        lights.push({x:sx, y:sy, r:55, col: it.type === 'hp100' ? 'rgba(244,63,94,0.55)' : 'rgba(74,222,128,0.5)'});
      }
    }
  }

  // =========================================================================
  // 5. WEATHER PARTICLES & REAL 2D DYNAMIC MULTIPLY LIGHTMAP
  // =========================================================================
  function drawWeather(ctx, weather){
    if(!weather || weather.type === 'none') return;
    const W = PSO.LOG_W, H = PSO.LOG_H;
    ctx.save();
    for(const p of weather.items){
      p.x += p.vx; p.y += p.vy;
      if(p.x < 0) p.x += W; else if(p.x > W) p.x -= W;
      if(p.y < 0) p.y += H; else if(p.y > H) p.y -= H;

      if(weather.type === 'rain'){
        ctx.strokeStyle = 'rgba(147,197,253,0.34)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y + p.sz); ctx.stroke();
      } else if(weather.type === 'snow'){
        ctx.fillStyle = 'rgba(241,245,249,0.72)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz);
      } else if(weather.type === 'sparks'){
        ctx.fillStyle = 'rgba(251,146,60,0.75)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz);
      } else if(weather.type === 'embers'){
        ctx.fillStyle = 'rgba(232,121,249,0.7)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz);
      } else {
        ctx.fillStyle = 'rgba(226,232,240,0.22)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
    }
    ctx.restore();
  }

  function drawLighting(ctx, theme, lights){
    // Ambient darkness color per environment (Mine & Metro are genuinely atmospheric!)
    const amb = {
      exterior: 'rgb(148,158,195)',
      office:   'rgb(185,198,218)',
      school:   'rgb(192,192,210)',
      hotel:    'rgb(165,132,140)',
      mine:     'rgb(64,56,52)',
      metro:    'rgb(72,88,108)',
      boss:     'rgb(122,92,120)'
    }[theme] || 'rgb(165,175,205)';

    const lw = lightCanvas.width, lh = lightCanvas.height;
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = amb;
    lctx.fillRect(0, 0, lw, lh);

    // Stamp all active light pools additively onto the ambient map
    lctx.globalCompositeOperation = 'lighter';
    for(let i = 0; i < lights.length; i++){
      const L = lights[i];
      const lx = L.x * LIGHT_SCALE, ly = L.y * LIGHT_SCALE, lr = L.r * LIGHT_SCALE;
      if(lx + lr < 0 || lx - lr > lw || ly + lr < 0 || ly - lr > lh) continue;
      const g = lctx.createRadialGradient(lx, ly, 2, lx, ly, lr);
      g.addColorStop(0, L.col || 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
    }

    // Multiply lightmap over the main scene for authentic 2D shadowed lighting
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(lightCanvas, 0, 0, PSO.LOG_W, PSO.LOG_H);
    ctx.restore();
  }

  PSO.World = {
    makeMonster,
    makeBoss,
    buildLevel,
    drawBackdrop,
    drawLevelGeometry,
    drawWeather,
    drawLighting
  };
})();
