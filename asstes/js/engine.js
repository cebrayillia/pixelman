(function(){
  'use strict';
  const PSO = window.PSO = window.PSO || {};

  // =========================================================================
  // 1. PERSISTENT SAVE STORE & TOTAL STAT CALCULATOR
  // =========================================================================
  const SAVE_KEY = 'pixel_shadow_odyssey_v3';

  function defaultSave(){
    return {
      lang:'TR', sound:true, music:true,
      playerName:'GölgeSavaşçı', avatarId:0,
      accLv:1, accXp:0, bossesSlain:0, parriesTotal:0,
      gold:150, emeralds:0, maxLevel:1, clearedLevels:{},
      mats:{fire:2, frost:0, cyber:0, soul:0, star:0},
      ownedChars:{ 0:{lv:1, asc:0} },
      ownedWeapons:{ 0:{lv:1, asc:0} },
      selChar:0, selWeapon:0,
      dungeonRuns:{}
    };
  }

  const Store = PSO.Store = {
    S: defaultSave(),
    load(){
      try{
        const raw = localStorage.getItem(SAVE_KEY);
        if(!raw){ this.S = defaultSave(); return; }
        const parsed = JSON.parse(raw);
        this.S = Object.assign(defaultSave(), parsed);
        this.S.mats = Object.assign({fire:0,frost:0,cyber:0,soul:0,star:0}, this.S.mats);
        if(!this.S.ownedChars[this.S.selChar]) this.S.selChar = 0;
        if(!this.S.ownedWeapons[this.S.selWeapon]) this.S.selWeapon = 0;
      }catch(e){ this.S = defaultSave(); }
    },
    save(){
      try{ localStorage.setItem(SAVE_KEY, JSON.stringify(this.S)); }catch(e){}
    },
    todayKey(){
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
    },
    getDungeonRuns(id){
      const k = this.todayKey();
      if(!this.S.dungeonRuns[k]) this.S.dungeonRuns = { [k]:{0:0,1:0,2:0,3:0,4:0} };
      return this.S.dungeonRuns[k][id] || 0;
    },
    addDungeonRun(id){
      const k = this.todayKey();
      if(!this.S.dungeonRuns[k]) this.S.dungeonRuns = { [k]:{0:0,1:0,2:0,3:0,4:0} };
      this.S.dungeonRuns[k][id] = (this.S.dungeonRuns[k][id] || 0) + 1;
      this.save();
    },
    gainAccXp(amount){
      if(this.S.accLv >= 100) return false;
      this.S.accXp += Math.floor(amount);
      let up = false;
      while(this.S.accLv < 100 && this.S.accXp >= PSO.accXpNeed(this.S.accLv)){
        this.S.accXp -= PSO.accXpNeed(this.S.accLv);
        this.S.accLv++;
        up = true;
      }
      this.save();
      return up;
    },
    getTotalStats(){
      const cid = this.S.selChar, wid = this.S.selWeapon;
      const c = PSO.calcCharStats(cid, this.S.ownedChars[cid]);
      const w = PSO.calcWeaponStats(wid, this.S.ownedWeapons[wid]);
      const wpDef = PSO.WEAPONS[wid];
      const wCls = PSO.WEAPON_CLASSES[wpDef.type];
      const accM = 1 + (this.S.accLv - 1) * 0.008;
      const kingM = wpDef.passiveId === 'void_king' ? 1.15 : 1.0;

      const agi = Math.round((c.agi + w.agi) * kingM);
      const crit = Math.min(0.88,
        0.08 + agi * 0.004 + (wCls.crit || 0) +
        (cid === 3 ? 0.18 : 0) +
        (wpDef.passiveId === 'crit_12' ? 0.12 : 0)
      );
      return {
        hp: Math.round(c.hp * accM * kingM),
        atk: +((c.atk + w.atk) * accM * kingM).toFixed(1),
        def: Math.round(c.def * kingM),
        spd: +Math.min(8.8, Math.max(3.3, (c.spd + w.spd) * (kingM > 1 ? 1.06 : 1))).toFixed(2),
        agi,
        critChance: crit
      };
    }
  };

  // =========================================================================
  // 2. ENGINE RUNTIME STATE & INPUTS
  // =========================================================================
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const Engine = PSO.Engine = {
    G: null,
    keys: { left:false, right:false, up:false, down:false, jump:false, atk:false },
    jumpBuffer: 0,
    coyoteTimer: 0
  };

  function startLevel(lvNum, dungeonObj){
    PSO.Audio.unlock();
    const data = PSO.World.buildLevel(lvNum, dungeonObj || null);
    const st = Store.getTotalStats();
    const cid = Store.S.selChar;
    const wid = Store.S.selWeapon;

    Engine.G = {
      data, zoneIdx:0, paused:false, over:false, won:false,
      camX:0, shake:0, flash:0, hitstop:0, dimBg:0, slowMo:0,
      earnedGold:0, earnedKills:0, timeMs:0,
      cp:{ zoneIdx:0, x:90, y:PSO.GROUND_Y - 26, count:0 },
      player:{
        x:90, y:PSO.GROUND_Y - 26, vx:0, vy:0, w:24, h:44,
        facing:1, onGround:false, climbing:false, wallSlide:false, wallDir:0,
        jumpsLeft: cid === 7 ? 3 : 2, dropTimer:0,
        hp:st.hp, maxHp:st.hp, atk:st.atk, def:st.def, spd:st.spd, agi:st.agi, crit:st.critChance,
        charId:cid, weaponId:wid,
        ulti:30, skillCd:0, skillMaxCd:PSO.CHARACTERS[cid].skill.cd,
        atkTimer:0, atkMax:14, atkCd:0, atkPose:'slash_down', atkDidHit:false, atkHitSet:new Set(),
        comboStep:0, comboHits:0, comboReset:0, totalSwings:0,
        dashTimer:0, dashCd:0, dashCharges:cid === 3 ? 2 : 1, postDashBuff:0,
        parryTimer:0, parryCd:0,
        invuln:0, animT:0, shieldTimer:0
      },
      particles:[], floats:[], projs:[], ghosts:[], fxEntities:[]
    };

    syncZoneMusic();
    PSO.Audio.sfx('door');
    if(PSO.UI) PSO.UI.onGameStart();
  }

  function syncZoneMusic(){
    const G = Engine.G;
    if(!G) return;
    const th = G.data.zones[G.zoneIdx].theme;
    if(G.data.isDungeon || th === 'boss') PSO.Audio.setTrack('boss');
    else if(th === 'exterior') PSO.Audio.setTrack('exterior');
    else if(th === 'mine' || th === 'metro') PSO.Audio.setTrack('underground');
    else PSO.Audio.setTrack('interior');
  }

  function respawnAtCheckpoint(){
    const G = Engine.G; if(!G) return;
    G.over = false; G.paused = false;
    G.zoneIdx = G.cp.zoneIdx;
    const p = G.player;
    p.x = G.cp.x; p.y = G.cp.y; p.vx = 0; p.vy = 0; p.climbing = false;
    p.hp = p.maxHp; p.invuln = 95; p.ulti = Math.max(p.ulti, 35);
    syncZoneMusic();
    PSO.Audio.sfx('checkpoint');
    if(PSO.UI){ PSO.UI.closeModal(); PSO.UI.toast('⚑ Son dirilme noktasında canlandın!'); }
  }

  function addFloat(x, y, txt, col, big){
    if(!Engine.G) return;
    Engine.G.floats.push({ x, y, txt, col:col || '#fff', big:!!big, life:46, vy:-1.25 });
  }
  function burst(x, y, col, n, spd){
    if(!Engine.G) return;
    for(let i = 0; i < (n || 10); i++){
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * (spd || 4);
      Engine.G.particles.push({ x, y, vx:Math.cos(a) * s, vy:Math.sin(a) * s - 1.3, col, life:16 + Math.random() * 18, sz:2 + Math.floor(Math.random() * 3) });
    }
  }

  // =========================================================================
  // 3. DEEP COMBAT: 4-HIT COMBO, 40 WEAPON PASSIVES, PARRY, POISE & REACTIONS
  // =========================================================================
  function triggerAttack(){
    const G = Engine.G; if(!G || G.paused || G.over) return;
    const p = G.player;
    if(p.atkCd > 0 || p.climbing || p.parryTimer > 0) return;

    const ch = PSO.CHARACTERS[p.charId];
    const wp = PSO.WEAPONS[p.weaponId];
    const wc = PSO.WEAPON_CLASSES[wp.type];

    // Advance 4-hit character combo chain
    const stepIdx = p.comboReset > 0 ? (p.comboStep % ch.combo.length) : 0;
    const move = ch.combo[stepIdx];
    p.comboStep = (stepIdx + 1) % ch.combo.length;
    p.comboReset = 68;
    p.totalSwings++;

    const spdBonus = (wp.passiveId === 'combo_spd' && p.comboHits >= 3) ? 0.92 : 1.0;
    const vexBonus = ch.id === 1 ? 0.78 : 1.0;
    const agiScale = Math.max(0.55, 1 - p.agi * 0.0038) * spdBonus * vexBonus;
    const totalFrames = Math.max(9, Math.round((wc.windup + wc.active + wc.rec) * agiScale));

    p.atkMax = totalFrames;
    p.atkTimer = totalFrames;
    p.atkCd = Math.max(7, totalFrames - 2);
    p.atkPose = move.pose;
    p.atkMove = move;
    p.atkStepIdx = stepIdx;
    p.atkDidHit = false;
    p.atkHitSet = new Set();

    // Lunge forward with attack momentum; Zen hovers slightly during air combos
    p.vx = p.facing * (move.stepX * 0.85);
    if(!p.onGround && ch.id === 7) p.vy = Math.min(p.vy, -1.6);

    PSO.Audio.sfx(stepIdx === 3 || wc.windup >= 8 ? 'swing_heavy' : 'swing_light');

    // Immediate Projectile Triggers (Reno Gunblade / Staff / Weapon Passives)
    if(move.shoot || wp.type === 'staff' || wp.passiveId === 'star_lance' ||
      (wp.passiveId === 'wave_3' && p.totalSwings % 3 === 0) ||
      (wp.passiveId === 'pierce_beam' && stepIdx === 3)){
      const isBeam = wp.passiveId === 'pierce_beam' && stepIdx === 3;
      G.projs.push({
        x:p.x + p.facing * 24, y:p.y - 6,
        vx:p.facing * (isBeam ? 14 : 10.5), vy:0,
        dmg: p.atk * (isBeam ? 1.65 : 0.95),
        fromPlayer:true, col:wp.edgeCol, elem:wp.element,
        life:isBeam ? 60 : 48, r:isBeam ? 12 : 8, pierce:isBeam
      });
    }
    if(wp.passiveId === 'void_king' && p.totalSwings % 3 === 0){
      G.fxEntities.push({ kind:'ring', x:p.x + p.facing * 48, y:p.y, maxR:125, life:18, maxLife:18, col:'#fef08a' });
    }
  }

  function processActiveAttackHitbox(){
    const G = Engine.G, p = G.player;
    if(p.atkTimer <= 0 || !p.atkMove) return;

    // Hitbox is active during the middle Strike phase (24% -> 62% of animation)
    const prog = 1 - (p.atkTimer / p.atkMax);
    if(prog < 0.24 || prog > 0.62) return;

    const ch = PSO.CHARACTERS[p.charId];
    const wp = PSO.WEAPONS[p.weaponId];
    const wc = PSO.WEAPON_CLASSES[wp.type];
    const move = p.atkMove;
    const isFinisher = p.atkStepIdx === 3;
    const z = G.data.zones[G.zoneIdx];

    const reach = (wc.reach * move.reachM) + (ch.id === 2 ? 24 : 0);

    // 1. Smash Destructible Crates
    for(let i = z.crates.length - 1; i >= 0; i--){
      const cr = z.crates[i];
      if(p.atkHitSet.has(cr)) continue;
      const dx = (cr.x + 14) - p.x, dy = Math.abs((cr.y + 14) - p.y);
      if(dx * p.facing > -22 && Math.abs(dx) < reach + 16 && dy < 48){
        p.atkHitSet.add(cr);
        cr.hp--;
        burst(cr.x + 14, cr.y + 14, '#d97706', 9, 3.5);
        PSO.Audio.sfx('crate');
        if(cr.hp <= 0){
          if(cr.drop === 'gold'){
            z.items.push({x:cr.x + 14, y:cr.y + 6, type:'gold', val:Math.round(40 + G.data.levelNum * 14), taken:false});
          } else {
            z.items.push({x:cr.x + 14, y:cr.y + 6, type:cr.drop, taken:false});
          }
          z.crates.splice(i, 1);
        }
      }
    }

    // 2. Strike Monsters & Bosses
    z.mobs.forEach(m => {
      if(m.hp <= 0 || p.atkHitSet.has(m)) return;
      const dx = m.x - p.x, dy = Math.abs(m.y - p.y);
      if(dx * p.facing > -24 && Math.abs(dx) < reach + m.w * 0.55 && dy < 58){
        p.atkHitSet.add(m);

        // Shield Frontal Guard Check
        const isBehind = (dx > 0 && m.facing > 0) || (dx < 0 && m.facing < 0);
        const pierces = wc.pierceShield || ch.id === 2 || isFinisher || m.staggerTimer > 0 || isBehind;
        if(m.kind === 'shield' && !pierces){
          PSO.Audio.sfx('block');
          addFloat(m.x, m.y - 32, '🛡️ BLOK!', '#94a3b8');
          burst(m.x - m.facing * 14, m.y, '#e2e8f0', 7, 3);
          m.poise = Math.max(0, m.poise - wc.poise * 0.45);
          return;
        }

        // Compute Damage with ALL Character & 40 Weapon Passives!
        let mult = move.dmgM;
        mult *= ch.id === 0 ? (1 + Math.min(0.95, p.comboHits * 0.06)) : (1 + Math.min(0.55, p.comboHits * 0.03));
        if(!p.onGround) mult *= (ch.id === 7 ? 1.45 : wc.airBonus) * (wp.passiveId === 'air_35' ? 1.35 : 1.0);
        if(isBehind && ch.id === 3) mult *= 1.40;
        if(isBehind && wp.passiveId === 'backstab') mult *= 1.30;
        if(ch.id === 8 && (m.freeze > 0 || m.slow > 0)) mult *= 1.40;
        if(m.staggerTimer > 0) mult *= 1.35;
        if(m.shredTimer > 0) mult *= 1.28;

        // Weapon-specific conditional multipliers
        const pid = wp.passiveId;
        if(pid === 'first_hit' && m.hp >= m.maxHp) mult *= 1.18;
        if(pid === 'range_dmg' && Math.abs(dx) > 58) mult *= 1.15;
        if(pid === 'shield_50' && m.kind === 'shield') mult *= 1.50;
        if(pid === 'frost_shat' && (m.slow > 0 || m.freeze > 0)) mult *= 1.25;
        if(pid === 'execute_30' && m.hp < m.maxHp * 0.30) mult *= 1.45;
        if(pid === 'low_hp_fury' && p.hp < p.maxHp * 0.50) mult *= 1.35;
        if(pid === 'boss_25' && m.isBoss) mult *= 1.25;
        if(pid === 'abyss_reap' && m.isBoss) mult *= 1.20;
        if(pid === 'solar_burn') mult *= 1.20;

        let critChance = p.crit + (pid === 'crit_dash' && p.postDashBuff > 0 ? 0.25 : 0);
        const isCrit = Math.random() < critChance;
        const critMult = isCrit ? (pid === 'crit_dmg_40' ? 2.15 : 1.75) : 1.0;

        const dmg = +(p.atk * mult * critMult * (0.95 + Math.random() * 0.1)).toFixed(1);
        const poiseDmg = wc.poise * move.poiseM * (ch.id === 4 ? 1.5 : 1.0) * (pid === 'poise_40' ? 1.4 : pid === 'poise_20' ? 1.2 : 1.0);

        // Apply Element: Finisher applies Hero element, normal hits apply Weapon element -> Triggers Reactions!
        const appliedElem = isFinisher ? ch.element : wp.element;
        damageMonster(m, dmg, isCrit, p.facing * wc.kb * (isFinisher ? 1.4 : 1.0), appliedElem, move.liftY, poiseDmg);

        // On-Hit Weapon & Hero Passives
        if(isFinisher && ch.id === 6) healPlayer(+(dmg * 0.12).toFixed(1), '#c084fc');
        if(ch.id === 8) m.slow = 160;
        if(pid === 'vamp_5') healPlayer(+(dmg * 0.05).toFixed(1), '#c084fc');
        if(pid === 'abyss_reap') healPlayer(+(dmg * 0.08).toFixed(1), '#c084fc');
        if(pid === 'crit_vamp' && isCrit) healPlayer(+(dmg * 0.08).toFixed(1), '#f43f5e');
        if(pid === 'stun_fin' && isFinisher && !m.isBoss) m.staggerTimer = Math.max(m.staggerTimer, 60);
        if(pid === 'burn_chance' && Math.random() < 0.35) m.burn = 160;
        if(pid === 'dash_reset' && isCrit) p.dashCd = Math.floor(p.dashCd * 0.5);
        if(pid === 'crit_burst' && isCrit) G.fxEntities.push({kind:'ring', x:m.x, y:m.y, maxR:75, life:14, maxLife:14, col:'#fde047'});
        if((pid === 'chain_bolt' && Math.random() < 0.30) || (pid === 'omega_arc' && Math.random() < 0.45)){
          chainLightning(m, dmg * 0.48);
          if(pid === 'omega_arc') p.ulti = Math.min(100, p.ulti + 4);
        }
        if((pid === 'shock_slam' || pid === 'frost_nova') && isFinisher){
          const col = pid === 'frost_nova' ? '#38bdf8' : '#facc15';
          G.fxEntities.push({kind:'ring', x:m.x, y:m.y, maxR:140, life:18, maxLife:18, col});
          z.mobs.forEach(o => { if(o !== m && o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) < 140){
            if(pid === 'frost_nova') o.freeze = 90;
            damageMonster(o, +(dmg * 0.5).toFixed(1), false, Math.sign(o.x - m.x) * 6, pid === 'frost_nova' ? 'frost' : 'star', 2, 18);
          }});
        }

        if(!p.atkDidHit){
          p.atkDidHit = true;
          p.comboHits++;
          p.comboReset = 165;
          const ultGain = (isFinisher ? 13 : 8) * (pid === 'ulti_fast' ? 1.25 : pid === 'time_warp' ? 1.40 : 1.0);
          p.ulti = Math.min(100, p.ulti + ultGain);
          G.hitstop = move.hitstop || 2;
          G.shake = Math.max(G.shake, isCrit ? 7 : isFinisher ? 6 : 3);
          PSO.Audio.sfx(isCrit ? 'hit_crit' : isFinisher ? 'hit_heavy' : 'hit_light');
          if(move.shockwave) G.fxEntities.push({kind:'ring', x:m.x, y:m.y, maxR:95, life:15, maxLife:15, col:wp.edgeCol});
        }
      }
    });
  }

  function chainLightning(srcMob, dmg){
    const z = Engine.G.data.zones[Engine.G.zoneIdx];
    const target = z.mobs.find(o => o !== srcMob && o.hp > 0 && Math.hypot(o.x - srcMob.x, o.y - srcMob.y) < 210);
    if(!target) return;
    target.hp = Math.max(0, +(target.hp - dmg).toFixed(1));
    target.hitFlash = 8;
    addFloat(target.x, target.y - 30, `⚡${dmg.toFixed(1)}`, '#22d3ee');
    Engine.G.fxEntities.push({kind:'bolt', x1:srcMob.x, y1:srcMob.y, x2:target.x, y2:target.y, life:12, col:'#22d3ee'});
    if(target.hp <= 0) onMonsterKilled(target);
  }

  function healPlayer(amt, col){
    const p = Engine.G.player;
    if(amt <= 0) return;
    p.hp = Math.min(p.maxHp, +(p.hp + amt).toFixed(1));
    addFloat(p.x, p.y - 36, `+${amt}`, col || '#4ade80');
  }

  function damageMonster(m, dmg, isCrit, kb, elem, liftY, poiseDmg){
    const G = Engine.G, p = G.player, z = G.data.zones[G.zoneIdx];
    const wp = PSO.WEAPONS[p.weaponId];

    // 1. GENSHIN-STYLE ELEMENTAL REACTION CHECK!
    if(elem){
      const react = PSO.resolveReaction(m.auraElem, elem);
      if(react){
        m.auraElem = null; m.auraTimer = 0;
        const rMult = react.dmgMult * (wp.passiveId === 'react_30' ? 1.30 : 1.0);
        dmg = +(dmg * rMult).toFixed(1);
        poiseDmg = (poiseDmg || 12) + react.poise;
        addFloat(m.x, m.y - m.h * 0.85 - 12, `✦ ${react.name}`, react.color, true);
        G.fxEntities.push({kind:'ring', x:m.x, y:m.y, maxR:Math.max(85, react.aoe), life:18, maxLife:18, col:react.color});
        burst(m.x, m.y, react.color, 18, 6);
        PSO.Audio.sfx('reaction');
        G.shake = Math.max(G.shake, 8);

        if(react.effect === 'freeze') m.freeze = 135;
        else if(react.effect === 'shred') m.shredTimer = 260;
        else if(react.effect === 'lifesteal') healPlayer(+(dmg * 0.14).toFixed(1), '#e879f9');
        else if(react.effect === 'energy') p.ulti = Math.min(100, p.ulti + 14);

        if(react.aoe > 0){
          z.mobs.forEach(o => {
            if(o !== m && o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) < react.aoe){
              const splash = +(dmg * 0.45).toFixed(1);
              o.hp = Math.max(0, +(o.hp - splash).toFixed(1)); o.hitFlash = 8;
              addFloat(o.x, o.y - 26, `${splash}`, react.color);
              if(o.hp <= 0) onMonsterKilled(o);
            }
          });
        }
      } else {
        m.auraElem = elem;
        m.auraTimer = 300;
        if(elem === 'fire') m.burn = 150;
        if(elem === 'frost') m.slow = 150;
      }
    }

    // 2. Apply HP & Poise/Stagger Damage
    m.hp = Math.max(0, +(m.hp - dmg).toFixed(1));
    m.hitFlash = 9;
    if(m.staggerTimer <= 0 && poiseDmg){
      m.poise = Math.max(0, m.poise - poiseDmg);
      if(m.poise <= 0){
        m.staggerTimer = m.isBoss ? 115 : 95;
        m.telegraph = 0;
        m.poise = m.maxPoise;
        G.hitstop = 6; G.shake = 10;
        PSO.Audio.sfx('poise_break');
        addFloat(m.x, m.y - m.h * 0.85, PSO.I18N[Store.S.lang].poiseBreak, '#facc15', true);
        G.fxEntities.push({kind:'ring', x:m.x, y:m.y, maxR:110, life:16, maxLife:16, col:'#facc15'});
        if(wp.passiveId === 'cataclysm'){
          const cDmg = +(p.atk * 2.5).toFixed(1);
          m.hp = Math.max(0, +(m.hp - cDmg).toFixed(1));
          addFloat(m.x, m.y - 45, `💥 ${cDmg}`, '#ef4444', true);
        }
      }
    }

    m.vx += m.isBoss ? (kb || 0) * 0.28 : (kb || 0);
    if(liftY > 0 && !m.isBoss && m.kind !== 'flyer') m.vy = -liftY * 1.45;
    addFloat(m.x, m.y - m.h * 0.55, isCrit ? `${dmg}★` : `${dmg}`, isCrit ? '#fde047' : '#ffffff', isCrit);
    burst(m.x, m.y, m.color, isCrit ? 14 : 7, 4.2);

    // Boss Enrage Phase 2 at 50% HP!
    if(m.isBoss && m.phase === 1 && m.hp > 0 && m.hp <= m.maxHp * 0.5){
      m.phase = 2; m.spd *= 1.24; m.telegraph = 0; m.invuln = 30;
      G.shake = 14; G.flash = 8;
      PSO.Audio.sfx('boss_roar');
      addFloat(m.x, m.y - 68, '🔥 ÖFKE FAZI 2!', '#f43f5e', true);
      G.fxEntities.push({kind:'ring', x:m.x, y:m.y, maxR:190, life:24, maxLife:24, col:'#f43f5e'});
      burst(m.x, m.y, '#f43f5e', 30, 7);
    }

    if(m.hp <= 0) onMonsterKilled(m);
  }

  function onMonsterKilled(m){
    const G = Engine.G, p = G.player;
    const wp = PSO.WEAPONS[p.weaponId];
    G.earnedKills++;
    const gDrop = Math.round((m.isBoss ? 105 : 16) * Math.pow(1.062, G.data.levelNum - 1));
    G.earnedGold += gDrop; Store.S.gold += gDrop;
    addFloat(m.x, m.y - 28, `+${gDrop}🪙`, '#fbbf24');
    burst(m.x, m.y, '#facc15', 20, 5.5);

    if(p.charId === 6) p.ulti = Math.min(100, p.ulti + 10);
    if(wp.passiveId === 'kill_heal') healPlayer(12, '#4ade80');
    if(m.isBoss) onBossDefeated(m);
  }

  // =========================================================================
  // 4. PERFECT PARRY, ACTIVE SKILLS [E] (10 UNIQUE) & ULTIMATES [Q] (10 UNIQUE)
  // =========================================================================
  function triggerParry(){
    const G = Engine.G; if(!G || G.paused || G.over) return;
    const p = G.player;
    if(p.parryCd > 0 || p.climbing) return;
    p.parryTimer = 15; // Crisp 0.25s active parry window
    p.parryCd = 38;
    p.atkTimer = 0;
    PSO.Audio.sfx('swing_light');
  }

  function triggerSkill(){
    const G = Engine.G; if(!G || G.paused || G.over) return;
    const p = G.player, ch = PSO.CHARACTERS[p.charId], wp = PSO.WEAPONS[p.weaponId];
    if(p.skillCd > 0 || p.climbing) return;

    const cdScale = (wp.passiveId === 'cd_reduce' ? 0.8 : 1.0) * (wp.passiveId === 'time_warp' ? 0.72 : 1.0);
    p.skillMaxCd = Math.round(ch.skill.cd * cdScale);
    p.skillCd = p.skillMaxCd;
    p.invuln = Math.max(p.invuln, 16);
    PSO.Audio.sfx('skill');
    addFloat(p.x, p.y - 44, `✦ ${ch.skill.name}`, ch.palette.glow, false);

    const z = G.data.zones[G.zoneIdx];
    if(ch.id === 0){ // Kairo: Flame Shadow Dash Slash
      p.vx = p.facing * 14; p.dashTimer = 12;
      G.fxEntities.push({kind:'clone', x:p.x, y:p.y, vx:p.facing * 11, life:18, dmg:p.atk * 1.5, col:'#f97316', hitSet:new Set()});
    } else if(ch.id === 1){ // Vex: Rising Dragon Uppercut
      p.vy = -12.5; p.vx = p.facing * 4.5; p.atkTimer = 16; p.atkMax = 16; p.atkPose = 'sky_kick';
      z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - p.x, m.y - p.y) < 105) damageMonster(m, +(p.atk * 1.9).toFixed(1), true, p.facing * 4, 'fire', 8.5, 38); });
    } else if(ch.id === 2){ // Sora: Frost Spear Dive
      p.vy = -9; p.vx = p.facing * 9;
      G.fxEntities.push({kind:'ring', x:p.x + p.facing * 70, y:p.y + 10, maxR:115, life:16, maxLife:16, col:'#38bdf8'});
      z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - (p.x + p.facing * 60), m.y - p.y) < 115){ m.slow = 180; damageMonster(m, +(p.atk * 1.8).toFixed(1), false, p.facing * 6, 'frost', 2, 34); }});
    } else if(ch.id === 3){ // Nyx: Shadow Step Backstab
      const tgt = z.mobs.find(m => m.hp > 0 && Math.abs(m.x - p.x) < 340);
      if(tgt){
        burst(p.x, p.y, '#f43f5e', 12, 4);
        p.x = clamp(tgt.x - tgt.facing * 36, 30, z.width - 30); p.y = tgt.y; p.facing = tgt.facing;
        damageMonster(tgt, +(p.atk * 2.3).toFixed(1), true, p.facing * 5, 'soul', 2, 36);
      }
    } else if(ch.id === 4){ // Titan: Shield Bash + Energy Barrier
      p.shieldTimer = 240; p.vx = p.facing * 12;
      G.fxEntities.push({kind:'ring', x:p.x, y:p.y, maxR:105, life:16, maxLife:16, col:'#38bdf8'});
      z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - p.x, m.y - p.y) < 115) damageMonster(m, +(p.atk * 1.7).toFixed(1), false, p.facing * 10, 'fire', 2, 62); });
    } else if(ch.id === 5){ // Reno: Backflip + 3 EMP Bombs
      p.vx = -p.facing * 6.5; p.vy = -6;
      for(let i = 0; i < 3; i++){
        G.projs.push({x:p.x, y:p.y - 10, vx:p.facing * (5 + i * 2.2), vy:-4.5 + i * 0.5, gravity:0.25, dmg:p.atk * 1.25, fromPlayer:true, col:'#22d3ee', elem:'cyber', life:60, r:9, aoe:85});
      }
    } else if(ch.id === 6){ // Vespera: Soul Hook Pull
      G.fxEntities.push({kind:'ring', x:p.x + p.facing * 140, y:p.y, maxR:130, life:18, maxLife:18, col:'#a855f7'});
      z.mobs.forEach(m => {
        if(m.hp > 0 && Math.abs(m.x - (p.x + p.facing * 130)) < 145){
          if(!m.isBoss) m.x = p.x + p.facing * 42;
          damageMonster(m, +(p.atk * 1.85).toFixed(1), false, -p.facing * 4, 'soul', 1, 30);
        }
      });
    } else if(ch.id === 7){ // Zen: Gale Vacuum Launch
      G.fxEntities.push({kind:'ring', x:p.x, y:p.y, maxR:145, life:18, maxLife:18, col:'#34d399'});
      z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - p.x, m.y - p.y) < 150) damageMonster(m, +(p.atk * 1.7).toFixed(1), false, 0, 'star', 7.5, 36); });
    } else if(ch.id === 8){ // Freya: Glacial Ring Freeze
      G.fxEntities.push({kind:'ring', x:p.x, y:p.y, maxR:155, life:20, maxLife:20, col:'#7dd3fc'});
      z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - p.x, m.y - p.y) < 160){ m.freeze = 150; damageMonster(m, +(p.atk * 1.9).toFixed(1), false, 0, 'frost', 0, 34); }});
    } else if(ch.id === 9){ // Aether: 3 Dimensional Void Rifts
      for(let i = 1; i <= 3; i++){
        const rx = p.x + p.facing * (i * 75);
        G.fxEntities.push({kind:'void_rift', x:rx, y:p.y - 10, life:24, dmg:p.atk * 1.45, hitDone:false});
      }
    }
  }

  function triggerUlti(){
    const G = Engine.G; if(!G || G.paused || G.over) return;
    const p = G.player, ch = PSO.CHARACTERS[p.charId], z = G.data.zones[G.zoneIdx];
    if(p.ulti < 100) return;

    p.ulti = 0; p.invuln = 60; G.shake = 15; G.flash = 9;
    PSO.Audio.sfx('ulti');
    addFloat(p.x, p.y - 56, `⚡ ${ch.ulti.name.toUpperCase()}!`, ch.palette.primary, true);

    if(ch.id === 0){
      for(let i = 0; i < 3; i++){
        G.fxEntities.push({kind:'clone', x:p.x - 90 + i * 45, y:p.y, vx:p.facing * (12 + i * 2), life:34 + i * 8, dmg:p.atk * 1.95, col:ch.palette.primary, hitSet:new Set()});
      }
    } else if(ch.id === 1){
      const tgt = z.mobs.find(m => m.hp > 0 && Math.abs(m.x - p.x) < 400);
      if(tgt){ p.x = clamp(tgt.x - p.facing * 36, 30, z.width - 30); p.y = tgt.y; }
      G.fxEntities.push({kind:'flurry', x:p.x + p.facing * 36, y:p.y, dir:p.facing, life:38, tick:0, dmg:p.atk * 0.72, col:'#f97316'});
    } else if(ch.id === 2){
      G.fxEntities.push({kind:'dragon_charge', x:p.x, y:p.y, vx:p.facing * 14.5, life:34, dmg:p.atk * 4.1, col:'#22c55e', hitSet:new Set()});
    } else if(ch.id === 3){
      G.dimBg = 46;
      for(let i = 0; i < 14; i++){
        G.fxEntities.push({kind:'nyx_slash', x:p.x - 240 + Math.random() * 480, y:p.y - 120 + Math.random() * 190, ang:-1.1 + Math.random() * 2.2, life:34, dmg:p.atk * 0.92, col:'#f43f5e'});
      }
    } else if(ch.id === 4){
      healPlayer(+(p.maxHp * 0.28).toFixed(1), '#4ade80');
      p.shieldTimer = 300;
      for(let i = -3; i <= 3; i++){
        if(i === 0) continue;
        G.fxEntities.push({kind:'geyser', x:p.x + i * 68, y:PSO.GROUND_Y, delay:Math.abs(i) * 5, life:34, dmg:p.atk * 3.5, col:'#f97316', done:false});
      }
    } else if(ch.id === 5){
      G.fxEntities.push({kind:'orbital_beam', x:p.x + p.facing * 95, y:PSO.GROUND_Y, vx:p.facing * 3.4, life:58, dmg:p.atk * 0.62, col:'#22d3ee'});
      for(let i = 0; i < 6; i++){
        G.projs.push({x:p.x, y:p.y - 24 - i * 8, vx:p.facing * (6 + i), vy:-2.5 + i * 0.8, dmg:p.atk * 1.15, fromPlayer:true, col:'#38bdf8', elem:'cyber', life:75, r:8, homing:true});
      }
    } else if(ch.id === 6){
      for(let i = 0; i < 4; i++){
        G.fxEntities.push({kind:'orbit_scythe', ang:i * (Math.PI / 2), rad:88, life:420, dmg:p.atk * 0.82, col:'#a855f7'});
      }
    } else if(ch.id === 7){
      G.fxEntities.push({kind:'tornado', x:p.x + p.facing * 55, y:PSO.GROUND_Y, vx:p.facing * 3.6, life:115, dmg:p.atk * 0.48, col:'#34d399'});
    } else if(ch.id === 8){
      for(let i = 0; i < 9; i++){
        G.fxEntities.push({kind:'icicle', x:p.x - 260 + i * 66, y:35 - i * 22, vy:14, life:52, dmg:p.atk * 3.9, col:'#7dd3fc', done:false});
      }
    } else if(ch.id === 9){
      G.fxEntities.push({kind:'blackhole', x:p.x + p.facing * 160, y:p.y - 45, life:100, dmg:p.atk * 0.40, boomDmg:p.atk * 5.2, col:'#c084fc'});
    }
  }

  function triggerDash(){
    const G = Engine.G; if(!G || G.paused || G.over) return;
    const p = G.player, ch = PSO.CHARACTERS[p.charId], z = G.data.zones[G.zoneIdx];
    if(p.dashCd > 0 && p.dashCharges <= 0) return;

    p.dashTimer = 11; p.invuln = Math.max(p.invuln, 20); p.climbing = false; p.postDashBuff = 70;
    if(ch.id === 3 && p.dashCharges > 1){ p.dashCharges--; }
    else { p.dashCharges = ch.id === 3 ? 2 : 1; p.dashCd = Math.max(20, 46 - Math.floor(p.agi * 0.3)); }
    PSO.Audio.sfx('dash');

    if(ch.id === 9){ // Aether Passive: Blink behind nearest enemy
      const tgt = z.mobs.find(m => m.hp > 0 && Math.abs(m.x - p.x) < 280);
      if(tgt){
        burst(p.x, p.y, '#facc15', 12, 4);
        p.x = clamp(tgt.x + (tgt.x > p.x ? 42 : -42), 30, z.width - 30);
        p.facing = tgt.x > p.x ? 1 : -1;
        damageMonster(tgt, +(p.atk * 0.9).toFixed(1), false, p.facing * 3, 'star', 0, 18);
        return;
      }
    }
    p.vx = p.facing * (p.spd * 2.65); p.vy = 0;
  }

  function tryInteract(){
    const G = Engine.G; if(!G || G.paused || G.over) return;
    const p = G.player, z = G.data.zones[G.zoneIdx];
    const pt = z.portals.find(pt => Math.abs(p.x - pt.x) < 60 && Math.abs(p.y - (pt.y - 26)) < 72);
    if(pt){
      G.zoneIdx = pt.targetZone;
      p.x = 76; p.y = PSO.GROUND_Y - 26; p.vx = 0; p.vy = 0; p.climbing = false;
      G.camX = 0; G.flash = 8;
      syncZoneMusic();
      PSO.Audio.sfx('door');
      if(PSO.UI){ PSO.UI.updateHud(); PSO.UI.toast(`🚪 ${zoneDisplayName(G.data.zones[G.zoneIdx])}`); }
    }
  }

  function zoneDisplayName(z){
    const T = PSO.I18N[Store.S.lang];
    if(z.label) return z.label;
    if(z.theme === 'exterior') return T.zones[0];
    if(T.interiors[z.theme]) return T.interiors[z.theme];
    if(T.undergrounds[z.theme]) return T.undergrounds[z.theme];
    return T.zones[3];
  }

  // =========================================================================
  // 5. MAIN 60FPS PHYSICS, FX, AI & RENDER STEP
  // =========================================================================
  function stepFx(){
    const G = Engine.G, z = G.data.zones[G.zoneIdx], p = G.player;
    for(let i = G.fxEntities.length - 1; i >= 0; i--){
      const fx = G.fxEntities[i];
      fx.life--;
      if(fx.kind === 'clone'){
        fx.x += fx.vx;
        z.mobs.forEach(m => { if(m.hp > 0 && !fx.hitSet.has(m) && Math.abs(m.x - fx.x) < 42 && Math.abs(m.y - fx.y) < 60){ fx.hitSet.add(m); damageMonster(m, +(fx.dmg).toFixed(1), true, Math.sign(fx.vx) * 5, 'fire', 1.5, 25); }});
      } else if(fx.kind === 'flurry'){
        fx.tick++;
        if(fx.tick % 4 === 0){
          burst(fx.x, fx.y, '#f97316', 5, 4); PSO.Audio.sfx('hit_light');
          z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - fx.x, m.y - fx.y) < 105) damageMonster(m, +(fx.dmg).toFixed(1), fx.tick > 30, fx.dir * (fx.tick > 30 ? 9 : 1), 'fire', fx.tick > 30 ? 5.5 : 0, 14); });
        }
      } else if(fx.kind === 'dragon_charge'){
        fx.x += fx.vx; p.x = clamp(fx.x, 30, z.width - 30);
        if(fx.life % 5 === 0) G.fxEntities.push({kind:'geyser', x:fx.x, y:PSO.GROUND_Y, delay:2, life:22, dmg:p.atk * 1.1, col:'#38bdf8', done:false});
        z.mobs.forEach(m => { if(m.hp > 0 && !fx.hitSet.has(m) && Math.abs(m.x - fx.x) < 60 && Math.abs(m.y - fx.y) < 68){ fx.hitSet.add(m); damageMonster(m, +(fx.dmg).toFixed(1), true, Math.sign(fx.vx) * 9, 'frost', 3, 45); }});
      } else if(fx.kind === 'nyx_slash' && fx.life === 12){
        PSO.Audio.sfx('hit_crit'); G.shake = 7;
        z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - fx.x, m.y - fx.y) < 105) damageMonster(m, +(fx.dmg).toFixed(1), true, 0, 'soul', 1, 16); });
      } else if(fx.kind === 'geyser'){
        if(fx.delay > 0){ fx.delay--; fx.life++; continue; }
        if(!fx.done){
          fx.done = true; G.shake = 8; PSO.Audio.sfx('hit_heavy'); burst(fx.x, fx.y - 30, fx.col, 12, 5);
          z.mobs.forEach(m => { if(m.hp > 0 && Math.abs(m.x - fx.x) < 52 && Math.abs(m.y - (fx.y - 55)) < 98) damageMonster(m, +(fx.dmg).toFixed(1), true, 0, 'fire', 5, 40); });
        }
      } else if(fx.kind === 'orbital_beam'){
        fx.x += fx.vx;
        if(fx.life % 6 === 0){
          G.shake = 5; burst(fx.x, PSO.GROUND_Y - 12, '#22d3ee', 8, 5);
          z.mobs.forEach(m => { if(m.hp > 0 && Math.abs(m.x - fx.x) < 58) damageMonster(m, +(fx.dmg).toFixed(1), false, 0, 'cyber', 1, 18); });
        }
      } else if(fx.kind === 'orbit_scythe'){
        fx.ang += 0.14;
        const ox = p.x + Math.cos(fx.ang) * fx.rad, oy = p.y + Math.sin(fx.ang) * fx.rad;
        if(fx.life % 8 === 0){
          z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - ox, m.y - oy) < 48){ damageMonster(m, +(fx.dmg).toFixed(1), false, Math.sign(m.x - p.x) * 3, 'soul', 0, 12); healPlayer(+(fx.dmg * 0.06).toFixed(1), '#c084fc'); }});
        }
      } else if(fx.kind === 'tornado'){
        fx.x += fx.vx;
        if(fx.life % 7 === 0){
          z.mobs.forEach(m => { if(m.hp > 0 && Math.abs(m.x - fx.x) < 82){ m.x += (fx.x - m.x) * 0.2; if(!m.isBoss) m.vy = -5.8; damageMonster(m, +(fx.dmg).toFixed(1), false, 0, 'star', 0, 14); }});
        }
      } else if(fx.kind === 'icicle'){
        fx.y += fx.vy;
        if(!fx.done && fx.y >= PSO.GROUND_Y - 18){
          fx.done = true; fx.vy = 0; G.shake = 6; PSO.Audio.sfx('hit_heavy'); burst(fx.x, PSO.GROUND_Y - 15, '#7dd3fc', 12, 5);
          z.mobs.forEach(m => { if(m.hp > 0 && Math.abs(m.x - fx.x) < 60){ m.freeze = 250; damageMonster(m, +(fx.dmg).toFixed(1), true, 0, 'frost', 0, 35); }});
        }
      } else if(fx.kind === 'blackhole'){
        z.mobs.forEach(m => {
          if(m.hp <= 0) return;
          const dx = fx.x - m.x, dy = fx.y - m.y, d = Math.hypot(dx, dy) || 1;
          if(d < 320){
            m.x += (dx / d) * (m.isBoss ? 1.6 : 4.2);
            if(!m.isBoss) m.y += (dy / d) * 3.0;
            if(fx.life % 10 === 0 && d < 95) damageMonster(m, +(fx.dmg).toFixed(1), false, 0, 'soul', 0, 12);
          }
        });
        if(fx.life === 1){
          G.shake = 18; G.flash = 10; PSO.Audio.sfx('poise_break'); burst(fx.x, fx.y, '#facc15', 36, 8);
          G.fxEntities.push({kind:'ring', x:fx.x, y:fx.y, maxR:240, life:22, maxLife:22, col:'#facc15'});
          z.mobs.forEach(m => { if(m.hp > 0 && Math.hypot(m.x - fx.x, m.y - fx.y) < 240) damageMonster(m, +(fx.boomDmg).toFixed(1), true, Math.sign(m.x - fx.x) * 10, 'star', 4, 80); });
        }
      } else if(fx.kind === 'void_rift' && !fx.hitDone && fx.life === 18){
        fx.hitDone = true;
        z.mobs.forEach(m => { if(m.hp > 0 && Math.abs(m.x - fx.x) < 42 && Math.abs(m.y - fx.y) < 62) damageMonster(m, +(fx.dmg).toFixed(1), true, p.facing * 4, 'star', 2, 28); });
      }
      if(fx.life <= 0) G.fxEntities.splice(i, 1);
    }
  }

  function step(){
    const G = Engine.G;
    if(!G || G.paused || G.over) return;
    G.timeMs += 16.67;
    if(G.hitstop > 0){ G.hitstop--; return; }
    if(G.slowMo > 0){ G.slowMo--; if(G.slowMo % 2 === 1) return; }

    const p = G.player, z = G.data.zones[G.zoneIdx], keys = Engine.keys;
    p.animT++;
    if(p.invuln > 0) p.invuln--;
    if(p.atkTimer > 0){ p.atkTimer--; processActiveAttackHitbox(); }
    if(p.atkCd > 0) p.atkCd--;
    if(p.dashCd > 0) p.dashCd--;
    if(p.postDashBuff > 0) p.postDashBuff--;
    if(p.parryTimer > 0) p.parryTimer--;
    if(p.parryCd > 0) p.parryCd--;
    if(p.skillCd > 0) p.skillCd--;
    if(p.shieldTimer > 0) p.shieldTimer--;
    if(p.dropTimer > 0) p.dropTimer--;
    if(p.comboReset > 0){ p.comboReset--; if(p.comboReset === 0) p.comboHits = 0; }
    if(G.shake > 0) G.shake *= 0.82;
    if(G.flash > 0) G.flash--;
    if(G.dimBg > 0) G.dimBg--;

    // 1. Update Working Cab Elevators
    for(const el of z.elevators){
      el.prevY = el.y;
      el.y += el.dir * el.spd;
      if(el.y <= el.minY){ el.y = el.minY; el.dir = 1; }
      else if(el.y >= el.maxY){ el.y = el.maxY; el.dir = -1; }
    }

    // 2. Climbable Ladders
    const nearLadder = z.ladders.find(l => Math.abs(p.x - l.x) < 24 && p.y + p.h / 2 >= l.y1 - 4 && p.y - p.h / 2 <= l.y2 + 4);
    if(nearLadder && (keys.up || (keys.down && p.y + p.h / 2 < nearLadder.y2))){
      p.climbing = true; p.vx = 0; p.vy = 0; p.x += (nearLadder.x - p.x) * 0.32;
      p.jumpsLeft = p.charId === 7 ? 3 : 2;
    }
    if(!nearLadder) p.climbing = false;

    // 3. Movement, Wall Slide & Wall Jump, Coyote Time
    p.wallSlide = false;
    if(p.climbing){
      if(keys.up) p.y -= 3.8;
      if(keys.down) p.y += 4.0;
      if(keys.left){ p.vx = -p.spd; p.facing = -1; p.climbing = false; }
      if(keys.right){ p.vx = p.spd; p.facing = 1; p.climbing = false; }
      if(Engine.jumpBuffer > 0){ p.climbing = false; p.vy = -10.8; Engine.jumpBuffer = 0; PSO.Audio.sfx('jump'); }
    } else {
      if(p.dashTimer > 0){
        p.dashTimer--;
        G.ghosts.push({x:p.x, y:p.y, facing:p.facing, col:PSO.CHARACTERS[p.charId].palette.primary, life:11});
      } else {
        const moveScale = p.atkTimer > 0 ? 0.35 : 1.0;
        if(keys.left){ p.vx = -p.spd * moveScale; p.facing = -1; }
        else if(keys.right){ p.vx = p.spd * moveScale; p.facing = 1; }
        else p.vx *= 0.72;
        p.vy += 0.56;
      }

      // Wall Slide against arena boundaries
      if(!p.onGround && p.vy > 0 && ((p.x <= 24 && keys.left) || (p.x >= z.width - 24 && keys.right))){
        p.wallSlide = true; p.wallDir = p.x <= 24 ? -1 : 1; p.vy = Math.min(p.vy, 2.2);
      }

      if(keys.down && Engine.jumpBuffer > 0 && p.onGround && p.y < PSO.GROUND_Y - 40){
        p.dropTimer = 14; p.onGround = false; Engine.jumpBuffer = 0;
      } else if(Engine.jumpBuffer > 0){
        if(p.wallSlide){
          p.vy = -11.4; p.vx = -p.wallDir * (p.spd * 1.6); p.facing = -p.wallDir;
          p.wallSlide = false; Engine.jumpBuffer = 0; burst(p.x, p.y, '#e2e8f0', 7, 3); PSO.Audio.sfx('jump');
        } else if(Engine.coyoteTimer > 0 || p.jumpsLeft > 0){
          p.vy = -(11.3 + Math.min(2.3, p.agi * 0.024));
          p.onGround = false; Engine.coyoteTimer = 0; p.jumpsLeft--; Engine.jumpBuffer = 0;
          burst(p.x, p.y + 20, '#94a3b8', 5, 2.2); PSO.Audio.sfx('jump');
        }
      }
      if(keys.atk) triggerAttack();
    }
    if(Engine.jumpBuffer > 0) Engine.jumpBuffer--;

    p.x = clamp(p.x + p.vx, 20, z.width - 20);
    p.y += p.vy;
    const wasOnGround = p.onGround;
    p.onGround = false;

    if(!p.climbing){
      for(const pl of z.plats){
        const isGround = pl.y >= PSO.GROUND_Y;
        if(!isGround && p.dropTimer > 0) continue;
        if(p.x + p.w / 2 > pl.x && p.x - p.w / 2 < pl.x + pl.w){
          if(p.vy >= 0 && (p.y - p.vy + p.h / 2) <= pl.y + 12 && (p.y + p.h / 2) >= pl.y){
            p.y = pl.y - p.h / 2; p.vy = 0; p.onGround = true; p.jumpsLeft = p.charId === 7 ? 3 : 2;
          }
        }
      }
      for(const el of z.elevators){
        if(p.x + p.w / 2 > el.x && p.x - p.w / 2 < el.x + el.w){
          if(p.vy >= 0 && (p.y - p.vy + p.h / 2) <= el.prevY + 14 && (p.y + p.h / 2) >= el.y - 4){
            p.y = el.y - p.h / 2; p.vy = 0; p.onGround = true; p.jumpsLeft = p.charId === 7 ? 3 : 2;
          }
        }
      }
    }
    if(p.y > PSO.GROUND_Y - p.h / 2){ p.y = PSO.GROUND_Y - p.h / 2; p.vy = 0; p.onGround = true; p.jumpsLeft = p.charId === 7 ? 3 : 2; }
    if(p.onGround) Engine.coyoteTimer = 7; else if(Engine.coyoteTimer > 0) Engine.coyoteTimer--;
    if(!wasOnGround && p.onGround) burst(p.x, p.y + 21, '#64748b', 4, 1.8);

    // 4. Hazards, Checkpoints (3 per level), Portals & Pickups
    for(const hz of z.hazards){
      if(p.invuln <= 0 && p.x > hz.x && p.x < hz.x + hz.w && p.y + p.h / 2 >= hz.y){
        hurtPlayer(+(Math.round((7.5 + G.data.levelNum * 1.45) * 2) / 2).toFixed(1), -p.facing, null);
      }
    }
    for(const cp of z.checkpoints){
      if(!cp.active && Math.abs(p.x - cp.x) < 46 && Math.abs(p.y - (cp.y - 24)) < 54){
        cp.active = true;
        G.cp = { zoneIdx:G.zoneIdx, x:cp.x, y:cp.y - 26, count:Math.min(3, G.cp.count + 1) };
        healPlayer(25, '#10b981');
        burst(cp.x, cp.y - 34, '#10b981', 20, 4.5);
        addFloat(cp.x, cp.y - 58, '⚑ DİRİLME NOKTASI KAYDEDİLDİ', '#10b981', true);
        PSO.Audio.sfx('checkpoint');
      }
    }
    for(const it of z.items){
      if(it.taken) continue;
      if(Math.hypot(p.x - it.x, p.y - it.y) < 34){
        it.taken = true;
        if(it.type === 'gold'){
          G.earnedGold += it.val; Store.S.gold += it.val;
          addFloat(it.x, it.y - 12, `+${it.val}🪙`, '#fbbf24');
          PSO.Audio.sfx('coin');
        } else {
          const h = it.type === 'hp20' ? 20 : it.type === 'hp50' ? 50 : 100;
          healPlayer(h, '#4ade80');
          burst(it.x, it.y, '#4ade80', 14, 3.5);
          PSO.Audio.sfx('heal');
        }
      }
    }

    stepFx();

    // 5. Monster & 2-Phase Boss AI
    let activeBoss = null;
    for(const m of z.mobs){
      if(m.hp <= 0) continue;
      if(m.isBoss) activeBoss = m;
      m.animT++;
      if(m.hitFlash > 0) m.hitFlash--;
      if(m.atkAnim > 0) m.atkAnim--;
      if(m.auraTimer > 0){ m.auraTimer--; if(m.auraTimer === 0) m.auraElem = null; }
      if(m.shredTimer > 0) m.shredTimer--;
      if(m.burn > 0){
        m.burn--;
        if(m.burn % 30 === 0){
          const dotM = PSO.WEAPONS[p.weaponId].passiveId === 'dot_boost' ? 1.4 : 1.0;
          damageMonster(m, +(p.atk * 0.22 * dotM).toFixed(1), false, 0, null, 0, 2);
          if(m.hp <= 0) continue;
        }
      }
      if(m.slow > 0) m.slow--;
      if(m.freeze > 0){ m.freeze--; continue; }
      if(m.staggerTimer > 0){ m.staggerTimer--; m.vx *= 0.8; continue; }
      if(m.cd > 0) m.cd--;

      const spd = m.spd * (m.slow > 0 ? 0.52 : 1.0);
      const dx = p.x - m.x, dy = p.y - m.y, dist = Math.hypot(dx, dy);

      if(m.isBoss){
        m.facing = dx >= 0 ? 1 : -1;
        if(m.telegraph > 0){
          m.telegraph--; m.vx *= 0.78;
          if(m.telegraph === 0){
            m.atkAnim = 18;
            if(m.bossMove === 'charge'){
              m.vx = m.facing * (m.phase === 2 ? 13 : 10); G.shake = 7; PSO.Audio.sfx('swing_heavy');
            } else if(m.bossMove === 'slam' || m.bossMove === 'jump_crush'){
              m.vy = -10.5; G.shake = 10; PSO.Audio.sfx('hit_heavy');
              G.projs.push({x:m.x + 24, y:PSO.GROUND_Y - 14, vx:6.8, vy:0, dmg:m.atk, fromPlayer:false, col:m.color, life:80, r:11});
              G.projs.push({x:m.x - 24, y:PSO.GROUND_Y - 14, vx:-6.8, vy:0, dmg:m.atk, fromPlayer:false, col:m.color, life:80, r:11});
            } else {
              const cnt = m.phase === 2 ? 5 : 3;
              for(let k = 0; k < cnt; k++){
                G.projs.push({x:m.x, y:m.y - 10, vx:m.facing * (5.2 + k * 1.1), vy:-1.8 + k * 0.7, dmg:+(m.atk * 0.85).toFixed(1), fromPlayer:false, col:'#facc15', life:95, r:8});
              }
              PSO.Audio.sfx('skill');
            }
          }
        } else {
          if(dist > 72) m.vx += m.facing * 0.28;
          m.vx = clamp(m.vx, -spd, spd);
          if(m.cd <= 0 && dist < 480){
            const moves = ['charge','slam','jump_crush','laser_sweep'];
            m.bossMove = moves[Math.floor(Math.random() * moves.length)];
            m.telegraph = m.phase === 2 ? 26 : 36;
            m.cd = m.phase === 2 ? 82 : 112;
          }
        }
      } else if(m.kind === 'flyer'){
        m.facing = dx >= 0 ? 1 : -1;
        if(dist < 360){ m.vx += Math.sign(dx) * 0.16; m.vy = Math.sin(m.animT * 0.08) * 1.6 + Math.sign(p.y - 68 - m.y) * 0.85; }
        else { m.vx = Math.sin(m.animT * 0.04) * spd; m.vy = Math.cos(m.animT * 0.06) * 0.8; }
        m.vx = clamp(m.vx, -spd, spd);
        m.x = clamp(m.x + m.vx, 30, z.width - 30);
        m.y = clamp(m.y + m.vy, 75, PSO.GROUND_Y - 64);
        if(dist < 280 && m.cd <= 0){ m.cd = 105; G.projs.push({x:m.x, y:m.y, vx:Math.sign(dx) * 4.8, vy:2.3, dmg:m.atk, fromPlayer:false, col:'#22d3ee', life:90, r:6}); }
      } else {
        if(dist < 360){
          m.facing = dx >= 0 ? 1 : -1;
          if(m.kind === 'caster' && dist < 280){
            m.vx *= 0.8;
            if(m.cd <= 0){ m.cd = 108; m.atkAnim = 16; G.projs.push({x:m.x, y:m.y - 6, vx:m.facing * 5.4, vy:0, dmg:m.atk, fromPlayer:false, col:'#c084fc', life:95, r:7}); }
          } else {
            m.vx += m.facing * 0.28; m.vx = clamp(m.vx, -spd, spd);
            if(dist < 56 && m.cd <= 0){ m.atkAnim = 16; m.cd = 52; }
          }
        } else {
          if(Math.abs(m.x - m.patrolX) > m.range) m.facing = m.x > m.patrolX ? -1 : 1;
          m.vx = m.facing * spd * 0.55;
        }
      }

      if(m.kind !== 'flyer'){
        m.vy += 0.55; m.x = clamp(m.x + m.vx, 30, z.width - 30); m.y += m.vy;
        for(const pl of z.plats){
          if(m.x > pl.x && m.x < pl.x + pl.w && m.vy >= 0 && (m.y - m.vy + m.h / 2) <= pl.y + 12 && (m.y + m.h / 2) >= pl.y){
            m.y = pl.y - m.h / 2; m.vy = 0;
          }
        }
        if(m.y > PSO.GROUND_Y - m.h / 2){ m.y = PSO.GROUND_Y - m.h / 2; m.vy = 0; }
      }

      // Enemy Contact / Strike vs Player (with Perfect Parry check!)
      if(Math.abs(p.x - m.x) < (p.w + m.w) * 0.45 && Math.abs(p.y - m.y) < (p.h + m.h) * 0.45){
        if(p.parryTimer > 0){
          executeParry(m, null);
        } else if(p.invuln <= 0){
          const raw = m.atk * (0.85 + Math.random() * 0.3) * (p.charId === 4 ? 0.76 : 1.0) * (p.shieldTimer > 0 ? 0.5 : 1.0);
          const mitigated = Math.max(0.5, raw - p.def * 0.14);
          hurtPlayer(+(Math.round(mitigated * 2) / 2).toFixed(1), m.facing, m);
        }
      }
    }

    // 6. Projectiles (including Parry Reflection!)
    for(let i = G.projs.length - 1; i >= 0; i--){
      const pr = G.projs[i];
      if(pr.gravity) pr.vy += pr.gravity;
      if(pr.homing){
        const tgt = z.mobs.find(m => m.hp > 0);
        if(tgt){ const a = Math.atan2(tgt.y - pr.y, tgt.x - pr.x); pr.vx = Math.cos(a) * 8.5; pr.vy = Math.sin(a) * 8.5; }
      }
      pr.x += pr.vx; pr.y += pr.vy; pr.life--;

      if(pr.fromPlayer){
        for(const m of z.mobs){
          if(m.hp > 0 && Math.hypot(pr.x - m.x, pr.y - m.y) < pr.r + m.w * 0.55){
            const wp = PSO.WEAPONS[p.weaponId];
            if(wp.passiveId === 'orb_double' && Math.random() < 0.35) m.freeze = 90;
            damageMonster(m, +pr.dmg.toFixed(1), false, Math.sign(pr.vx) * 4, pr.elem, 0, 16);
            if(pr.aoe){
              G.fxEntities.push({kind:'ring', x:pr.x, y:pr.y, maxR:pr.aoe, life:16, maxLife:16, col:pr.col});
              z.mobs.forEach(o => { if(o !== m && o.hp > 0 && Math.hypot(o.x - pr.x, o.y - pr.y) < pr.aoe) damageMonster(o, +(pr.dmg * 0.7).toFixed(1), false, 0, pr.elem, 1, 20); });
            }
            if(!pr.pierce){ pr.life = 0; break; }
          }
        }
      } else if(Math.hypot(pr.x - p.x, pr.y - p.y) < pr.r + 18){
        if(p.parryTimer > 0){
          executeParry(null, pr);
        } else if(p.invuln <= 0){
          hurtPlayer(+(Math.round(pr.dmg * 2) / 2).toFixed(1), Math.sign(pr.vx), null);
          pr.life = 0;
        }
      }
      if(pr.y > PSO.GROUND_Y) pr.life = 0;
      if(pr.life <= 0) G.projs.splice(i, 1);
    }

    G.particles = G.particles.filter(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.18; pt.life--; return pt.life > 0; });
    G.floats = G.floats.filter(fl => { fl.y += fl.vy; fl.life--; return fl.life > 0; });
    G.ghosts = G.ghosts.filter(gh => { gh.life--; return gh.life > 0; });

    // Smooth camera tracking
    const targetCam = clamp(p.x - PSO.LOG_W * 0.36, 0, Math.max(0, z.width - PSO.LOG_W));
    G.camX += (targetCam - G.camX) * 0.14;

    if(PSO.UI) PSO.UI.updateHud(activeBoss);
  }

  function executeParry(attacker, proj){
    const G = Engine.G, p = G.player, wp = PSO.WEAPONS[p.weaponId];
    p.parryTimer = 0; p.parryCd = 12; p.invuln = 30;
    G.hitstop = 7; G.slowMo = 12; G.flash = 7; G.shake = 9;
    Store.S.parriesTotal++;
    PSO.Audio.sfx('parry');
    addFloat(p.x, p.y - 48, `⚡ ${PSO.I18N[Store.S.lang].parry}`, '#fde047', true);
    G.fxEntities.push({kind:'ring', x:p.x + p.facing * 12, y:p.y - 4, maxR:95, life:16, maxLife:16, col:'#fde047'});
    burst(p.x + p.facing * 14, p.y - 4, '#fef08a', 20, 6);

    p.ulti = Math.min(100, p.ulti + (p.charId === 0 ? 25 : 15));
    if(wp.passiveId === 'parry_heal') healPlayer(15, '#4ade80');

    if(attacker){
      attacker.vx = -attacker.facing * 9;
      damageMonster(attacker, +(p.atk * 1.2).toFixed(1), true, -attacker.facing * 8, PSO.CHARACTERS[p.charId].element, 1, 75);
    }
    if(proj){
      // Reflect projectile back at enemies with 2.2x damage!
      proj.fromPlayer = true; proj.vx = -proj.vx * 1.7; proj.vy = -proj.vy;
      proj.dmg *= 2.2; proj.col = '#fde047'; proj.life = 70;
    }
  }

  function hurtPlayer(dmg, dir){
    const G = Engine.G, p = G.player;
    const superArmor = p.charId === 4 && p.atkTimer > 0 && p.atkStepIdx >= 2;
    p.hp = Math.max(0, +(p.hp - dmg).toFixed(1));
    p.invuln = 44;
    if(!superArmor){ p.vx = dir * 5.2; p.vy = -4.2; }
    G.shake = 8;
    addFloat(p.x, p.y - 30, `-${dmg}`, '#f43f5e', true);
    burst(p.x, p.y, '#f43f5e', 11, 4.2);
    PSO.Audio.sfx('hurt');

    if(p.hp <= 0){
      G.over = true;
      if(PSO.UI) PSO.UI.onDefeat();
    }
  }

  function onBossDefeated(){
    const G = Engine.G;
    G.won = true; G.paused = true;
    Store.S.bossesSlain++;
    PSO.Audio.sfx('victory');

    const summary = { gold:G.earnedGold, emeralds:0, mat:null, matQty:0, xp:0, firstClear:false, isDungeon:G.data.isDungeon };
    if(G.data.isDungeon){
      const d = G.data.dungeon;
      Store.addDungeonRun(d.id);
      const qty = d.dropMin + Math.floor(Math.random() * (d.dropMax - d.dropMin + 1));
      Store.S.mats[d.mat] = (Store.S.mats[d.mat] || 0) + qty;
      summary.mat = PSO.ELEMENTS[d.mat];
      summary.matQty = qty;
      summary.xp = Math.round(160 * Math.pow(1.05, d.recLv));
    } else {
      const lv = G.data.levelNum;
      summary.firstClear = !Store.S.clearedLevels[lv];
      Store.S.clearedLevels[lv] = true;
      if(lv >= Store.S.maxLevel && Store.S.maxLevel < 100) Store.S.maxLevel = lv + 1;
      summary.emeralds = summary.firstClear ? Math.round(8 + lv * 0.78) : Math.round(3 + lv * 0.28);
      Store.S.emeralds += summary.emeralds;
      summary.xp = Math.round(98 * Math.pow(1.065, lv));
    }
    const leveled = Store.gainAccXp(summary.xp);
    Store.save();
    if(PSO.UI) PSO.UI.onVictory(summary, leveled);
  }

  // =========================================================================
  // 6. FULL SCENE COMPOSITING (WORLD -> ENTITIES -> FX -> WEATHER -> 2D LIGHTS)
  // =========================================================================
  function render(canvas){
    const G = Engine.G; if(!G) return;
    if(canvas.width !== PSO.LOG_W || canvas.height !== PSO.LOG_H){
      canvas.width = PSO.LOG_W; canvas.height = PSO.LOG_H;
    }
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const z = G.data.zones[G.zoneIdx];
    const lights = [];

    const shX = (Math.random() - 0.5) * G.shake, shY = (Math.random() - 0.5) * G.shake;
    ctx.save();
    ctx.translate(Math.round(shX), Math.round(shY));

    // 1. Environment Backdrop & Geometry (collects dynamic light sources)
    PSO.World.drawBackdrop(ctx, z, G.data.district, G.camX, G.timeMs, lights);
    PSO.World.drawLevelGeometry(ctx, z, G.camX, G.timeMs, lights);

    if(G.dimBg > 0){ ctx.fillStyle = 'rgba(6,2,14,0.72)'; ctx.fillRect(0, 0, PSO.LOG_W, PSO.LOG_H); }

    // 2. Dash Afterimages, Enemies, Hero, Active Skills/Ulti VFX
    for(const gh of G.ghosts){
      ctx.globalAlpha = gh.life / 20; ctx.fillStyle = gh.col;
      ctx.fillRect(Math.round(gh.x - G.camX) - 9, Math.round(gh.y) - 20, 18, 40);
      ctx.globalAlpha = 1;
    }
    for(const m of z.mobs){
      if(m.hp > 0){
        PSO.Rig.drawEnemy(ctx, m, G.camX, 0);
        if(m.isBoss) lights.push({x:m.x - G.camX, y:m.y, r:120, col:'rgba(244,63,94,0.45)'});
      }
    }
    PSO.Rig.drawHero(ctx, G.player, G.camX, 0, 1);
    // Player personal lantern/aura light
    lights.push({
      x:G.player.x - G.camX, y:G.player.y - 6,
      r: (z.theme === 'mine' || z.theme === 'metro') ? 210 : 130,
      col: PSO.CHARACTERS[G.player.charId].palette.glow
    });

    PSO.Rig.drawFx(ctx, G.fxEntities, G.player, G.camX, 0);
    for(const fx of G.fxEntities){
      if(fx.x !== undefined) lights.push({x:fx.x - G.camX, y:fx.y || 240, r:130, col:fx.col || '#facc15'});
    }

    // 3. Projectiles & Particles
    for(const pr of G.projs){
      const sx = Math.round(pr.x - G.camX), sy = Math.round(pr.y);
      ctx.fillStyle = pr.col; ctx.fillRect(sx - pr.r, sy - pr.r / 2, pr.r * 2, pr.r);
      ctx.fillStyle = '#fff'; ctx.fillRect(sx - pr.r / 2, sy - pr.r / 4, pr.r, pr.r / 2);
      lights.push({x:sx, y:sy, r:55, col:pr.col});
    }
    for(const pt of G.particles){
      ctx.fillStyle = pt.col;
      ctx.fillRect(Math.round(pt.x - G.camX), Math.round(pt.y), pt.sz, pt.sz);
    }

    // 4. Weather & Dynamic 2D Multiply Lightmap!
    PSO.World.drawWeather(ctx, z.weather);
    PSO.World.drawLighting(ctx, z.theme, lights);

    // 5. Crisp Unlit Floating Damage Numbers & Screen Flash on top of Lightmap
    for(const fl of G.floats){
      ctx.font = fl.big ? '900 15px monospace' : 'bold 12px monospace';
      const fx = Math.round(fl.x - G.camX), fy = Math.round(fl.y);
      ctx.fillStyle = '#000'; ctx.fillText(fl.txt, fx + 1, fy + 1);
      ctx.fillStyle = fl.col; ctx.fillText(fl.txt, fx, fy);
    }
    if(G.flash > 0){
      ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.05})`;
      ctx.fillRect(0, 0, PSO.LOG_W, PSO.LOG_H);
    }
    ctx.restore();
  }

  Object.assign(Engine, {
    startLevel, respawnAtCheckpoint, triggerAttack, triggerSkill, triggerUlti,
    triggerDash, triggerParry, tryInteract, zoneDisplayName, step, render
  });
})();
