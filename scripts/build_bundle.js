const fs = require('fs');

function cleanModule(code) {
  // Remove BOM if present
  let clean = code.replace(/^\uFEFF/, '');
  // Remove multiline and singleline import statements
  clean = clean.replace(/import\s*(?:\{[\s\S]*?\}|[\w*\s,]+)\s*from\s*['"][^'"]+['"];?/g, '');
  clean = clean.replace(/import\s*['"][^'"]+['"];?/g, '');
  // Remove export keywords while keeping declarations
  clean = clean.replace(/^export\s+(async\s+function|function|let|const|var|class)\s+/gm, '$1 ');
  // Remove trailing export { ... };
  clean = clean.replace(/export\s*\{[\s\S]*?\};?/g, '');
  return clean.trim();
}

console.log('Reading module files...');
const mapSource = cleanModule(fs.readFileSync('js/map.js', 'utf8'));
const harmSource = cleanModule(fs.readFileSync('js/harmonizer.js', 'utf8'));
const calSource = cleanModule(fs.readFileSync('js/calendar.js', 'utf8'));
const proofSource = cleanModule(fs.readFileSync('proof/proof-lab.js', 'utf8'));
let apiSource = cleanModule(fs.readFileSync('js/api.js', 'utf8'));

// If apiSource already declares DEFAULT_MAP_KEY, don't redeclare it in header
let apiPrefix = `const { initProofLab, updateInlineProof, updateSolverMath } = window.__TQ;
const CASE_STUDIES_OFFLINE = window.CASE_STUDIES_OFFLINE || window.TURQUA_CASE_STUDIES_OFFLINE || window.__TQ.CASE_STUDIES_OFFLINE || {};
const { applyDataQuery, clusterProperties, exportGeoJSON, popupCluster, mergeRecords, processRecords, recluster, state, updateClusterBiome, updateAoiCriticalAlarm, updateMapAndTelemetry } = window.__TQ;
const { focusAOI, setMapLogger, setMapLayers, setMapOrbits, setMapSelectionHandler, setGibsDate, setGibsLayerMode, setTerrainEnabled, fetchIgbpLandCover, activePopup, updateAOI } = window.__TQ;
const { downloadHistoricalArchive, initCalendar, refreshActivityCalendar } = window.__TQ;
`;

if (!apiSource.includes('DEFAULT_MAP_KEY')) {
  apiPrefix = `const DEFAULT_MAP_KEY = "";\n` + apiPrefix;
}

const bundle = `window.__TQ = window.__TQ || {};

// === map.js ===
(function() {
${mapSource}

  window.__TQ.activePopup = activePopup;
  window.__TQ.beginAoiDrawing = beginAoiDrawing;
  window.__TQ.fetchIgbpLandCover = fetchIgbpLandCover;
  window.__TQ.focusAOI = focusAOI;
  window.__TQ.map = map;
  window.__TQ.setGibsDate = setGibsDate;
  window.__TQ.setGibsLayerMode = setGibsLayerMode;
  window.__TQ.setMapActivityMetric = setMapActivityMetric;
  window.__TQ.setMapColorRamp = setMapColorRamp;
  window.__TQ.setMapLayers = setMapLayers;
  window.__TQ.setMapLogger = setMapLogger;
  window.__TQ.setMapOrbits = setMapOrbits;
  window.__TQ.setMapSelectionHandler = setMapSelectionHandler;
  window.__TQ.setTerrainEnabled = setTerrainEnabled;
  window.__TQ.updateAOI = updateAOI;
  window.__TQ.updateMapData = updateMapData;
})();

// === harmonizer.js ===
(function() {
const { updateMapData } = window.__TQ;

${harmSource}

  window.__TQ.analyzeFireIntelligence = analyzeFireIntelligence;
  window.__TQ.applyDataQuery = applyDataQuery;
  window.__TQ.clusterProperties = clusterProperties;
  window.__TQ.detectBiomeAndLandCover = detectBiomeAndLandCover;
  window.__TQ.exportGeoJSON = exportGeoJSON;
  window.__TQ.footprintPolygon = footprintPolygon;
  window.__TQ.mergeRecords = mergeRecords;
  window.__TQ.popupCluster = popupCluster;
  window.__TQ.processRecords = processRecords;
  window.__TQ.recluster = recluster;
  window.__TQ.setActivityMetric = setActivityMetric;
  window.__TQ.state = state;
  window.__TQ.updateAoiCriticalAlarm = updateAoiCriticalAlarm;
  window.__TQ.updateClusterBiome = updateClusterBiome;
  window.__TQ.updateMapAndTelemetry = updateMapAndTelemetry;
})();

// === calendar.js ===
(function() {
const { applyDataQuery, setActivityMetric, state } = window.__TQ;
const { beginAoiDrawing, focusAOI, setMapActivityMetric, setMapColorRamp, updateAOI } = window.__TQ;

${calSource}

  window.__TQ.downloadHistoricalArchive = downloadHistoricalArchive;
  window.__TQ.exportCalendarCSV = exportCalendarCSV;
  window.__TQ.exportResultsCSV = exportResultsCSV;
  window.__TQ.initCalendar = initCalendar;
  window.__TQ.refreshActivityCalendar = refreshActivityCalendar;
})();

// === proof-lab.js ===
(function() {
const { map } = window.__TQ;

${proofSource}

  window.__TQ.initProofLab = initProofLab;
  window.__TQ.updateInlineProof = updateInlineProof;
  window.__TQ.updateSolverMath = updateSolverMath;
})();

// === api.js ===
(function() {
${apiPrefix}

${apiSource}

})();
`;

fs.writeFileSync('js/turqua-bundle.js', bundle, 'utf8');
console.log('Successfully generated js/turqua-bundle.js (size:', bundle.length, 'bytes)');
