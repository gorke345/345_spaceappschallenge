# SPACE APPS 2026 — OFFICIAL SUBMISSION TEXTS
**Challenge:** Harmonization of MODIS and VIIRS Hot Spots  
**Project:** TURQUA // FIRE HARMONY — Continuous Multi-Satellite Wildfire Intelligence  
**Team:** TURQUA  

---

## 1. High-Level Project Summary (≤ 1500 chars)

Satellites have watched fires for twenty-five years, yet the global record cannot be read as one continuous time series. When 375 m VIIRS (Suomi-NPP, NOAA-20, NOAA-21) joined 1 km MODIS (Terra, Aqua), raw hotspot counts jumped ×17.49—making burning appear to rise +67% between 2011 and 2013 while unchanged Terra MODIS recorded a -51% drop. Furthermore, Suomi-NPP active fire production ended on November 2, 2026, creating a second continuity gap.

TURQUA // FIRE HARMONY is a serverless 3D globe and Harmonized Burning Activity Calendar (2000–2026) that places all five satellites onto a single, verified scale without requiring an API key:
1. Static Industrial Filtering: Removes persistent industrial/port thermal anomalies (reducing VIIRS false positives from 25.7% to 1.6%).
2. 0.1° Local Solar Burning Days: Aggregates pixel clusters into equal-grid local solar burning days.
3. Orbital Drift & Two-Branch Transfer (k1, k2): Corrects Terra (-10.8%) and Aqua (+15.9%) orbital drift and reconstructs pre-2012 activity, including small fires MODIS missed (branch k2, preventing a 52.7% loss).
4. Post-SNPP Continuity: Suomi-NPP stopped delivering fire data on 2 November 2026, twelve days before the hackathon; from that day the engine bridges the record using NOAA-20 and NOAA-21 scaled by the empirical ratios measured while all three flew together (0.985 and 0.978).

Validated across two continents (Türkiye ×17.49 → ×1.13; Florida ×2.68 → ×1.04), unseen hold-out years (r = 0.989, median error 3.55%), and an independent 16.25 MW physical operator (r = 0.997).

---

## 2. Project Details

### A. What Exactly Does It Do?
TURQUA unifies a quarter-century of Earth observation records into a single continuous scale. Instead of presenting raw hotspot point counts (which explode whenever a new sensor is launched), it computes **0.1° Burning Days (BD)** referenced to the Suomi-NPP VIIRS 375m standard.
- **Interactive 3D Mission Globe:** High-contrast NASA GIBS Blue Marble with deep space atmospheric glow, initial focus on the Mediterranean/Türkiye (zoom 1.65), showing active fire clusters marked with fire emojis (`🔥`).
- **25-Year Harmonized Calendar (2000–2026):** Full monthly matrix displaying burning days, historical medians, anomaly percentages, and data provenance (`measured`, `reconstructed`, `outage_filled`, `bridged_post_snpp`, `no_observation`).
- **6-Panel Evidence Laboratory:** Empirical proof suite proving seam closure, invariance, hold-out back-testing, physical observation agreement, orbital drift, and multi-scale precision.
- **Cinematic 25s Jury Tour:** 5-scene guided presentation covering Mediterranean fire regimes, seam closure, Manavgat 2021 megafire, Payas STA masking, and proof highlights.
- **In-App Formula Solver:** Step-by-step interactive mathematical calculator for $\Delta T$, off-nadir bowtie geometric expansion $E_{\text{bowtie}}$, and Bayesian multi-sensor confidence $P_{\text{cluster}}$.

### B. How Does It Work?
1. **Geometric Bowtie Normalization:** Corrects pixel area distortion at wide scan angles ($\theta$ up to 65°) where pixels grow up to $\times 4.8$ larger than nadir ($E_{\text{bowtie}} = 1/\cos^2\theta$).
2. **Two-Branch Transfer Function ($k_1, k_2$):** Separately transfers daytime passes ($k_1 \approx 3.42$) and nighttime passes ($k_2 \approx 2.85$) between MODIS and VIIRS to preserve diurnal fire physics and capture small fires undetectable by MODIS.
3. **Orbital Drift Correction:** Measures empirical Local Solar Time (LST) drift across Türkiye latitudes from FIRMS timestamps (Terra 10:55 $\to$ 09:19 LST, Aqua 13:09 $\to$ 15:02 LST) to prevent diurnal sampling bias.
4. **Post-SNPP Bridge:** When reference satellite Suomi-NPP was retired on November 2, 2026, the pipeline seamlessly transitioned the active record to co-planar NOAA-20 and NOAA-21 using cross-calibrated overlap ratios.

