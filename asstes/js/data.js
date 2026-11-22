
(function(){
  'use strict';
  const PSO = window.PSO = window.PSO || {};

  // =========================================================================
  // 1. LOCALIZATION (TR / EN / RU)
  // =========================================================================
  PSO.I18N = {
    TR:{
      title:'GÖLGE PİKSEL: DESTAN', back:'GERİ', play:'MACERA (100 SEVİYE)',
      playSub:'5 Bölge • 2 Katlı Binalar • Asansör & Merdiven • Bosslar',
      armory:'KARAKTER & SİLAH', armorySub:'10 Kahraman • 40 Pasifli Silah • Yükseltme',
      dungeons:'5 ZİNDAN (GÜNLÜK 2x)', dungeonsSub:'5 Yükseltme Malzemesi & 2 Fazlı Bosslar',
      profile:'PROFİL & AVATAR', profileSub:'Oyuncu Adı • 16 Piksel Avatar • Sv.100 Yolu',
      upgrade:'GELİŞTİRME MERKEZİ', upgradeSub:'Genshin Tarzı Seviye & Yükseltme',
      zones:['DIŞ MEKAN','BİNA İÇİ','YERALTI','BOSS ARENASI'],
      interiors:{office:'ŞİRKET KULESİ (2 KAT)', school:'AKADEMİ BİNASI (2 KAT)', hotel:'GRAND OTEL (2 KAT)'},
      undergrounds:{mine:'KRİSTAL MADENİ', metro:'TERK EDİLMİŞ METRO'},
      paused:'OYUN DURAKLATILDI', resume:'DEVAM ET', retry:'SEVİYEYİ TEKRARLA', exit:'ANA MENÜ',
      victory:'ZAFER!', defeat:'YENİLDİN — SON DİRİLME NOKTASI HAZIR',
      parry:'MÜKEMMEL PARRY!', poiseBreak:'DENGE KIRILDI!'
    },
    EN:{
      title:'PIXEL SHADOW: ODYSSEY', back:'BACK', play:'CAMPAIGN (100 LEVELS)',
      playSub:'5 Districts • 2F Buildings • Elevators & Ladders • Bosses',
      armory:'HEROES & ARMORY', armorySub:'10 Heroes • 40 Passive Weapons • Ascend',
      dungeons:'5 DUNGEONS (2x DAILY)', dungeonsSub:'5 Ascension Materials & 2-Phase Bosses',
      profile:'PROFILE & AVATARS', profileSub:'Player Name • 16 Pixel Avatars • Lv.100',
      upgrade:'ASCENSION FORGE', upgradeSub:'Genshin-Style Level & Ascension',
      zones:['EXTERIOR','INTERIOR','UNDERGROUND','BOSS ARENA'],
      interiors:{office:'CORP TOWER (2F)', school:'ACADEMY HALL (2F)', hotel:'GRAND HOTEL (2F)'},
      undergrounds:{mine:'CRYSTAL MINE', metro:'ABANDONED METRO'},
      paused:'PAUSED', resume:'RESUME', retry:'RESTART LEVEL', exit:'MAIN MENU',
      victory:'VICTORY!', defeat:'DEFEATED — CHECKPOINT READY',
      parry:'PERFECT PARRY!', poiseBreak:'STAGGERED!'
    },
    RU:{
      title:'ПИКСЕЛЬ ТЕНЬ: ОДИССЕЯ', back:'НАЗАД', play:'КАМПАНИЯ (100 УРОВНЕЙ)',
      playSub:'5 Районов • 2-эт. Здания • Лифты и Лестницы • Боссы',
      armory:'ГЕРОИ И АРСЕНАЛ', armorySub:'10 Героев • 40 Оружий с Пассивками',
      dungeons:'5 ПОДЗЕМЕЛИЙ (2x/ДЕНЬ)', dungeonsSub:'5 Материалов и 2-фазные Боссы',
      profile:'ПРОФИЛЬ И АВАТАРЫ', profileSub:'Имя • 16 Аватаров • Путь к Ур.100',
      upgrade:'КУЗНИЦА ВОЗВЫШЕНИЯ', upgradeSub:'Прокачка и Возвышение (Genshin)',
      zones:['УЛИЦА','ЗДАНИЕ','ПОДЗЕМЕЛЬЕ','АРЕНА БОССА'],
      interiors:{office:'ОФИСНАЯ БАШНЯ (2 ЭТ)', school:'АКАДЕМИЯ (2 ЭТ)', hotel:'ГРАНД ОТЕЛЬ (2 ЭТ)'},
      undergrounds:{mine:'КРИСТАЛЬНАЯ ШАХТА', metro:'ЗАБРОШЕННОЕ МЕТРО'},
      paused:'ПАУЗА', resume:'ПРОДОЛЖИТЬ', retry:'ЗАНОВО', exit:'ГЛАВНОЕ МЕНЮ',
      victory:'ПОБЕДА!', defeat:'ПОРАЖЕНИЕ — ФЛАГ ВОЗРОЖДЕНИЯ',
      parry:'ИДЕАЛЬНЫЙ ПАРРИ!', poiseBreak:'ОГЛУШЁН!'
    }
  };

  // =========================================================================
  // 2. 5 ELEMENTS, MATERIALS & ELEMENTAL REACTION MATRIX (GENSHIN STYLE)
  // =========================================================================
  PSO.ELEMENTS = {
    fire:  {id:'fire',  name:'Ateş Özü',     icon:'🔥', color:'#f97316', glow:'#fed7aa', aura:'Yanma (DoT)'},
    frost: {id:'frost', name:'Buz Kristali', icon:'❄️', color:'#38bdf8', glow:'#e0f2fe', aura:'Yavaşlatma'},
    cyber: {id:'cyber', name:'Kuantum Çip',  icon:'⚡', color:'#22d3ee', glow:'#cffafe', aura:'Şok Yükü'},
    soul:  {id:'soul',  name:'Ruh Parçası',  icon:'💀', color:'#c084fc', glow:'#f3e8ff', aura:'Lanet'},
    star:  {id:'star',  name:'Yıldız Tozu',  icon:'🌟', color:'#facc15', glow:'#fef9c3', aura:'Astral İz'}
  };
  PSO.MAT_LIST = Object.values(PSO.ELEMENTS);

  // Triggered when a hit applies Element B to a target afflicted with Element A
  PSO.REACTIONS = {
    'fire+frost':  {name:'ERİTME!',        color:'#fb923c', dmgMult:1.95, aoe:0,   poise:22, effect:'melt'},
    'frost+fire':  {name:'BUHAR PATLAMASI!',color:'#38bdf8', dmgMult:1.65, aoe:85,  poise:18, effect:'vapor'},
    'fire+cyber':  {name:'AŞIRI YÜK!',     color:'#f43f5e', dmgMult:1.45, aoe:135, poise:45, effect:'overload'},
    'cyber+fire':  {name:'AŞIRI YÜK!',     color:'#f43f5e', dmgMult:1.45, aoe:135, poise:45, effect:'overload'},
    'frost+cyber': {name:'SÜPER İLETKEN!', color:'#60a5fa', dmgMult:1.30, aoe:110, poise:28, effect:'shred'},
    'cyber+frost': {name:'SÜPER İLETKEN!', color:'#60a5fa', dmgMult:1.30, aoe:110, poise:28, effect:'shred'},
    'soul+fire':   {name:'RUH ALEVİ!',     color:'#e879f9', dmgMult:1.50, aoe:90,  poise:20, effect:'lifesteal'},
    'soul+frost':  {name:'ÖLÜM BUZU!',     color:'#a78bfa', dmgMult:1.40, aoe:95,  poise:25, effect:'freeze'},
    'soul+cyber':  {name:'HAYALET ŞOK!',   color:'#818cf8', dmgMult:1.45, aoe:120, poise:30, effect:'energy'},
    'star+any':    {name:'KOZMİK ÇÖKÜŞ!',  color:'#fde047', dmgMult:1.80, aoe:150, poise:50, effect:'nova'}
  };

  PSO.resolveReaction = function(existingElem, incomingElem){
    if(!existingElem || !incomingElem || existingElem === incomingElem) return null;
    if(incomingElem === 'star' || existingElem === 'star') return PSO.REACTIONS['star+any'];
    return PSO.REACTIONS[existingElem + '+' + incomingElem] || PSO.REACTIONS[incomingElem + '+' + existingElem] || null;
  };

  // =========================================================================
  // 3. WEAPON CLASSES (REAL COMBAT FRAME & PHYSICS PROFILES)
  // =========================================================================
  PSO.WEAPON_CLASSES = {
    dagger: {label:'Hançer',   reach:52, windup:3, active:5, rec:5,  kb:2.4, poise:9,  crit:0.12, airBonus:1.25, pierceShield:false, trailWidth:4},
    katana: {label:'Katana',   reach:74, windup:4, active:6, rec:6,  kb:4.2, poise:14, crit:0.08, airBonus:1.15, pierceShield:false, trailWidth:6},
    blade:  {label:'Kılıç',    reach:68, windup:5, active:6, rec:7,  kb:5.0, poise:18, crit:0.05, airBonus:1.10, pierceShield:false, trailWidth:7},
    cyber:  {label:'Siber',    reach:72, windup:4, active:5, rec:6,  kb:4.5, poise:16, crit:0.10, airBonus:1.15, pierceShield:true,  trailWidth:6},
    spear:  {label:'Mızrak',   reach:96, windup:5, active:6, rec:7,  kb:6.8, poise:20, crit:0.06, airBonus:1.05, pierceShield:true,  trailWidth:5},
    axe:    {label:'Balta',    reach:76, windup:8, active:7, rec:10, kb:8.5, poise:34, crit:0.04, airBonus:1.30, pierceShield:true,  trailWidth:10},
    hammer: {label:'Balyoz',   reach:74, windup:9, active:7, rec:11, kb:10.0,poise:42, crit:0.03, airBonus:1.40, pierceShield:true,  trailWidth:12},
    scythe: {label:'Tırpan',   reach:90, windup:6, active:7, rec:8,  kb:5.5, poise:24, crit:0.09, airBonus:1.25, pierceShield:false, trailWidth:9},
    staff:  {label:'Asa',      reach:64, windup:5, active:6, rec:7,  kb:4.0, poise:15, crit:0.07, airBonus:1.10, pierceShield:false, trailWidth:6}
  };

  // =========================================================================
  // 4. 10 UNIQUE CHARACTERS (DISTINCT MOVESETS, [E] SKILLS, [Q] ULTIMATES, RIGS)
  // =========================================================================
  // Each combo step: {pose, dmgM, stepX, liftY, reachM, hitstop, poiseM, shockwave}
  PSO.CHARACTERS = [
    {
      id:0, name:'Kairo', title:'Gölge Ronin', price:0, rarity:3, mat:'fire', element:'fire',
      hp:100, atk:18, spd:4.7, agi:18, def:6,
      palette:{primary:'#38bdf8', secondary:'#1e3a8a', armor:'#0f172a', cape:'#ef4444', glow:'#7dd3fc', skin:'#e2e8f0'},
      rig:{helm:'ronin_band', shoulder:'light', capeLen:6, scale:1.0, style:'katana'},
      passive:'İaijutsu: Her art arda vuruş +%6 kombo hasarı verir; Mükemmel Parry anında +25 Ulti doldurur.',
      skill:{name:'Gölge Çizgisi', cd:240, desc:'İleri şimşek hızıyla atılıp geçtiği düşmanlara Ateş izi bırakır.'},
      ulti:{name:'Üçlü Gölge İnfazı', desc:'3 animasyonlu Gölge Klonu sahneyi çaprazlama biçer ve son darbede patlar.'},
      combo:[
        {pose:'slash_down', dmgM:0.95, stepX:3.5, liftY:0,   reachM:1.0, hitstop:2, poiseM:1.0},
        {pose:'slash_up',   dmgM:1.05, stepX:4.0, liftY:3.2, reachM:1.05,hitstop:2, poiseM:1.1},
        {pose:'spin_cut',   dmgM:1.20, stepX:5.0, liftY:0.5, reachM:1.15,hitstop:3, poiseM:1.3},
        {pose:'iaido_fin',  dmgM:1.75, stepX:9.5, liftY:1.8, reachM:1.45,hitstop:5, poiseM:1.9, shockwave:true}
      ]
    },
    {
      id:1, name:'Vex', title:'Yıldırım Dövüşçüsü', price:18, rarity:3, mat:'fire', element:'fire',
      hp:120, atk:22, spd:5.2, agi:26, def:8,
      palette:{primary:'#f97316', secondary:'#7c2d12', armor:'#1c1917', cape:'#fbbf24', glow:'#fdba74', skin:'#fed7aa'},
      rig:{helm:'street_hood', shoulder:'wraps', capeLen:4, scale:1.02, style:'brawler'},
      passive:'Sokak Ritimleri: %22 daha hızlı saldırı animasyonu; 4. vuruş düşmanı havaya fırlatır.',
      skill:{name:'Yükselen Ejderha', cd:210, desc:'Düşmanları havaya kaldıran alevli aparkat — havada kombo başlatır.'},
      ulti:{name:'Sekizli Şok Fırtınası', desc:'Hedefe kilitlenip 8 ultra hızlı yumruk ve ekran sarsan uçan tekme indirir.'},
      combo:[
        {pose:'jab_fast',   dmgM:0.85, stepX:4.0, liftY:0,   reachM:0.9, hitstop:1, poiseM:0.9},
        {pose:'cross_hook', dmgM:1.00, stepX:4.5, liftY:0,   reachM:0.95,hitstop:2, poiseM:1.1},
        {pose:'low_sweep',  dmgM:1.15, stepX:5.5, liftY:2.2, reachM:1.05,hitstop:3, poiseM:1.4},
        {pose:'sky_kick',   dmgM:1.85, stepX:6.0, liftY:7.8, reachM:1.20,hitstop:5, poiseM:2.1, shockwave:true}
      ]
    },
    {
      id:2, name:'Sora', title:'Buzul Mızrakçı', price:38, rarity:4, mat:'frost', element:'frost',
      hp:142, atk:28, spd:4.8, agi:22, def:11,
      palette:{primary:'#22c55e', secondary:'#14532d', armor:'#0f2922', cape:'#38bdf8', glow:'#86efac', skin:'#e2e8f0'},
      rig:{helm:'valkyrie_plume', shoulder:'plated', capeLen:7, scale:1.03, style:'spear'},
      passive:'Delici Uç: Tüm saldırılar kalkanları deler ve +24px ekstra menzil kazanır.',
      skill:{name:'Buzul Sıçraması', cd:230, desc:'Mızrakla havaya sıçrayıp çapraz aşağı dalışla buz şoku yayar.'},
      ulti:{name:'Ejderha Mızrak Hücumu', desc:'Mavi ejderha aurasıyla ekranı yararak arkasında 5 patlayan buz sütunu bırakır.'},
      combo:[
        {pose:'thrust_mid', dmgM:1.00, stepX:4.5, liftY:0,   reachM:1.25,hitstop:2, poiseM:1.1},
        {pose:'thrust_dbl', dmgM:1.15, stepX:5.0, liftY:0.5, reachM:1.30,hitstop:2, poiseM:1.2},
        {pose:'vault_arc',  dmgM:1.30, stepX:5.5, liftY:4.2, reachM:1.35,hitstop:3, poiseM:1.5},
        {pose:'dragon_pierce',dmgM:1.95,stepX:10.5,liftY:1.2,reachM:1.65,hitstop:6, poiseM:2.2, shockwave:true}
      ]
    },
    {
      id:3, name:'Nyx', title:'Kızıl Suikastçı', price:65, rarity:4, mat:'soul', element:'soul',
      hp:130, atk:36, spd:5.8, agi:38, def:7,
      palette:{primary:'#f43f5e', secondary:'#881337', armor:'#180912', cape:'#fb7185', glow:'#fda4af', skin:'#f1f5f9'},
      rig:{helm:'oni_horns', shoulder:'assassin', capeLen:7, scale:0.96, style:'assassin'},
      passive:'İkiz Gölge: 2 adet Kaçınma (Dash) yükü, +%18 Kritik şansı ve arkadan vuruşta 1.4x hasar.',
      skill:{name:'Gölge Adımı', cd:190, desc:'En yakın düşmanın arkasına ışınlanıp kritik ruh hançeri saplar.'},
      ulti:{name:'Kızıl Ay Kafesi', desc:'Zamanı dondurur, ekrana 14 kızıl kesik çizgisi kazıyıp aynı anda patlatır.'},
      combo:[
        {pose:'twin_x1',    dmgM:0.90, stepX:5.5, liftY:0,   reachM:0.95,hitstop:2, poiseM:0.8},
        {pose:'twin_x2',    dmgM:1.05, stepX:6.0, liftY:0.8, reachM:1.00,hitstop:2, poiseM:0.9},
        {pose:'backflip_cut',dmgM:1.25,stepX:3.5, liftY:4.8, reachM:1.15,hitstop:3, poiseM:1.2},
        {pose:'crimson_cross',dmgM:2.05,stepX:11.0,liftY:1.0,reachM:1.45,hitstop:6, poiseM:1.8, shockwave:true}
      ]
    },
    {
      id:4, name:'Titan', title:'Demir Juggernaut', price:95, rarity:4, mat:'fire', element:'fire',
      hp:235, atk:44, spd:4.0, agi:14, def:22,
      palette:{primary:'#cbd5e1', secondary:'#475569', armor:'#1e293b', cape:'#f97316', glow:'#fb923c', skin:'#cbd5e1'},
      rig:{helm:'mech_visor', shoulder:'colossus', capeLen:5, scale:1.18, style:'heavy'},
      passive:'Çelik Kale: Alınan hasarı %24 azaltır; 3. ve 4. vuruşlarda sarsılmaz (Super Armor) + %50 ekstra denge kırma.',
      skill:{name:'Demir Kalkan Hücumu', cd:260, desc:'Zırhlı omuz hücumuyla düşmanları sürükler ve 4 sn enerji kalkanı açar.'},
      ulti:{name:'Sismik Kıyamet', desc:'Göğe sıçrayıp yere çakılır, 7 magma sütunu fışkırtır ve %28 can yeniler.'},
      combo:[
        {pose:'heavy_cleave',dmgM:1.25,stepX:3.0, liftY:0,   reachM:1.15,hitstop:4, poiseM:1.8},
        {pose:'heavy_golf',  dmgM:1.35,stepX:3.5, liftY:5.5, reachM:1.20,hitstop:4, poiseM:2.0},
        {pose:'heavy_spin',  dmgM:1.50,stepX:4.5, liftY:1.2, reachM:1.30,hitstop:5, poiseM:2.3},
        {pose:'earth_shatter',dmgM:2.35,stepX:5.5,liftY:4.0, reachM:1.55,hitstop:7, poiseM:3.2, shockwave:true}
      ]
    },
    {
      id:5, name:'Reno', title:'Siber Nişancı', price:135, rarity:4, mat:'cyber', element:'cyber',
      hp:168, atk:52, spd:5.3, agi:32, def:12,
      palette:{primary:'#06b6d4', secondary:'#164e63', armor:'#082f49', cape:'#22d3ee', glow:'#67e8f9', skin:'#e2e8f0'},
      rig:{helm:'cyber_antenna', shoulder:'tech', capeLen:5, scale:1.01, style:'gunblade'},
      passive:'Aşırı Şarj: 2. ve 4. kombo vuruşları delici plazma mermisi fırlatır ve Kuantum yükü bırakır.',
      skill:{name:'EMP Bombası', cd:220, desc:'Geri sıçrayıp 3 patlayıcı EMP bombası fırlatır, robot ve boss dengesini kırar.'},
      ulti:{name:'Orbital Plazma Işını', desc:'Gökten süpüren dev yörünge lazeri indirir ve 6 güdümlü siber füze salar.'},
      combo:[
        {pose:'slash_down', dmgM:0.95, stepX:3.5, liftY:0,   reachM:1.05,hitstop:2, poiseM:1.0},
        {pose:'gun_shot',   dmgM:1.15, stepX:-1.5,liftY:0,   reachM:1.20,hitstop:2, poiseM:1.2, shoot:true},
        {pose:'slash_up',   dmgM:1.25, stepX:5.0, liftY:3.5, reachM:1.15,hitstop:3, poiseM:1.4},
        {pose:'rail_blast', dmgM:1.95, stepX:-3.0,liftY:1.5, reachM:1.50,hitstop:6, poiseM:2.2, shoot:true, shockwave:true}
      ]
    },
    {
      id:6, name:'Vespera', title:'Abis Tırpanı', price:185, rarity:5, mat:'soul', element:'soul',
      hp:205, atk:62, spd:5.1, agi:34, def:14,
      palette:{primary:'#a855f7', secondary:'#4c1d95', armor:'#170c29', cape:'#d8b4fe', glow:'#e879f9', skin:'#f3e8ff'},
      rig:{helm:'reaper_cowl', shoulder:'spectral', capeLen:8, scale:1.04, style:'scythe'},
      passive:'Ruh Emici: Her 4. vuruş hasarın %12 kadarını cana çevirir; düşman kesince %10 ekstra Ulti.',
      skill:{name:'Karanlık Çekim', cd:240, desc:'Geniş tırpan kancasıyla uzaktaki düşmanları kendine çekip lanetler.'},
      ulti:{name:'Dönen Hayalet Tırpanlar', desc:'7 sn boyunca etrafında dönen 4 dev mor tırpan tüm düşmanları biçip can çalar.'},
      combo:[
        {pose:'scythe_wide',dmgM:1.05, stepX:4.0, liftY:0,   reachM:1.25,hitstop:3, poiseM:1.2},
        {pose:'scythe_hook',dmgM:1.15, stepX:3.5, liftY:2.4, reachM:1.30,hitstop:3, poiseM:1.3},
        {pose:'scythe_spin',dmgM:1.35, stepX:6.0, liftY:1.8, reachM:1.40,hitstop:4, poiseM:1.6},
        {pose:'soul_reap',  dmgM:2.10, stepX:7.5, liftY:3.2, reachM:1.60,hitstop:6, poiseM:2.4, shockwave:true}
      ]
    },
    {
      id:7, name:'Zen', title:'Fırtına Keşişi', price:245, rarity:5, mat:'star', element:'star',
      hp:195, atk:70, spd:6.2, agi:48, def:13,
      palette:{primary:'#34d399', secondary:'#065f46', armor:'#06291f', cape:'#a7f3d0', glow:'#6ee7b7', skin:'#ecfdf5'},
      rig:{helm:'monk_halo', shoulder:'beads', capeLen:6, scale:1.0, style:'monk'},
      passive:'Hava Hakimi: 3 Kez Havada Zıplama + havadaki saldırılarda +%45 hasar ve havada asılı kalma.',
      skill:{name:'Rüzgar Vakumu', cd:200, desc:'Çevresindeki düşmanları havaya fırlatan rüzgar patlaması yaratır.'},
      ulti:{name:'Gök Kasırgası', desc:'Ekranı süpüren dev piksel hortum düşmanları içine çekip havada parçalar.'},
      combo:[
        {pose:'jab_fast',   dmgM:0.95, stepX:4.5, liftY:0,   reachM:1.00,hitstop:2, poiseM:1.0},
        {pose:'palm_gust',  dmgM:1.15, stepX:5.5, liftY:2.0, reachM:1.20,hitstop:3, poiseM:1.4},
        {pose:'cyclone_kick',dmgM:1.35,stepX:6.5, liftY:5.2, reachM:1.25,hitstop:4, poiseM:1.7},
        {pose:'meteor_heel',dmgM:2.15, stepX:7.0, liftY:6.5, reachM:1.45,hitstop:6, poiseM:2.5, shockwave:true}
      ]
    },
    {
      id:8, name:'Freya', title:'Buz Kraliçesi', price:320, rarity:5, mat:'frost', element:'frost',
      hp:245, atk:82, spd:5.4, agi:40, def:18,
      palette:{primary:'#7dd3fc', secondary:'#0369a1', armor:'#0c2442', cape:'#e0f2fe', glow:'#bae6fd', skin:'#f0f9ff'},
      rig:{helm:'ice_crown', shoulder:'crystal', capeLen:8, scale:1.04, style:'frost'},
      passive:'Ayaz Hükümdarı: Vuruşlar düşmanı %40 yavaşlatır; donmuş hedeflere +%40 kritik hasar.',
      skill:{name:'Buzul Çemberi', cd:230, desc:'Etrafında patlayan buz kristalleri düşmanları 2.5 sn buz küpüne hapseder.'},
      ulti:{name:'Mutlak Sıfır Kıyameti', desc:'Gökten 9 dev buz mızrağı yağdırıp tüm ekranı 4.5 sn buzla kaplar.'},
      combo:[
        {pose:'slash_down', dmgM:1.05, stepX:4.0, liftY:0,   reachM:1.15,hitstop:2, poiseM:1.2},
        {pose:'slash_up',   dmgM:1.20, stepX:4.5, liftY:3.0, reachM:1.20,hitstop:3, poiseM:1.4},
        {pose:'frost_nova', dmgM:1.40, stepX:5.0, liftY:2.2, reachM:1.35,hitstop:4, poiseM:1.8},
        {pose:'glacier_cleave',dmgM:2.25,stepX:8.0,liftY:3.8,reachM:1.55,hitstop:6, poiseM:2.6, shockwave:true}
      ]
    },
    {
      id:9, name:'Aether', title:'Hiçlik Hükümdarı', price:420, rarity:5, mat:'star', element:'star',
      hp:310, atk:102, spd:6.0, agi:52, def:20,
      palette:{primary:'#facc15', secondary:'#581c87', armor:'#140826', cape:'#a855f7', glow:'#fef08a', skin:'#fefce8'},
      rig:{helm:'void_wings', shoulder:'imperial', capeLen:9, scale:1.08, style:'void'},
      passive:'Boyut Yırtıcı: Kaçınma (Dash) en yakın düşmanın arkasına ışınlanıp Kozmik şok vurur.',
      skill:{name:'Boyut Kırılması', cd:210, desc:'Önünde 3 uzay yarığı açıp yüksek yıldız hasarı ve denge kırma uygular.'},
      ulti:{name:'Hiçlik Tekilliği', desc:'Tüm düşmanları merkezine vakumlayan dönen Kara Delik açar ve süpernova ile patlatır.'},
      combo:[
        {pose:'twin_x1',    dmgM:1.10, stepX:5.5, liftY:0,   reachM:1.20,hitstop:2, poiseM:1.3},
        {pose:'slash_up',   dmgM:1.25, stepX:6.0, liftY:3.8, reachM:1.25,hitstop:3, poiseM:1.5},
        {pose:'void_spin',  dmgM:1.50, stepX:7.5, liftY:2.5, reachM:1.40,hitstop:4, poiseM:2.0},
        {pose:'singularity_cut',dmgM:2.45,stepX:10.5,liftY:4.2,reachM:1.70,hitstop:7,poiseM:3.0, shockwave:true}
      ]
    }
  ];

  // =========================================================================
  // 5. 40 DISTINCT WEAPONS (EACH WITH CUSTOM GEOMETRY + UNIQUE COMBAT PASSIVE)
  // =========================================================================
  // [name, class, rarity, price, atk, spd, agi, edgeCol, coreCol, elem, guardStyle, passiveId, passiveDesc]
  const RAW_WEAPONS = [
    ['Paslı Hançer',          'dagger',1,0,     7,  0.2,4, '#cbd5e1','#64748b','fire', 'simple','combo_spd',   '3+ komboda saldırı hızı +%8.'],
    ['Eğitim Kılıcı',         'blade', 1,120,   11, 0.1,3, '#d97706','#78350f','fire', 'cross', 'first_hit',   'Düşmana ilk darbe +%18 hasar.'],
    ['Demir Gürz',            'hammer',1,260,   16,-0.1,2, '#cbd5e1','#475569','fire', 'ring',  'poise_20',    'Denge kırma gücü +%20.'],
    ['Sokak Bıçağı',          'dagger',1,450,   20, 0.3,7, '#e2e8f0','#0ea5e9','cyber','angled','crit_dash',   'Dash sonrası ilk vuruş +%25 kritik.'],
    ['Avcı Mızrağı',          'spear', 1,700,   25, 0.1,5, '#a3e635','#365314','frost','collar','range_dmg',   'Uzaktan vuruşlarda +%15 hasar.'],
    ['Bakır Savaş Baltası',   'axe',   1,1050,  31,-0.1,4, '#f59e0b','#92400e','fire', 'heavy', 'shield_50',   'Kalkanlı düşmanlara +%50 hasar.'],
    ['Gece Katanası',         'katana',2,1500,  37, 0.3,9, '#60a5fa','#1e3a8a','frost','tsuba', 'crit_12',     'Kritik şansı +%12 artar.'],
    ['Gümüş Suikast Hançeri', 'dagger',2,2100,  43, 0.5,12,'#f8fafc','#9333ea','soul', 'twin',  'backstab',    'Arkadan vuruşlar +%30 hasar.'],
    ['Şövalye Uzun Kılıcı',   'blade', 2,2800,  51, 0.2,8, '#38bdf8','#0284c7','frost','wing',  'parry_heal',  'Parry başarınca +15 can yeniler.'],
    ['Ağır Demir Balyoz',     'hammer',2,3700,  62,-0.2,5, '#94a3b8','#f97316','fire', 'heavy', 'stun_fin',    '4. vuruş düşmanı 1 sn sersemletir.'],
    ['Zehirli Kama',          'dagger',2,4800,  68, 0.5,15,'#4ade80','#15803d','soul', 'angled','dot_boost',   'Yakma/Lanet hasarı +%40.'],
    ['Kızıl Ejder Mızrağı',   'spear', 2,6100,  78, 0.2,11,'#f87171','#991b1b','fire', 'flame', 'burn_chance', 'Her vuruş %35 Ateş uygular.'],
    ['Buzul Savaş Baltası',   'axe',   2,7600,  90, 0.0,9, '#7dd3fc','#0369a1','frost','heavy', 'frost_shat',  'Yavaşlamış hedefe +%25 hasar.'],
    ['Siber Kesici MK-II',    'cyber', 2,9400,  102,0.5,16,'#22d3ee','#0891b2','cyber','tech',  'chain_bolt',  'Vuruşlarda %30 zincir şimşek.'],
    ['Gölge Tırpanı',         'scythe',3,11500, 118,0.3,15,'#a855f7','#581c87','soul', 'reaper','vamp_5',      'Verilen hasarın %5 kadarını çalar.'],
    ['Fırtına Katanası',      'katana',3,14000, 132,0.6,20,'#34d399','#047857','star', 'tsuba', 'air_35',      'Havada saldırı hasarı +%35.'],
    ['Alevli Şövalye Kılıcı', 'blade', 3,17000, 148,0.3,15,'#fb923c','#c2410c','fire', 'flame', 'wave_3',      'Her 3. vuruş ateş dalgası yollar.'],
    ['Kristal Buz Asası',     'staff', 3,20500, 165,0.4,19,'#38bdf8','#1d4ed8','frost','orb',   'orb_double',  'Asa mermileri %35 dondurur.'],
    ['Plazma Kıvılcım',       'cyber', 3,24500, 184,0.6,22,'#06b6d4','#155e75','cyber','tech',  'ulti_fast',   'Ulti dolum hızı +%25.'],
    ['Karanlık Ruh Mızrağı',  'spear', 3,29000, 204,0.4,18,'#c084fc','#6b21a8','soul', 'reaper','execute_30',  'Canı %30 altı düşmana +%45 hasar.'],
    ['Titanyum Balta',        'axe',   3,34500, 228,0.1,15,'#e2e8f0','#0ea5e9','cyber','heavy', 'poise_40',    'Denge kırma gücü +%40.'],
    ['Yıldırım İkiz Hançeri', 'dagger',3,41000, 248,0.8,28,'#fde047','#ca8a04','star', 'twin',  'crit_burst',  'Kritikte etrafa yıldız kıvılcımı.'],
    ['Ejderha Dişi Kılıcı',   'blade', 4,49000, 278,0.4,22,'#ef4444','#7f1d1d','fire', 'flame', 'low_hp_fury', 'Can %50 altındayken +%35 hasar.'],
    ['Kuzey Rüzgarı Tırpanı', 'scythe',4,58000, 308,0.4,24,'#0ea5e9','#0c4a6e','frost','wing',  'react_30',    'Element reaksiyon hasarı +%30.'],
    ['Kuantum Katana X',      'katana',4,68000, 340,0.8,30,'#22d3ee','#0284c7','cyber','tech',  'cd_reduce',   '[E] Yetenek bekleme süresi -%20.'],
    ['Ruh Yiyen Kılıç',       'blade', 4,80000, 376,0.5,26,'#a855f7','#3b0764','soul', 'reaper','kill_heal',   'Düşman öldürünce +12 can yeniler.'],
    ['Gök Gürültüsü Balyozu', 'hammer',4,94000, 422,0.1,20,'#facc15','#a16207','star', 'heavy', 'shock_slam',  'Her 4. vuruş dev şok dalgası.'],
    ['Kızıl Ay Tırpanı',      'scythe',4,110000,462,0.6,30,'#f43f5e','#881337','soul', 'reaper','crit_vamp',   'Kritik vuruşlar %8 can çalar.'],
    ['Lazer Mızrağı V9',      'spear', 4,128000,502,0.7,32,'#2dd4bf','#115e59','cyber','tech',  'pierce_beam', '4. vuruş lazer ışını ateşler.'],
    ['Buz Kraliçesi Asası',   'staff', 4,148000,545,0.6,34,'#bae6fd','#0284c7','frost','orb',   'frost_nova',  'Her 4. vuruş buz halkası patlatır.'],
    ['Cehennem Baltası',      'axe',   4,172000,605,0.3,26,'#f97316','#9a3412','fire', 'flame', 'boss_25',     'Bosslara karşı +%25 hasar.'],
    ['Hayalet İkiz Bıçak',    'dagger',4,198000,648,1.0,42,'#e879f9','#701a75','soul', 'twin',  'dash_reset',  'Kritik vuruş Dash süresini %50 kısaltır.'],
    ['Güneş Kılıcı Solis',    'blade', 5,230000,720,0.7,36,'#fbbf24','#b45309','star', 'wing',  'solar_burn',  'Tüm saldırılar +%20 hasar + Ateş/Yıldız.'],
    ['Mutlak Sıfır Katana',   'katana',5,268000,790,0.9,44,'#38bdf8','#0369a1','frost','tsuba', 'crit_dmg_40', 'Kritik hasar çarpanı +%40 artar.'],
    ['Omega Siber Kılıç',     'cyber', 5,312000,870,1.0,46,'#00f5d4','#0f766e','cyber','tech',  'omega_arc',   'Her vuruşta %45 çifte şimşek + Ulti.'],
    ['Abis Lordu Tırpanı',    'scythe',5,365000,960,0.8,45,'#c084fc','#4c1d95','soul', 'reaper','abyss_reap',  'Hasarın %8 can çalar + Bosslara +%20.'],
    ['Kıyamet Çekici',        'hammer',5,425000,1070,0.4,35,'#ef4444','#7f1d1d','fire','heavy', 'cataclysm',   'Denge kırıldığında 2.5x patlama hasarı.'],
    ['Yıldızlararası Mızrak', 'spear', 5,495000,1175,0.9,50,'#fde047','#854d0e','star', 'wing',  'star_lance',  'Tüm kombolar yıldız mızrağı fırlatır.'],
    ['Zaman Bükücü Asa',      'staff', 5,580000,1305,1.0,55,'#818cf8','#312e81','star', 'orb',   'time_warp',   'Yetenek ve Ulti dolumu +%40 hızlanır.'],
    ['Hiçlik Hükümdarı',      'blade', 5,700000,1520,1.2,65,'#fef08a','#581c87','star', 'wing',  'void_king',   'Tüm istatistikler +%15 + her 3. vuruş süpernova.']
  ];

  PSO.WEAPONS = RAW_WEAPONS.map((w, i) => ({
    id:i, name:w[0], type:w[1], rarity:w[2], price:w[3],
    atk:w[4], spd:w[5], agi:w[6],
    edgeCol:w[7], coreCol:w[8], color:w[7], mat:w[9], element:w[9],
    guard:w[10], passiveId:w[11], passiveDesc:w[12]
  }));

  // =========================================================================
  // 6. 5 MATERIAL DUNGEONS (MAX 2 RUNS/DAY, NO EMERALDS, ONLY ASCENSION MATS)
  // =========================================================================
  PSO.DUNGEONS = [
    {id:0, name:'Kızıl Ocak Zindanı', boss:'Alev Golemi Ignis',  mat:'fire',  recLv:5,  hp:1250,  atk:18, color:'#f97316', bg:'mine',   dropMin:5,  dropMax:9,  aura:'Zemin lav püskürtür'},
    {id:1, name:'Donmuş Mahzen',      boss:'Buzul Şövalye Boreas',mat:'frost', recLv:18, hp:3400,  atk:34, color:'#38bdf8', bg:'hotel',  dropMin:6,  dropMax:11, aura:'Buz mızrakları düşer'},
    {id:2, name:'Siber Çekirdek',     boss:'Meka-Komutan X9',    mat:'cyber', recLv:35, hp:8500,  atk:54, color:'#22d3ee', bg:'office', dropMin:7,  dropMax:13, aura:'EMP şok dalgaları'},
    {id:3, name:'Karanlık Katakomb',  boss:'Abis Nekromanseri',  mat:'soul',  recLv:55, hp:21000, atk:86, color:'#a855f7', bg:'metro',  dropMin:8,  dropMax:15, aura:'Gölge klon çağırır'},
    {id:4, name:'Gökyüzü Tapınağı',   boss:'Astral Ejderha Rex', mat:'star',  recLv:78, hp:52000, atk:135,color:'#facc15', bg:'boss',   dropMin:10, dropMax:18, aura:'Meteor yağmuru + 2 Faz'}
  ];

  // =========================================================================
  // 7. 16 UNLOCKABLE PIXEL AVATARS (DETAILED 32x32 SPRITE SPECS)
  // =========================================================================
  PSO.AVATARS = [
    {id:0,  name:'Gölge Çırak',    c1:'#38bdf8', c2:'#1e3a8a', accent:'#ef4444', helm:'band',   req:0,   desc:'Başlangıç'},
    {id:1,  name:'Sokak Ateşi',    c1:'#f97316', c2:'#7c2d12', accent:'#facc15', helm:'hood',   req:0,   desc:'Başlangıç'},
    {id:2,  name:'Zümrüt Gözcü',   c1:'#34d399', c2:'#064e3b', accent:'#6ee7b7', helm:'visor',  req:0,   desc:'Başlangıç'},
    {id:3,  name:'Altın Ronin',    c1:'#facc15', c2:'#713f12', accent:'#fef08a', helm:'horns',  req:0,   desc:'Başlangıç'},
    {id:4,  name:'Varoş Kralı',    c1:'#fb923c', c2:'#431407', accent:'#fff',    helm:'crown',  req:5,   desc:'Sv.5 Boss'},
    {id:5,  name:'Şirket Patronu', c1:'#94a3b8', c2:'#0f172a', accent:'#38bdf8', helm:'visor',  req:10,  desc:'Sv.10 Boss'},
    {id:6,  name:'Maden Baronu',   c1:'#d97706', c2:'#451a03', accent:'#22d3ee', helm:'mech',   req:20,  desc:'Sv.20 Boss'},
    {id:7,  name:'Metro Hayaleti', c1:'#22d3ee', c2:'#164e63', accent:'#e0f2fe', helm:'reaper', req:30,  desc:'Sv.30 Boss'},
    {id:8,  name:'Buz Kraliçesi',  c1:'#7dd3fc', c2:'#0c4a6e', accent:'#fff',    helm:'crown',  req:40,  desc:'Sv.40 Boss'},
    {id:9,  name:'Siber General',  c1:'#00f5d4', c2:'#115e59', accent:'#f43f5e', helm:'mech',   req:50,  desc:'Sv.50 Boss'},
    {id:10, name:'Abis Şövalye',   c1:'#a855f7', c2:'#3b0764', accent:'#facc15', helm:'horns',  req:60,  desc:'Sv.60 Boss'},
    {id:11, name:'Kızıl Lord',     c1:'#ef4444', c2:'#450a0a', accent:'#fde047', helm:'reaper', req:70,  desc:'Sv.70 Boss'},
    {id:12, name:'Fırtına Keşişi', c1:'#4ade80', c2:'#14532d', accent:'#fef08a', helm:'halo',   req:80,  desc:'Sv.80 Boss'},
    {id:13, name:'Hiçlik Gardiyan',c1:'#e879f9', c2:'#4a044e', accent:'#38bdf8', helm:'wings',  req:90,  desc:'Sv.90 Boss'},
    {id:14, name:'Destan Efsanesi',c1:'#fde047', c2:'#854d0e', accent:'#a855f7', helm:'wings',  req:100, desc:'Sv.100 Boss'},
    {id:15, name:'Zindan Fatihi',  c1:'#f43f5e', c2:'#2e1065', accent:'#22d3ee', helm:'crown',  req:999, desc:'5 Boss Kes'}
  ];

  // =========================================================================
  // 8. 100-LEVEL CAMPAIGN DISTRICTS & SCALING FORMULAS
  // =========================================================================
  PSO.DISTRICTS = [
    {min:1,  max:20,  name:'Neon Varoşlar',    skyTop:'#0b1332', skyBot:'#2c2254', moon:'#fef08a'},
    {min:21, max:40,  name:'Demir Şirket Bölgesi', skyTop:'#0d1c2e', skyBot:'#1e3a4c', moon:'#7dd3fc'},
    {min:41, max:60,  name:'Kızıl Endüstri',   skyTop:'#240c18', skyBot:'#4a192c', moon:'#fb923c'},
    {min:61, max:80,  name:'Donmuş Akademi',   skyTop:'#081d33', skyBot:'#1b4965', moon:'#e0f2fe'},
    {min:81, max:100, name:'Hiçlik Kulesi',    skyTop:'#160624', skyBot:'#3b0764', moon:'#f43f5e'}
  ];

  PSO.getDistrict = function(lv){
    return PSO.DISTRICTS.find(d => lv >= d.min && lv <= d.max) || PSO.DISTRICTS[0];
  };

  PSO.BOSS_TITLES = [
    'Gölge Baronu','Çelik Juggernaut','Siber Şef','Kızıl General',
    'Metro Golemi','Buzul Komutanı','Ruh Biçici','Fırtına Titanı',
    'Karanlık Mimar','Hiçlik İmparatoru'
  ];

  // Genshin-Style Ascension Caps & Account Level 1-100 Curve (Lv.90-100 Brutal)
  PSO.ASC_CAPS = [20, 40, 60, 70, 80, 90, 100];

  PSO.accXpNeed = function(lv){
    if(lv >= 100) return Infinity;
    if(lv < 50) return Math.floor(130 * Math.pow(lv, 1.46));
    if(lv < 90) return Math.floor(190 * Math.pow(lv, 1.64));
    return Math.floor(260000 * Math.pow(1.52, lv - 89));
  };

  PSO.calcCharStats = function(cid, prog){
    const b = PSO.CHARACTERS[cid];
    const p = prog || {lv:1, asc:0};
    const m = 1 + (p.lv - 1) * 0.09 + p.asc * 0.26;
    return {
      hp: Math.round(b.hp * m),
      atk: +(b.atk * m).toFixed(1),
      def: Math.round(b.def * (1 + (p.lv - 1) * 0.06 + p.asc * 0.2)),
      spd: +(b.spd + p.asc * 0.14).toFixed(2),
      agi: Math.round(b.agi + (p.lv - 1) * 0.48 + p.asc * 3.5),
      cap: PSO.ASC_CAPS[p.asc] || 100
    };
  };

  PSO.calcWeaponStats = function(wid, prog){
    const b = PSO.WEAPONS[wid];
    const p = prog || {lv:1, asc:0};
    const m = 1 + (p.lv - 1) * 0.095 + p.asc * 0.30;
    return {
      atk: +(b.atk * m).toFixed(1),
      spd: +(b.spd + p.asc * 0.06).toFixed(2),
      agi: Math.round(b.agi + (p.lv - 1) * 0.38 + p.asc * 2.5),
      cap: PSO.ASC_CAPS[p.asc] || 100
    };
  };
})();
