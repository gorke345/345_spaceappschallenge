// TURQUA // FIRE HARMONY — Interactive Calendar Bridge, Raw/Harmonized Toggle & Solver Modal
import { map } from "../js/map.js";

let precomputedMonthly = null;
let currentMode = "harmonized"; // "harmonized" | "raw"

export async function initProofLab() {
  try {
    const res = await fetch("data/monthly_tr.json", { cache: "no-store" });
    if (res.ok) precomputedMonthly = await res.json();
  } catch (_) {}

  const cmdActions = document.querySelector(".cmd-actions");
  if (cmdActions) {
    let modeBtn = document.getElementById("btnRawHarmToggle");
    if (!modeBtn) {
      modeBtn = document.createElement("button");
      modeBtn.id = "btnRawHarmToggle";
      modeBtn.className = "btn btn-proof";
      modeBtn.textContent = "SCALE: HARMONIZED (×1.13)";
      modeBtn.title = "Switch between Harmonized Burning Days and Raw Uncalibrated Sum (watch 2012/2019/2024 jumps)";
      cmdActions.prepend(modeBtn);
    }
    modeBtn.onclick = toggleRawHarmonized;

    let solverBtn = document.getElementById("btnSolverModal");
    if (!solverBtn) {
      solverBtn = document.createElement("button");
      solverBtn.id = "btnSolverModal";
      solverBtn.className = "btn";
      solverBtn.textContent = "🔬 SOLVER LAB";
      solverBtn.title = "Open interactive in-app mathematical formula solver";
      cmdActions.prepend(solverBtn);
    }
    solverBtn.onclick = openSolverModal;

    let proofLink = document.getElementById("btnEvidencePage");
    if (!proofLink) {
      proofLink = document.createElement("a");
      proofLink.id = "btnEvidencePage";
      proofLink.href = "proof/index.html";
      proofLink.className = "btn btn-proof";
      proofLink.style.textDecoration = "none";
      proofLink.textContent = "🔥 EVIDENCE (6 PROOFS)";
      cmdActions.prepend(proofLink);
    }
  }

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
    const mMatch = title.match(/^(\d{4})\s+([A-Za-z]+)/);
    if (!mMatch) return;
    const yr = Number(mMatch[1]);
    const mShort = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const mLong = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
    let mo = mShort.indexOf(mMatch[2].slice(0, 3).toUpperCase()) + 1;
    if (mo < 1) mo = mLong.indexOf(mMatch[2].toUpperCase()) + 1;
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

  const dtOut = document.getElementById("solverDtOut");
  if (dtOut) dtOut.textContent = `${dtMin} min`;
  const thetaOut = document.getElementById("solverThetaOut");
  if (thetaOut) thetaOut.textContent = `${thetaDeg}°`;
  const nOut = document.getElementById("solverNOut");
  if (nOut) nOut.textContent = `${nSats} sensors`;

  // 1. Bowtie expansion factor: E_bowtie = 1 / cos^2(theta)
  const rad = (thetaDeg * Math.PI) / 180.0;
  const cosT = Math.max(0.1, Math.cos(rad));
  const eBowtie = 1.0 / (cosT * cosT);
  const bVal = document.getElementById("solverBowtieVal");
  if (bVal) bVal.textContent = `×${eBowtie.toFixed(2)}`;

  // 2. Temporal coincidence weight: exp(-dt / 30)
  const tCoinc = Math.exp(-dtMin / 30.0);
  const cVal = document.getElementById("solverCoincVal");
  if (cVal) cVal.textContent = tCoinc.toFixed(3);

  // 3. Bayes Noisy-OR cluster confidence: P = 1 - (1 - p)^N
  const pSensor = 0.75;
  const pCluster = 1.0 - Math.pow(1.0 - pSensor, nSats);
  const byVal = document.getElementById("solverBayesVal");
  if (byVal) byVal.textContent = `${(pCluster * 100).toFixed(1)}%`;

  // 4. Combined weight
  const finalWeight = (pCluster * tCoinc) / Math.sqrt(eBowtie);
  const fwVal = document.getElementById("solverFinalWeight");
  if (fwVal) fwVal.textContent = finalWeight.toFixed(3);
}

export function updateInlineProof() {}
