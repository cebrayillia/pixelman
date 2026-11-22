
(function(){
  'use strict';
  const PSO = window.PSO = window.PSO || {};

  let shopTab = 'chars';
  let weaponFilter = 'all';
  let selShopId = 0;
  let upgMode = 'char';
  let menuAnim = 0, menuDemoAtk = 0, menuDemoStep = 0;
  let shopDemoAtk = 0, shopDemoStep = 0;
  let toastTimer = null;

  const $ = id => document.getElementById(id);

  const UI = PSO.UI = {
    toast(msg){
      const el = $('toast');
      el.textContent = msg; el.style.display = 'block';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.style.display = 'none', 2300);
    },
    showModal(html){
      $('modalBox').innerHTML = html;
      $('modalBg').classList.add('active');
    },
    closeModal(){
      $('modalBg').classList.remove('active');
    },

    openScreen(id){
      document.querySelectorAll('.screen').forEach(e => e.classList.remove('active'));
      $('hud').classList.remove('active');
      $(id).classList.add('active');
      PSO.Engine.G = null;
      PSO.Audio.setTrack('menu');
      this.refreshHome();
      if(id === 'screenLevels') this.renderLevels();
    },

    onGameStart(){
      document.querySelectorAll('.screen').forEach(e => e.classList.remove('active'));
      $('hud').classList.add('active');
      this.updateHud(null);
    },

    refreshHome(){
      const S = PSO.Store.S, T = PSO.I18N[S.lang];
      $('uiTitle').textContent = T.title;
      $('tPlay').textContent = '⚔️ ' + T.play; $('tPlaySub').textContent = T.playSub;
      $('tChars').textContent = '🥷 ' + T.armory; $('tCharsSub').textContent = T.armorySub;
      $('tDng').textContent = '🔥 ' + T.dungeons; $('tDngSub').textContent = T.dungeonsSub;
      $('tProf').textContent = '👑 ' + T.profile; $('tProfSub').textContent = T.profileSub;
      $('tUpg').textContent = '✨ ' + T.upgrade; $('tUpgSub').textContent = T.upgradeSub;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if(T[k]) el.textContent = T[k];
      });

      $('uiPlayerTag').textContent = `${S.playerName} • Genel Sv.${S.accLv}/100`;
      $('pillLvl').textContent = `⭐ Sv.${S.accLv}`;
      $('pillGold').textContent = `🪙 ${S.gold}`;
      $('pillEm').textContent = `💎 ${S.emeralds}`;
      $('btnSound').textContent = S.sound ? '🔊' : '🔇';
      $('btnLang').textContent = S.lang;

      // Blit 32x32 baked avatar
      const avCtx = $('topAvatar').getContext('2d');
      avCtx.imageSmoothingEnabled = false;
      avCtx.clearRect(0, 0, 32, 32);
      if(PSO.Bakery.avatars[S.avatarId]) avCtx.drawImage(PSO.Bakery.avatars[S.avatarId], 0, 0, 32, 32);

      const ch = PSO.CHARACTERS[S.selChar], wp = PSO.WEAPONS[S.selWeapon];
      const st = PSO.Store.getTotalStats();
      const cP = S.ownedChars[S.selChar], wP = S.ownedWeapons[S.selWeapon];
      $('homeHeroName').textContent = `${ch.name} — ${ch.title}`;
      $('homeHeroMeta').textContent = `Sv.${cP.lv} ✦${cP.asc} • ${PSO.ELEMENTS[wp.element].icon} ${wp.name} (Sv.${wP.lv})`;
      $('homePower').textContent = `GÜÇ: ${Math.round(st.hp + st.atk * 6 + st.agi * 4 + st.def * 5)}`;
      $('homeStats').innerHTML = `
        <div class="pill" style="justify-content:center;">❤️ ${st.hp}</div>
        <div class="pill" style="justify-content:center;">⚔️ ${st.atk}</div>
        <div class="pill" style="justify-content:center;">💨 ${st.spd}</div>
        <div class="pill" style="justify-content:center;">⚡ ${st.agi}</div>`;
    },

    // =========================================================================
    // 100-LEVEL CAMPAIGN MAP (5 DISTRICTS)
    // =========================================================================
    renderLevels(){
      const S = PSO.Store.S;
      $('lvlGold').textContent = `🪙 ${S.gold}`;
      $('lvlEm').textContent = `💎 ${S.emeralds}`;
      let html = '';
      PSO.DISTRICTS.forEach(dist => {
        html += `<div class="dist-hdr">🏙️ ${dist.name.toUpperCase()} (Sv.${dist.min} – ${dist.max})</div>`;
        for(let i = dist.min; i <= dist.max; i++){
          const unl = i <= S.maxLevel, cl = !!S.clearedLevels[i];
          const em = Math.round(8 + i * 0.78);
          html += `<div class="lvl-box ${cl ? 'cleared' : unl ? 'unlocked' : 'locked'}" onclick="${unl ? `PSO.Engine.startLevel(${i})` : `PSO.UI.toast('🔒 Önce Sv.${i - 1} Bossunu yen!')`}">
            <div class="num">${unl ? i : '🔒'}</div>
            <div class="sub">${cl ? '✅ Tamam' : `💎+${em}`}</div>
          </div>`;
        }
      });
      $('lvlGrid').innerHTML = html;
    },

    // =========================================================================
    // GENSHIN-STYLE ARMORY (10 HEROES, 40 WEAPONS, ENHANCE & ASCENSION)
    // =========================================================================
    openShop(tab){
      this.openScreen('screenShop');
      this.switchShopTab(tab);
    },
    switchShopTab(tab){
      shopTab = tab;
      ['Chars','Weapons','Upgrade'].forEach(t => $('tab' + t).classList.remove('active'));
      $('tab' + tab[0].toUpperCase() + tab.slice(1)).classList.add('active');
      selShopId = tab === 'weapons' ? PSO.Store.S.selWeapon : PSO.Store.S.selChar;
      this.renderShop();
    },

    renderShop(){
      const S = PSO.Store.S;
      $('shopGold').textContent = `🪙 ${S.gold}`;
      $('shopEm').textContent = `💎 ${S.emeralds}`;
      let html = '';

      if(shopTab === 'chars'){
        PSO.CHARACTERS.forEach(c => {
          const own = !!S.ownedChars[c.id], eq = S.selChar === c.id, lv = own ? S.ownedChars[c.id].lv : 1;
          const el = PSO.ELEMENTS[c.element];
          html += `<div class="item-card rarity-${c.rarity} ${selShopId === c.id ? 'selected' : ''} ${eq ? 'equipped' : ''}" onclick="PSO.UI.selectShopItem(${c.id})">
            <div style="display:flex;justify-content:space-between;font-weight:900;font-size:11px;color:${c.palette.primary}"><span>${el.icon} ${c.name}</span><span>${'★'.repeat(c.rarity)}</span></div>
            <div style="font-size:9px;color:var(--muted);">${c.title}</div>
            <div class="badge" style="color:${eq ? '#10b981' : own ? '#93c5fd' : '#facc15'}">${eq ? 'AKTİF' : own ? `Sv.${lv}` : `💎 ${c.price}`}</div>
          </div>`;
        });
      } else if(shopTab === 'weapons'){
        // Weapon Class Filter Bar
        const filters = [['all','Tümü'],['dagger','Hançer'],['katana','Katana'],['blade','Kılıç'],['cyber','Siber'],['spear','Mızrak'],['axe','Balta'],['hammer','Balyoz'],['scythe','Tırpan'],['staff','Asa']];
        html += `<div style="grid-column:1/-1;display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">` +
          filters.map(([k, lb]) => `<button class="btn sm ${weaponFilter === k ? 'primary' : ''}" onclick="PSO.UI.setWeaponFilter('${k}')">${lb}</button>`).join('') +
          `</div>`;
        PSO.WEAPONS.filter(w => weaponFilter === 'all' || w.type === weaponFilter).forEach(w => {
          const own = !!S.ownedWeapons[w.id], eq = S.selWeapon === w.id, lv = own ? S.ownedWeapons[w.id].lv : 1;
          const el = PSO.ELEMENTS[w.element];
          html += `<div class="item-card rarity-${w.rarity} ${selShopId === w.id ? 'selected' : ''} ${eq ? 'equipped' : ''}" onclick="PSO.UI.selectShopItem(${w.id})">
            <div style="font-weight:900;font-size:10px;color:${w.edgeCol};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${el.icon} ${w.name}</div>
            <div style="font-size:9px;color:var(--muted);">⚔+${w.atk} ⚡+${w.agi}</div>
            <div class="badge" style="color:${eq ? '#10b981' : own ? '#93c5fd' : '#fbbf24'}">${eq ? 'TAKILI' : own ? `Sv.${lv}` : `🪙 ${w.price}`}</div>
          </div>`;
        });
      } else {
        html += `<div style="grid-column:1/-1;display:flex;gap:6px;margin-bottom:4px;">
          <button class="btn sm ${upgMode === 'char' ? 'primary' : ''}" style="flex:1" onclick="PSO.UI.setUpgMode('char')">🥷 Karakterlerim</button>
          <button class="btn sm ${upgMode === 'weapon' ? 'primary' : ''}" style="flex:1" onclick="PSO.UI.setUpgMode('weapon')">⚔️ Silahlarım</button>
        </div>`;
        const src = upgMode === 'char' ? S.ownedChars : S.ownedWeapons;
        Object.keys(src).forEach(id => {
          const item = upgMode === 'char' ? PSO.CHARACTERS[id] : PSO.WEAPONS[id];
          const pr = src[id];
          const col = upgMode === 'char' ? item.palette.primary : item.edgeCol;
          html += `<div class="item-card rarity-${item.rarity} ${selShopId == id ? 'selected' : ''}" onclick="PSO.UI.selectShopItem(${id})">
            <div style="font-weight:900;font-size:11px;color:${col}">${item.name}</div>
            <div style="font-size:10px;">Sv.${pr.lv}/${PSO.ASC_CAPS[pr.asc]} <span style="color:#facc15">${'✦'.repeat(pr.asc + 1)}</span></div>
          </div>`;
        });
      }
      $('shopList').innerHTML = html;
      this.renderShopDetail();
    },

    selectShopItem(id){ selShopId = id; this.triggerShopDemo(); this.renderShop(); },
    setWeaponFilter(f){ weaponFilter = f; this.renderShop(); },
    setUpgMode(m){ upgMode = m; selShopId = m === 'char' ? PSO.Store.S.selChar : PSO.Store.S.selWeapon; this.renderShop(); },
    triggerMenuDemo(){ menuDemoAtk = 18; menuDemoStep = (menuDemoStep + 1) % 4; PSO.Audio.sfx('swing_light'); },
    triggerShopDemo(){ shopDemoAtk = 18; shopDemoStep = (shopDemoStep + 1) % 4; PSO.Audio.sfx('swing_light'); },

    renderShopDetail(){
      const S = PSO.Store.S, box = $('shopDetail');
      if(shopTab === 'chars'){
        const c = PSO.CHARACTERS[selShopId], own = !!S.ownedChars[c.id];
        const st = PSO.calcCharStats(c.id, S.ownedChars[c.id]);
        const el = PSO.ELEMENTS[c.element];
        box.innerHTML = `
          <div class="scroll">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="color:${c.palette.primary};font-size:15px;">${el.icon} ${c.name} <span style="font-size:10px;color:var(--muted)">(${c.title})</span></h3>
              <button class="btn sm" onclick="PSO.UI.triggerShopDemo()">▶ 4'lü Kombo Test</button>
            </div>
            <div style="text-align:center;background:#090c18;border:1px solid var(--border);border-radius:8px;margin:4px 0;">
              <canvas id="shopPreviewCanvas" width="210" height="92"></canvas>
            </div>
            <div class="stat-row"><span>❤️ Can / ⚔️ Güç / 🛡️ Def</span><b>${st.hp} / ${st.atk} / ${st.def}</b></div>
            <div class="stat-row"><span>💨 Hız / ⚡ Çeviklik</span><b>${st.spd} / ${st.agi}</b></div>
            <div style="margin-top:5px;padding:6px;background:#0c1124;border:1px solid #334155;border-radius:7px;font-size:10px;line-height:1.45;">
              <div><b style="color:#facc15">★ PASİF:</b> ${c.passive}</div>
              <div style="margin-top:3px;"><b style="color:#4ade80">✦ YETENEK [E] (${c.skill.name}):</b> ${c.skill.desc}</div>
              <div style="margin-top:3px;"><b style="color:#38bdf8">⚡ ULTİ [Q] (${c.ulti.name}):</b> ${c.ulti.desc}</div>
            </div>
          </div>
          <div style="margin-top:6px;">
            ${own
              ? `<button class="btn ${S.selChar === c.id ? '' : 'primary'}" style="width:100%" onclick="PSO.UI.equipChar(${c.id})">${S.selChar === c.id ? '✓ AKTİF KARAKTER' : 'KARAKTERİ SEÇ'}</button>`
              : `<button class="btn em" style="width:100%" onclick="PSO.UI.buyChar(${c.id})">💎 ${c.price} ZÜMRÜT İLE AL</button>`}
          </div>`;
      } else if(shopTab === 'weapons'){
        const w = PSO.WEAPONS[selShopId], own = !!S.ownedWeapons[w.id];
        const st = PSO.calcWeaponStats(w.id, S.ownedWeapons[w.id]);
        const el = PSO.ELEMENTS[w.element], wc = PSO.WEAPON_CLASSES[w.type];
        box.innerHTML = `
          <div class="scroll">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="color:${w.edgeCol};font-size:14px;">${w.name}</h3>
              <button class="btn sm" onclick="PSO.UI.triggerShopDemo()">▶ Test</button>
            </div>
            <div style="text-align:center;background:#090c18;border:1px solid var(--border);border-radius:8px;margin:4px 0;">
              <canvas id="shopPreviewCanvas" width="210" height="92"></canvas>
            </div>
            <div class="stat-row"><span>Sınıf / Menzil</span><b>${wc.label} (${wc.reach}px)</b></div>
            <div class="stat-row"><span>Element / Kalkan Delme</span><b style="color:${el.color}">${el.icon} ${el.aura} • ${wc.pierceShield ? 'EVET' : 'HAYIR'}</b></div>
            <div class="stat-row"><span>⚔️ Güç / 💨 Hız / ⚡ Çevik</span><b class="stat-up">+${st.atk} / ${st.spd >= 0 ? '+' : ''}${st.spd} / +${st.agi}</b></div>
            <div style="margin-top:5px;padding:6px;background:#0c1124;border:1px solid #334155;border-radius:7px;font-size:10px;">
              <b style="color:#facc15">★ SİLAH PASİFİ:</b> ${w.passiveDesc}
            </div>
          </div>
          <div style="margin-top:6px;">
            ${own
              ? `<button class="btn ${S.selWeapon === w.id ? '' : 'primary'}" style="width:100%" onclick="PSO.UI.equipWeapon(${w.id})">${S.selWeapon === w.id ? '✓ KUŞANILDI' : 'KARAKTERE TAK (HEPSİYLE UYUMLU)'}</button>`
              : `<button class="btn gold" style="width:100%" onclick="PSO.UI.buyWeapon(${w.id})">🪙 ${w.price} ALTIN İLE AL</button>`}
          </div>`;
      } else {
        const isC = upgMode === 'char';
        const item = isC ? PSO.CHARACTERS[selShopId] : PSO.WEAPONS[selShopId];
        const pr = isC ? S.ownedChars[selShopId] : S.ownedWeapons[selShopId];
        const cur = isC ? PSO.calcCharStats(selShopId, pr) : PSO.calcWeaponStats(selShopId, pr);
        const needAsc = pr.lv >= cur.cap && pr.lv < 100;
        const nxtP = needAsc ? {lv:pr.lv, asc:pr.asc + 1} : {lv:Math.min(100, pr.lv + 1), asc:pr.asc};
        const nxt = isC ? PSO.calcCharStats(selShopId, nxtP) : PSO.calcWeaponStats(selShopId, nxtP);
        const m = PSO.ELEMENTS[item.mat], starM = PSO.ELEMENTS.star;
        const gCost = needAsc ? Math.round(620 * Math.pow(2.12, pr.asc)) : Math.round(125 + pr.lv * 78 * (1 + pr.asc * 0.3));
        const mCost = needAsc ? (4 + pr.asc * 4) : Math.max(1, Math.floor(1 + pr.lv / 15));
        const sCost = (needAsc && pr.asc >= 3) ? pr.asc * 2 : 0;

        box.innerHTML = `
          <div class="scroll">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="color:${isC ? item.palette.primary : item.edgeCol};font-size:15px;">${item.name}</h3>
              <span style="color:#facc15">${'✦'.repeat(pr.asc + 1)}${'✧'.repeat(6 - pr.asc)}</span>
            </div>
            <div style="font-size:12px;margin:3px 0 6px;">Seviye: <b>Lv.${pr.lv} / ${cur.cap}</b></div>
            ${isC ? `<div class="stat-row"><span>❤️ Can</span><span>${cur.hp} ➔ <b class="stat-up">${nxt.hp}</b></span></div>` : ''}
            <div class="stat-row"><span>⚔️ Güç</span><span>${cur.atk} ➔ <b class="stat-up">${nxt.atk}</b></span></div>
            <div class="stat-row"><span>💨 Hız</span><span>${cur.spd} ➔ <b class="stat-up">${nxt.spd}</b></span></div>
            <div class="stat-row"><span>⚡ Çeviklik</span><span>${cur.agi} ➔ <b class="stat-up">${nxt.agi}</b></span></div>
            ${pr.lv < 100 ? `
            <div style="margin-top:6px;padding:7px;background:#0a0d1a;border:1px solid var(--border);border-radius:8px;font-size:11px;">
              <div style="font-weight:900;color:#93c5fd;margin-bottom:3px;">${needAsc ? '🌟 YÜKSELTME (ASCENSION)' : '⬆️ SEVİYE ATLAMA'}</div>
              <div>🪙 Altın: <b style="color:${S.gold >= gCost ? '#4ade80' : '#f87171'}">${S.gold} / ${gCost}</b></div>
              <div>${m.icon} ${m.name}: <b style="color:${(S.mats[m.id] || 0) >= mCost ? '#4ade80' : '#f87171'}">${S.mats[m.id] || 0} / ${mCost}</b></div>
              ${sCost > 0 ? `<div>${starM.icon} ${starM.name}: <b style="color:${(S.mats.star || 0) >= sCost ? '#4ade80' : '#f87171'}">${S.mats.star || 0} / ${sCost}</b></div>` : ''}
            </div>` : ''}
          </div>
          <div style="margin-top:6px;">
            ${pr.lv >= 100
              ? `<button class="btn" disabled style="width:100%">🏆 MAKSİMUM SEVİYE (100)</button>`
              : `<button class="btn ${needAsc ? 'gold' : 'primary'}" style="width:100%" onclick="PSO.UI.doUpgrade(${selShopId},${isC},${needAsc},${gCost},'${m.id}',${mCost},${sCost})">${needAsc ? '🌟 YÜKSELT (ASCEND)' : '⬆️ SEVİYE ATLAT'}</button>`}
          </div>`;
      }
    },

    equipChar(id){ PSO.Store.S.selChar = id; PSO.Store.save(); this.renderShop(); this.toast(`✅ ${PSO.CHARACTERS[id].name} seçildi!`); },
    equipWeapon(id){ PSO.Store.S.selWeapon = id; PSO.Store.save(); this.renderShop(); this.toast(`⚔️ ${PSO.WEAPONS[id].name} kuşanıldı!`); },
    buyChar(id){
      const S = PSO.Store.S, c = PSO.CHARACTERS[id];
      if(S.emeralds < c.price){ this.toast('❌ Yetersiz Zümrüt! Seviye bosslarını yen.'); return; }
      S.emeralds -= c.price; S.ownedChars[id] = {lv:1, asc:0}; S.selChar = id;
      PSO.Store.save(); PSO.Audio.sfx('ascend'); this.toast(`🥷 ${c.name} kadrona katıldı!`); this.renderShop();
    },
    buyWeapon(id){
      const S = PSO.Store.S, w = PSO.WEAPONS[id];
      if(S.gold < w.price){ this.toast('❌ Yetersiz Altın!'); return; }
      S.gold -= w.price; S.ownedWeapons[id] = {lv:1, asc:0}; S.selWeapon = id;
      PSO.Store.save(); PSO.Audio.sfx('coin'); this.toast(`⚔️ ${w.name} satın alındı!`); this.renderShop();
    },
    doUpgrade(id, isC, isAsc, gC, mId, mC, sC){
      const S = PSO.Store.S;
      if(S.gold < gC || (S.mats[mId] || 0) < mC || (S.mats.star || 0) < sC){ this.toast('❌ Yetersiz Altın veya Zindan Malzemesi!'); return; }
      S.gold -= gC; S.mats[mId] -= mC; if(sC) S.mats.star -= sC;
      const pr = isC ? S.ownedChars[id] : S.ownedWeapons[id];
      if(isAsc){ pr.asc++; PSO.Audio.sfx('ascend'); this.toast('🌟 Yükseltme (Ascension) Başarılı!'); }
      else { pr.lv++; PSO.Audio.sfx('upgrade'); }
      PSO.Store.save(); this.renderShop();
    },

    // =========================================================================
    // 5 DAILY DUNGEONS (MAX 2 RUNS/DAY, MATERIAL DROPS ONLY)
    // =========================================================================
    openDungeons(){
      this.openScreen('screenDungeons');
      const S = PSO.Store.S;
      $('dngMatBar').innerHTML = PSO.MAT_LIST.map(m => `<div class="mat-chip" style="border-color:${m.color}">${m.icon} ${m.name}: <b>${S.mats[m.id] || 0}</b></div>`).join('');
      $('dngGrid').innerHTML = PSO.DUNGEONS.map(d => {
        const rem = Math.max(0, 2 - PSO.Store.getDungeonRuns(d.id));
        const m = PSO.ELEMENTS[d.mat];
        return `<div class="dng-card" style="border-color:${d.color}">
          <div>
            <div style="font-size:13px;font-weight:900;color:${d.color}">${m.icon} ${d.name}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">Boss: <b>${d.boss}</b> (Önerilen Sv.${d.recLv})</div>
            <div style="font-size:10px;color:#cbd5e1;margin-top:2px;">⚠️ ${d.aura}</div>
            <div style="font-size:11px;margin-top:4px;">Düşen: <b style="color:${m.color}">${m.icon} ${m.name} (${d.dropMin}-${d.dropMax})</b></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
            <span class="badge" style="color:${rem > 0 ? '#4ade80' : '#f87171'}">Günlük Hak: ${rem}/2</span>
            <button class="btn sm ${rem > 0 ? 'primary' : ''}" ${rem <= 0 ? 'disabled' : ''} onclick="PSO.Engine.startLevel(${d.recLv}, PSO.DUNGEONS[${d.id}])">GİR ⚔️</button>
          </div>
        </div>`;
      }).join('');
    },

    // =========================================================================
    // PROFILE, 16 PIXEL AVATARS & SAVE BACKUP SETTINGS
    // =========================================================================
    openProfile(){
      const S = PSO.Store.S, need = PSO.accXpNeed(S.accLv);
      const pct = S.accLv >= 100 ? 100 : Math.min(100, Math.round((S.accXp / need) * 100));
      this.showModal(`
        <div style="display:flex;justify-content:space-between;align-items:center;"><h3>👑 OYUNCU PROFİLİ</h3><button class="btn sm" onclick="PSO.UI.closeModal()">✕</button></div>
        <div style="display:flex;gap:10px;align-items:center;">
          <canvas id="profAvPrev" width="48" height="48" style="border:2px solid #facc15;border-radius:8px;image-rendering:pixelated;"></canvas>
          <div style="flex:1;display:flex;gap:6px;">
            <input type="text" id="inpName" maxlength="18" value="${S.playerName}">
            <button class="btn sm primary" onclick="PSO.UI.saveName()">KAYDET</button>
          </div>
        </div>
        <div style="background:#0a0d1a;padding:8px;border-radius:8px;border:1px solid var(--border);font-size:11px;">
          <div style="display:flex;justify-content:space-between;"><b>Genel Seviye: ${S.accLv}/100</b><span style="color:#d8b4fe">${S.accLv >= 100 ? 'MAX' : `${S.accXp}/${need} XP`}</span></div>
          <div class="bar-wrap" style="height:9px;margin-top:4px;"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,#7e22ce,#c084fc);"></div></div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">Kesilen Boss: <b>${S.bossesSlain}</b> • Mükemmel Parry: <b>${S.parriesTotal}</b> • Seviye: <b>${S.maxLevel}/100</b> (Sv.90-100 ustalık)</div>
        </div>
        <div class="scroll" style="max-height:175px;"><div class="av-grid" id="avGrid"></div></div>
      `);
      const pCtx = $('profAvPrev').getContext('2d');
      pCtx.imageSmoothingEnabled = false;
      pCtx.drawImage(PSO.Bakery.avatars[S.avatarId], 0, 0, 48, 48);

      const grid = $('avGrid');
      PSO.AVATARS.forEach(a => {
        const unl = a.req === 0 || (a.req === 999 ? S.bossesSlain >= 5 : !!S.clearedLevels[a.req]);
        const div = document.createElement('div');
        div.className = `av-item ${S.avatarId === a.id ? 'sel' : ''} ${unl ? '' : 'locked'}`;
        div.innerHTML = `<canvas width="36" height="36" style="image-rendering:pixelated;"></canvas><div style="font-size:8px;margin-top:2px;">${unl ? a.name : a.desc}</div>`;
        const c = div.querySelector('canvas').getContext('2d');
        c.imageSmoothingEnabled = false;
        c.drawImage(PSO.Bakery.avatars[a.id], 0, 0, 36, 36);
        div.onclick = () => { if(!unl){ this.toast(`🔒 Kilitli: ${a.desc}`); return; } S.avatarId = a.id; PSO.Store.save(); this.refreshHome(); this.openProfile(); };
        grid.appendChild(div);
      });
    },
    saveName(){
      PSO.Store.S.playerName = ($('inpName').value || '').trim() || 'GölgeSavaşçı';
      PSO.Store.save(); this.refreshHome(); this.toast('✅ Oyuncu adı kaydedildi!');
    },

    openSettings(){
      const S = PSO.Store.S;
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
      this.showModal(`
        <div style="display:flex;justify-content:space-between;align-items:center;"><h3>⚙️ AYARLAR & KAYIT KODU</h3><button class="btn sm" onclick="PSO.UI.closeModal()">✕</button></div>
        <div style="display:flex;gap:6px;">
          <button class="btn sm" style="flex:1" onclick="PSO.UI.toggleSound();PSO.UI.openSettings()">Ses: ${S.sound ? 'AÇIK 🔊' : 'KAPALI 🔇'}</button>
          <button class="btn sm" style="flex:1" onclick="PSO.UI.toggleMusic();PSO.UI.openSettings()">Müzik: ${S.music ? 'AÇIK 🎵' : 'KAPALI'}</button>
          <button class="btn sm" style="flex:1" onclick="PSO.UI.cycleLang();PSO.UI.openSettings()">Dil: ${S.lang}</button>
        </div>
        <div style="font-size:10px;color:var(--muted);">Yeni APK sürümüne geçerken emeğini korumak için bu kayıt kodunu kopyala/yapıştır:</div>
        <textarea id="saveCodeBox" rows="3">${code}</textarea>
        <div style="display:flex;gap:8px;">
          <button class="btn primary" style="flex:1" onclick="navigator.clipboard?.writeText(document.getElementById('saveCodeBox').value);PSO.UI.toast('📋 Kayıt kodu kopyalandı!')">KOPYALA</button>
          <button class="btn em" style="flex:1" onclick="PSO.UI.importSave()">KODU YÜKLE</button>
        </div>
      `);
    },
    importSave(){
      try{
        const obj = JSON.parse(decodeURIComponent(escape(atob($('saveCodeBox').value.trim()))));
        if(obj && typeof obj.gold === 'number'){
          PSO.Store.S = Object.assign(PSO.Store.S, obj);
          PSO.Store.save(); this.refreshHome(); this.closeModal(); this.toast('✅ Kayıt başarıyla yüklendi!');
        }
      }catch(e){ this.toast('❌ Geçersiz kayıt kodu!'); }
    },

    // =========================================================================
    // IN-GAME HUD, PAUSE, VICTORY & DEFEAT MODALS
    // =========================================================================
    updateHud(activeBoss){
      const G = PSO.Engine.G; if(!G) return;
      const p = G.player, z = G.data.zones[G.zoneIdx];
      $('hudHero').textContent = `${PSO.CHARACTERS[p.charId].name} • ${PSO.WEAPONS[p.weaponId].name}`;
      $('hudCombo').textContent = p.comboHits > 1 ? `${p.comboHits}x KOMBO` : '';
      $('barHp').style.width = `${(p.hp / p.maxHp) * 100}%`;
      $('txtHp').textContent = `${p.hp} / ${p.maxHp}`;
      $('barUlti').style.width = `${p.ulti}%`;
      $('txtUlti').textContent = p.ulti >= 100 ? '⚡ ULTİ HAZIR!' : `ULTİ %${Math.floor(p.ulti)}`;
      $('btnUlt').classList.toggle('ready', p.ulti >= 100);
      $('hudGold').textContent = `🪙 ${PSO.Store.S.gold}`;
      $('hudStage').textContent = G.data.isDungeon ? `🔥 ${G.data.dungeon.name}` : `SV.${G.data.levelNum} • ${PSO.Engine.zoneDisplayName(z)}`;
      $('hudCp').textContent = G.data.isDungeon ? '🔥 ZİNDAN BOSS' : `⚑ Dirilme: ${G.cp.count}/3`;
      $('zoneSteps').innerHTML = G.data.zones.map((_, i) => `<div class="z-dot ${i < G.zoneIdx ? 'done' : i === G.zoneIdx ? 'now' : ''}"></div>`).join('');

      // Skill [E] Cooldown Indicator
      const skBtn = $('btnSkill');
      if(p.skillCd > 0){
        skBtn.style.opacity = '0.48';
        $('lblSkill').textContent = Math.ceil(p.skillCd / 60) + 's';
      } else {
        skBtn.style.opacity = '1';
        $('lblSkill').textContent = 'BECERİ';
      }

      // Portal Proximity Prompt
      const nearP = z.portals.find(pt => Math.abs(p.x - pt.x) < 60 && Math.abs(p.y - (pt.y - 26)) < 72);
      $('btnAct').classList.toggle('active', !!nearP);
      const tip = $('interactTip');
      if(nearP){ tip.style.display = 'block'; tip.textContent = `🚪 ${nearP.label} — [GİR]`; } else tip.style.display = 'none';

      // Boss Bar + Boss Poise Bar
      const bh = $('bossHud');
      if(activeBoss){
        bh.classList.add('show');
        $('bossName').textContent = `👹 ${activeBoss.name} ${activeBoss.phase === 2 ? '[FAZ 2 🔥]' : ''}`;
        $('bossHpTxt').textContent = `${Math.ceil(activeBoss.hp)} / ${activeBoss.maxHp}`;
        $('bossBar').style.width = `${(activeBoss.hp / activeBoss.maxHp) * 100}%`;
        $('bossPoiseBar').style.width = `${(activeBoss.poise / activeBoss.maxPoise) * 100}%`;
      } else bh.classList.remove('show');
    },

    onVictory(sum, leveled){
      const G = PSO.Engine.G, T = PSO.I18N[PSO.Store.S.lang];
      let html = `<p>🪙 Altın: <b>+${sum.gold}</b></p>`;
      if(sum.isDungeon){
        html += `<p>${sum.mat.icon} ${sum.mat.name}: <b style="color:${sum.mat.color}">+${sum.matQty}</b></p>`;
        html += `<p style="font-size:11px;color:var(--muted);">Bugünkü kalan hak: ${2 - PSO.Store.getDungeonRuns(G.data.dungeon.id)}/2 (Zindanlarda zümrüt düşmez)</p>`;
      } else {
        html += `<p>💎 Zümrüt: <b style="color:var(--emerald)">+${sum.emeralds}</b> ${sum.firstClear ? '(İlk Temizleme!)' : ''}</p>`;
      }
      html += `<p>⭐ Hesap XP: <b>+${sum.xp}</b> ${leveled ? '<b style="color:#facc15">(SEVİYE ATLADIN!)</b>' : ''}</p>`;
      this.showModal(`
        <h2 style="color:var(--emerald);text-align:center;">🏆 ${T.victory}</h2>
        <div style="background:#0a0d1a;padding:10px;border-radius:8px;border:1px solid var(--border);font-size:13px;line-height:1.7;">${html}</div>
        <div style="display:flex;gap:8px;justify-content:center;">
          ${(!sum.isDungeon && G.data.levelNum < 100) ? `<button class="btn primary" onclick="PSO.UI.closeModal();PSO.Engine.startLevel(${G.data.levelNum + 1})">SONRAKİ SEVİYE ➡</button>` : ''}
          <button class="btn" onclick="PSO.UI.exitToMenu()">${T.exit}</button>
        </div>
      `);
    },

    onDefeat(){
      const G = PSO.Engine.G, T = PSO.I18N[PSO.Store.S.lang];
      this.showModal(`
        <h2 style="color:#f43f5e;text-align:center;">💀 ${T.defeat}</h2>
        <p style="font-size:12px;color:var(--muted);text-align:center;">Aktif Dirilme Noktası: <b>${G.cp.count}/3</b> • Bölge: <b>${PSO.Engine.zoneDisplayName(G.data.zones[G.cp.zoneIdx])}</b></p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="btn em" onclick="PSO.Engine.respawnAtCheckpoint()">⚑ SON DİRİLME NOKTASINDA CANLAN</button>
          <button class="btn" onclick="PSO.UI.exitToMenu()">${T.exit}</button>
        </div>
      `);
    },

    togglePause(){
      const G = PSO.Engine.G; if(!G || G.over || G.won) return;
      G.paused = !G.paused;
      const T = PSO.I18N[PSO.Store.S.lang];
      if(G.paused){
        this.showModal(`
          <h3 style="text-align:center;">⏸ ${T.paused}</h3>
          <button class="btn primary" onclick="PSO.UI.togglePause()">▶ ${T.resume}</button>
          <button class="btn" onclick="PSO.UI.closeModal();PSO.Engine.startLevel(${G.data.levelNum}, PSO.Engine.G.data.dungeon)">🔄 ${T.retry}</button>
          <button class="btn danger" onclick="PSO.UI.exitToMenu()">🏠 ${T.exit}</button>
        `);
      } else this.closeModal();
    },

    exitToMenu(){ this.closeModal(); this.openScreen('screenHome'); },
    toggleSound(){ PSO.Store.S.sound = !PSO.Store.S.sound; PSO.Audio.setEnabled(PSO.Store.S.sound); PSO.Store.save(); this.refreshHome(); },
    toggleMusic(){ PSO.Store.S.music = !PSO.Store.S.music; PSO.Audio.setMusicEnabled(PSO.Store.S.music); PSO.Store.save(); },
    cycleLang(){ const l = ['TR','EN','RU']; PSO.Store.S.lang = l[(l.indexOf(PSO.Store.S.lang) + 1) % 3]; PSO.Store.save(); this.refreshHome(); },

    // =========================================================================
    // MULTI-TOUCH, KEYBOARD & 60FPS MAIN LOOP BOOTSTRAP
    // =========================================================================
    bindControls(){
      const bind = (id, down, up) => {
        const el = $(id); if(!el) return;
        const s = e => { e.preventDefault(); PSO.Audio.unlock(); el.classList.add('pressed'); down(); };
        const f = e => { e.preventDefault(); el.classList.remove('pressed'); if(up) up(); };
        el.addEventListener('pointerdown', s);
        el.addEventListener('pointerup', f);
        el.addEventListener('pointercancel', f);
        el.addEventListener('pointerleave', f);
      };
      const k = PSO.Engine.keys;
      bind('btnL', () => k.left = true, () => k.left = false);
      bind('btnR', () => k.right = true, () => k.right = false);
      bind('btnU', () => k.up = true, () => k.up = false);
      bind('btnD', () => k.down = true, () => k.down = false);
      bind('btnJmp', () => { k.jump = true; PSO.Engine.jumpBuffer = 8; }, () => k.jump = false);
      bind('btnAtk', () => { k.atk = true; PSO.Engine.triggerAttack(); }, () => k.atk = false);
      bind('btnSkill', () => PSO.Engine.triggerSkill());
      bind('btnParry', () => PSO.Engine.triggerParry());
      bind('btnDash', () => PSO.Engine.triggerDash());
      bind('btnUlt', () => PSO.Engine.triggerUlti());
      bind('btnAct', () => PSO.Engine.tryInteract());

      window.addEventListener('keydown', e => {
        PSO.Audio.unlock();
        if(e.code === 'ArrowLeft' || e.code === 'KeyA') k.left = true;
        if(e.code === 'ArrowRight' || e.code === 'KeyD') k.right = true;
        if(e.code === 'ArrowUp' || e.code === 'KeyW') k.up = true;
        if(e.code === 'ArrowDown' || e.code === 'KeyS') k.down = true;
        if(e.code === 'Space'){ k.jump = true; PSO.Engine.jumpBuffer = 8; }
        if(e.code === 'KeyJ') PSO.Engine.triggerAttack();
        if(e.code === 'KeyE') PSO.Engine.triggerSkill();
        if(e.code === 'KeyP' || e.code === 'ShiftLeft') PSO.Engine.triggerParry();
        if(e.code === 'KeyK') PSO.Engine.triggerDash();
        if(e.code === 'KeyQ' || e.code === 'KeyL') PSO.Engine.triggerUlti();
        if(e.code === 'KeyF') PSO.Engine.tryInteract();
        if(e.code === 'Escape') window.handleBackButton();
      });
      window.addEventListener('keyup', e => {
        if(e.code === 'ArrowLeft' || e.code === 'KeyA') k.left = false;
        if(e.code === 'ArrowRight' || e.code === 'KeyD') k.right = false;
        if(e.code === 'ArrowUp' || e.code === 'KeyW') k.up = false;
        if(e.code === 'ArrowDown' || e.code === 'KeyS') k.down = false;
        if(e.code === 'Space') k.jump = false;
      });
    },

    init(){
      PSO.Bakery.init();
      PSO.Store.load();
      PSO.Audio.setEnabled(PSO.Store.S.sound);
      PSO.Audio.setMusicEnabled(PSO.Store.S.music);
      PSO.Audio.setTrack('menu');
      this.bindControls();
      this.refreshHome();

      // Flutter Android Lifecycle & Back Button Hooks
      window.autoPauseGame = () => { if(PSO.Engine.G && !PSO.Engine.G.paused && !PSO.Engine.G.over && !PSO.Engine.G.won) this.togglePause(); };
      window.handleBackButton = () => {
        if($('modalBg').classList.contains('active')) this.closeModal();
        else if(PSO.Engine.G) this.togglePause();
        else this.openScreen('screenHome');
      };

      // Midnight Dungeon Reset Countdown
      setInterval(() => {
        const el = $('dngResetTimer'); if(!el) return;
        const now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        const d = Math.max(0, Math.floor((mid - now) / 1000));
        el.textContent = `⏱ Sıfırlanma: ${String(Math.floor(d / 3600)).padStart(2,'0')}:${String(Math.floor((d % 3600) / 60)).padStart(2,'0')}:${String(d % 60).padStart(2,'0')}`;
      }, 1000);

      // 60 FPS Master Loop
      const mainCanvas = $('game');
      const loop = () => {
        if(PSO.Engine.G){
          PSO.Engine.step();
          PSO.Engine.render(mainCanvas);
        } else {
          menuAnim++;
          if(menuDemoAtk > 0) menuDemoAtk--;
          if(shopDemoAtk > 0) shopDemoAtk--;

          // Live 2-Bone IK Preview on Home Screen
          const mc = $('menuHeroCanvas');
          if(mc && $('screenHome').classList.contains('active')){
            const mx = mc.getContext('2d'); mx.imageSmoothingEnabled = false;
            mx.clearRect(0, 0, mc.width, mc.height);
            const cid = PSO.Store.S.selChar, ch = PSO.CHARACTERS[cid];
            const autoAtk = (menuAnim % 115 < 18) ? 18 - (menuAnim % 115) : 0;
            const stp = menuDemoAtk > 0 ? menuDemoStep : Math.floor(menuAnim / 115) % ch.combo.length;
            PSO.Rig.drawHero(mx, {
              x:108, y:102, vx:0, facing:1, onGround:true, charId:cid, weaponId:PSO.Store.S.selWeapon,
              animT:menuAnim, atkTimer:Math.max(menuDemoAtk, autoAtk), atkMax:18,
              atkPose:ch.combo[stp].pose, comboStep:stp, invuln:0
            }, 0, 0, 2.25);
          }

          // Live 2-Bone IK Preview inside Armory / Shop
          const sc = $('shopPreviewCanvas');
          if(sc && $('screenShop').classList.contains('active')){
            const sx = sc.getContext('2d'); sx.imageSmoothingEnabled = false;
            sx.clearRect(0, 0, sc.width, sc.height);
            const cid = shopTab === 'chars' ? selShopId : PSO.Store.S.selChar;
            const wid = shopTab === 'weapons' ? selShopId : PSO.Store.S.selWeapon;
            const ch = PSO.CHARACTERS[cid];
            const stp = shopDemoStep % ch.combo.length;
            PSO.Rig.drawHero(sx, {
              x:90, y:56, vx:0, facing:1, onGround:true, charId:cid, weaponId:wid,
              animT:menuAnim, atkTimer:shopDemoAtk, atkMax:18,
              atkPose:ch.combo[stp].pose, comboStep:stp, invuln:0
            }, 0, 0, 1.5);
          }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  };

  window.addEventListener('DOMContentLoaded', () => UI.init());
})();
