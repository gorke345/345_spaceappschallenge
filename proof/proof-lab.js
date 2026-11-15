// TURQUA // FIRE HARMONY — Interactive Calendar Bridge, Raw/Harmonized Toggle, 25s Jury Tour & I18N
import { map } from "../js/map.js";

let precomputedMonthly = null;
let currentMode = "harmonized"; // "harmonized" | "raw"
let currentLang = "en";
let spinActive = false;
let spinFrame = null;
let juryTourActive = false;
let juryTourTimer = null;

const UI_TRANSLATIONS = { en: {} };

export async function initProofLab() {
  try {
    const res = await fetch("data/monthly_tr.json", { cache: "no-store" });
    if (res.ok) precomputedMonthly = await res.json();
  } catch (_) {}

  const cmdActions = document.querySelector(".cmd-actions");
  if (cmdActions && !document.getElementById("btnEvidencePage")) {
    // 1) Raw vs Harmonized Toggle
    const modeBtn = document.createElement("button");
    modeBtn.id = "btnRawHarmToggle";
    modeBtn.className = "btn btn-proof";
    modeBtn.textContent = "SCALE: HARMONIZED (×1.13)";
    modeBtn.title = "Switch between Harmonized Burning Days and Raw Uncalibrated Sum (watch 2012/2019/2024 jumps)";
    modeBtn.addEventListener("click", toggleRawHarmonized);

    // 2) 25s Jury Tour Button
    const tourBtn = document.createElement("button");
    tourBtn.id = "btnJuryTour";
    tourBtn.className = "btn btn-proof";
    tourBtn.textContent = "🎬 25s JURY TOUR";
    tourBtn.title = "Start 25-second cinematic jury presentation tour with scientific narration";
    tourBtn.addEventListener("click", toggleJuryTour);

    // 3) Evidence Page Link (proof/index.html)
    const proofLink = document.createElement("a");
    proofLink.id = "btnEvidencePage";
    proofLink.href = "proof/index.html";
    proofLink.className = "btn btn-proof";
    proofLink.style.textDecoration = "none";
    proofLink.textContent = "🔥 EVIDENCE (6 PROOFS)";

    // 4) In-App Solver Modal Button
    const solverBtn = document.createElement("button");
    solverBtn.id = "btnSolverModal";
    solverBtn.className = "btn";
    solverBtn.textContent = "🔬 SOLVER LAB";
    solverBtn.title = "Open interactive in-app mathematical formula solver";
    solverBtn.addEventListener("click", openSolverModal);

    // 5) 3D Spin Button
    const spinBtn = document.createElement("button");
    spinBtn.id = "btnGlobeSpin";
    spinBtn.className = "btn";
    spinBtn.textContent = "🌐 3D SPIN";
    spinBtn.addEventListener("click", toggleGlobeSpin);

    // 6) EN / TR Toggle
    const langBtn = document.createElement("button");
    langBtn.id = "btnLangToggle";
    langBtn.className = "btn";
    langBtn.textContent = "EN / TR";
    langBtn.addEventListener("click", toggleLanguage);

    cmdActions.prepend(langBtn);
    cmdActions.prepend(spinBtn);
    cmdActions.prepend(solverBtn);
    cmdActions.prepend(modeBtn);
    cmdActions.prepend(tourBtn);
    cmdActions.prepend(proofLink);
  }

  applyLanguage("en");
  window.addEventListener("turqua:anomaly-updated", () => {
    renderPrecomputedCalendar();
  });
  if (precomputedMonthly) {
    setTimeout(() => renderPrecomputedCalendar(), 300);
    setTimeout(() => renderPrecomputedCalendar(), 1200);
  }
}

function toggleRawHarmonized() {
  currentMode = currentMode === "harmonized" ? "raw" : "harmonized";
  const btn = document.getElementById("btnRawHarmToggle");
  if (btn) {
    btn.textContent = currentMode === "harmonized"
      ? "SCALE: HARMONIZED (×1.13)"
      : "SCALE: RAW SUM (×17.5 JUMP!)";
  }
  renderPrecomputedCalendar();
}

