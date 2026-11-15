# TURQUA // FIRE HARMONY — Harmonized Burning Activity Calendar

**Live Application:** https://turqua.netlify.app  
**Challenge:** NASA International Space Apps Challenge 2026 — *Harmonization of MODIS and VIIRS Hot Spots*

## 1. Overview
Satellites have tracked active fires since November 2000, but the historical record is split across incompatible instruments: 1 km **MODIS** (Terra, Aqua) and 375 m **VIIRS** (Suomi-NPP, NOAA-20, NOAA-21). Adding new satellites inflates raw hotspot counts by **×17.49** while unchanged Terra MODIS shows burning actually fell between 2011 and 2013. **TURQUA** reconciles 26 years (2000–2026) onto a single **SNPP-equivalent Burning Day** scale (**×17.49 → ×1.13**, **r = 0.989** on unseen hold-out years) and visualizes the record on a high-contrast 3D globe and interactive Burning Activity Calendar.

## 2. Prior Work & Hackathon Transparency Disclosure
- **Prior Work (Pre-Hackathon Exploration):** Before the hackathon, the team explored NASA FIRMS archives and built learning prototypes (`gorke345/turqua-fire-harmony` and an early preview published on 8 November 2026) to test candidate spatial clustering (ST-DBSCAN) and pixel normalization methods.
- **Built & Rebuilt During the Hackathon (14–15 November 2026):** During the official hackathon window, we audited and replaced the flawed area-weighted pixel index with the 0.1° Burning Day + Two-Branch ($k_1, k_2$) transfer model, added post-SNPP (2 November 2026) NOAA-20/21 bridging, built the 6-panel non-circular `proof/index.html` validation suite, replaced third-party icons with our custom `assets/flame.svg` WebGL symbol layer, and packaged all static `data/*.json` outputs.

## 3. Use of Artificial Intelligence (SI Disclosure)
Built with AI assistance (**Anthropic Claude, Google Gemini, Antigravity**); all figures are computed by deterministic Python/Rust scripts in this repository (`pipeline/harmonize_and_validate.py`) and reviewed by the team. No AI-generated imagery or synthetic data is presented as empirical observation.

## 4. Data Sources & Licenses
- **NASA Data:** NASA FIRMS / LANCE / EOSDIS MODIS Collection 6.1 (`MOD14`/`MYD14`), VIIRS 375m (`VNP14IMG`, `VJ114IMG`, `VJ214IMG`), NASA GIBS WMTS (`BlueMarble`, `VIIRS TrueColor`, `MODIS MCD12Q1 IGBP`).
- **Partner & Open Data:** ESA WorldCover 2020 v100 (CC BY 4.0), AWS/Mapzen Terrarium DEM, OpenStreetMap Nominatim (ODbL), CelesTrak GP/TLE, MapLibre GL JS (BSD-3-Clause), satellite.js (MIT).
