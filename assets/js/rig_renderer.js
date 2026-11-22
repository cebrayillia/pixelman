(function(){
  'use strict';
  const PSO = window.PSO = window.PSO || {};

  // =========================================================================
  // 1. MATH & ANALYTIC 2-BONE INVERSE KINEMATICS (IK) SOLVER
  // =========================================================================
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  const easeInQuad = t => t * t;
  const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  /**
   * Analytic 2-bone IK solver in 2D local space.
   * Returns joint {jx, jy} and clamped end-effector {ex, ey} + final bone angle.
   */
  function solveIK(x0, y0, tx, ty, l1, l2, bendDir){
    const dx = tx - x0;
    const dy = ty - y0;
    const rawDist = Math.hypot(dx, dy) || 0.0001;
    const maxReach = (l1 + l2) - 0.05;
    const minReach = Math.abs(l1 - l2) + 0.05;
    const dist = clamp(rawDist, minReach, maxReach);

    const baseAng = Math.atan2(dy, dx);
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const ang1 = baseAng + bendDir * Math.acos(cosA);

    const jx = x0 + Math.cos(ang1) * l1;
    const jy = y0 + Math.sin(ang1) * l1;
    const ex = x0 + (dx / rawDist) * dist;
    const ey = y0 + (dy / rawDist) * dist;
    const ang2 = Math.atan2(ey - jy, ex - jx);
    return { jx, jy, ex, ey, ang1, ang2 };
  }

  // =========================================================================
  // 2. CRISP PIXEL-ART RASTERIZED LIMB & SILHOUETTE PRIMITIVES
  // =========================================================================
  function pixBone(ctx, x1, y1, x2, y2, thickness, colCore, colHi, colOut){
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(3, Math.ceil(len / 1.4));
    const half = thickness * 0.5;
    const out = thickness + 2;
    const oh = out * 0.5;

    // Pass 1: 1px crisp dark pixel outline
    ctx.fillStyle = colOut || '#05060b';
    for(let i = 0; i <= steps; i++){
      const t = i / steps;
      ctx.fillRect(Math.round(x1 + dx * t - oh), Math.round(y1 + dy * t - oh), out, out);
    }
    // Pass 2: Core shaded mass
    ctx.fillStyle = colCore;
    for(let i = 0; i <= steps; i++){
      const t = i / steps;
      ctx.fillRect(Math.round(x1 + dx * t - half), Math.round(y1 + dy * t - half), thickness, thickness);
    }
    // Pass 3: Specular pixel rim highlight
    if(colHi && thickness >= 3){
      ctx.fillStyle = colHi;
      for(let i = 1; i < steps; i += 2){
        const t = i / steps;
        ctx.fillRect(Math.round(x1 + dx * t - half), Math.round(y1 + dy * t - half), Math.max(1, thickness - 2), 1);
      }
    }
  }

  function pixRectOut(ctx, x, y, w, h, fill, hi, outCol){
    const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h);
    ctx.fillStyle = outCol || '#05060b';
    ctx.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);
    ctx.fillStyle = fill;
    ctx.fillRect(rx, ry, rw, rh);
    if(hi && rh >= 3){
      ctx.fillStyle = hi;
      ctx.fillRect(rx, ry, rw, 1);
    }
  }

  // =========================================================================
  // 3. MULTI-NODE VERLET-STYLE CLOTH / SCARF / CAPE SIMULATION
  // =========================================================================
  function drawCloth(ctx, f, anchorX, anchorY, nodesCount, colMain, colTrim, scale){
    if(!f._cloth || f._cloth.length !== nodesCount){
      f._cloth = [];
      for(let i = 0; i < nodesCount; i++){
        f._cloth.push({ x: anchorX - i * 4, y: anchorY + i * 2 });
      }
    }
    const c = f._cloth;
    c[0].x = anchorX;
    c[0].y = anchorY;

    const windX = -(f.vx || 0) * (f.facing || 1) * 1.15 - 2.6;
    const windY = Math.sin((f.animT || 0) * 0.22) * 1.3 + (f.vy ? clamp(-f.vy * 0.35, -3.5, 3.5) : 0.9);
    const segLen = 4.4 * scale;

    for(let i = 1; i < nodesCount; i++){
      const prev = c[i - 1], cur = c[i];
      cur.x += (prev.x + windX - cur.x) * 0.38;
      cur.y += (prev.y + windY + 1.1 - cur.y) * 0.38;
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      const d = Math.hypot(dx, dy) || 0.001;
      cur.x = prev.x + (dx / d) * segLen;
      cur.y = prev.y + (dy / d) * segLen;
    }

    // Draw tapered pixel cape/scarf segments
    for(let i = 0; i < nodesCount - 1; i++){
      const w = Math.max(2, Math.round((6 - i * 0.45) * scale));
      pixBone(ctx, c[i].x, c[i].y, c[i + 1].x, c[i + 1].y, w, i === nodesCount - 2 ? colTrim : colMain, colTrim, '#05060b');
    }
  }

  // =========================================================================
  // 4. 3-PHASE COMBAT POSE LIBRARY (ANTICIPATION -> STRIKE -> RECOVERY)
  // =========================================================================
  // Coordinates are in hero local space (facing RIGHT = +X, DOWN = +Y, hip around y = 3)
  // Targets: fh (front hand), bh (back hand), ff (front foot), bf (back foot), torsoAngle, wpnAngle, smear
  const ATTACK_POSES = {
    // --- KAIRO / KATANA / FROST ---
    slash_down: {
      wind: { hipY:2,  torso:-0.28, fh:[-11,-22], bh:[-6,-14], ff:[9,22],  bf:[-9,22], wAng:-2.55 },
      hit:  { hipY:5,  torso:0.36,  fh:[20,6],    bh:[-10,-4], ff:[14,22], bf:[-13,22],wAng:0.65,  smear:'down' },
      rec:  { hipY:4,  torso:0.20,  fh:[14,10],   bh:[-6,-6],  ff:[11,22], bf:[-10,22],wAng:0.95 }
    },
    slash_up: {
      wind: { hipY:7,  torso:0.35,  fh:[8,12],    bh:[-8,4],   ff:[12,22], bf:[-10,22],wAng:1.25 },
      hit:  { hipY:-1, torso:-0.20, fh:[17,-23],  bh:[-9,-12], ff:[13,20], bf:[-11,22],wAng:-1.20, smear:'up' },
      rec:  { hipY:2,  torso:-0.05, fh:[12,-17],  bh:[-7,-8],  ff:[10,22], bf:[-9,22], wAng:-0.95 }
    },
    spin_cut: {
      wind: { hipY:6,  torso:-0.35, fh:[-14,-6],  bh:[10,-8],  ff:[6,22],  bf:[-12,22],wAng:-3.0 },
      hit:  { hipY:3,  torso:0.42,  fh:[22,-5],   bh:[-12,-6], ff:[15,22], bf:[-14,21],wAng:0.05,  smear:'horiz' },
      rec:  { hipY:4,  torso:0.18,  fh:[15,-2],   bh:[-8,-5],  ff:[11,22], bf:[-10,22],wAng:0.35 }
    },
    iaido_fin: {
      wind: { hipY:9,  torso:0.42,  fh:[-10,6],   bh:[-4,4],   ff:[13,22], bf:[-14,22],wAng:2.75 },
      hit:  { hipY:5,  torso:0.55,  fh:[24,-8],   bh:[-14,-4], ff:[17,22], bf:[-16,22],wAng:-0.15, smear:'mega' },
      rec:  { hipY:4,  torso:0.22,  fh:[18,-10],  bh:[-9,-4],  ff:[13,22], bf:[-12,22],wAng:-0.35 }
    },

    // --- VEX / ZEN (MARTIAL ARTS & KICKS) ---
    jab_fast: {
      wind: { hipY:4,  torso:0.10,  fh:[2,-10],   bh:[-5,-9],  ff:[10,22], bf:[-10,22],wAng:0.1 },
      hit:  { hipY:4,  torso:0.30,  fh:[22,-11],  bh:[-9,-8],  ff:[13,22], bf:[-12,22],wAng:0.0,   smear:'thrust' },
      rec:  { hipY:3,  torso:0.15,  fh:[11,-10],  bh:[-4,-9],  ff:[10,22], bf:[-10,22],wAng:0.15 }
    },
    cross_hook: {
      wind: { hipY:5,  torso:-0.18, fh:[-8,-8],   bh:[8,-10],  ff:[11,22], bf:[-11,22],wAng:-0.9 },
      hit:  { hipY:4,  torso:0.38,  fh:[16,-14],  bh:[20,-9],  ff:[14,22], bf:[-13,22],wAng:0.2,   smear:'horiz' },
      rec:  { hipY:4,  torso:0.15,  fh:[10,-10],  bh:[6,-9],   ff:[10,22], bf:[-10,22],wAng:0.3 }
    },
    low_sweep: {
      wind: { hipY:9,  torso:0.35,  fh:[-8,4],    bh:[8,2],    ff:[12,22], bf:[-12,22],wAng:1.5 },
      hit:  { hipY:11, torso:-0.30, fh:[-10,12],  bh:[-4,10],  ff:[22,19], bf:[-9,22], wAng:2.1,   smear:'low' },
      rec:  { hipY:7,  torso:0.10,  fh:[6,2],     bh:[-6,0],   ff:[12,22], bf:[-10,22],wAng:0.8 }
    },
    sky_kick: {
      wind: { hipY:8,  torso:0.28,  fh:[6,4],     bh:[-8,-2],  ff:[8,22],  bf:[-10,22],wAng:0.9 },
      hit:  { hipY:-3, torso:-0.52, fh:[-11,-6],  bh:[-13,2],  ff:[21,-14],bf:[-5,21], wAng:-1.4,  smear:'up' },
      rec:  { hipY:2,  torso:-0.12, fh:[6,-8],    bh:[-8,-4],  ff:[11,16], bf:[-8,22], wAng:-0.4 }
    },
    palm_gust: {
      wind: { hipY:6,  torso:-0.20, fh:[-6,-8],   bh:[-4,-11], ff:[10,22], bf:[-12,22],wAng:-1.8 },
      hit:  { hipY:4,  torso:0.38,  fh:[23,-10],  bh:[16,-7],  ff:[15,22], bf:[-14,22],wAng:0.0,   smear:'mega' },
      rec:  { hipY:4,  torso:0.15,  fh:[14,-9],   bh:[6,-8],   ff:[11,22], bf:[-11,22],wAng:0.2 }
    },
    cyclone_kick: {
      wind: { hipY:5,  torso:0.20,  fh:[-6,-12],  bh:[8,-10],  ff:[4,18],  bf:[-8,22], wAng:-1.2 },
      hit:  { hipY:-6, torso:-0.45, fh:[-12,-14], bh:[12,-12], ff:[22,-6], bf:[-14,8], wAng:0.3,   smear:'mega' },
      rec:  { hipY:0,  torso:0.05,  fh:[8,-10],   bh:[-8,-8],  ff:[10,18], bf:[-10,20],wAng:0.1 }
    },
    meteor_heel: {
      wind: { hipY:-6, torso:-0.35, fh:[-10,-16], bh:[10,-14], ff:[14,-10],bf:[-6,16], wAng:-2.2 },
      hit:  { hipY:6,  torso:0.48,  fh:[-12,-2],  bh:[-8,4],   ff:[21,16], bf:[-11,22],wAng:0.9,   smear:'down' },
      rec:  { hipY:5,  torso:0.20,  fh:[8,-6],    bh:[-6,-6],  ff:[12,22], bf:[-10,22],wAng:0.5 }
    },

    // --- SORA (SPEAR) ---
    thrust_mid: {
      wind: { hipY:5,  torso:-0.15, fh:[-11,-7],  bh:[4,-7],   ff:[11,22], bf:[-13,22],wAng:0.0 },
      hit:  { hipY:5,  torso:0.40,  fh:[24,-7],   bh:[8,-7],   ff:[16,22], bf:[-15,22],wAng:0.0,   smear:'thrust' },
      rec:  { hipY:4,  torso:0.18,  fh:[14,-7],   bh:[2,-7],   ff:[12,22], bf:[-11,22],wAng:0.08 }
    },
    thrust_dbl: {
      wind: { hipY:5,  torso:0.05,  fh:[-9,-12],  bh:[5,-9],   ff:[10,22], bf:[-12,22],wAng:-0.15 },
      hit:  { hipY:3,  torso:0.45,  fh:[25,-12],  bh:[9,-9],   ff:[16,22], bf:[-14,22],wAng:-0.18, smear:'thrust' },
      rec:  { hipY:4,  torso:0.20,  fh:[15,-9],   bh:[3,-8],   ff:[12,22], bf:[-11,22],wAng:-0.05 }
    },
    vault_arc: {
      wind: { hipY:6,  torso:0.30,  fh:[10,6],    bh:[-4,-4],  ff:[12,22], bf:[-10,22],wAng:1.1 },
      hit:  { hipY:-5, torso:-0.22, fh:[19,-22],  bh:[4,-14],  ff:[15,12], bf:[-12,18],wAng:-1.1,  smear:'up' },
      rec:  { hipY:1,  torso:0.05,  fh:[14,-14],  bh:[2,-10],  ff:[11,20], bf:[-10,22],wAng:-0.5 }
    },
    dragon_pierce: {
      wind: { hipY:8,  torso:-0.25, fh:[-15,-5],  bh:[2,-5],   ff:[10,22], bf:[-16,22],wAng:0.0 },
      hit:  { hipY:5,  torso:0.58,  fh:[26,-6],   bh:[10,-6],  ff:[18,22], bf:[-17,22],wAng:0.0,   smear:'mega_thrust' },
      rec:  { hipY:4,  torso:0.25,  fh:[16,-6],   bh:[4,-6],   ff:[13,22], bf:[-12,22],wAng:0.05 }
    },

    // --- NYX & AETHER (ASSASSIN / TWIN BLADE) ---
    twin_x1: {
      wind: { hipY:6,  torso:0.30,  fh:[-10,-14], bh:[10,-14], ff:[11,22], bf:[-12,22],wAng:-2.2 },
      hit:  { hipY:5,  torso:0.48,  fh:[21,4],    bh:[-12,-10],ff:[15,22], bf:[-14,22],wAng:0.55,  smear:'down' },
      rec:  { hipY:5,  torso:0.26,  fh:[13,2],    bh:[-6,-8],  ff:[11,22], bf:[-11,22],wAng:0.4 }
    },
    twin_x2: {
      wind: { hipY:6,  torso:0.40,  fh:[12,8],    bh:[-10,-16],ff:[12,22], bf:[-12,22],wAng:1.4 },
      hit:  { hipY:3,  torso:0.22,  fh:[19,-18],  bh:[16,6],   ff:[14,22], bf:[-13,22],wAng:-0.95, smear:'up' },
      rec:  { hipY:4,  torso:0.18,  fh:[12,-10],  bh:[6,-2],   ff:[10,22], bf:[-10,22],wAng:-0.4 }
    },
    backflip_cut: {
      wind: { hipY:8,  torso:0.40,  fh:[8,6],     bh:[-8,4],   ff:[10,22], bf:[-10,22],wAng:1.2 },
      hit:  { hipY:-7, torso:-0.55, fh:[16,-20],  bh:[-14,-14],ff:[12,6],  bf:[-10,14],wAng:-1.7,  smear:'up' },
      rec:  { hipY:1,  torso:0.10,  fh:[12,-10],  bh:[-8,-6],  ff:[10,20], bf:[-10,22],wAng:-0.3 }
    },
    crimson_cross: {
      wind: { hipY:9,  torso:0.48,  fh:[-12,-16], bh:[-12,8],  ff:[13,22], bf:[-15,22],wAng:-2.4 },
      hit:  { hipY:5,  torso:0.60,  fh:[24,-4],   bh:[20,6],   ff:[18,22], bf:[-17,22],wAng:0.15,  smear:'mega' },
      rec:  { hipY:4,  torso:0.25,  fh:[15,-2],   bh:[8,2],    ff:[12,22], bf:[-12,22],wAng:0.35 }
    },

    // --- TITAN (HEAVY JUGGERNAUT) ---
    heavy_cleave: {
      wind: { hipY:2,  torso:-0.38, fh:[-14,-24], bh:[-10,-22],ff:[10,22], bf:[-13,22],wAng:-2.7 },
      hit:  { hipY:8,  torso:0.52,  fh:[21,12],   bh:[14,10],  ff:[16,22], bf:[-15,22],wAng:1.15,  smear:'heavy_down' },
      rec:  { hipY:7,  torso:0.34,  fh:[16,13],   bh:[9,11],   ff:[13,22], bf:[-12,22],wAng:1.3 }
    },
    heavy_golf: {
      wind: { hipY:9,  torso:0.42,  fh:[10,14],   bh:[4,12],   ff:[13,22], bf:[-13,22],wAng:1.6 },
      hit:  { hipY:-1, torso:-0.32, fh:[16,-25],  bh:[10,-21], ff:[14,21], bf:[-12,22],wAng:-1.35, smear:'up' },
      rec:  { hipY:2,  torso:-0.10, fh:[11,-18],  bh:[5,-15],  ff:[11,22], bf:[-10,22],wAng:-1.0 }
    },
    heavy_spin: {
      wind: { hipY:6,  torso:-0.40, fh:[-16,-6],  bh:[-12,-4], ff:[8,22],  bf:[-14,22],wAng:-3.1 },
      hit:  { hipY:5,  torso:0.45,  fh:[24,-4],   bh:[14,-4],  ff:[16,22], bf:[-15,22],wAng:0.1,   smear:'mega' },
      rec:  { hipY:5,  torso:0.20,  fh:[15,-2],   bh:[8,-2],   ff:[12,22], bf:[-11,22],wAng:0.4 }
    },
    earth_shatter: {
      wind: { hipY:-4, torso:-0.42, fh:[-12,-27], bh:[-8,-25], ff:[10,16], bf:[-10,20],wAng:-2.65 },
      hit:  { hipY:10, torso:0.58,  fh:[22,15],   bh:[15,13],  ff:[17,22], bf:[-16,22],wAng:1.35,  smear:'heavy_down' },
      rec:  { hipY:8,  torso:0.36,  fh:[17,15],   bh:[10,13],  ff:[14,22], bf:[-13,22],wAng:1.4 }
    },

    // --- RENO (GUNBLADE) ---
    gun_shot: {
      wind: { hipY:4,  torso:0.05,  fh:[14,-10],  bh:[-6,-8],  ff:[10,22], bf:[-12,22],wAng:0.0 },
      hit:  { hipY:5,  torso:-0.20, fh:[21,-13],  bh:[-10,-6], ff:[12,22], bf:[-14,22],wAng:-0.25, smear:'thrust' },
      rec:  { hipY:4,  torso:0.05,  fh:[15,-10],  bh:[-6,-8],  ff:[10,22], bf:[-11,22],wAng:-0.05 }
    },
    rail_blast: {
      wind: { hipY:7,  torso:0.12,  fh:[16,-10],  bh:[6,-10],  ff:[12,22], bf:[-15,22],wAng:0.0 },
      hit:  { hipY:7,  torso:-0.32, fh:[22,-15],  bh:[10,-13], ff:[10,22], bf:[-17,22],wAng:-0.30, smear:'mega_thrust' },
      rec:  { hipY:5,  torso:0.0,   fh:[15,-10],  bh:[4,-9],   ff:[11,22], bf:[-12,22],wAng:-0.05 }
    },

    // --- VESPERA (SCYTHE) ---
    scythe_wide: {
      wind: { hipY:4,  torso:-0.32, fh:[-15,-14], bh:[-8,-12], ff:[10,22], bf:[-12,22],wAng:-2.6 },
      hit:  { hipY:6,  torso:0.44,  fh:[23,4],    bh:[8,2],    ff:[15,22], bf:[-15,22],wAng:0.45,  smear:'horiz' },
      rec:  { hipY:4,  torso:0.20,  fh:[15,4],    bh:[4,2],    ff:[11,22], bf:[-11,22],wAng:0.6 }
    },
    scythe_hook: {
      wind: { hipY:5,  torso:0.35,  fh:[22,-8],   bh:[8,-8],   ff:[14,22], bf:[-12,22],wAng:0.2 },
      hit:  { hipY:4,  torso:-0.30, fh:[-12,-14], bh:[-10,-8], ff:[10,22], bf:[-14,22],wAng:-2.1,  smear:'up' },
      rec:  { hipY:4,  torso:0.05,  fh:[8,-10],   bh:[-4,-8],  ff:[10,22], bf:[-11,22],wAng:-0.8 }
    },
    scythe_spin: {
      wind: { hipY:5,  torso:-0.30, fh:[-14,-18], bh:[8,-12],  ff:[8,22],  bf:[-12,22],wAng:-2.8 },
      hit:  { hipY:1,  torso:0.42,  fh:[22,-12],  bh:[-12,-6], ff:[16,20], bf:[-14,20],wAng:0.25,  smear:'mega' },
      rec:  { hipY:4,  torso:0.15,  fh:[14,-8],   bh:[-6,-6],  ff:[11,22], bf:[-11,22],wAng:0.4 }
    },
    soul_reap: {
      wind: { hipY:2,  torso:-0.42, fh:[-15,-25], bh:[-8,-21], ff:[9,22],  bf:[-14,22],wAng:-2.85 },
      hit:  { hipY:8,  torso:0.55,  fh:[24,10],   bh:[10,6],   ff:[17,22], bf:[-16,22],wAng:0.95,  smear:'mega' },
      rec:  { hipY:6,  torso:0.28,  fh:[17,9],    bh:[6,5],    ff:[13,22], bf:[-12,22],wAng:1.0 }
    },

    // --- FREYA & AETHER FINISHERS ---
    frost_nova: {
      wind: { hipY:5,  torso:-0.20, fh:[-10,-20], bh:[10,-16], ff:[10,22], bf:[-11,22],wAng:-2.1 },
      hit:  { hipY:3,  torso:0.35,  fh:[22,-6],   bh:[-12,-8], ff:[15,22], bf:[-14,22],wAng:0.2,   smear:'mega' },
      rec:  { hipY:4,  torso:0.15,  fh:[14,-6],   bh:[-6,-6],  ff:[11,22], bf:[-11,22],wAng:0.3 }
    },
    glacier_cleave: {
      wind: { hipY:1,  torso:-0.36, fh:[-13,-25], bh:[-6,-18], ff:[10,22], bf:[-13,22],wAng:-2.65 },
      hit:  { hipY:7,  torso:0.50,  fh:[23,11],   bh:[-10,-2], ff:[16,22], bf:[-15,22],wAng:1.05,  smear:'heavy_down' },
      rec:  { hipY:5,  torso:0.25,  fh:[16,10],   bh:[-6,-2],  ff:[12,22], bf:[-12,22],wAng:1.1 }
    },
    void_spin: {
      wind: { hipY:4,  torso:-0.35, fh:[-14,-12], bh:[12,-12], ff:[9,22],  bf:[-13,22],wAng:-2.7 },
      hit:  { hipY:2,  torso:0.46,  fh:[24,-6],   bh:[-14,-6], ff:[16,21], bf:[-15,21],wAng:0.1,   smear:'mega' },
      rec:  { hipY:4,  torso:0.20,  fh:[15,-4],   bh:[-8,-4],  ff:[12,22], bf:[-11,22],wAng:0.3 }
    },
    singularity_cut: {
      wind: { hipY:7,  torso:0.45,  fh:[-13,4],   bh:[-9,-16], ff:[13,22], bf:[-15,22],wAng:2.6 },
      hit:  { hipY:3,  torso:0.58,  fh:[26,-10],  bh:[-14,6],  ff:[18,22], bf:[-17,22],wAng:-0.25, smear:'mega' },
      rec:  { hipY:4,  torso:0.22,  fh:[17,-8],   bh:[-8,2],   ff:[13,22], bf:[-12,22],wAng:-0.1 }
    }
  };

  function blendPose(a, b, t){
    return {
      hipY: lerp(a.hipY, b.hipY, t),
      torso: lerp(a.torso, b.torso, t),
      fh: [lerp(a.fh[0], b.fh[0], t), lerp(a.fh[1], b.fh[1], t)],
      bh: [lerp(a.bh[0], b.bh[0], t), lerp(a.bh[1], b.bh[1], t)],
      ff: [lerp(a.ff[0], b.ff[0], t), lerp(a.ff[1], b.ff[1], t)],
      bf: [lerp(a.bf[0], b.bf[0], t), lerp(a.bf[1], b.bf[1], t)],
      wAng: lerp(a.wAng, b.wAng, t),
      smear: b.smear || null
    };
  }

  function evaluateHeroPose(f, ch){
    const t = f.animT || 0;
    const vx = Math.abs(f.vx || 0);
    const onGround = f.onGround !== false;

    // 1. Active Combat Attack (3-Phase Anticipation -> Strike -> Recovery)
    if(f.atkTimer > 0 && f.atkMax > 0){
      const p = clamp(1 - (f.atkTimer / f.atkMax), 0, 1);
      const poseKey = f.atkPose || (ch.combo[f.comboStep % ch.combo.length]?.pose) || 'slash_down';
      const def = ATTACK_POSES[poseKey] || ATTACK_POSES.slash_down;
      let pose;
      if(p < 0.24){
        const k = easeInQuad(p / 0.24);
        pose = blendPose(getIdlePose(t), def.wind, k);
        pose.smear = null;
      } else if(p < 0.58){
        const k = easeOutExpo((p - 0.24) / 0.34);
        pose = blendPose(def.wind, def.hit, k);
        pose.smearAlpha = clamp(1 - (p - 0.24) / 0.42, 0.2, 1);
        pose.smearProg = k;
      } else {
        const k = (p - 0.58) / 0.42;
        pose = blendPose(def.hit, def.rec, easeOutBack(Math.min(1, k)));
        pose.smear = p < 0.72 ? def.hit.smear : null;
        pose.smearAlpha = clamp((0.72 - p) / 0.14, 0, 0.45);
        pose.smearProg = 1;
      }
      return pose;
    }

    // 2. Parry / Guard Stance
    if(f.parryTimer > 0){
      return { hipY:5, torso:0.15, fh:[14,-11], bh:[8,-7], ff:[12,22], bf:[-12,22], wAng:-1.45, parryGlow:true };
    }

    // 3. Ladder Climbing
    if(f.climbing){
      const c = Math.sin(t * 0.28);
      return {
        hipY:3, torso:0.0,
        fh:[6, -18 + c * 7], bh:[-6, -18 - c * 7],
        ff:[6, 17 - c * 6],  bf:[-6, 17 + c * 6],
        wAng:-1.55
      };
    }

    // 4. Wall Slide
    if(f.wallSlide){
      return { hipY:3, torso:-0.15, fh:[11,-16], bh:[-8,-4], ff:[9,16], bf:[-7,21], wAng:0.9 };
    }

    // 5. Dash Lean
    if(f.dashTimer > 0){
      return { hipY:7, torso:0.62, fh:[-14,-2], bh:[12,-8], ff:[16,18], bf:[-16,17], wAng:2.85 };
    }

    // 6. Airborne (Jump vs Fall)
    if(!onGround){
      const rising = (f.vy || 0) < 0;
      return rising
        ? { hipY:1, torso:0.22, fh:[11,-16], bh:[-10,-12], ff:[12,12], bf:[-9,19], wAng:-0.75 }
        : { hipY:0, torso:0.10, fh:[13,-14], bh:[-12,-14], ff:[9,18],  bf:[-11,13], wAng:-0.35 };
    }

    // 7. Dynamic Ninja Sprint Cycle
    if(vx > 0.35){
      const phase = t * (0.28 + Math.min(0.18, vx * 0.025));
      const s1 = Math.sin(phase), c1 = Math.cos(phase);
      const s2 = Math.sin(phase + Math.PI), c2 = Math.cos(phase + Math.PI);
      const bob = Math.abs(c1) * 2.6;
      return {
        hipY: 4.5 - bob,
        torso: 0.32 + Math.sin(phase * 2) * 0.04,
        fh: [-8 - s1 * 7, -6 + c1 * 3],
        bh: [8 + s1 * 8, -8 - c1 * 3],
        ff: [s1 * 15, 22 - Math.max(0, c1) * 7],
        bf: [s2 * 15, 22 - Math.max(0, c2) * 7],
        wAng: ch.rig.style === 'heavy' ? -2.2 : 2.65
      };
    }

    // 8. Combat Breathing Idle
    return getIdlePose(t);
  }

  function getIdlePose(t){
    const b = Math.sin(t * 0.09);
    return {
      hipY: 3.5 + b * 1.1,
      torso: 0.08 + b * 0.03,
      fh: [10, -8 + b * 1.4],
      bh: [-8, -9 - b * 1.2],
      ff: [9, 22],
      bf: [-9, 22],
      wAng: -0.45 + b * 0.06
    };
  }

  // =========================================================================
  // 5. PIXEL SMEAR ARC & WEAPON TRAIL RENDERER
  // =========================================================================
  function drawSmear(ctx, pose, wp, ch){
    if(!pose.smear || !pose.smearAlpha) return;
    const elCol = PSO.ELEMENTS[wp.element]?.color || wp.edgeCol;
    const wCls = PSO.WEAPON_CLASSES[wp.type] || PSO.WEAPON_CLASSES.blade;
    const r = Math.round(wCls.reach * 0.68);
    const p = pose.smearProg || 0.7;

    ctx.save();
    ctx.globalAlpha = pose.smearAlpha;

    if(pose.smear === 'thrust' || pose.smear === 'mega_thrust'){
      const len = pose.smear === 'mega_thrust' ? r * 1.95 : r * 1.35;
      const th = pose.smear === 'mega_thrust' ? 14 : 8;
      ctx.fillStyle = elCol;
      ctx.fillRect(10, -8 - th/2, len * p, th);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(14, -8 - th/4, len * p * 0.85, Math.max(2, th/2));
      // Shockcone rings
      ctx.strokeStyle = wp.edgeCol; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(18 + len * 0.45, -8, 5, th * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      // Multi-layered stepped pixel arc smear
      const thick = (pose.smear === 'mega' || pose.smear === 'heavy_down') ? wCls.trailWidth + 7 : wCls.trailWidth + 2;
      let aStart = -1.9, aEnd = 0.95;
      if(pose.smear === 'up'){ aStart = 1.1; aEnd = -1.65; }
      else if(pose.smear === 'horiz'){ aStart = -0.8; aEnd = 0.65; }
      else if(pose.smear === 'low'){ aStart = 0.35; aEnd = 1.65; }
      else if(pose.smear === 'mega'){ aStart = -2.35; aEnd = 1.25; }

      const ccw = aEnd < aStart;
      const curEnd = lerp(aStart, aEnd, clamp(p * 1.15, 0.25, 1));
      const curStart = lerp(aStart, aEnd, clamp(p - 0.55, 0, 0.6));

      ctx.strokeStyle = elCol; ctx.lineWidth = thick + 4; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(6, -5, r, curStart, curEnd, ccw); ctx.stroke();

      ctx.strokeStyle = wp.edgeCol; ctx.lineWidth = thick;
      ctx.beginPath(); ctx.arc(6, -5, r + 1, curStart, curEnd, ccw); ctx.stroke();

      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, Math.floor(thick * 0.35));
      ctx.beginPath(); ctx.arc(6, -5, r + 3, curStart, curEnd, ccw); ctx.stroke();
    }
    ctx.restore();
  }

  // =========================================================================
  // 6. FULL 10-CHARACTER ARTICULATED PIXEL HERO RENDERER
  // =========================================================================
  function drawHero(ctx, f, camX, camY, customScale){
    const ch = PSO.CHARACTERS[f.charId] || PSO.CHARACTERS[0];
    const wp = PSO.WEAPONS[f.weaponId] || PSO.WEAPONS[0];
    const pal = ch.palette;
    const sc = (customScale || 1) * (ch.rig.scale || 1);
    const sx = Math.round(f.x - camX), sy = Math.round(f.y - camY);

    ctx.save();
    ctx.translate(sx, sy);
    if(f.invuln > 0 && Math.floor(f.invuln / 3) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.scale((f.facing || 1) * sc, sc);

    const pose = evaluateHeroPose(f, ch);
    const hipX = 0, hipY = pose.hipY;
    const torsoLen = 15;
    const shX = hipX + Math.sin(pose.torso) * torsoLen;
    const shY = hipY - Math.cos(pose.torso) * torsoLen;

    // Ground contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-13, 21, 26, 4);

    // 1. Back Wings (Aether) & Multi-Node Physics Cape/Scarf
    if(ch.rig.helm === 'void_wings'){
      const flap = Math.sin((f.animT || 0) * 0.16) * 4;
      pixRectOut(ctx, -23, shY - 8 + flap, 13, 4, '#7e22ce', '#d8b4fe');
      pixRectOut(ctx, -28, shY - 3 + flap, 16, 4, '#a855f7', '#fef08a');
      pixRectOut(ctx, -20, shY + 2 + flap, 11, 3, '#facc15', '#fff');
    }
    drawCloth(ctx, f, shX - 4, shY + 1, ch.rig.capeLen || 5, pal.cape, pal.glow, 1);

    // 2. Back Leg & Back Arm (Solved via 2-Bone IK)
    const bLeg = solveIK(hipX - 2, hipY, pose.bf[0], pose.bf[1], 10, 10, -1);
    pixBone(ctx, hipX - 2, hipY, bLeg.jx, bLeg.jy, 4, pal.armor, pal.secondary);
    pixBone(ctx, bLeg.jx, bLeg.jy, bLeg.ex, bLeg.ey, 4, '#0f172a', pal.primary);
    pixRectOut(ctx, bLeg.ex - 2, bLeg.ey - 2, 6, 3, pal.secondary, pal.primary);

    const bArm = solveIK(shX - 2, shY + 2, pose.bh[0], pose.bh[1], 8.5, 8.5, 1);
    pixBone(ctx, shX - 2, shY + 2, bArm.jx, bArm.jy, 4, pal.secondary, pal.primary);
    pixBone(ctx, bArm.jx, bArm.jy, bArm.ex, bArm.ey, 3.5, pal.armor, pal.glow);

    // 3. Armored Torso & Belt
    const torsoW = ch.rig.shoulder === 'colossus' ? 11 : 8;
    pixBone(ctx, hipX, hipY, shX, shY, torsoW, pal.armor, pal.secondary);
    // Chestplate / Core emblem
    pixRectOut(ctx, shX - torsoW * 0.5, shY + 1, torsoW, 8, pal.primary, pal.glow);
    ctx.fillStyle = pal.armor; ctx.fillRect(Math.round(shX - 2), Math.round(shY + 3), 4, 4);
    ctx.fillStyle = pal.glow;  ctx.fillRect(Math.round(shX - 1), Math.round(shY + 4), 2, 2);
    // Sash / Utility belt
    pixRectOut(ctx, hipX - 4, hipY - 2, 9, 3, pal.cape, '#facc15');

    // 4. Front Leg (2-Bone IK)
    const fLeg = solveIK(hipX + 2, hipY, pose.ff[0], pose.ff[1], 10, 10, -1);
    pixBone(ctx, hipX + 2, hipY, fLeg.jx, fLeg.jy, 4.5, pal.secondary, pal.primary);
    pixBone(ctx, fLeg.jx, fLeg.jy, fLeg.ex, fLeg.ey, 4, pal.armor, pal.glow);
    pixRectOut(ctx, fLeg.ex - 2, fLeg.ey - 2, 7, 3, pal.primary, pal.glow);

    // 5. Detailed Head + 10 Unique Silhouettes/Headgear
    const hx = Math.round(shX + Math.sin(pose.torso) * 2);
    const hy = Math.round(shY - 9);
    drawHeroHead(ctx, hx, hy, ch, f.animT || 0);

    // 6. Front Shoulder Pauldron & Front Arm (2-Bone IK)
    const fArm = solveIK(shX + 2, shY + 2, pose.fh[0], pose.fh[1], 8.5, 8.5, 1);
    pixBone(ctx, shX + 2, shY + 2, fArm.jx, fArm.jy, 4.5, pal.primary, pal.glow);
    pixBone(ctx, fArm.jx, fArm.jy, fArm.ex, fArm.ey, 4, pal.secondary, pal.glow);
    if(ch.rig.shoulder === 'colossus' || ch.rig.shoulder === 'plated' || ch.rig.shoulder === 'imperial'){
      pixRectOut(ctx, shX - 1, shY - 2, 7, 6, pal.primary, pal.glow);
    }

    // 7. Baked 54x28 High-Detail Pixel Weapon Attached to Hand Pivot!
    const wSprite = PSO.Bakery && PSO.Bakery.weapons[wp.id];
    ctx.save();
    ctx.translate(Math.round(fArm.ex), Math.round(fArm.ey));
    ctx.rotate(pose.wAng);
    if(wSprite){
      if(f.atkTimer > 0 || wp.rarity >= 4){
        ctx.shadowColor = PSO.ELEMENTS[wp.element]?.color || wp.edgeCol;
        ctx.shadowBlur = f.atkTimer > 0 ? 10 : 4;
      }
      // Pivot at grip (x=10, y=14) inside 54x28 sprite
      ctx.drawImage(wSprite, -10, -14);
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // 8. Smear Trail & Parry Shield Flash
    drawSmear(ctx, pose, wp, ch);

    if(pose.parryGlow){
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(10, -4, 24, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(12, -4, 20, -1.0, 1.0); ctx.stroke();
    }
    if(f.shieldTimer > 0){
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.65 + Math.sin((f.animT || 0) * 0.25) * 0.2;
      ctx.beginPath(); ctx.arc(0, -2, 29, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.restore();
  }

  function drawHeroHead(ctx, hx, hy, ch, t){
    const p = ch.palette;
    const h = ch.rig.helm;
    // Base helmet/head
    pixRectOut(ctx, hx - 6, hy - 6, 12, 11, '#090d1a', p.secondary);
    pixRectOut(ctx, hx - 6, hy - 6, 12, 4, p.primary, p.glow);
    // Expressive glowing eye slit
    ctx.fillStyle = '#020617'; ctx.fillRect(hx - 1, hy - 1, 7, 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(hx + 1, hy - 1, 4, 2);
    ctx.fillStyle = p.glow;    ctx.fillRect(hx + 3, hy - 1, 2, 2);

    if(h === 'ronin_band'){
      ctx.fillStyle = p.cape; ctx.fillRect(hx - 7, hy - 3, 14, 2);
      ctx.fillRect(hx - 10, hy - 2 + Math.sin(t * 0.25) * 1.5, 4, 2);
    } else if(h === 'street_hood'){
      pixRectOut(ctx, hx - 8, hy - 7, 15, 4, p.secondary, p.primary);
      pixRectOut(ctx, hx - 8, hy - 3, 4, 8, p.secondary);
    } else if(h === 'valkyrie_plume'){
      pixRectOut(ctx, hx - 4, hy - 12, 7, 6, '#facc15', '#fef9c3');
      pixRectOut(ctx, hx - 9, hy - 10, 6, 4, p.cape);
    } else if(h === 'oni_horns'){
      pixRectOut(ctx, hx - 6, hy - 12, 3, 6, '#f43f5e', '#fda4af');
      pixRectOut(ctx, hx + 3, hy - 12, 3, 6, '#f43f5e', '#fda4af');
    } else if(h === 'mech_visor'){
      pixRectOut(ctx, hx - 7, hy - 7, 14, 12, '#64748b', '#e2e8f0');
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(hx - 1, hy - 2, 8, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(hx + 1, hy - 2, 4, 1);
    } else if(h === 'cyber_antenna'){
      ctx.fillStyle = '#22d3ee'; ctx.fillRect(hx - 4, hy - 13, 2, 7); ctx.fillRect(hx - 5, hy - 14, 4, 2);
      ctx.fillStyle = '#06b6d4'; ctx.fillRect(hx, hy - 2, 7, 3);
    } else if(h === 'reaper_cowl'){
      pixRectOut(ctx, hx - 8, hy - 8, 16, 13, '#1e1b4b', '#6d28d9');
      ctx.fillStyle = '#020617'; ctx.fillRect(hx - 3, hy - 4, 9, 8);
      ctx.fillStyle = '#e879f9'; ctx.fillRect(hx + 1, hy - 1, 4, 2);
    } else if(h === 'monk_halo'){
      ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 2;
      ctx.strokeRect(hx - 7, hy - 13 + Math.sin(t * 0.14), 14, 3);
    } else if(h === 'ice_crown'){
      pixRectOut(ctx, hx - 6, hy - 11, 2, 5, '#bae6fd', '#fff');
      pixRectOut(ctx, hx - 1, hy - 13, 3, 7, '#7dd3fc', '#fff');
      pixRectOut(ctx, hx + 4, hy - 11, 2, 5, '#bae6fd', '#fff');
    } else if(h === 'void_wings'){
      pixRectOut(ctx, hx - 5, hy - 12, 10, 4, '#facc15', '#fef08a');
      ctx.fillStyle = '#a855f7'; ctx.fillRect(hx - 1, hy - 14, 3, 4);
    }
  }

  // =========================================================================
  // 7. 6 ARTICULATED ENEMIES + 2-PHASE BOSS IK RENDERER
  // =========================================================================
  function drawEnemy(ctx, m, camX, camY){
    const sx = Math.round(m.x - camX), sy = Math.round(m.y - (camY || 0));
    if(sx < -120 || sx > 1100) return;

    // 1. Boss Attack Telegraph Warning Overlay (World Space)
    if(m.isBoss && m.telegraph > 0){
      const blink = Math.floor(m.telegraph / 4) % 2 === 0;
      ctx.save();
      ctx.fillStyle = blink ? 'rgba(244,63,94,0.36)' : 'rgba(244,63,94,0.16)';
      ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 2;
      if(m.bossMove === 'charge'){
        const rx = m.facing > 0 ? sx : sx - 250;
        ctx.fillRect(rx, sy - 28, 250, 62); ctx.strokeRect(rx, sy - 28, 250, 62);
      } else if(m.bossMove === 'slam' || m.bossMove === 'jump_crush'){
        ctx.fillRect(sx - 150, sy + 14, 300, 26); ctx.strokeRect(sx - 150, sy + 14, 300, 26);
      } else if(m.bossMove === 'laser_sweep'){
        const rx = m.facing > 0 ? sx + 10 : sx - 420;
        ctx.fillRect(rx, sy - 16, 410, 24);
      }
      ctx.fillStyle = '#fef08a'; ctx.font = '900 18px monospace';
      ctx.fillText('⚠️', sx - 10, sy - m.h * 0.65 - 16);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);
    const sc = m.isBoss ? 1.62 : (m.kind === 'shield' || m.kind === 'brute' ? 1.2 : 1.0);
    ctx.scale((m.facing || -1) * sc, sc);

    const flash = m.hitFlash > 0;
    const col = flash ? '#ffffff' : (m.freeze > 0 ? '#7dd3fc' : (m.isBoss && m.phase === 2 ? '#f43f5e' : m.color));
    const dark = flash ? '#e2e8f0' : '#111827';
    const hi = flash ? '#ffffff' : '#fef08a';
    const t = m.animT || 0;
    const mv = Math.abs(m.vx || 0) > 0.25;
    const stagger = (m.staggerTimer || 0) > 0;

    // --- ARCHETYPE 5: ARTICULATED CYBER-DRONE / SHADOW BAT FLYER ---
    if(m.kind === 'flyer'){
      const wing = Math.sin(t * 0.42) * 10;
      pixBone(ctx, -4, -2, -16, -8 + wing, 4, col, hi);
      pixBone(ctx, -16, -8 + wing, -24, -2 + wing * 1.2, 3, dark, col);
      pixBone(ctx, 4, -2, 16, -8 + wing, 4, col, hi);
      pixBone(ctx, 16, -8 + wing, 24, -2 + wing * 1.2, 3, dark, col);
      pixRectOut(ctx, -9, -8, 18, 13, dark, col);
      pixRectOut(ctx, -5, -10, 10, 4, col, hi);
      ctx.fillStyle = m.cd < 22 ? '#f43f5e' : '#22d3ee';
      ctx.fillRect(2, -4, 6, 4);
      ctx.restore();
      drawEnemyStatusHUD(ctx, m, sx, sy);
      return;
    }

    // Boss Phase 2 Rotating Rune Aura
    if(m.isBoss && m.phase === 2){
      ctx.save();
      ctx.strokeStyle = 'rgba(244,63,94,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -4, 28 + Math.sin(t * 0.2) * 3, 0, Math.PI * 2); ctx.stroke();
      for(let i = 0; i < 4; i++){
        const a = t * 0.08 + i * (Math.PI / 2);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(Math.cos(a) * 30 - 2, -4 + Math.sin(a) * 30 - 2, 4, 4);
      }
      ctx.restore();
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-13, 20, 26, 4);

    // Compute Enemy IK Posture (Idle / Patrol / Attack Windup+Swing / Staggered Kneel)
    let hipY = stagger ? 10 : (mv ? 4 - Math.abs(Math.cos(t * 0.26)) * 2 : 4 + Math.sin(t * 0.1) * 1);
    let torso = stagger ? 0.55 : (mv ? 0.22 : 0.06);
    let ff = stagger ? [10, 22] : (mv ? [Math.sin(t * 0.26) * 13, 22 - Math.max(0, Math.cos(t * 0.26)) * 5] : [8, 22]);
    let bf = stagger ? [-10, 22] : (mv ? [-Math.sin(t * 0.26) * 13, 22 - Math.max(0, -Math.cos(t * 0.26)) * 5] : [-8, 22]);
    let fh = [11, -7], bh = [-8, -6], wAng = -0.5;

    if(m.kind === 'caster'){
      hipY = -3 + Math.sin(t * 0.12) * 3; // Floating acolyte
      ff = [5, 16]; bf = [-5, 18];
    }
    if(m.telegraph > 0){
      torso = -0.35; fh = [-12, -20]; bh = [-8, -16]; wAng = -2.4;
    } else if(m.atkAnim > 0){
      const ap = 1 - (m.atkAnim / 18);
      torso = 0.45;
      fh = [lerp(-10, 22, easeOutExpo(ap)), lerp(-16, 6, easeOutExpo(ap))];
      wAng = lerp(-2.2, 0.85, easeOutExpo(ap));
    }

    const shX = Math.sin(torso) * 14;
    const shY = hipY - Math.cos(torso) * 14;

    // Boss Tattered War Cape
    if(m.isBoss){
      drawCloth(ctx, m, shX - 5, shY + 1, 7, m.phase === 2 ? '#be123c' : '#3b0764', '#facc15', 1.1);
    }

    // Legs (2-Bone IK)
    const bL = solveIK(-2, hipY, bf[0], bf[1], 9.5, 9.5, -1);
    const fL = solveIK(2, hipY, ff[0], ff[1], 9.5, 9.5, -1);
    pixBone(ctx, -2, hipY, bL.jx, bL.jy, 4, dark, col);
    pixBone(ctx, bL.jx, bL.jy, bL.ex, bL.ey, 4, '#090d1a', dark);
    pixBone(ctx, 2, hipY, fL.jx, fL.jy, 4.5, col, hi);
    pixBone(ctx, fL.jx, fL.jy, fL.ex, fL.ey, 4, dark, col);

    // Back Arm
    const bA = solveIK(shX - 2, shY + 2, bh[0], bh[1], 8, 8, 1);
    pixBone(ctx, shX - 2, shY + 2, bA.jx, bA.jy, 4, dark, col);
    pixBone(ctx, bA.jx, bA.jy, bA.ex, bA.ey, 3.5, col);

    // Torso
    const tw = (m.isBoss || m.kind === 'shield' || m.kind === 'brute') ? 11 : 7;
    pixBone(ctx, 0, hipY, shX, shY, tw, dark, col);
    pixRectOut(ctx, shX - tw * 0.5, shY + 1, tw, 8, col, hi);

    // Head + Archetype Mask/Helmet
    const hx = Math.round(shX), hy = Math.round(shY - 8);
    pixRectOut(ctx, hx - 6, hy - 6, 12, 11, '#090d1a', col);
    pixRectOut(ctx, hx - 6, hy - 6, 12, 4, col, hi);
    ctx.fillStyle = stagger ? '#94a3b8' : '#fef08a';
    ctx.fillRect(hx + 1, hy - 1, 5, 2);

    if(m.isBoss){
      pixRectOut(ctx, hx - 7, hy - 12, 3, 6, '#facc15', '#fff');
      pixRectOut(ctx, hx + 4, hy - 12, 3, 6, '#facc15', '#fff');
      pixRectOut(ctx, hx - 1, hy - 15, 3, 9, '#facc15', '#fff');
    } else if(m.kind === 'assassin'){
      ctx.fillStyle = '#f43f5e'; ctx.fillRect(hx - 7, hy - 3, 14, 2);
    } else if(m.kind === 'caster'){
      pixRectOut(ctx, hx - 7, hy - 10, 14, 6, '#4c1d95', '#c084fc');
    } else if(m.kind === 'brute'){
      pixRectOut(ctx, hx - 7, hy - 7, 14, 5, '#475569', '#94a3b8');
    }

    // Front Arm (2-Bone IK) + Archetype Weapon/Shield
    const fA = solveIK(shX + 2, shY + 2, fh[0], fh[1], 8.5, 8.5, 1);
    pixBone(ctx, shX + 2, shY + 2, fA.jx, fA.jy, m.kind === 'brute' ? 6 : 4, col, hi);
    pixBone(ctx, fA.jx, fA.jy, fA.ex, fA.ey, m.kind === 'brute' ? 6 : 4, dark, col);

    if(m.kind === 'shield'){
      // Heavy Tower Shield with Energy Core
      pixRectOut(ctx, 10, -15, 8, 30, '#475569', '#cbd5e1');
      pixRectOut(ctx, 12, -10, 4, 20, '#eab308', '#fef08a');
    } else if(m.kind === 'brute'){
      // Giant Piston Gauntlets
      pixRectOut(ctx, fA.ex - 4, fA.ey - 5, 11, 10, '#f97316', '#fef08a');
    } else if(m.kind === 'assassin'){
      ctx.save(); ctx.translate(fA.ex, fA.ey); ctx.rotate(wAng);
      pixRectOut(ctx, 0, -2, 18, 3, '#f43f5e', '#fff');
      ctx.restore();
    } else if(m.kind === 'caster'){
      pixRectOut(ctx, fA.ex - 1, fA.ey - 16, 3, 28, '#581c87', '#c084fc');
      pixRectOut(ctx, fA.ex - 4, fA.ey - 20, 8, 8, '#e879f9', '#fff');
    } else if(m.isBoss){
      // Giant Boss Greatsword + Attack Smear
      ctx.save(); ctx.translate(fA.ex, fA.ey); ctx.rotate(wAng);
      pixRectOut(ctx, -4, -3, 36, 7, m.phase === 2 ? '#f43f5e' : '#94a3b8', '#fff');
      pixRectOut(ctx, 2, -6, 4, 13, '#facc15', '#fef08a');
      ctx.restore();
      if(m.atkAnim > 4){
        ctx.strokeStyle = m.phase === 2 ? '#f43f5e' : '#fb923c'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(8, -4, 34, -1.6, 1.1); ctx.stroke();
      }
    } else {
      // Street Brawler Spiked Bat
      ctx.save(); ctx.translate(fA.ex, fA.ey); ctx.rotate(wAng);
      pixRectOut(ctx, 0, -2, 16, 4, '#94a3b8', '#e2e8f0');
      ctx.fillStyle = '#fff'; ctx.fillRect(10, -4, 2, 2); ctx.fillRect(14, 2, 2, 2);
      ctx.restore();
    }

    // Frozen Ice Prison Block
    if(m.freeze > 0){
      ctx.fillStyle = 'rgba(125,211,252,0.44)';
      ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 2;
      ctx.fillRect(-15, -24, 30, 46); ctx.strokeRect(-15, -24, 30, 46);
    }
    ctx.restore();

    drawEnemyStatusHUD(ctx, m, sx, sy);
  }

  function drawEnemyStatusHUD(ctx, m, sx, sy){
    const topY = sy - m.h * 0.65 - 12;
    // Element Aura Icon above head (Genshin Style!)
    if(m.auraElem && PSO.ELEMENTS[m.auraElem]){
      ctx.font = 'bold 12px monospace';
      ctx.fillText(PSO.ELEMENTS[m.auraElem].icon, sx - 6, topY - 6);
    }
    if(m.staggerTimer > 0){
      ctx.fillStyle = '#facc15'; ctx.font = '900 10px monospace';
      ctx.fillText('💫 SERSEM', sx - 26, topY - 4);
    }
    if(m.isBoss) return;
    if(m.hp < m.maxHp || (m.poise !== undefined && m.poise < m.maxPoise)){
      // HP Bar
      ctx.fillStyle = '#090d1a'; ctx.fillRect(sx - 20, topY, 40, 5);
      ctx.fillStyle = m.burn > 0 ? '#f97316' : '#ef4444';
      ctx.fillRect(sx - 19, topY + 1, 38 * clamp(m.hp / m.maxHp, 0, 1), 3);
      // Poise / Posture Bar (Yellow thin bar underneath)
      if(m.maxPoise > 0){
        ctx.fillStyle = '#090d1a'; ctx.fillRect(sx - 20, topY + 5, 40, 3);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(sx - 19, topY + 6, 38 * clamp((m.poise || 0) / m.maxPoise, 0, 1), 1);
      }
    }
  }

  // =========================================================================
  // 8. ALL 10 HERO SKILLS [E], ULTIMATES [Q] & REACTION VFX RENDERER
  // =========================================================================
  function drawFx(ctx, fxList, player, camX, camY){
    const t = Date.now() * 0.01;
    for(const fx of fxList){
      const sx = Math.round((fx.x || 0) - camX);
      const sy = Math.round((fx.y || 0) - (camY || 0));

      if(fx.kind === 'clone'){
        ctx.save(); ctx.globalAlpha = clamp(fx.life / 25, 0.2, 0.8);
        drawHero(ctx, {
          x:fx.x, y:fx.y, vx:fx.vx, facing:Math.sign(fx.vx) || 1, onGround:true,
          charId:0, weaponId:player.weaponId, animT:player.animT,
          atkTimer:8, atkMax:14, atkPose:'iaido_fin', comboStep:3, invuln:0
        }, camX, camY || 0, 1);
        ctx.restore();
      }
      else if(fx.kind === 'flurry'){
        for(let k = 0; k < 3; k++){
          const ox = (Math.random() - 0.5) * 44, oy = (Math.random() - 0.5) * 38;
          pixRectOut(ctx, sx + ox - 12, sy + oy - 3, 24, 6, '#f97316', '#fef08a');
        }
      }
      else if(fx.kind === 'dragon_charge'){
        ctx.save();
        ctx.fillStyle = 'rgba(34,197,94,0.35)'; ctx.fillRect(sx - 60, sy - 20, 120, 40);
        pixRectOut(ctx, sx - 44, sy - 10, 88, 20, '#22c55e', '#e0f2fe');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 30, sy - 3, 60, 6);
        ctx.restore();
      }
      else if(fx.kind === 'nyx_slash'){
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(fx.ang || 0);
        const det = fx.life < 14;
        ctx.fillStyle = det ? '#ffffff' : '#f43f5e';
        ctx.fillRect(-150, det ? -4 : -2, 300, det ? 8 : 3);
        if(det){ ctx.fillStyle = 'rgba(244,63,94,0.45)'; ctx.fillRect(-150, -9, 300, 18); }
        ctx.restore();
      }
      else if(fx.kind === 'geyser' && (fx.delay || 0) <= 0){
        const h = Math.sin(clamp(fx.life / 32, 0, 1) * Math.PI) * 145;
        pixRectOut(ctx, sx - 20, sy - h, 40, h, '#78350f', '#f97316');
        ctx.fillStyle = '#fb923c'; ctx.fillRect(sx - 12, sy - h - 10, 24, h + 10);
        ctx.fillStyle = '#fef08a'; ctx.fillRect(sx - 5, sy - h - 4, 10, h);
      }
      else if(fx.kind === 'orbital_beam'){
        const w = 52 + Math.sin(t * 4) * 10;
        ctx.fillStyle = 'rgba(34,211,238,0.28)'; ctx.fillRect(sx - w, 0, w * 2, sy);
        ctx.fillStyle = '#22d3ee'; ctx.fillRect(sx - w * 0.55, 0, w * 1.1, sy);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - w * 0.25, 0, w * 0.5, sy);
      }
      else if(fx.kind === 'orbit_scythe'){
        const ox = Math.round(player.x + Math.cos(fx.ang) * fx.rad - camX);
        const oy = Math.round(player.y + Math.sin(fx.ang) * fx.rad - (camY || 0));
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(fx.ang * 2.5);
        pixRectOut(ctx, -18, -3, 36, 6, '#a855f7', '#f3e8ff');
        pixRectOut(ctx, 10, -20, 8, 24, '#c084fc', '#ffffff');
        ctx.restore();
      }
      else if(fx.kind === 'tornado'){
        for(let r = 0; r < 11; r++){
          const w = 24 + r * 11, ox = Math.sin(t * 3 + r * 0.8) * 10;
          ctx.fillStyle = r % 2 ? 'rgba(52,211,153,0.78)' : 'rgba(209,250,229,0.72)';
          ctx.fillRect(sx - w / 2 + ox, sy - 16 - r * 19, w, 15);
        }
      }
      else if(fx.kind === 'icicle'){
        pixRectOut(ctx, sx - 11, sy - 54, 22, 48, '#38bdf8', '#e0f2fe');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 4, sy - 46, 8, 36);
        ctx.fillStyle = '#7dd3fc'; ctx.fillRect(sx - 5, sy - 6, 10, 8);
      }
      else if(fx.kind === 'blackhole'){
        const r = 24 + Math.sin(t * 2.5) * 5;
        ctx.fillStyle = 'rgba(168,85,247,0.3)'; ctx.beginPath(); ctx.arc(sx, sy, r * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(250,204,21,0.35)'; ctx.beginPath(); ctx.arc(sx, sy, r * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#020617'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, Math.PI * 2); ctx.stroke();
      }
      else if(fx.kind === 'void_rift'){
        const h = 76 * clamp(fx.life / 20, 0.2, 1);
        pixRectOut(ctx, sx - 6, sy - h / 2, 12, h, '#7e22ce', '#fef08a');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 2, sy - h * 0.4, 4, h * 0.8);
      }
      else if(fx.kind === 'ring'){
        const prog = 1 - (fx.life / (fx.maxLife || 20));
        const r = (fx.maxR || 110) * easeOutExpo(prog);
        ctx.save(); ctx.globalAlpha = 1 - prog;
        ctx.strokeStyle = fx.col || '#facc15'; ctx.lineWidth = 5 * (1 - prog) + 1;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      else if(fx.kind === 'bolt'){
        ctx.save(); ctx.strokeStyle = fx.col || '#22d3ee'; ctx.lineWidth = 3;
        const x1 = fx.x1 - camX, y1 = fx.y1 - (camY || 0);
        const x2 = fx.x2 - camX, y2 = fx.y2 - (camY || 0);
        ctx.beginPath(); ctx.moveTo(x1, y1);
        ctx.lineTo((x1 + x2) * 0.5 + (Math.random() - 0.5) * 18, (y1 + y2) * 0.5 - 12);
        ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
      }
    }
  }

  PSO.Rig = {
    solveIK,
    pixBone,
    pixRectOut,
    drawHero,
    drawEnemy,
    drawFx
  };
})();