### C. What Did We Discover / Scientific Findings?
- **Artificial Sensor Inflation:** Moving from 1 satellite (2001) to 5 satellites (2024–2026) artificially inflates raw detection counts by $\times 17.49$. TURQUA reduces this to $\times 1.13$, removing **98% of artificial sensor jump**.
- **The 2011–2013 Illusion:** Raw archive shows a $+67.2\%$ surge in fire activity when VIIRS launched, while unchanged Terra MODIS actually registered a $-51.1\%$ decrease. TURQUA accurately captures the decrease.
- **Zero-Parameter Physical Operator Agreement:** An independent physical threshold operator ($FRP \ge 16.25\text{ MW}$) developed by Sofiev & Kouznetsov (2026) shares zero parameters with our statistical model yet correlates at $r = 0.997$.
- **Industrial Contamination:** Up to $25.7\%$ of raw VIIRS detections in industrial coastal regions are permanent flares (e.g. Payas/İskenderun, Aliağa), which our STA spatial mask removes with $95.5\%$ accuracy.

### D. What It Does NOT Do (Scientific Boundaries)
- It is **NOT** a next-day predictive fire weather forecast (the challenge does not solicit unverifiable machine learning predictions).
- It does **NOT** invent arbitrary percentages for human causality or arson.
- It does **NOT** treat unobserved satellite windows (such as pre-Terra 2000-01..10 or sensor outages) as "zero fire activity"—all unobserved bins are explicitly flagged as `no_observation`.
- Burning Days measure the frequency and duration of thermal activity in $0.1^\circ$ cells, not total ground burned area in hectares.

---

## 3. Tools, Technologies & NASA Data Assets

### NASA & Space Agency Data:
- **NASA FIRMS MODIS Collection 6.1:** Terra (MOD14) & Aqua (MYD14) active fire data (2000–2026).
- **NASA/NOAA FIRMS VIIRS 375m:** Suomi-NPP (VNP14IMG), NOAA-20 (VJ114IMG), NOAA-21 (VJ214IMG) (2012–2026).
- **NASA GIBS WMTS:** Blue Marble Next Generation, VIIRS TrueColor, MODIS MCD12Q1 annual IGBP land cover.
- **ESA WorldCover 2020 v100:** Global 10m land cover validation.

### Software Stack:
- **Client:** Pure Vanilla JavaScript (ES2022, zero external build dependencies), MapLibre GL JS 4.7.1 (3D Globe projection), satellite.js 6.0.1 (orbit propagation), HTML5 Canvas 2D.
- **Pipeline:** Python 3 (pandas, numpy, pyshp, struct binary parser) in `pipeline/harmonize_and_validate.py`.
- **Packaging:** Standalone zero-install static web application with preloaded in-situ dataset in `data/preloaded-data.js`. Runs locally via double-click on `index.html` or via any static web host.

---

## 4. Artificial Intelligence (AI) Disclosure

Built with AI assistance (Claude, Gemini, Antigravity) for code refactoring, WebGL UI styling, and documentation drafting. All scientific models, calibration ratios, LOYO cross-validations, and invariance metrics are computed by deterministic scripts in this repository (`pipeline/harmonize_and_validate.py`) on empirical NASA FIRMS records and reviewed by the team.

---

## 5. Preparation & Prior Work Statement

Before the event, we created initial exploratory prototypes (public repository `gorke345/turqua-fire-harmony` and a public preview published 8 Nov 2026) to study FIRMS schemas, MapLibre globe rendering, and basic ST-DBSCAN clustering.

During the hackathon (14–15 Nov 2026), we completely rebuilt the architecture:
- Designed and computed 0.1° Local Solar Burning Days (BD) with two-branch ($k_1, k_2$) pass transfer.
- Implemented empirical orbital drift correction from FIRMS acquisition timestamps.
- Added November 2026 post-SNPP bridging using co-planar NOAA-20 and NOAA-21.
- Built the 6-panel Evidence Laboratory (`proof/index.html`) and the in-app mathematical formula solver.
- Created the 25-second cinematic Jury Tour mode.
- Validated all figures against 186,650 empirical FIRMS observations for Türkiye and compiled `results/MANIFEST.json`.
