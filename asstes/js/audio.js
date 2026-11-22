(function(){
  'use strict';
  const PSO = window.PSO = window.PSO || {};

  let ctx = null;
  let noiseBuf = null;
  let enabled = true;
  let musicEnabled = true;
  let currentTrack = 'none';
  let seqTimer = null;
  let seqStep = 0;

  function ensureContext(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
      // Pre-generate 1-second white noise buffer for percussion, impacts & explosions
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
    return ctx;
  }

  // Musical note helper (MIDI -> Hz)
  const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);

  // =========================================================================
  // 1. 5 PROCEDURAL CHIPTUNE / SYNTHWAVE ZONE SOUNDTRACKS
  // =========================================================================
  // Each track: bpm, bass (16 steps), lead (16 steps, 0 = rest), wave
  const TRACKS = {
    menu: {
      bpm: 112, wave: 'triangle',
      bass: [45,0,45,0, 48,0,48,0, 50,0,50,0, 43,0,47,0],
      lead: [69,72,76,0, 79,76,72,0, 74,77,81,0, 79,76,74,72]
    },
    exterior: {
      bpm: 132, wave: 'square',
      bass: [40,40,52,40, 43,43,55,43, 45,45,57,45, 47,47,50,43],
      lead: [64,0,67,71, 76,0,74,71, 69,0,72,76, 74,71,67,0]
    },
    interior: {
      bpm: 124, wave: 'triangle',
      bass: [45,0,52,45, 41,0,48,41, 43,0,50,43, 40,0,47,40],
      lead: [72,0,76,0, 74,72,69,0, 71,0,74,0, 76,0,71,0]
    },
    underground: {
      bpm: 108, wave: 'sawtooth',
      bass: [36,0,36,39, 41,0,39,36, 34,0,34,37, 39,0,36,34],
      lead: [60,0,0,63, 65,0,63,0, 58,0,61,0, 60,0,0,0]
    },
    boss: {
      bpm: 152, wave: 'sawtooth',
      bass: [38,38,50,38, 41,41,53,41, 40,40,52,40, 43,41,40,38],
      lead: [74,77,81,74, 82,81,77,74, 76,79,83,76, 86,84,81,79]
    }
  };

  function playNote(freq, dur, type, vol, slideTo){
    const c = ensureContext(); if(!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
  }

  function playNoise(dur, vol, filterHz, type){
    const c = ensureContext(); if(!c || !noiseBuf) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = type || 'bandpass';
    flt.frequency.setValueAtTime(filterHz || 1200, t);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(flt); flt.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur + 0.01);
  }

  function tickMusic(){
    if(!enabled || !musicEnabled || !TRACKS[currentTrack]) return;
    if(!ctx || ctx.state !== 'running') return;
    const tr = TRACKS[currentTrack];
    const step = seqStep % 16;
    const stepDur = (60 / tr.bpm) / 2;

    const bNote = tr.bass[step];
    if(bNote > 0) playNote(midiHz(bNote), stepDur * 0.85, 'triangle', 0.045);

    const lNote = tr.lead[step];
    if(lNote > 0) playNote(midiHz(lNote), stepDur * 0.72, tr.wave, 0.026);

    // Kick & Hi-hat percussion on active tracks
    if(currentTrack !== 'menu'){
      if(step % 4 === 0) playNote(115, 0.08, 'sine', 0.055, 38);
      if(step % 2 === 1) playNoise(0.03, 0.018, 6500, 'highpass');
      if(currentTrack === 'boss' && (step === 4 || step === 12)) playNoise(0.07, 0.035, 1800, 'bandpass');
    }
    seqStep++;
  }

  function setTrack(name){
    if(currentTrack === name) return;
    currentTrack = name;
    seqStep = 0;
    if(seqTimer){ clearInterval(seqTimer); seqTimer = null; }
    if(!TRACKS[name]) return;
    const ms = Math.round(((60 / TRACKS[name].bpm) / 2) * 1000);
    seqTimer = setInterval(tickMusic, ms);
  }

  // =========================================================================
  // 2. LAYERED COMBAT & UI SOUND EFFECT ENGINE
  // =========================================================================
  function sfx(name){
    if(!enabled) return;
    const c = ensureContext(); if(!c) return;
    const t = c.currentTime;

    switch(name){
      case 'swing_light':
        playNoise(0.07, 0.09, 2400, 'bandpass');
        playNote(460, 0.07, 'triangle', 0.09, 130);
        break;
      case 'swing_heavy':
        playNoise(0.14, 0.14, 900, 'lowpass');
        playNote(240, 0.14, 'sawtooth', 0.13, 55);
        break;
      case 'hit_light':
        playNoise(0.06, 0.13, 1600, 'bandpass');
        playNote(180, 0.07, 'square', 0.12, 58);
        break;
      case 'hit_heavy':
        playNoise(0.14, 0.19, 700, 'lowpass');
        playNote(135, 0.14, 'sawtooth', 0.18, 36);
        break;
      case 'hit_crit':
        playNoise(0.11, 0.18, 2800, 'bandpass');
        playNote(210, 0.11, 'sawtooth', 0.15, 65);
        playNote(1180, 0.14, 'square', 0.09, 1760);
        break;
      case 'parry':
        // Crisp Sekiro-like metallic ring!
        playNote(1046, 0.24, 'triangle', 0.18, 1568);
        playNote(2093, 0.28, 'sine', 0.14, 1980);
        playNoise(0.06, 0.14, 4800, 'highpass');
        break;
      case 'poise_break':
        playNoise(0.24, 0.22, 1200, 'bandpass');
        playNote(320, 0.26, 'sawtooth', 0.18, 42);
        playNote(880, 0.18, 'square', 0.10, 220);
        break;
      case 'block':
        playNote(620, 0.08, 'square', 0.12, 310);
        playNoise(0.05, 0.09, 3200, 'highpass');
        break;
      case 'dash':
        playNoise(0.10, 0.11, 1800, 'highpass');
        playNote(320, 0.09, 'sine', 0.08, 640);
        break;
      case 'jump':
        playNote(230, 0.11, 'square', 0.075, 560);
        break;
      case 'coin':
        playNote(987, 0.06, 'square', 0.08);
        setTimeout(() => enabled && playNote(1318, 0.12, 'square', 0.08), 48);
        break;
      case 'heal':
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => enabled && playNote(f, 0.14, 'sine', 0.09), i * 45));
        break;
      case 'checkpoint':
        [440, 554, 659, 880].forEach((f, i) => setTimeout(() => enabled && playNote(f, 0.18, 'triangle', 0.11), i * 55));
        break;
      case 'door':
        playNote(260, 0.16, 'triangle', 0.11, 620);
        break;
      case 'crate':
        playNoise(0.11, 0.16, 850, 'bandpass');
        playNote(150, 0.09, 'square', 0.11, 55);
        break;
      case 'hurt':
        playNoise(0.12, 0.16, 650, 'lowpass');
        playNote(140, 0.16, 'sawtooth', 0.16, 48);
        break;
      case 'skill':
        playNote(340, 0.18, 'sawtooth', 0.13, 920);
        playNoise(0.14, 0.12, 2600, 'bandpass');
        break;
      case 'ulti':
        playNoise(0.36, 0.22, 1100, 'lowpass');
        playNote(110, 0.42, 'sawtooth', 0.21, 780);
        setTimeout(() => enabled && playNote(880, 0.35, 'square', 0.14, 110), 160);
        break;
      case 'reaction':
        playNoise(0.22, 0.18, 2200, 'bandpass');
        playNote(520, 0.22, 'triangle', 0.15, 1280);
        break;
      case 'boss_roar':
        playNoise(0.45, 0.22, 420, 'lowpass');
        playNote(140, 0.48, 'sawtooth', 0.22, 45);
        break;
      case 'victory':
        [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => enabled && playNote(f, 0.22, 'square', 0.10), i * 85));
        break;
      case 'upgrade':
        [587, 740, 880].forEach((f, i) => setTimeout(() => enabled && playNote(f, 0.12, 'triangle', 0.10), i * 50));
        break;
      case 'ascend':
        [523, 659, 784, 987, 1046, 1318].forEach((f, i) => setTimeout(() => enabled && playNote(f, 0.22, 'triangle', 0.12), i * 65));
        break;
      default:
        playNote(540, 0.05, 'triangle', 0.06, 680);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if(!ctx) return;
    if(document.hidden) ctx.suspend().catch(()=>{});
    else if(enabled) ctx.resume().catch(()=>{});
  });

  PSO.Audio = {
    unlock: ensureContext,
    setEnabled(val){ enabled = !!val; if(!enabled && ctx) ctx.suspend().catch(()=>{}); else if(enabled && ctx) ctx.resume().catch(()=>{}); },
    setMusicEnabled(val){ musicEnabled = !!val; },
    setTrack,
    sfx
  };
})();
