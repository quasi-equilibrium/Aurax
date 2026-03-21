(function () {
  "use strict";

  const SPIN_MS_NORMAL = 2000;
  const SPIN_MS_FAST = 700;
  const AUTO_INTERVAL_MS = 2000;
  const SPLASH_MS = 1200;
  const CUTSCENE_MS = 8000;
  /** Cutscene bittikten sonra sallanan yazı süresi (ms). */
  const LEGEND_REVEAL_HOLD_MS = 3000;
  /** Yazının yavaşça kaybolması (CSS transition ile uyumlu). */
  const LEGEND_REVEAL_FADE_MS = 1250;
  const LUCK_PER_SPIN = 3;
  const LUCK_WEIGHT_SCALE = 0.038;
  const W_COMMON = 1;
  const FAST_SPIN_CODE = "6767676767";
  const LEGENDARY_MIN_ONE_IN = 5000;
  /** Gündelik dışı sonuçta şanstan düşen miktar (sıfırın altına inmez). */
  const LUCK_PENALTY_GOOD_ROLL = 10;
  /** Craft malzemesi: payda &lt; 200 (daha yaygın). */
  const CRAFT_MAX_ONE_IN = 200;
  const POTION_DURATION_MS = 500 * 1000;
  const POTION_CHANCE_PER_SEC = 8;
  const CROWN_BONUS = 6;
  const GLOVE_BONUS = 9;

  const CRAFT_RECIPES = Object.freeze([
    {
      id: "potion",
      name: "İksir",
      desc: "Her saniye +8 şans birikir (500 sn).",
      cost: 12,
    },
    {
      id: "crown",
      name: "Taç",
      desc: `+${CROWN_BONUS} şans — kalıcı.`,
      cost: 22,
    },
    {
      id: "glove",
      name: "Eldiven",
      desc: `+${GLOVE_BONUS} şans — kalıcı.`,
      cost: 30,
    },
  ]);

  const STORAGE_KEY = "aura-game-state-v4";

  /** @typedef {{ id: string; name: string; color: string; oneIn: number; oneInLabel: string; weightDenom?: number }} AuraDef */

  const AURAS_1_IN_100 = /** @type {const} */ ([
    { id: "tr_tost", name: "Tost Makinesi Huzuru", color: "#ffe082" },
    { id: "tr_kopek", name: "Mahallenin En Sadık Köpeği", color: "#a5d6a7" },
    { id: "tr_corap", name: "Çorap Çekmecesi Enerjisi", color: "#90caf9" },
    { id: "tr_cay", name: "Gece Çayı Premium", color: "#ce93d8" },
    { id: "tr_dolmus", name: "Dolmuş Şoförü İtibarı", color: "#ffab91" },
    { id: "tr_yazlik", name: "Yazlık Ayakkabı Kokusu", color: "#bcaaa4" },
  ]);

  const AURA_COMMON = {
    id: "common_gunluk",
    name: "Gündelik Aura",
    color: "#9e9e9e",
    oneIn: 1,
    oneInLabel: "Yaygın",
  };

  const RARE_EXACT = /** @type {AuraDef[]} */ ([
    { id: "lolipop", name: "Lolipop", color: "#f48fb1", oneIn: 121, oneInLabel: "1 / 121" },
    { id: "bomba", name: "Bomba", color: "#ef5350", oneIn: 233, oneInLabel: "1 / 233" },
    { id: "sosis", name: "Sosis", color: "#ffcc80", oneIn: 393, oneInLabel: "1 / 393" },
    { id: "sucuk", name: "Sucuk", color: "#d7ccc8", oneIn: 500, oneInLabel: "1 / 500" },
    { id: "dubai_cikolata", name: "Dubai Çikolatası", color: "#a1887f", oneIn: 676, oneInLabel: "1 / 676" },
    { id: "calilik", name: "Çalılık", color: "#7cb342", oneIn: 891, oneInLabel: "1 / 891" },
    { id: "nebula", name: "Nebula", color: "#b388ff", oneIn: 1000, oneInLabel: "1 / 1.000" },
    { id: "kafatasi", name: "Kafatası", color: "#eceff1", oneIn: 1541, oneInLabel: "1 / 1.541" },
    { id: "sirius", name: "Sirius", color: "#40c4ff", oneIn: 3762, oneInLabel: "1 / 3.762" },
    { id: "bontirli", name: "Bontirli", color: "#ff6e40", oneIn: 4083, oneInLabel: "1 / 4.083" },
    { id: "ozel_cicek", name: "Özel Çiçek", color: "#ff4081", oneIn: 5674, oneInLabel: "1 / 5.674" },
  ]);

  const AURAS_100_FULL = AURAS_1_IN_100.map((a) => ({
    id: a.id,
    name: a.name,
    color: a.color,
    oneIn: 100,
    oneInLabel: "1 / 100",
    weightDenom: 600,
  }));

  const ALL_AURAS = /** @type {AuraDef[]} */ ([AURA_COMMON, ...AURAS_100_FULL, ...RARE_EXACT]);
  const auraMap = new Map(ALL_AURAS.map((a) => [a.id, a]));

  /** @typedef {{ counts: Record<string, number>; equippedId: string | null; autoRoll: boolean; luckPoints: number; fastSpin: boolean; potionSince: number; hasCrown: boolean; hasGlove: boolean }} GameState */

  /** @type {GameState} */
  let state = {
    counts: {},
    equippedId: null,
    autoRoll: false,
    luckPoints: 0,
    fastSpin: false,
    potionSince: 0,
    hasCrown: false,
    hasGlove: false,
  };

  let lastRoll = /** @type {AuraDef | null} */ (null);
  let isSpinning = false;
  let spinStartAt = 0;
  let autoTimeoutId = 0;
  let teaserIntervalId = 0;
  let spinFinishTimerId = 0;
  let uiTickId = 0;
  let legendRevealTimer1 = 0;
  let legendRevealTimer2 = 0;

  const elSplash = document.getElementById("splash");
  const elApp = document.getElementById("app");
  const elAppSlider = document.getElementById("app-slider");
  const elBtnToCraft = document.getElementById("btn-to-craft");
  const elBtnFromCraft = document.getElementById("btn-from-craft");
  const elCraftList = document.getElementById("craft-list");
  const elInventoryList = document.getElementById("inventory-list");
  const elInventoryEmpty = document.getElementById("inventory-empty");
  const elEquippedName = document.getElementById("equipped-name");
  const elAuraStage = document.getElementById("aura-stage");
  const elAuraOrbit = document.getElementById("aura-orbit");
  const elAuraEyebrow = document.getElementById("aura-eyebrow");
  const elAuraName = document.getElementById("aura-display-name");
  const elAuraOdds = document.getElementById("aura-display-odds");
  const elLuckReadout = document.getElementById("luck-readout");
  const elBtnSpin = document.getElementById("btn-spin");
  const elBtnQuick = document.getElementById("btn-quick");
  const elBtnAuto = document.getElementById("btn-auto");
  const elCutscene = document.getElementById("cutscene");
  const elLegendReveal = document.getElementById("legend-reveal");
  const elLegendRevealName = document.getElementById("legend-reveal-name");
  const elLegendRevealOdds = document.getElementById("legend-reveal-odds");
  const elQuickModal = document.getElementById("quick-modal");
  const elQuickBackdrop = document.getElementById("quick-backdrop");
  const elQuickCode = document.getElementById("quick-code");
  const elQuickError = document.getElementById("quick-error");
  const elQuickSubmit = document.getElementById("quick-submit");
  const elQuickCancel = document.getElementById("quick-cancel");

  function auraById(id) {
    return auraMap.get(id) ?? null;
  }

  function getSpinMs() {
    return state.fastSpin ? SPIN_MS_FAST : SPIN_MS_NORMAL;
  }

  function getTeaserTickMs() {
    return state.fastSpin ? 32 : 90;
  }

  function isLegendaryCutscene(aura) {
    return aura.oneIn >= LEGENDARY_MIN_ONE_IN;
  }

  function isPotionActive() {
    if (!state.potionSince) return false;
    return Date.now() < state.potionSince + POTION_DURATION_MS;
  }

  function getPotionTimeBonus() {
    if (!isPotionActive() || !state.potionSince) return 0;
    const elapsedSec = Math.floor((Date.now() - state.potionSince) / 1000);
    const capped = Math.min(500, Math.max(0, elapsedSec));
    return capped * POTION_CHANCE_PER_SEC;
  }

  function getCraftPassiveLuck() {
    let x = getPotionTimeBonus();
    if (state.hasCrown) x += CROWN_BONUS;
    if (state.hasGlove) x += GLOVE_BONUS;
    return x;
  }

  function getEffectiveLuckForRoll() {
    return state.luckPoints + getCraftPassiveLuck();
  }

  function expirePotionIfNeeded() {
    if (state.potionSince && Date.now() >= state.potionSince + POTION_DURATION_MS) {
      state.potionSince = 0;
      saveState();
    }
  }

  function weightForAura(aura, luck) {
    const denom = aura.weightDenom ?? aura.oneIn;
    const mult = 1 + luck * LUCK_WEIGHT_SCALE;
    return (1 / denom) * mult;
  }

  function pickRandomAura() {
    const luck = getEffectiveLuckForRoll();
    /** @type {{ aura: AuraDef; w: number }[]} */
    const pool = [{ aura: AURA_COMMON, w: W_COMMON }];
    for (const a of AURAS_100_FULL) pool.push({ aura: a, w: weightForAura(a, luck) });
    for (const a of RARE_EXACT) pool.push({ aura: a, w: weightForAura(a, luck) });

    let t = 0;
    for (const e of pool) t += e.w;
    let r = Math.random() * t;
    for (const e of pool) {
      r -= e.w;
      if (r <= 0) return e.aura;
    }
    return pool[pool.length - 1].aura;
  }

  function listCraftMaterials() {
    return ALL_AURAS.filter((a) => a.oneIn < CRAFT_MAX_ONE_IN).sort((a, b) => a.oneIn - b.oneIn);
  }

  function countCraftMaterialsTotal() {
    return listCraftMaterials().reduce((s, a) => s + (state.counts[a.id] || 0), 0);
  }

  function tryConsumeCraftMaterials(need) {
    let left = need;
    for (const a of listCraftMaterials()) {
      const have = state.counts[a.id] || 0;
      if (have <= 0) continue;
      const take = Math.min(have, left);
      state.counts[a.id] = have - take;
      left -= take;
      if (left <= 0) return true;
    }
    return false;
  }

  function initAuraOrbs() {
    if (!elAuraOrbit) return;
    elAuraOrbit.innerHTML = "";
    const ring = document.createElement("div");
    ring.className = "aura-orbit__ring";
    const n = 10;
    for (let i = 0; i < n; i += 1) {
      const o = document.createElement("span");
      o.className = "aura-orb";
      o.style.setProperty("--orb-rot", `${(360 / n) * i}deg`);
      const a = ALL_AURAS[i % ALL_AURAS.length];
      o.style.setProperty("--orb-color", a.color);
      ring.appendChild(o);
    }
    elAuraOrbit.appendChild(ring);
  }

  function setOrbPalette(startIndex) {
    if (!elAuraOrbit) return;
    const orbs = elAuraOrbit.querySelectorAll(".aura-orb");
    orbs.forEach((node, j) => {
      const a = ALL_AURAS[(startIndex + j) % ALL_AURAS.length];
      node.style.setProperty("--orb-color", a.color);
    });
  }

  function setOrbsSolidColor(hex) {
    if (!elAuraOrbit) return;
    elAuraOrbit.querySelectorAll(".aura-orb").forEach((node) => {
      node.style.setProperty("--orb-color", hex);
    });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.counts = parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {};
        state.equippedId = typeof parsed.equippedId === "string" ? parsed.equippedId : null;
        state.autoRoll = Boolean(parsed.autoRoll);
        state.luckPoints =
          typeof parsed.luckPoints === "number" && Number.isFinite(parsed.luckPoints)
            ? Math.max(0, Math.floor(parsed.luckPoints))
            : 0;
        state.fastSpin = Boolean(parsed.fastSpin);
        state.potionSince =
          typeof parsed.potionSince === "number" && Number.isFinite(parsed.potionSince)
            ? Math.max(0, parsed.potionSince)
            : 0;
        state.hasCrown = Boolean(parsed.hasCrown);
        state.hasGlove = Boolean(parsed.hasGlove);
        if (state.equippedId && !auraById(state.equippedId)) state.equippedId = null;
      }
    } catch {
      /* ignore */
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          counts: state.counts,
          equippedId: state.equippedId,
          autoRoll: state.autoRoll,
          luckPoints: state.luckPoints,
          fastSpin: state.fastSpin,
          potionSince: state.potionSince,
          hasCrown: state.hasCrown,
          hasGlove: state.hasGlove,
        }),
      );
    } catch {
      /* ignore */
    }
  }

  function renderLuckReadout() {
    expirePotionIfNeeded();
    if (!elLuckReadout) return;
    const fast = state.fastSpin ? " · Hızlı mod: 0,7 sn" : "";
    const craft = getCraftPassiveLuck();
    const craftTxt = craft > 0 ? ` · Eşya şansı: +${craft}` : "";
    elLuckReadout.textContent = `Şans birikimi: +${state.luckPoints} (çevir +${LUCK_PER_SPIN})${craftTxt}${fast}`;
  }

  function renderCraftPanel() {
    if (!elCraftList) return;
    expirePotionIfNeeded();
    elCraftList.innerHTML = "";
    const matTotal = countCraftMaterialsTotal();

    for (const recipe of CRAFT_RECIPES) {
      const li = document.createElement("li");
      li.className = "craft-card";

      const h = document.createElement("p");
      h.className = "craft-card__name";
      h.textContent = recipe.name;

      const d = document.createElement("p");
      d.className = "craft-card__desc";
      d.textContent = recipe.desc;

      const c = document.createElement("p");
      c.className = "craft-card__cost";
      c.textContent = `Malzeme: ${recipe.cost} aura (1/200 altı, envanterden düşer)`;

      const st = document.createElement("p");
      st.className = "craft-card__status";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--craft";
      btn.textContent = "Üret";

      if (recipe.id === "potion") {
        if (isPotionActive()) {
          const left = Math.max(0, state.potionSince + POTION_DURATION_MS - Date.now());
          const sec = Math.ceil(left / 1000);
          st.textContent = `İksir aktif — kalan ~${sec} sn`;
        } else {
          st.textContent = "İksir kapalı";
        }
        btn.disabled = matTotal < recipe.cost;
        btn.addEventListener("click", () => {
          if (countCraftMaterialsTotal() < recipe.cost) return;
          if (!tryConsumeCraftMaterials(recipe.cost)) return;
          state.potionSince = Date.now();
          saveState();
          renderCraftPanel();
          renderInventory();
          renderLuckReadout();
        });
      } else if (recipe.id === "crown") {
        st.textContent = state.hasCrown ? "Taç üretildi (kalıcı +6)" : "Taç yok";
        btn.disabled = state.hasCrown || matTotal < recipe.cost;
        btn.addEventListener("click", () => {
          if (state.hasCrown) return;
          if (countCraftMaterialsTotal() < recipe.cost) return;
          if (!tryConsumeCraftMaterials(recipe.cost)) return;
          state.hasCrown = true;
          saveState();
          renderCraftPanel();
          renderInventory();
          renderLuckReadout();
        });
      } else if (recipe.id === "glove") {
        st.textContent = state.hasGlove ? "Eldiven üretildi (kalıcı +9)" : "Eldiven yok";
        btn.disabled = state.hasGlove || matTotal < recipe.cost;
        btn.addEventListener("click", () => {
          if (state.hasGlove) return;
          if (countCraftMaterialsTotal() < recipe.cost) return;
          if (!tryConsumeCraftMaterials(recipe.cost)) return;
          state.hasGlove = true;
          saveState();
          renderCraftPanel();
          renderInventory();
          renderLuckReadout();
        });
      }

      li.appendChild(h);
      li.appendChild(d);
      li.appendChild(c);
      li.appendChild(st);
      li.appendChild(btn);
      elCraftList.appendChild(li);
    }
  }

  function openCraftView() {
    if (elAppSlider) elAppSlider.classList.add("app-slider--craft");
    renderCraftPanel();
  }

  function closeCraftView() {
    if (elAppSlider) elAppSlider.classList.remove("app-slider--craft");
  }

  function clearAutoTimer() {
    if (autoTimeoutId) {
      clearTimeout(autoTimeoutId);
      autoTimeoutId = 0;
    }
  }

  function clearSpinFinishTimer() {
    if (spinFinishTimerId) {
      clearTimeout(spinFinishTimerId);
      spinFinishTimerId = 0;
    }
  }

  function clearTeaser() {
    if (teaserIntervalId) {
      clearInterval(teaserIntervalId);
      teaserIntervalId = 0;
    }
  }

  function scheduleAutoSpin() {
    clearAutoTimer();
    if (!state.autoRoll || isSpinning) return;
    const elapsed = Date.now() - spinStartAt;
    const period = Math.max(AUTO_INTERVAL_MS, getSpinMs());
    const wait = Math.max(0, period - elapsed);
    autoTimeoutId = window.setTimeout(() => {
      autoTimeoutId = 0;
      if (state.autoRoll && !isSpinning) startSpin();
    }, wait);
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clearLegendRevealTimers() {
    if (legendRevealTimer1) clearTimeout(legendRevealTimer1);
    if (legendRevealTimer2) clearTimeout(legendRevealTimer2);
    legendRevealTimer1 = 0;
    legendRevealTimer2 = 0;
  }

  function finishLegendarySequence() {
    clearLegendRevealTimers();
    isSpinning = false;
    elBtnSpin.disabled = false;
    if (elBtnQuick) elBtnQuick.disabled = false;
    if (elBtnToCraft) elBtnToCraft.disabled = false;
    elAuraStage.classList.remove("aura-stage--spinning");
    renderAuraStage();
    renderInventory();
    if (state.autoRoll) scheduleAutoSpin();
  }

  function startLegendRevealAfterCutscene(rolled) {
    clearLegendRevealTimers();
    if (!elLegendReveal || !elLegendRevealName || !elLegendRevealOdds) {
      finishLegendarySequence();
      return;
    }

    const reduced = prefersReducedMotion();
    const holdMs = reduced ? 650 : LEGEND_REVEAL_HOLD_MS;
    const fadeMs = reduced ? 400 : LEGEND_REVEAL_FADE_MS;

    elLegendRevealName.textContent = rolled.name;
    elLegendRevealOdds.textContent = rolled.oneInLabel;
    elLegendReveal.style.setProperty("--lr-color", rolled.color);
    elLegendReveal.style.transitionDuration = reduced ? "0.38s" : "";
    elLegendReveal.classList.remove("legend-reveal--hidden", "legend-reveal--fade");
    elLegendReveal.setAttribute("aria-hidden", "false");
    void elLegendReveal.offsetWidth;

    legendRevealTimer1 = window.setTimeout(() => {
      elLegendReveal.classList.add("legend-reveal--fade");
      legendRevealTimer2 = window.setTimeout(() => {
        elLegendReveal.classList.add("legend-reveal--hidden");
        elLegendReveal.classList.remove("legend-reveal--fade");
        elLegendReveal.setAttribute("aria-hidden", "true");
        finishLegendarySequence();
      }, fadeMs);
    }, holdMs);
  }

  function runLegendaryCutscene(rolled, onDone) {
    if (!elCutscene) {
      onDone();
      return;
    }
    clearAutoTimer();
    elCutscene.style.setProperty("--cs-color", rolled.color);
    const stopMid = document.getElementById("cutscene-stop-mid");
    const stopEdge = document.getElementById("cutscene-stop-edge");
    if (stopMid) stopMid.setAttribute("stop-color", rolled.color);
    if (stopEdge) stopEdge.setAttribute("stop-color", rolled.color);

    elCutscene.classList.remove("cutscene--hidden", "cutscene--run", "cutscene--fast");
    void elCutscene.offsetWidth;
    elCutscene.classList.add("cutscene--run");
    elCutscene.setAttribute("aria-hidden", "false");
    if (prefersReducedMotion()) elCutscene.classList.add("cutscene--fast");

    const ms = prefersReducedMotion() ? 500 : CUTSCENE_MS;
    window.setTimeout(() => {
      elCutscene.classList.remove("cutscene--run", "cutscene--fast");
      elCutscene.classList.add("cutscene--hidden");
      elCutscene.setAttribute("aria-hidden", "true");
      onDone();
    }, ms);
  }

  function startSpin() {
    if (isSpinning) return;
    isSpinning = true;
    spinStartAt = Date.now();
    clearAutoTimer();
    clearSpinFinishTimer();

    state.luckPoints += LUCK_PER_SPIN;
    saveState();
    renderLuckReadout();

    elBtnSpin.disabled = true;
    if (elBtnQuick) elBtnQuick.disabled = true;
    if (elBtnToCraft) elBtnToCraft.disabled = true;
    elAuraStage.classList.add("aura-stage--spinning");
    elAuraEyebrow.textContent = "Çevriliyor";
    elAuraName.textContent = "…";
    elAuraOdds.textContent = "";
    elAuraName.classList.remove("aura-stage__name--legendary");
    elAuraStage.style.setProperty("--aura-color", "#888");

    let i = 0;
    clearTeaser();
    setOrbPalette(0);
    teaserIntervalId = window.setInterval(() => {
      const a = ALL_AURAS[i % ALL_AURAS.length];
      elAuraName.textContent = a.name;
      elAuraStage.style.setProperty("--aura-color", a.color);
      setOrbPalette(i);
      i += 1;
    }, getTeaserTickMs());

    const ms = prefersReducedMotion() ? Math.min(400, getSpinMs()) : getSpinMs();
    spinFinishTimerId = window.setTimeout(finishSpin, ms);
  }

  function finishSpin() {
    spinFinishTimerId = 0;
    clearTeaser();
    const rolled = pickRandomAura();
    lastRoll = rolled;
    state.counts[rolled.id] = (state.counts[rolled.id] || 0) + 1;

    if (rolled.id !== AURA_COMMON.id) {
      state.luckPoints = Math.max(0, state.luckPoints - LUCK_PENALTY_GOOD_ROLL);
    }

    saveState();
    renderLuckReadout();

    if (isLegendaryCutscene(rolled)) {
      setOrbsSolidColor(rolled.color);
      runLegendaryCutscene(rolled, () => {
        startLegendRevealAfterCutscene(rolled);
      });
      return;
    }

    isSpinning = false;
    elBtnSpin.disabled = false;
    if (elBtnQuick) elBtnQuick.disabled = false;
    if (elBtnToCraft) elBtnToCraft.disabled = false;
    elAuraStage.classList.remove("aura-stage--spinning");
    renderAuraStage();
    renderInventory();

    if (state.autoRoll) scheduleAutoSpin();
  }

  function renderAuraStage() {
    if (isSpinning) return;
    if (lastRoll) {
      elAuraEyebrow.textContent = "Bulundu";
      elAuraName.textContent = lastRoll.name;
      elAuraOdds.textContent = lastRoll.oneInLabel;
      elAuraStage.style.setProperty("--aura-color", lastRoll.color);
      elAuraName.classList.toggle("aura-stage__name--legendary", isLegendaryCutscene(lastRoll));
      setOrbsSolidColor(lastRoll.color);
    } else {
      elAuraEyebrow.textContent = "";
      elAuraName.textContent = "Çevirmeye hazır";
      elAuraOdds.textContent = "Şansını dene";
      elAuraStage.style.setProperty("--aura-color", "#fff");
      elAuraName.classList.remove("aura-stage__name--legendary");
      setOrbPalette(0);
    }
  }

  function renderEquippedBar() {
    const eq = state.equippedId ? auraById(state.equippedId) : null;
    elEquippedName.textContent = eq ? eq.name : "—";
    elEquippedName.style.color = eq ? eq.color : "";
  }

  function renderInventory() {
    elInventoryList.innerHTML = "";
    const owned = ALL_AURAS.filter((a) => (state.counts[a.id] || 0) > 0);
    elInventoryEmpty.classList.toggle("inventory__empty--hidden", owned.length > 0);

    for (const a of owned) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "inventory-item";
      if (state.equippedId === a.id) btn.classList.add("inventory-item--equipped");

      const name = document.createElement("span");
      name.className = "inventory-item__name";
      name.textContent = a.name;
      name.style.color = a.color;

      const meta = document.createElement("div");
      meta.className = "inventory-item__meta";
      const count = document.createElement("span");
      count.textContent = `×${state.counts[a.id]}`;
      meta.appendChild(count);
      if (state.equippedId === a.id) {
        const badge = document.createElement("span");
        badge.className = "inventory-item__badge";
        badge.textContent = "Takılı";
        meta.appendChild(badge);
      }

      btn.appendChild(name);
      btn.appendChild(meta);
      btn.addEventListener("click", () => {
        state.equippedId = a.id;
        saveState();
        renderInventory();
        renderEquippedBar();
      });

      li.appendChild(btn);
      elInventoryList.appendChild(li);
    }
  }

  function renderAutoButton() {
    const on = state.autoRoll;
    elBtnAuto.setAttribute("aria-pressed", on ? "true" : "false");
    elBtnAuto.textContent = on ? "Otomatik Çevir: AÇIK" : "Otomatik Çevir: KAPALI";
    elBtnAuto.classList.toggle("btn--auto-on", on);
    elBtnAuto.classList.toggle("btn--auto-off", !on);
  }

  function openQuickModal() {
    if (!elQuickModal || isSpinning) return;
    elQuickModal.classList.remove("modal--hidden");
    elQuickModal.setAttribute("aria-hidden", "false");
    if (elQuickError) {
      elQuickError.textContent = "";
      elQuickError.classList.add("modal__error--hidden");
    }
    if (elQuickCode) {
      elQuickCode.value = "";
      elQuickCode.focus();
    }
  }

  function closeQuickModal() {
    if (!elQuickModal) return;
    elQuickModal.classList.add("modal--hidden");
    elQuickModal.setAttribute("aria-hidden", "true");
  }

  function submitQuickCode() {
    const code = (elQuickCode && elQuickCode.value.trim()) || "";
    if (code === FAST_SPIN_CODE) {
      state.fastSpin = true;
      saveState();
      closeQuickModal();
      renderLuckReadout();
      if (!isSpinning) startSpin();
      return;
    }
    if (elQuickError) {
      elQuickError.textContent = "Yanlış kod";
      elQuickError.classList.remove("modal__error--hidden");
    }
  }

  function initControls() {
    elBtnSpin.addEventListener("click", () => {
      if (!isSpinning) startSpin();
    });
    if (elBtnQuick) elBtnQuick.addEventListener("click", () => openQuickModal());
    if (elBtnToCraft) elBtnToCraft.addEventListener("click", () => openCraftView());
    if (elBtnFromCraft) elBtnFromCraft.addEventListener("click", () => closeCraftView());
    if (elQuickBackdrop) elQuickBackdrop.addEventListener("click", () => closeQuickModal());
    if (elQuickCancel) elQuickCancel.addEventListener("click", () => closeQuickModal());
    if (elQuickSubmit) elQuickSubmit.addEventListener("click", () => submitQuickCode());
    if (elQuickCode) {
      elQuickCode.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitQuickCode();
        }
      });
    }
    elBtnAuto.addEventListener("click", () => {
      state.autoRoll = !state.autoRoll;
      saveState();
      renderAutoButton();
      if (!state.autoRoll) clearAutoTimer();
      else if (!isSpinning) startSpin();
    });
  }

  function startUiTicker() {
    if (uiTickId) clearInterval(uiTickId);
    uiTickId = window.setInterval(() => {
      renderLuckReadout();
      if (elAppSlider && elAppSlider.classList.contains("app-slider--craft")) {
        renderCraftPanel();
      }
    }, 1000);
  }

  function endSplash() {
    elSplash.classList.add("splash--done");
    elSplash.setAttribute("aria-hidden", "true");
    elApp.classList.remove("app--hidden");
    elApp.setAttribute("aria-hidden", "false");
    if (state.autoRoll && !isSpinning) startSpin();
  }

  loadState();
  initAuraOrbs();
  initControls();
  startUiTicker();
  renderEquippedBar();
  renderInventory();
  renderAuraStage();
  renderAutoButton();
  renderLuckReadout();
  renderCraftPanel();

  window.setTimeout(endSplash, SPLASH_MS);
})();