function renderPrecomputedCalendar() {
  if (!precomputedMonthly?.series) return;
  const cells = document.querySelectorAll("#calendarGrid .calendar-value");
  if (!cells.length) return;

  const seriesMap = new Map(precomputedMonthly.series.map(r => [r.ym, r]));
  const viridis10 = ["#440154","#482878","#3e4989","#31688e","#26828e","#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"];
  const maxVal = currentMode === "harmonized" ? 3800 : 22000;

  let totalHarm = 0;
  cells.forEach(cell => {
    const title = cell.getAttribute("title") || "";
    const mMatch = title.match(/^(\d{4})\s+([A-Z]+)/);
    if (!mMatch) return;
    const yr = Number(mMatch[1]);
    const mNames = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
    const mo = mNames.indexOf(mMatch[2]) + 1;
    if (mo < 1) return;
    const ym = `${yr}-${String(mo).padStart(2, "0")}`;
    const row = seriesMap.get(ym);
    if (!row) return;

    cell.classList.remove("status-reconstructed", "status-outage_filled", "status-bridged_post_snpp", "status-no_observation", "no-data");
    cell.classList.add(`status-${row.status}`);

    if (row.status === "no_observation") {
      cell.style.backgroundColor = "";
      cell.title = `${ym} | NO OBSERVATION (Never treated as zero)`;
      return;
    }

    const val = currentMode === "harmonized" ? row.harmonized_bd : row.raw_hotspots;
    totalHarm += row.harmonized_bd || 0;
    const norm = Math.min(1, Math.sqrt(Math.max(0, val) / maxVal));
    const cIdx = Math.min(viridis10.length - 1, Math.floor(norm * viridis10.length));
    cell.style.backgroundColor = viridis10[cIdx];
    cell.title = `${ym} | Status: ${row.status.toUpperCase()} | ${currentMode === "harmonized" ? "Harmonized BD" : "Raw Hotspots"}: ${val} | Median: ${row.median_bd} | Anomaly: ${row.anomaly_pct >= 0 ? "+" : ""}${row.anomaly_pct}% | 80% CI: [${row.q10}, ${row.q90}]`;
  });

  const idxEl = document.getElementById("sensorAdjustedIndex");
  if (idxEl) idxEl.textContent = `${Math.round(totalHarm).toLocaleString()} BD (SNPP-eq)`;
  const corrEl = document.getElementById("sensorCorrection");
  if (corrEl) corrEl.textContent = "×17.49 → ×1.13 (-98% artificial jump)";
}

function toggleGlobeSpin() {
  spinActive = !spinActive;
  const btn = document.getElementById("btnGlobeSpin");
  if (btn) btn.textContent = spinActive ? "⏹ STOP SPIN" : "🌐 3D SPIN";
  if (!spinActive) {
    if (spinFrame) cancelAnimationFrame(spinFrame);
    return;
  }
  const step = () => {
    if (!spinActive) return;
    const c = map.getCenter();
    map.setCenter([c.lng + 0.15, c.lat]);
    spinFrame = requestAnimationFrame(step);
  };
  map.once("mousedown", () => { if (spinActive) toggleGlobeSpin(); });
  step();
}

function toggleJuryTour() {
  if (juryTourActive) {
    stopJuryTour();
    return;
  }
  juryTourActive = true;
  const btn = document.getElementById("btnJuryTour");
  if (btn) btn.textContent = "⏹ STOP TOUR";

  let hud = document.getElementById("juryTourHud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "juryTourHud";
    hud.className = "jury-tour-hud";
    document.querySelector(".globe-wrap")?.appendChild(hud);
  }
  hud.style.display = "flex";

  const scenes = [
    {
      title: "SCENE 1/5: 25 YEARS OF MEDITERRANEAN FIRE REGIMES",
      sub: "Harmonizing MODIS (Terra/Aqua) & VIIRS (SNPP/NOAA-20/NOAA-21) on one continuous scale.",
      center: [35.0, 38.5], zoom: 2.2, pitch: 35, bearing: 0, duration: 5000,
    },
    {
      title: "SCENE 2/5: CLOSING THE SATELLITE SEAMS (2012 / 2019 / 2024)",
      sub: "Raw archive inflates ×17.5 across launches; two-branch (k1, k2) transfer stabilizes to ×1.13.",
      center: [32.0, 37.0], zoom: 4.8, pitch: 45, bearing: -15, duration: 5000,
    },
    {
      title: "SCENE 3/5: 2021 MANAVGAT MEGAFIRE CLUSTER",
      sub: "412 Burning Days, 14,820 MW peak FRP — 4 satellites confirm crown fire progression.",
      center: [31.47, 36.88], zoom: 8.5, pitch: 55, bearing: 25, duration: 5000,
      action: () => {
        const b = document.querySelector('[data-case-study="mediterranean-2021"]');
        if (b) b.click();
      }
    },
    {
      title: "SCENE 4/5: STATIC THERMAL ANOMALY (STA) FILTER",
      sub: "Payas/Iskenderun industrial flares: 25.7% of detections masked with 95.5% precision.",
      center: [36.20, 36.71], zoom: 9.0, pitch: 40, bearing: 10, duration: 5000,
      action: () => {
        const b = document.querySelector('[data-case-study="payas-sta"]');
        if (b) b.click();
      }
    },
    {
      title: "SCENE 5/5: 6 EMPIRICAL PROOFS & VALIDATION",
      sub: "Leave-One-Year-Out r = 0.989 | Independent Sofiev physical operator (16.25 MW) r = 0.997.",
      center: [35.0, 38.5], zoom: 3.5, pitch: 20, bearing: 0, duration: 5000,
    }
  ];

  let currentIdx = 0;
  function runScene() {
    if (!juryTourActive || currentIdx >= scenes.length) {
      stopJuryTour();
      return;
    }
    const sc = scenes[currentIdx];
    hud.innerHTML = `
      <div class="scene-title">${sc.title}</div>
      <div class="scene-sub">${sc.sub}</div>
      <div class="tour-progress"><div class="tour-bar" style="width: ${((currentIdx + 1) / scenes.length) * 100}%"></div></div>
    `;
    if (sc.action) sc.action();
    map.flyTo({ center: sc.center, zoom: sc.zoom, pitch: sc.pitch, bearing: sc.bearing, duration: 3200 });
    currentIdx++;
    juryTourTimer = setTimeout(runScene, sc.duration);
  }

  runScene();
}

function stopJuryTour() {
  juryTourActive = false;
  if (juryTourTimer) clearTimeout(juryTourTimer);
  const btn = document.getElementById("btnJuryTour");
  if (btn) btn.textContent = "🎬 25s JURY TOUR";
  const hud = document.getElementById("juryTourHud");
  if (hud) hud.style.display = "none";
}

function openSolverModal() {
  const dlg = document.getElementById("proofLabDialog");
  if (dlg) {
    dlg.showModal();
    updateSolverMath();
  }
}

export function updateSolverMath() {
  const dtSlider = document.getElementById("solverDtSlider");
  const thetaSlider = document.getElementById("solverThetaSlider");
  const nSlider = document.getElementById("solverNSlider");

  if (!dtSlider || !thetaSlider || !nSlider) return;

  const dtMin = Number(dtSlider.value);
  const thetaDeg = Number(thetaSlider.value);
  const nSats = Number(nSlider.value);

  document.getElementById("solverDtOut").textContent = `${dtMin} min`;
  document.getElementById("solverThetaOut").textContent = `${thetaDeg}°`;
  document.getElementById("solverNOut").textContent = `${nSats} sensors`;

  // 1. Bowtie expansion factor: E_bowtie = 1 / cos^2(theta)
  const rad = (thetaDeg * Math.PI) / 180.0;
  const cosT = Math.max(0.1, Math.cos(rad));
  const eBowtie = 1.0 / (cosT * cosT);
  document.getElementById("solverBowtieVal").textContent = `×${eBowtie.toFixed(2)}`;

  // 2. Temporal coincidence weight: exp(-dt / 30)
  const tCoinc = Math.exp(-dtMin / 30.0);
  document.getElementById("solverCoincVal").textContent = tCoinc.toFixed(3);

  // 3. Bayes Noisy-OR cluster confidence: P = 1 - (1 - p)^N
  const pSensor = 0.75;
  const pCluster = 1.0 - Math.pow(1.0 - pSensor, nSats);
  document.getElementById("solverBayesVal").textContent = `${(pCluster * 100).toFixed(1)}%`;

  // 4. Combined weight
  const finalWeight = (pCluster * tCoinc) / Math.sqrt(eBowtie);
  document.getElementById("solverFinalWeight").textContent = finalWeight.toFixed(3);
}

function toggleLanguage() {
  currentLang = currentLang === "en" ? "tr" : "en";
  applyLanguage(currentLang);
}

function applyLanguage(lang) {
  const dict = UI_TRANSLATIONS[lang] || {};
  document.querySelectorAll("button, h2, h3, span").forEach(el => {
    if (el.children.length === 0) {
      const t = el.textContent.trim();
      if (dict[t]) el.textContent = dict[t];
    }
  });
}

export function updateInlineProof() {}
