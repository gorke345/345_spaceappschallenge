window.__TQ = window.__TQ || {};

// === map.js ===
(function() {
let activePopup = null;
﻿function registerCustomFlameIcon(mapInstance) {
  if (mapInstance.hasImage("turqua-flame")) return;
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, size, 0, 4);
  grad.addColorStop(0, "#DC2626");
  grad.addColorStop(0.55, "#FF5B23");
  grad.addColorStop(1, "#FACC15");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#070B1E";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 4);
  ctx.bezierCurveTo(18, 14, 9, 20, 9, 32);
  ctx.bezierCurveTo(9, 41, 15.5, 45, 24, 45);
  ctx.bezierCurveTo(32.5, 45, 39, 41, 39, 32);
  ctx.bezierCurveTo(39, 23, 33, 17, 30, 13);
  ctx.bezierCurveTo(30, 17, 28, 20, 26, 21);
  ctx.bezierCurveTo(28, 14, 26, 9, 24, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#FEF08A";
  ctx.beginPath();
  ctx.arc(24, 34, 6.5, 0, Math.PI * 2);
  ctx.fill();
  const imgData = ctx.getImageData(0, 0, size, size);
  mapInstance.addImage("turqua-flame", { width: size, height: size, data: imgData.data });
  if (!mapInstance.hasImage("fire-emoji")) {
    mapInstance.addImage("fire-emoji", { width: size, height: size, data: imgData.data });
  }

  // Also load high-resolution assets/flame.svg if available
  if (typeof mapInstance.loadImage === "function") {
    mapInstance.loadImage("assets/flame.svg", (err, image) => {
      if (!err && image) {
        try {
          if (mapInstance.hasImage("turqua-flame")) mapInstance.removeImage("turqua-flame");
          mapInstance.addImage("turqua-flame", image);
          if (mapInstance.hasImage("fire-emoji")) mapInstance.removeImage("fire-emoji");
          mapInstance.addImage("fire-emoji", image);
        } catch (_) {}
      }
    });
  } else {
    const img = new Image(64, 64);
    img.onload = () => {
      try {
        if (mapInstance.hasImage("turqua-flame")) mapInstance.removeImage("turqua-flame");
        mapInstance.addImage("turqua-flame", img);
        if (mapInstance.hasImage("fire-emoji")) mapInstance.removeImage("fire-emoji");
        mapInstance.addImage("fire-emoji", img);
      } catch (_) {}
    };
    img.src = "assets/flame.svg";
  }
}
const emptyFeatureCollection = () => ({ type: "FeatureCollection", features: [] });
const hiddenFilter = ["==", ["get", "kind"], "__hidden__"];

let logger = () => {};
let latestMapData = {
  fires: emptyFeatureCollection(),
  footprints: emptyFeatureCollection(),
  hulls: emptyFeatureCollection(),
};
let latestAOI = emptyFeatureCollection();
let latestOrbits = emptyFeatureCollection();
let activeRamp = ["#F2C14E", "#D97724", "#C83E2B"];
let activeMetric = "count";
let selectionHandler = () => {};
let terrainEnabled = false;
let terrainRevision = 0;
let orbitVisible = false;
let orbitRevision = 0;
let gibsLayerMode = "standard";
let selectedGibsDate = "2026-07-12";
let gibsRevision = 0;
let activeLayers = {
  showMODIS: true,
  showVIIRS: true,
  showClusters: true,
  showFootprints: true,
  showDensity: false,
  showLandCover: false,
  showTimeAge: false,
};

const IGBP_ZOOM = 8;
const IGBP_TILE_SIZE = 256;
const IGBP_TILE_CACHE_LIMIT = 32;
const IGBP_RGB_TO_CLASS = new Map([
  ["33,138,33", 1],
  ["49,204,49", 2],
  ["152,204,49", 3],
  ["150,250,150", 4],
  ["141,186,141", 5],
  ["186,141,141", 6],
  ["245,222,179", 7],
  ["218,235,157", 8],
  ["255,213,0", 9],
  ["240,185,103", 10],
  ["71,131,181", 11],
  ["250,239,115", 12],
  ["255,0,0", 13],
  ["153,147,86", 14],
  ["255,255,255", 15],
  ["191,191,189", 16],
  ["134,202,227", 17],
]);
const igbpTileCache = new Map();

async function getIgbpTilePixels(tileX, tileY) {
  const key = `${tileX}/${tileY}`;
  if (igbpTileCache.has(key)) {
    const cached = igbpTileCache.get(key);
    igbpTileCache.delete(key);
    igbpTileCache.set(key, cached);
    return cached;
  }
  const request = (async () => {
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual/default/2024-01-01/GoogleMapsCompatible_Level8/${IGBP_ZOOM}/${tileY}/${tileX}.png`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NASA GIBS IGBP HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = IGBP_TILE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      throw new Error("Cannot create canvas context for IGBP pixel");
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return context.getImageData(0, 0, IGBP_TILE_SIZE, IGBP_TILE_SIZE).data;
  })();
  igbpTileCache.set(key, request);
  if (igbpTileCache.size > IGBP_TILE_CACHE_LIMIT) {
    igbpTileCache.delete(igbpTileCache.keys().next().value);
  }
  try {
    return await request;
  } catch (error) {
    igbpTileCache.delete(key);
    throw error;
  }
}

async function fetchIgbpLandCover(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error("Invalid coordinates for IGBP query");
  }
  const boundedLatitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const worldSize = 2 ** IGBP_ZOOM;
  const latitudeRadians = boundedLatitude * Math.PI / 180;
  const tileX = Math.max(0, Math.min(worldSize - 1, Math.floor((lon + 180) / 360 * worldSize)));
  const tileY = Math.max(0, Math.min(
    worldSize - 1,
    Math.floor((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * worldSize),
  ));
  const pixelX = Math.max(0, Math.min(
    IGBP_TILE_SIZE - 1,
    Math.floor((((lon + 180) / 360 * worldSize) - tileX) * IGBP_TILE_SIZE),
  ));
  const pixelY = Math.max(0, Math.min(
    IGBP_TILE_SIZE - 1,
    Math.floor(((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * worldSize - tileY) * IGBP_TILE_SIZE),
  ));
  const pixels = await getIgbpTilePixels(tileX, tileY);
  const offset = (pixelY * IGBP_TILE_SIZE + pixelX) * 4;
  const classCode = IGBP_RGB_TO_CLASS.get(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
  return classCode ? { classCode, rgb: `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}` } : null;
}

const map = new maplibregl.Map({
  container: "globe",
  style: {
    version: 8,
    // Standard 2D flat Mercator map projection per user request (not 3D globe)
    projection: { type: "mercator" },
    sources: {
      "nasa-blue-marble": {
        type: "raster",
        tiles: [
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg",
        ],
        tileSize: 256,
        maxzoom: 8,
        attribution: "NASA GIBS / Blue Marble",
      },
      "nasa-igbp-landcover": {
        type: "raster",
        tiles: [
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual/default/2024-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
        ],
        tileSize: 256,
        maxzoom: 8,
        attribution: "NASA GIBS / MODIS MCD12Q1 Land Cover",
      },
      "arcgis-world-imagery": {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: "Esri, Maxar, Earthstar Geographics",
      },
      "arcgis-world-boundaries": {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: "Esri World Boundaries and Places",
      },
      "terrain-dem": {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
        attribution: "AWS Terrain Tiles / Mapzen",
      },
      "hillshade-dem": {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
        attribution: "AWS Terrain Tiles / Mapzen",
      },
      orbits: { type: "geojson", data: emptyFeatureCollection() },
      fires: { type: "geojson", data: emptyFeatureCollection() },
      footprints: { type: "geojson", data: emptyFeatureCollection() },
      hulls: { type: "geojson", data: emptyFeatureCollection() },
      aoi: { type: "geojson", data: emptyFeatureCollection() },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#070B1E" } },
      {
        id: "blue-marble",
        type: "raster",
        source: "nasa-blue-marble",
        paint: {
          "raster-opacity": 1,
        },
      },
      {
        id: "world-imagery",
        type: "raster",
        source: "arcgis-world-imagery",
        minzoom: 6,
        paint: { "raster-opacity": 1 },
      },
      {
        id: "landcover-igbp",
        type: "raster",
        source: "nasa-igbp-landcover",
        layout: { visibility: "none" },
        paint: { "raster-opacity": 0.55 },
      },
      {
        id: "world-boundaries",
        type: "raster",
        source: "arcgis-world-boundaries",
        minzoom: 1,
        paint: { "raster-opacity": 0.85 },
      },
      {
        id: "terrain-hillshade",
        type: "hillshade",
        source: "hillshade-dem",
        minzoom: 4,
        paint: {
          "hillshade-exaggeration": 0.32,
          "hillshade-shadow-color": "#111827",
          "hillshade-highlight-color": "#FFFFFF",
          "hillshade-accent-color": "#334155",
        },
      },
      {
        id: "satellite-orbits",
        type: "line",
        source: "orbits",
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#02D8E1", "line-width": 1, "line-opacity": 0.65 },
      },
      {
        id: "fire-density",
        type: "heatmap",
        source: "fires",
        filter: ["==", ["get", "kind"], "point"],
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "density_weight"], 0, 0, 1, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 9, 1.2],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 10, 9, 26],
          "heatmap-opacity": 0.72,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(7,11,30,0)",
            0.2, "#14B8A6",
            0.55, "#F59E0B",
            1, "#EF4444",
          ],
        },
      },
      {
        id: "cluster-hull-fill",
        type: "fill",
        source: "hulls",
        minzoom: 6.0,
        layout: { visibility: "visible" },
        paint: { "fill-color": "#EF4444", "fill-opacity": 0.12 },
      },
      {
        id: "cluster-hull-outline",
        type: "line",
        source: "hulls",
        minzoom: 6.0,
        layout: { visibility: "visible" },
        paint: { "line-color": "#EF4444", "line-width": 1.2, "line-opacity": 0.8 },
      },
      {
        id: "aoi-fill",
        type: "fill",
        source: "aoi",
        paint: { "fill-color": "#3B8EA5", "fill-opacity": 0.08 },
      },
      {
        id: "aoi-outline",
        type: "line",
        source: "aoi",
        paint: { "line-color": "#3B8EA5", "line-width": 1.5, "line-dasharray": [2, 1] },
      },
      {
        id: "pt-modis",
        type: "circle",
        source: "fires",
        filter: ["all", ["==", ["get", "kind"], "point"], ["==", ["get", "sensor"], "MODIS"]],
        layout: { visibility: "visible" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.5, 5, 3, 9, 5],
          "circle-color": "#F59E0B",
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#070B1E",
        },
      },
      {
        id: "pt-viirs",
        type: "circle",
        source: "fires",
        filter: ["all", ["==", ["get", "kind"], "point"], ["==", ["get", "sensor"], "VIIRS"]],
        layout: { visibility: "visible" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.2, 5, 4.5, 9, 8],
          "circle-color": "#02D8E1",
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#070B1E",
        },
      },
                  {
        id: "pt-cluster",
        type: "circle",
        source: "fires",
        filter: ["all", ["==", ["get", "kind"], "cluster"], [">=", ["get", "detection_count"], 2]],
        layout: { visibility: "visible" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.2, 5, 4.2, 9, 7.5],
          "circle-color": "rgba(239,68,68,0.14)",
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#EF4444",
        },
      },
      {
        id: "fire-emoji-label",
        type: "symbol",
        source: "fires",
        filter: ["all", ["==", ["get", "kind"], "cluster"], [">=", ["get", "detection_count"], 2]],
        layout: {
          visibility: "visible",
          "icon-image": "turqua-flame",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.45, 5, 0.75, 9, 1.1],
          "text-allow-overlap": true,
          "text-ignore-placement": false,
        },
      },
      {
        id: "fp-outline",
        type: "line",
        source: "footprints",
        minzoom: 7.5,
        layout: { visibility: "visible" },
        paint: {
          "line-color": ["case", ["==", ["get", "sensor"], "MODIS"], "#D97724", "#3B8EA5"],
          "line-width": 0.8,
          "line-opacity": 0.55,
        },
      },
    ],
  },
  center: [35, 39],
  zoom: 2.2,
  renderWorldCopies: true,
  attributionControl: { compact: true },
});

function setMapLogger(nextLogger) {
  logger = nextLogger;
}

function setMapSelectionHandler(handler) {
  selectionHandler = handler;
}

function setMapOrbits(featureCollection, visible) {
  latestOrbits = featureCollection || emptyFeatureCollection();
  orbitVisible = Boolean(visible);
  const revision = ++orbitRevision;
  const applyOrbits = () => {
    if (revision !== orbitRevision) return;
    if (!map.isStyleLoaded()) {
      map.once("idle", applyOrbits);
      return;
    }
    const source = map.getSource("orbits");
    if (source) source.setData(latestOrbits);
    if (map.getLayer("satellite-orbits")) {
      map.setLayoutProperty("satellite-orbits", "visibility", orbitVisible ? "visible" : "none");
    }
  };
  applyOrbits();
}

function applyTerrain() {
  const revision = terrainRevision;
  if (!map.isStyleLoaded()) {
    map.once("idle", () => {
      if (revision === terrainRevision) applyTerrain();
    });
    return;
  }
  map.setTerrain(terrainEnabled ? { source: "terrain-dem", exaggeration: 1.35 } : null);
  map.easeTo({ pitch: terrainEnabled ? 55 : 0, duration: 500 });
}

function setTerrainEnabled(enabled) {
  terrainEnabled = enabled;
  terrainRevision++;
  applyTerrain();
}

function updateMapData(fireFeatures, footprintFeatures, hullFeatures) {
  latestMapData = {
    fires: { type: "FeatureCollection", features: fireFeatures },
    footprints: { type: "FeatureCollection", features: footprintFeatures },
    hulls: { type: "FeatureCollection", features: hullFeatures },
  };
  if (!map.isStyleLoaded()) return;
  for (const [sourceId, data] of Object.entries(latestMapData)) {
    const source = map.getSource(sourceId);
    if (source) source.setData(data);
  }
}

function setMapLayers(options) {
  activeLayers = { ...activeLayers, ...options };
  applyMapLayers();

  // Sky atmosphere removed for flat 2D map

}

const GIBS_LAYER_DEFINITIONS = {
  truecolor: {
    source: "gibs-viirs-truecolor",
    layer: "gibs-viirs-truecolor",
    product: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    extension: "jpg",
    maxzoom: 9,
  },
  thermal: {
    source: "gibs-viirs-thermal",
    layer: "gibs-viirs-thermal",
    product: "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1",
    extension: "jpg",
    maxzoom: 9,
  },
  ndvi: {
    source: "gibs-modis-ndvi",
    layer: "gibs-modis-ndvi",
    product: "MODIS_Terra_NDVI_8Day",
    extension: "png",
    maxzoom: 9,
  },
};

function gibsTileUrl(definition) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${definition.product}/default/${selectedGibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${definition.extension}`;
}

function ensureGibsLayers() {
  if (!map.isStyleLoaded()) return false;
  for (const definition of Object.values(GIBS_LAYER_DEFINITIONS)) {
    if (!map.getSource(definition.source)) {
      map.addSource(definition.source, {
        type: "raster",
        tiles: [gibsTileUrl(definition)],
        tileSize: 256,
        maxzoom: definition.maxzoom,
        attribution: "NASA GIBS",
      });
    }
    if (!map.getLayer(definition.layer)) {
      map.addLayer({
        id: definition.layer,
        type: "raster",
        source: definition.source,
        layout: { visibility: "none" },
        paint: { "raster-opacity": 1 },
      }, map.getLayer("fire-density") ? "fire-density" : undefined);
    }
  }
  applyGibsMode();
  return true;
}

function applyGibsMode() {
  if (!map.isStyleLoaded()) return;
  const layerByMode = {
    truecolor: "gibs-viirs-truecolor",
    thermal: "gibs-viirs-thermal",
    ndvi: "gibs-modis-ndvi",
  };
  for (const [mode, layerId] of Object.entries(layerByMode)) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", gibsLayerMode === mode ? "visible" : "none");
    }
  }
  if (map.getLayer("world-imagery")) {
    map.setLayoutProperty(
      "world-imagery",
      "visibility",
      gibsLayerMode === "standard" ? "visible" : "none",
    );
  }
  if (map.getLayer("landcover-igbp")) {
    const showIgbp = activeLayers.showLandCover || gibsLayerMode === "igbp";
    map.setLayoutProperty("landcover-igbp", "visibility", showIgbp ? "visible" : "none");
  }
}

function setGibsLayerMode(mode) {
  gibsLayerMode = Object.hasOwn(GIBS_LAYER_DEFINITIONS, mode) || mode === "igbp"
    ? mode
    : "standard";
  const revision = ++gibsRevision;
  const apply = () => {
    if (revision !== gibsRevision) return;
    if (!ensureGibsLayers()) {
      map.once("idle", apply);
      return;
    }
  };
  apply();
}

function setGibsDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error("GIBS date must be formatted as YYYY-MM-DD");
  }
  selectedGibsDate = date;
  const input = document.getElementById("gibsDate");
  if (input && input.value !== date) input.value = date;
  const revision = ++gibsRevision;
  const apply = () => {
    if (revision !== gibsRevision) return;
    if (!ensureGibsLayers()) {
      map.once("idle", apply);
      return;
    }
    for (const definition of Object.values(GIBS_LAYER_DEFINITIONS)) {
      const source = map.getSource(definition.source);
      if (!source) continue;
      map.removeLayer(definition.layer);
      map.removeSource(definition.source);
      map.addSource(definition.source, {
        type: "raster",
        tiles: [gibsTileUrl(definition)],
        tileSize: 256,
        maxzoom: definition.maxzoom,
        attribution: "NASA GIBS",
      });
      map.addLayer({
        id: definition.layer,
        type: "raster",
        source: definition.source,
        layout: { visibility: "none" },
        paint: { "raster-opacity": 1 },
      }, map.getLayer("fire-density") ? "fire-density" : undefined);
    }
    applyGibsMode();
  };
  apply();
}

function applyMapLayers() {
  if (!map.isStyleLoaded()) return;
  const {
    showMODIS,
    showVIIRS,
    showClusters,
    showFootprints,
    showDensity,
    showLandCover,
    showTimeAge,
  } = activeLayers;
  const filters = {
    "pt-modis": showMODIS
      ? ["all", ["==", ["get", "kind"], "point"], ["==", ["get", "sensor"], "MODIS"]]
      : hiddenFilter,
    "pt-viirs": showVIIRS
      ? ["all", ["==", ["get", "kind"], "point"], ["==", ["get", "sensor"], "VIIRS"]]
      : hiddenFilter,
    "pt-cluster": showClusters ? ["all", ["==", ["get", "kind"], "cluster"], [">=", ["get", "detection_count"], 2]] : hiddenFilter,
    "fire-emoji-label": showClusters ? ["all", ["==", ["get", "kind"], "cluster"], [">=", ["get", "detection_count"], 3], [">=", ["get", "cluster_frp"], 50]] : hiddenFilter,
    "cluster-hull-fill": showClusters ? null : hiddenFilter,
    "cluster-hull-outline": showClusters ? null : hiddenFilter,
    "fp-outline": showFootprints ? null : hiddenFilter,
  };
  if (map.getLayer("landcover-igbp")) {
    map.setLayoutProperty(
      "landcover-igbp",
      "visibility",
      showLandCover || gibsLayerMode === "igbp" ? "visible" : "none",
    );
  }
  if (map.getLayer("fire-density")) {
    map.setLayoutProperty("fire-density", "visibility", showDensity ? "visible" : "none");
  }
  const ageColor = [
    "case",
    ["<=", ["get", "age_hours"], 1], "#991B1B",
    ["<=", ["get", "age_hours"], 4], "#EF4444",
    ["<=", ["get", "age_hours"], 12], "#F59E0B",
    "#FDE047",
  ];
  if (map.getLayer("pt-modis")) {
    map.setPaintProperty("pt-modis", "circle-color", showTimeAge ? ageColor : "#F59E0B");
  }
  if (map.getLayer("pt-viirs")) {
    map.setPaintProperty("pt-viirs", "circle-color", showTimeAge ? ageColor : "#02D8E1");
  }
  for (const [layerId, filter] of Object.entries(filters)) {
    if (!map.getLayer(layerId)) continue;
    if (filter) map.setFilter(layerId, filter);
    else if (layerId.startsWith("cluster-hull")) {
      map.setFilter(layerId, ["has", "id"]);
    } else if (layerId === "fp-outline") {
      map.setFilter(layerId, ["has", "sensor"]);
    }
  }
}

function setMapColorRamp(colors) {
  activeRamp = colors;
  if (!map.isStyleLoaded()) return;
  map.setPaintProperty("fire-density", "heatmap-color", [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(7,11,30,0)",
    0.2, colors[0],
    0.55, colors[1],
    1, colors[2],
  ]);
}

function setMapActivityMetric(metric) {
  activeMetric = metric === "frp" ? "frp" : "count";
  if (!map.isStyleLoaded()) return;
  map.setPaintProperty("fire-density", "heatmap-weight", activeMetric === "frp"
    ? ["interpolate", ["linear"], ["get", "density_weight"], 0, 0, 8, 1]
    : ["interpolate", ["linear"], ["get", "density_weight"], 0, 0, 1, 1]);
}

function updateAOI(bounds) {
  const feature = bounds ? {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [bounds.minLon, bounds.minLat],
        [bounds.maxLon, bounds.minLat],
        [bounds.maxLon, bounds.maxLat],
        [bounds.minLon, bounds.maxLat],
        [bounds.minLon, bounds.minLat],
      ]],
    },
    properties: {},
  } : null;
  latestAOI = feature ? { type: "FeatureCollection", features: [feature] } : emptyFeatureCollection();
  if (!map.isStyleLoaded()) return;
  const source = map.getSource("aoi");
  if (source) source.setData(latestAOI);
}

function focusAOI(bounds) {
  if (!bounds) {
    map.flyTo({ center: [0, 20], zoom: 0.6, duration: 650 });
    return;
  }
  map.fitBounds(
    [[bounds.minLon, bounds.minLat], [bounds.maxLon, bounds.maxLat]],
    { padding: 90, maxZoom: 5.5, duration: 650 },
  );
}

function beginAoiDrawing(onBounds) {
  let start;
  let rectangle;
  const canvas = map.getCanvas();
  canvas.style.cursor = "crosshair";
  map.dragPan.disable();
  const cleanup = () => {
    map.off("mousedown", handleMouseDown);
    map.off("mousemove", move);
    map.off("mouseup", finish);
    map.dragPan.enable();
    canvas.style.cursor = "";
  };
  const finish = event => {
    const end = map.unproject(event.point);
    const bounds = {
      minLon: Math.min(start.lng, end.lng),
      maxLon: Math.max(start.lng, end.lng),
      minLat: Math.min(start.lat, end.lat),
      maxLat: Math.max(start.lat, end.lat),
    };
    cleanup();
    if (rectangle) updateAOI(null);
    if (bounds.maxLon - bounds.minLon >= 0.1 && bounds.maxLat - bounds.minLat >= 0.1) {
      onBounds(bounds);
    } else onBounds(null);
  };
  const move = event => {
    if (!start) return;
    const current = map.unproject(event.point);
    rectangle = true;
    updateAOI({
      minLon: Math.min(start.lng, current.lng),
      maxLon: Math.max(start.lng, current.lng),
      minLat: Math.min(start.lat, current.lat),
      maxLat: Math.max(start.lat, current.lat),
    });
  };
  const handleMouseDown = event => {
    start = map.unproject(event.point);
    map.off("mousedown", handleMouseDown);
    map.on("mousemove", move);
    map.on("mouseup", finish);
  };
  map.on("mousedown", handleMouseDown);
  return cleanup;
}

map.on("error", event => {
  const message = event.error?.message || "Unknown map error";
  logger(`MAP: ${message}`, "err");
});

map.on("load", () => { registerCustomFlameIcon(map);
  try {
    if (terrainEnabled) map.setTerrain({ source: "terrain-dem", exaggeration: 1.35 });
  } catch (error) {
    logger(`3D TERRAIN UNAVAILABLE: ${error.message}`, "warn");
  }
  for (const [sourceId, data] of Object.entries(latestMapData)) {
    const source = map.getSource(sourceId);
    if (source) source.setData(data);
  }
  map.getSource("aoi")?.setData(latestAOI);
  map.getSource("orbits")?.setData(latestOrbits);
  map.setLayoutProperty("satellite-orbits", "visibility", orbitVisible ? "visible" : "none");
  setMapColorRamp(activeRamp);
  setMapActivityMetric(activeMetric);
  applyMapLayers();
  ensureGibsLayers();

  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" }); activePopup = popup;
  for (const layerId of ["pt-modis", "pt-viirs", "pt-cluster", "fire-emoji-label"]) {
    map.on("click", layerId, event => {
      const feature = event.features?.[0];
      if (!feature) return;
      selectionHandler(feature.properties || {}, { fromMap: true });
      popup.setLngLat(feature.geometry.coordinates).setHTML(feature.properties.popup || "").addTo(map);
    });
    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
  }

  map.on("move", () => {
    const center = map.getCenter();
    document.getElementById("hudCam").textContent =
      `lon ${center.lng.toFixed(2)} / lat ${center.lat.toFixed(2)} / z ${map.getZoom().toFixed(2)}`;
  });
});

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

const EARTH_RADIUS_KM = 6371;

const state = {
  rawRecords: [],
  allPoints: [],
  rangePoints: [],
  filteredPoints: [],
  points: [],
  clusters: [],
  sourceLabel: "IDLE",
  maxPoints: null,
  epsKm: 0.8,
  bounds: null,
  startMonth: "2000-11",
  endMonth: "2026-10",
  selectedDate: null,
  activityMetric: "count",
};

function numericField(row, names) {
  for (const name of names) {
    const value = Number.parseFloat(row[name]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function confidenceField(row) {
  const raw = String(row.confidence ?? "").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
    return { raw, kind: "numeric", category: null };
  }
  const category = raw.toLowerCase();
  if (["l", "n", "h", "low", "nominal", "high"].includes(category)) {
    return { raw, kind: "categorical", category };
  }
  return null;
}

function summarizeConfidence(members) {
  const categoryLabels = { l: "low", n: "nominal", h: "high" };
  return ["MODIS", "VIIRS"].flatMap(sensor => {
    const observations = members.filter(member => member.sensor === sensor);
    if (!observations.length) return [];
    const numeric = observations.filter(member => member.confidenceKind === "numeric");
    if (numeric.length === observations.length) {
      const values = numeric.map(member => Number(member.confidenceRaw));
      const min = Math.min(...values);
      const max = Math.max(...values);
      return [`${sensor} kaynak confidence alanı: ${min}${min === max ? "" : `–${max}`} (n=${values.length})`];
    }
    const categories = new Map();
    observations.forEach(member => {
      categories.set(member.confidenceRaw, (categories.get(member.confidenceRaw) || 0) + 1);
    });
    const values = [...categories].map(([value, count]) => {
      const label = categoryLabels[value.toLowerCase()];
      return `${value}${label ? ` (${label})` : ""} ×${count}`;
    });
    return [`${sensor} kaynak confidence alanı: ${values.join(", ")}`];
  }).join("; ") || "Kaynak confidence alanı yok";
}

function unwrapRecord(record) {
  if (record?.type !== "Feature") return record;
  const properties = record.properties || {};
  const coordinates = record.geometry?.type === "Point" ? record.geometry.coordinates : null;
  return coordinates
    ? {
        ...properties,
        longitude: properties.longitude ?? coordinates[0],
        latitude: properties.latitude ?? coordinates[1],
      }
    : properties;
}

function parseUTC(dateStr, hhmm) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{4}$/.test(hhmm)) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(2, 4));
  if (hour > 23 || minute > 59) return null;
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  const parsedDate = new Date(timestamp);
  return parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
    ? timestamp
    : null;
}

function normalizeRaw(input) {
  if (!input || typeof input !== "object") return null;
  const row = unwrapRecord(input);
  const sensorName = String(row._sensor || row.sensor || row.satellite || "").toUpperCase();
  const isVIIRS = "bright_ti4" in row || sensorName.startsWith("VIIRS");
  const sensor = isVIIRS ? "VIIRS" : "MODIS";
  const lat = numericField(row, ["latitude", "lat"]);
  const lon = numericField(row, ["longitude", "lon"]);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const temp_k = numericField(row, ["temp_k", "brightness", "bright_ti4"]);
  const temp_bg_k = numericField(row, ["temp_bg_k", "bright_t31", "bright_ti5"]);
  if (temp_k == null || temp_bg_k == null) return null;

  const confidence = confidenceField(row);
  if (!confidence) return null;
  // NASA FIRMS Sun-Glint & Noise Filter:
  // Discard MODIS < 30% confidence, VIIRS low confidence, and non-positive FRP
  if (sensor === "MODIS" && confidence.kind === "numeric" && Number(confidence.raw) < 30) return null;
  if (sensor === "VIIRS" && (confidence.category === "l" || confidence.category === "low")) return null;

  const frp = numericField(row, ["frp", "frp_mw"]);
  if (frp == null || frp <= 0) return null;

  const scan_km = numericField(row, ["scan_km", "scan"]) || (sensor === "MODIS" ? 1.0 : 0.375);
  const track_km = numericField(row, ["track_km", "track"]) || (sensor === "MODIS" ? 1.0 : 0.375);
  if (scan_km == null || track_km == null || scan_km <= 0 || track_km <= 0) return null;

  const acq_date = row.acq_date || "";
  const rawTime = String(row.acq_time ?? "").replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const acq_time = rawTime.length === 4 ? rawTime : "0000";
  const ts = parseUTC(acq_date, acq_time) || (acq_date ? new Date(acq_date + "T00:00:00Z").getTime() : null);
  if (ts == null) return null;

  const daynightValue = String(row.daynight || row.day_night || "").toUpperCase();
  const daynight = daynightValue === "N" || daynightValue === "D" ? daynightValue : "D";

  const delta_t = temp_k - temp_bg_k;

  return {
    lat, lon, sensor,
    satellite: row.satellite || row.sensor || row._sensor || sensor,
    temp_k, temp_bg_k, delta_t,
    confidenceRaw: confidence.raw,
    confidenceKind: confidence.kind,
    confidenceCategory: confidence.category,
    scan_km, track_km,
    acq_date, acq_time, ts, daynight, frp,
  };
}

function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const latA = a.lat * Math.PI / 180;
  const latB = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function gridCell(point, cellSizeKm) {
  const latitude = point.lat * Math.PI / 180;
  const longitude = point.lon * Math.PI / 180;
  return [
    Math.floor(EARTH_RADIUS_KM * Math.cos(latitude) * Math.cos(longitude) / cellSizeKm),
    Math.floor(EARTH_RADIUS_KM * Math.cos(latitude) * Math.sin(longitude) / cellSizeKm),
    Math.floor(EARTH_RADIUS_KM * Math.sin(latitude) / cellSizeKm),
  ];
}

function findNeighbors(index, points, epsKm, epsMs, grid) {
  const [x, y, z] = gridCell(points[index], epsKm);
  const neighbors = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = grid.get(`${x + dx},${y + dy},${z + dz}`) || [];
        for (const candidate of bucket) {
          if (candidate === index || Math.abs(points[index].ts - points[candidate].ts) > epsMs) continue;
          if (haversineKm(points[index], points[candidate]) <= epsKm) neighbors.push(candidate);
        }
      }
    }
  }
  return neighbors;
}

function stDbscan(points, epsKm, epsMs = 4 * 60 * 60 * 1000) {
  const grid = new Map();
  points.forEach((point, index) => {
    const cell = gridCell(point, epsKm).join(",");
    if (!grid.has(cell)) grid.set(cell, []);
    grid.get(cell).push(index);
  });

  const visited = new Uint8Array(points.length);
  const assigned = new Uint8Array(points.length);
  const clusters = [];
  for (let index = 0; index < points.length; index++) {
    if (visited[index]) continue;
    visited[index] = 1;
    const neighbors = findNeighbors(index, points, epsKm, epsMs, grid);
    if (neighbors.length === 0) {
      clusters.push([index]);
      assigned[index] = 1;
      continue;
    }

    const cluster = [index];
    assigned[index] = 1;
    const queue = [...neighbors];
    const queued = new Uint8Array(points.length);
    neighbors.forEach(neighbor => { queued[neighbor] = 1; });
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const neighbor = queue[cursor];
      if (!visited[neighbor]) {
        visited[neighbor] = 1;
        const adjacent = findNeighbors(neighbor, points, epsKm, epsMs, grid);
        for (const candidate of adjacent) {
          if (!queued[candidate]) {
            queued[candidate] = 1;
            queue.push(candidate);
          }
        }
      }
      if (!assigned[neighbor]) {
        assigned[neighbor] = 1;
        cluster.push(neighbor);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function classifyError(members) {
  const flags = [];
  const sensors = new Set(members.map(member => member.sensor));
  const totalArea = members.reduce((sum, member) => sum + member.scan_km * member.track_km, 0);
  if (sensors.size === 1 && sensors.has("VIIRS") && totalArea < 0.5) {
    flags.push({ code: "OMISSION", text: "SUB-PIXEL DETECTION (MODIS Omission Recovered)", cls: "warn" });
  }
  if (members.length === 1 && members[0].daynight === "D" && members[0].delta_t < 12) {
    flags.push({ code: "COMMISSION", text: "LOW THERMAL ANOMALY / GLINT RISK", cls: "err" });
  }
  return flags;
}

function weightedLongitude(points, weights) {
  let sinSum = 0;
  let cosSum = 0;
  points.forEach((point, index) => {
    const radians = point.lon * Math.PI / 180;
    sinSum += Math.sin(radians) * weights[index];
    cosSum += Math.cos(radians) * weights[index];
  });
  return Math.atan2(sinSum, cosSum) * 180 / Math.PI;
}

function footprintCorners(point) {
  const halfTrackDegrees = (point.track_km / 2) / 111.32;
  const longitudeScale = 111.32 * Math.max(0.000001, Math.abs(Math.cos(point.lat * Math.PI / 180)));
  const halfScanDegrees = (point.scan_km / 2) / longitudeScale;
  return [
    [point.lon - halfScanDegrees, point.lat - halfTrackDegrees],
    [point.lon + halfScanDegrees, point.lat - halfTrackDegrees],
    [point.lon + halfScanDegrees, point.lat + halfTrackDegrees],
    [point.lon - halfScanDegrees, point.lat + halfTrackDegrees],
  ];
}

function convexHull(members) {
  const points = [...new Map(members.flatMap(footprintCorners)
    .map(point => [`${point[0]},${point[1]}`, point])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (points.length < 3) return [];
  const cross = (origin, a, b) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) -
    (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower = [];
  for (const point of points) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = points.length - 1; index >= 0; index--) {
    const point = points[index];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  return hull.length >= 3 ? [...hull, hull[0]] : [];
}

function hullAreaKm2(hull) {
  if (hull.length < 4) return 0;
  const referenceLatitude = hull.reduce((sum, point) => sum + point[1], 0) / hull.length;
  const longitudeScale = 111.32 * Math.cos(referenceLatitude * Math.PI / 180);
  const projected = hull.map(([longitude, latitude]) => [
    longitude * longitudeScale,
    latitude * 111.32,
  ]);
  let twiceArea = 0;
  for (let index = 0; index < projected.length - 1; index++) {
    twiceArea += projected[index][0] * projected[index + 1][1] -
      projected[index + 1][0] * projected[index][1];
  }
  return Math.abs(twiceArea) / 2;
}

function classifyRegime(members, spreadAreaKm2) {
  const totalFrp = members.reduce((sum, member) => sum + member.frp, 0);
  const maxDT = Math.max(...members.map(member => member.delta_t));
  const hasNightDetection = members.some(member => member.daynight === "N");
  const isDaytimeCluster = members.every(member => member.daynight === "D");
  const averageFrp = members.reduce((sum, member) => sum + member.frp, 0) / members.length;
  if (totalFrp >= 40 || (hasNightDetection && maxDT >= 25)) {
    return "WILDFIRE / NATURAL VEGETATION FIRE";
  }
  if (isDaytimeCluster && members.length >= 2 && averageFrp < 25) {
    return "AGRICULTURAL / STUBBLE BURNING";
  }
  if (members.length === 1 || (spreadAreaKm2 < 0.35 && maxDT < 18)) {
    return "INDUSTRIAL / STATIC THERMAL ANOMALY";
  }
  return "MIXED / UNCLASSIFIED";
}

function footprintPolygon(point) {
  const dLat = (point.track_km / 2) / 111.32;
  const cosLat = Math.max(0.000001, Math.abs(Math.cos(point.lat * Math.PI / 180)));
  const dLon = (point.scan_km / 2) / (111.32 * cosLat);
  const ring = [
    [point.lon - dLon, point.lat - dLat],
    [point.lon + dLon, point.lat - dLat],
    [point.lon + dLon, point.lat + dLat],
    [point.lon - dLon, point.lat + dLat],
    [point.lon - dLon, point.lat - dLat],
  ];
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: { sensor: point.sensor } };
}

function popupPoint(point) {
  const tag = point.delta_t < 12 && point.daynight === "D"
    ? `<div class="tag err">GLINT RISK</div>`
    : "";
  const confidenceCategoryLabel = { l: "low", n: "nominal", h: "high" }[point.confidenceCategory];
  const confidenceDisplay = confidenceCategoryLabel
    ? `${point.confidenceRaw} (${confidenceCategoryLabel})`
    : point.confidenceRaw;
  return `
    <div class="ph">${point.sensor} / ${escapeHTML(point.satellite)}</div>
    <div class="pr"><span>TEMP_K</span><b>${point.temp_k.toFixed(1)} K</b></div>
    <div class="pr"><span>TEMP_BG_K</span><b>${point.temp_bg_k.toFixed(1)} K</b></div>
    <div class="pr"><span>ΔT</span><b>${point.delta_t.toFixed(1)} K</b></div>
    <div class="pr"><span>KAYNAK CONFIDENCE</span><b>${escapeHTML(confidenceDisplay)}</b></div>
    <div class="pr"><span>SCAN×TRACK</span><b>${point.scan_km}×${point.track_km} km</b></div>
    <div class="pr"><span>DAYNIGHT</span><b>${point.daynight}</b></div>
    <div class="pr"><span>FRP</span><b>${point.frp.toFixed(1)} MW</b></div>
    ${tag}
  `;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);
}

function popupCluster(cluster) {
  const tags = (cluster.flags || []).map(flag => `<div class="tag ${flag.cls}">${flag.text}</div>`).join("");
  const primary = cluster.intelligence.rankedScores[0];
  return `
    <div class="ph">HARMONIZED CLUSTER #${String(cluster.id).padStart(3, "0")}</div>
    <div class="pr"><span>DETECTION SUPPORT</span><b>${cluster.members.length} detections / ${(cluster.sources || []).length} sensors</b></div>
    <div class="pr"><span>SENSOR</span><b>${(cluster.sources || []).join(" + ")}</b></div>
    <div class="pr"><span>MEMBERS</span><b>${cluster.members.length}</b></div>
    <div class="pr"><span>FIRE REGIME</span><b>${escapeHTML(cluster.regime)}</b></div>
    <div class="pr"><span>RELATIVE HEURISTIC SCORE (NON-PROBABILITY)</span><b>${primary.relativeScore}/100 ${escapeHTML(primary.label)}</b></div>
    <div class="pr"><span>LAND COVER / BIOME</span><b>${escapeHTML(cluster.biome.label)}</b></div>
    <div class="pr"><span>MODIS / VIIRS</span><b>${cluster.sensorCounts.MODIS} / ${cluster.sensorCounts.VIIRS}</b></div>
    <div class="pr"><span>10 KM RECURRENCE</span><b>${cluster.intelligence.recurrenceCount} records</b></div>
    <div class="pr"><span>MAKS ΔT</span><b>${cluster.maxDT.toFixed(1)} K</b></div>
    <div class="pr"><span>FRP TOPLAM</span><b>${cluster.members.reduce((sum, member) => sum + member.frp, 0).toFixed(1)} MW</b></div>
    ${tags}
  `;
}

function clusterProperties(cluster) {
  const firstObservation = cluster.members.reduce(
    (first, member) => member.ts < first.ts ? member : first,
    cluster.members[0],
  );
  const bowTieExpansion = cluster.members.reduce((sum, member) => {
    const nadirAreaKm2 = member.sensor === "MODIS" ? 1 : 0.14;
    return sum + (member.scan_km * member.track_km) / nadirAreaKm2;
  }, 0) / cluster.members.length;
  return {
    cluster_id: cluster.id,
    lat: cluster.lat,
    lon: cluster.lon,
    regime: cluster.regime,
    modis_count: cluster.sensorCounts.MODIS,
    viirs_count: cluster.sensorCounts.VIIRS,
    detection_count: cluster.members.length,
    sensor_count: cluster.sources.length,
    multi_sensor_support: cluster.sources.length > 1,
    confidence_summary: summarizeConfidence(cluster.members),
    bow_tie_expansion: bowTieExpansion,
    cluster_frp: cluster.harmonizedFrp,
    raw_cluster_frp: cluster.rawFrp,
    biomass_burn_rate_kg_s: cluster.biomassBurnRateKgS,
    co_emission_g_s: cluster.coEmissionGS,
    cluster_delta_t: cluster.meanDT,
    fire_intelligence: cluster.intelligence,
    biome: cluster.biome,
    acq_date: firstObservation.acq_date,
    acq_time: firstObservation.acq_time,
  };
}

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const FIRE_SOURCE_LABELS = [
  "ORMAN / DOĞAL ÖRTÜ YANGINI",
  "TARIMSAL ANIZ / ARAZİ YAKMA",
  "INDUSTRIAL FACILITY / PORT / FLARE (STA)",
  "WILDLAND-URBAN INTERFACE (WUI)",
  "WASTE / THERMAL ANOMALY",
  "GRASSLAND / STEPPE FIRE",
];
const FIRE_SOURCE_CATEGORIES = [
  "forest", "agriculture", "industrial", "human", "waste", "grassland",
];
const STA_REGIONS = [
  {
    name: "Iskenderun / Payas Industrial Port & Steel Complex",
    minLat: 36.55, maxLat: 36.90, minLon: 36.10, maxLon: 36.32,
  },
  {
    name: "Aliaga Refinery & Petrochemical Complex",
    minLat: 38.75, maxLat: 38.88, minLon: 26.88, maxLon: 27.02,
  },
  {
    name: "Izmit / Dilovasi / Tupras Industrial Hub",
    minLat: 40.72, maxLat: 40.82, minLon: 29.50, maxLon: 29.80,
  },
  {
    name: "Zonguldak / Eregli Steel & Industrial Hub",
    minLat: 41.15, maxLat: 41.32, minLon: 31.38, maxLon: 32.68,
  },
  {
    name: "Ceyhan / Yumurtalik Oil & Energy Terminal",
    minLat: 36.75, maxLat: 36.92, minLon: 35.80, maxLon: 36.00,
  },
  { name: "Persian Gulf Oil & Gas Basin", minLat: 24, maxLat: 30, minLon: 48, maxLon: 57 },
  { name: "North Sea Oil & Gas Basin", minLat: 51, maxLat: 62, minLon: -4, maxLon: 8 },
  { name: "Gulf of Mexico Oil & Gas Basin", minLat: 18, maxLat: 30, minLon: -98, maxLon: -80 },
  { name: "West Siberian Oil & Gas Basin", minLat: 55, maxLat: 72, minLon: 60, maxLon: 90 },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function inRegion(point, region) {
  return point.lat >= region.minLat && point.lat <= region.maxLat &&
    point.lon >= region.minLon && point.lon <= region.maxLon;
}

const persistenceIndexCache = new WeakMap();

function persistentDayIndex(points, radiusKm = 1.5) {
  let cached = persistenceIndexCache.get(points);
  if (cached?.radiusKm === radiusKm) return cached.index;
  const index = new Map();
  for (const point of points) {
    const key = gridCell(point, radiusKm).join(",");
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(point);
  }
  persistenceIndexCache.set(points, { radiusKm, index });
  return index;
}

function uniqueDetectionDaysWithin(cluster, points, radiusKm, index = null) {
  const days = new Set();
  if (index) {
    const [x, y, z] = gridCell(cluster, radiusKm);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const point of index.get(`${x + dx},${y + dy},${z + dz}`) || []) {
            if (haversineKm(point, cluster) <= radiusKm) days.add(point.acq_date);
          }
        }
      }
    }
    return days.size;
  }
  for (const point of points) {
    if (haversineKm(point, cluster) <= radiusKm) days.add(point.acq_date);
  }
  return days.size;
}

function biomeRecord(code, label, vegetation, fuelLoad, source, extra = {}) {
  return { code, label, vegetation, fuelLoad, source, ...extra };
}

function classifyIgbpBiome(classCode) {
  const classNames = {
    1: "Evergreen Needleleaf Forest",
    2: "Evergreen Broadleaf Forest",
    3: "Deciduous Needleleaf Forest",
    4: "Deciduous Broadleaf Forest",
    5: "Mixed Forest",
    6: "Closed Shrublands",
    7: "Open Shrublands",
    8: "Woody Savannas",
    9: "Savannas",
    10: "Grasslands",
    11: "Permanent Wetlands",
    12: "Croplands",
    13: "Urban & Built-Up",
    14: "Cropland/Natural Vegetation Mosaic",
    15: "Permanent Snow & Ice",
    16: "Barren / Sparsely Vegetated",
    17: "Water Bodies",
  };
  const className = classNames[classCode];
  if (!className) return null;
  const source = "NASA GIBS / MCD12Q1 IGBP 2024";
  const extra = { igbpClass: classCode };
  if (classCode >= 1 && classCode <= 5) {
    return biomeRecord(
      "FOREST_PINE_MIXED",
      `${className} (IGBP-${String(classCode).padStart(2, "0")})`,
      className,
      "Orman alt örtüsü; yakıt miktarı saha koşullarına bağlı",
      source,
      extra,
    );
  }
  if (classCode === 6 || classCode === 7) {
    return biomeRecord(
      "SHRUBLAND_MAQUIS",
      `${className} (Akdeniz makilik; IGBP-${String(classCode).padStart(2, "0")})`,
      className,
      "Kuru çalı ve makilik",
      source,
      extra,
    );
  }
  if (classCode >= 8 && classCode <= 11) {
    return biomeRecord(
      "GRASSLAND_STEPPE",
      `${className} (IGBP-${String(classCode).padStart(2, "0")})`,
      className,
      classCode === 11 ? "Sulak alan bitki örtüsü; yerel nem değişken" : "Kuru ot ve seyrek çalı",
      source,
      extra,
    );
  }
  if (classCode === 12 || classCode === 14) {
    return biomeRecord(
      "CROPLAND_AGRICULTURE",
      `${className} (IGBP-${String(classCode).padStart(2, "0")})`,
      className,
      "Ekili tarım alanı bağlamı; anız yakıldığı kanıtı değildir",
      source,
      extra,
    );
  }
  if (classCode === 13) {
    return biomeRecord(
      "WUI_URBAN_INTERFACE",
      `${className} (IGBP-13; sanayi etiketi değildir)`,
      className,
      "Kentsel mozaik; yanıcı örtü yerel ölçekte değişken",
      source,
      extra,
    );
  }
  return biomeRecord(
    "NON_FUEL_SURFACE",
    `${className} (IGBP-${String(classCode).padStart(2, "0")})`,
    className,
    "IGBP sınıfında düşük veya bulunmayan bitkisel yakıt",
    source,
    extra,
  );
}

const VOLCANO_REGIONS = [
  { name: "Hawaiʻi Volcanoes National Park (Kīlauea / Mauna Loa)", minLat: 18.90, maxLat: 19.65, minLon: -155.75, maxLon: -154.80 },
  { name: "Mount Etna & Stromboli Volcanic Complex (Italy)", minLat: 37.60, maxLat: 38.90, minLon: 14.80, maxLon: 15.35 },
  { name: "Erta Ale & Afar Rift Volcanic Zone (Ethiopia)", minLat: 13.40, maxLat: 13.90, minLon: 40.50, maxLon: 41.00 },
  { name: "Nyiragongo & Nyamulagira Volcanoes (DRC)", minLat: -1.65, maxLat: -1.30, minLon: 29.10, maxLon: 29.40 },
  { name: "Reykjanes Peninsula Volcanic Fissures (Iceland)", minLat: 63.75, maxLat: 64.05, minLon: -22.60, maxLon: -21.90 },
  { name: "Popocatépetl & Fuego Volcanic Belt", minLat: 14.30, maxLat: 19.20, minLon: -98.80, maxLon: -90.70 },
  { name: "Semeru, Merapi & Dukono Volcanic Arc (Indonesia)", minLat: -8.30, maxLat: 1.85, minLon: 110.30, maxLon: 128.00 },
];

function inferGeographicBiome(cluster, elevationM = null) {
  const { lat, lon } = cluster;
  const volcano = VOLCANO_REGIONS.find(v => inRegion(cluster, v));
  if (volcano) {
    return biomeRecord(
      "STA_VOLCANIC",
      `Aktif Volkanik / Jeotermal Alan (${volcano.name})`,
      "Bazaltik lav / krater yüzeyi (IGBP-16)",
      "Bitkisel yakıt yok — Magmatik / Volkanik Termal Anomali (FIRMS Type=1)",
      "KÜRESEL VOLKANİK MASKE",
    );
  }
  if (lat >= 35.8 && lat <= 42.1 && lon >= 25.6 && lon <= 44.8) {
    const coastalForestBelt =
      (lat >= 35.8 && lat <= 38.5 && lon >= 26 && lon <= 36.5) ||
      (lat >= 38.5 && lat <= 41.8 && lon >= 26 && lon <= 30.5) ||
      (lat >= 40.5 && lat <= 42.1 && lon >= 29 && lon <= 42);
    if (coastalForestBelt && (elevationM == null || elevationM >= 150)) {
      if (elevationM == null || elevationM < 650) {
        return biomeRecord(
          "SHRUBLAND_MAQUIS",
          "Akdeniz Makilik / Çalılık (IGBP-06/07)",
          "Makilik ve çalılık",
          "Kuru, reçineli maki ve çalılık",
          "COĞRAFİ KUŞAK ÇIKARIMI",
        );
      }
      return biomeRecord(
        "FOREST_PINE_MIXED",
        "Kızılçam / Karışık Orman (IGBP-01/05)",
        "İbreli ve karışık orman",
        "Yüksek reçineli ibreli orman / kuru orman alt örtüsü",
        "COĞRAFİ KUŞAK ÇIKARIMI",
      );
    }
    return biomeRecord(
      "CROPLAND_AGRICULTURE",
      "Tarım / Bozkır Kuşağı (IGBP-10/12)",
      "Tarım ve bozkır mozaiği",
      "Kuru tahıl anızı ve otlak örtüsü",
      "COĞRAFİ KUŞAK ÇIKARIMI",
    );
  }
  const absLat = Math.abs(lat);
  if (absLat <= 15) {
    return biomeRecord(
      "FOREST_PINE_MIXED",
      "Tropikal Orman ve Ağaçlı Savan Kuşağı (IGBP-02/08)",
      "Tropikal geniş yapraklı orman / savan",
      "Yoğun tropikal biyokütle ve savan örtüsü",
      "KÜRESEL ENLEM KUŞAĞI",
    );
  }
  if (absLat <= 32) {
    return biomeRecord(
      "GRASSLAND_STEPPE",
      "Subtropikal Savan ve Çalılık Kuşağı (IGBP-07/09)",
      "Savan ve açık çalılık",
      "Kuru ot ve subtropikal çalı yakıtı",
      "KÜRESEL ENLEM KUŞAĞI",
    );
  }
  if (absLat <= 50) {
    return biomeRecord(
      "SHRUBLAND_MAQUIS",
      "Ilıman Orman / Akdeniz ve Tarım Kuşağı (IGBP-05/12)",
      "Karışık orman ve tarım mozaiği",
      "Ilıman kuşak orman ve tarımsal örtü",
      "KÜRESEL ENLEM KUŞAĞI",
    );
  }
  return biomeRecord(
    "FOREST_PINE_MIXED",
    "Boreal / Kuzey İğne Yapraklı Orman Kuşağı (IGBP-01/03)",
    "Boreal tayga ve iğne yapraklı orman",
    "Reçineli kozalaklı orman örtüsü",
    "KÜRESEL ENLEM KUŞAĞI",
  );
}

function classifyOsmBiome(data) {
  if (!data) return null;
  const address = data.address || {};
  const names = data.namedetails || {};
  const tags = data.extratags || {};
  const value = [
    data.category, data.type, data.addresstype, data.name, data.display_name,
    ...Object.values(names), ...Object.entries(tags).flat(),
    address.landuse, address.natural, address.leisure, address.amenity,
    address.industrial, address.man_made,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(industrial|port|harbour|harbor|dock|refinery|plant|works|quarry|mine|liman|tersane|rafineri|demir.?çelik|sanayi)\b/.test(value)) {
    return biomeRecord(
      "STA_INDUSTRIAL_PORT",
      "Liman & Ağır Sanayi Endüstriyel Alanı (OSM doğrulamalı)",
      "Yok (beton / çelik / endüstriyel yüzey)",
      "Yanıcı bitki örtüsü yok - endüstriyel ısı kaynağı",
      "OSM / NOMINATIM",
    );
  }
  if (/\b(forest|wood|national_park|nature_reserve|orman|çam|koru)\b/.test(value)) {
    return biomeRecord(
      "FOREST_PINE_MIXED",
      "Orman Örtüsü / Karışık Orman (OSM; IGBP-01/05 görsel referans)",
      "Orman örtüsü (OSM sınıfı)",
      "Yüksek reçineli ibreli orman / kuru orman alt örtüsü",
      "OSM / NOMINATIM",
    );
  }
  if (/\b(scrub|heath|chaparral|makilik|çalılık|maki)\b/.test(value)) {
    return biomeRecord(
      "SHRUBLAND_MAQUIS",
      "Akdeniz Makilik ve Çalılık Örtüsü (OSM; IGBP-06/07 görsel referans)",
      "Makilik ve çalılık (OSM sınıfı)",
      "Kuru, reçineli maki ve çalılık",
      "OSM / NOMINATIM",
    );
  }
  if (/\b(farmland|farm|meadow|orchard|vineyard|field|tarla|çiftlik|bağ|bahçe)\b/.test(value)) {
    return biomeRecord(
      "CROPLAND_AGRICULTURE",
      "Tarım Arazisi / Ekili Alan (OSM; IGBP-12/14 görsel referans)",
      "Tarım ve ürün mozaiği (OSM sınıfı)",
      "Kuru tahıl anızı ve tarla artığı",
      "OSM / NOMINATIM",
    );
  }
  if (/\b(grass|grassland|steppe|pasture|bozkır|mera|otlak)\b/.test(value)) {
    return biomeRecord(
      "GRASSLAND_STEPPE",
      "Bozkır / Mera Otlağı (OSM; IGBP-10/11 görsel referans)",
      "Bozkır ve mera (OSM sınıfı)",
      "Kuru ot ve seyrek çalı yakıtı",
      "OSM / NOMINATIM",
    );
  }
  if (/\b(residential|suburb|city|town|village|yerleşim|mahalle|köy|şehir)\b/.test(value)) {
    return biomeRecord(
      "WUI_URBAN_INTERFACE",
      "Yerleşim / Kentsel Ara Yüz (OSM doğrulamalı)",
      "Yerleşim ve parçalı bitki örtüsü",
      "Karışık kentsel / kırsal yanıcı madde",
      "OSM / NOMINATIM",
    );
  }
  return null;
}

function detectBiomeAndLandCover(cluster, allPoints, context = {}) {
  const staRegion = STA_REGIONS.find(region => inRegion(cluster, region));
  const persistentDays = uniqueDetectionDaysWithin(
    cluster,
    allPoints,
    1.5,
    context.persistenceIndex,
  );
  if (staRegion) {
    return biomeRecord(
      "STA_INDUSTRIAL_PORT",
      "LİMAN / AĞIR SANAYİ TESİSİ (UYGULAMA İÇİ MASKE)",
      "Yok (Beton / Çelik / Endüstriyel Yüzey)",
      "Yanıcı Bitki Örtüsü Yok - Endüstriyel Isı",
      "YEREL SANAYİ COĞRAFİ SINIRI",
      { evidence: `Uygulama içi sanayi sınırı: ${staRegion.name}`, persistentDays },
    );
  }
  const osmBiome = classifyOsmBiome(context.osmData);
  if (osmBiome?.code === "STA_INDUSTRIAL_PORT") return { ...osmBiome, persistentDays };
  const igbpBiome = classifyIgbpBiome(context.igbpClass);
  const biome = igbpBiome || osmBiome || inferGeographicBiome(cluster, context.elevationM);
  if (persistentDays > 3) {
    return {
      ...biome,
      source: `${biome.source} / ${persistentDays} gün tekrar (STA adayı; sanayi doğrulanmadı)`,
      evidence: `${persistentDays} farklı tespit günü; uzun süren doğal yangınlar da tekrarlayabilir`,
      persistentDays,
    };
  }
  return { ...biome, persistentDays };
}

function normalizedPercentages(scores, agricultureIndex = -1, agricultureCap = null) {
  let shares = scores.map(score => Math.max(0, score));
  let sum = shares.reduce((total, score) => total + score, 0) || 1;
  shares = shares.map(score => score / sum);
  if (agricultureIndex >= 0 && agricultureCap != null && shares[agricultureIndex] > agricultureCap) {
    const remaining = 1 - agricultureCap;
    const otherTotal = 1 - shares[agricultureIndex];
    shares = shares.map((share, index) => index === agricultureIndex
      ? agricultureCap
      : otherTotal ? share / otherTotal * remaining : remaining / (shares.length - 1));
  }
  const exact = shares.map(share => share * 100);
  const result = exact.map(Math.floor);
  let remainder = 100 - result.reduce((total, value) => total + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - result[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remainder; index++) result[order[index % order.length].index]++;
  return result;
}

function analyzeFireIntelligence(cluster, allPoints, biomeOverride = null, context = {}) {
  const members = cluster.members;
  const biome = biomeOverride || detectBiomeAndLandCover(cluster, allPoints, context);
  const totalFrp = members.reduce((sum, member) => sum + member.frp, 0);
  const meanFrp = totalFrp / members.length;
  const maxDT = Math.max(...members.map(member => member.delta_t));
  const dayCount = members.filter(member => member.daynight === "D").length;
  const nightCount = members.filter(member => member.daynight === "N").length;
  const dayFraction = dayCount / members.length;
  const nightFraction = nightCount / members.length;
  const viirsCount = members.filter(member => member.sensor === "VIIRS").length;
  const firstTs = Math.min(...members.map(member => member.ts));
  const currentDates = new Set(members.map(member => member.acq_date));
  const recurrence = allPoints.filter(point =>
    !currentDates.has(point.acq_date) &&
    Math.abs(point.lat - cluster.lat) <= 10 / 111.32 &&
    Math.abs(point.lon - cluster.lon) <= 10 /
      (111.32 * Math.max(0.000001, Math.abs(Math.cos(cluster.lat * Math.PI / 180)))) &&
    haversineKm(point, cluster) <= 10
  );
  const recurrenceMonths = new Map();
  for (const point of recurrence) {
    const month = Number(point.acq_date.slice(5, 7));
    recurrenceMonths.set(month, (recurrenceMonths.get(month) || 0) + 1);
  }
  const recurrenceMonthSummary = [...recurrenceMonths.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([month, count]) => `${MONTH_LABELS[month - 1]} ${count}`);
  const industrialRepeat = allPoints.filter(point =>
    !currentDates.has(point.acq_date) &&
    Math.abs(point.lat - cluster.lat) <= 5 / 111.32 &&
    Math.abs(point.lon - cluster.lon) <= 5 /
      (111.32 * Math.max(0.000001, Math.abs(Math.cos(cluster.lat * Math.PI / 180)))) &&
    haversineKm(point, cluster) <= 5
  );
  const industrialDeltaValues = industrialRepeat.map(point => point.delta_t);
  const industrialDeltaMean = industrialDeltaValues.length
    ? industrialDeltaValues.reduce((sum, value) => sum + value, 0) / industrialDeltaValues.length
    : 0;
  const industrialDeltaDeviation = industrialDeltaValues.length
    ? Math.sqrt(industrialDeltaValues.reduce((sum, value) =>
      sum + (value - industrialDeltaMean) ** 2, 0) / industrialDeltaValues.length)
    : 0;
  const month = new Date(firstTs).getUTCMonth() + 1;
  const spreadArea = cluster.spreadAreaKm2;
  let forestScore = 0.12 +
    0.34 * clamp01((totalFrp - 12) / 70) +
    0.24 * clamp01((maxDT - 10) / 30) +
    0.15 * Number(dayCount > 0 && nightCount > 0) +
    0.15 * clamp01((spreadArea - 0.1) / 5);
  let agricultureScore = 0.08 +
    0.3 * dayFraction +
    0.22 * clamp01((28 - meanFrp) / 25) +
    0.2 * clamp01(viirsCount / 8) +
    0.2 * Number(month >= 6 && month <= 10);
  const industrialScore = 0.08 +
    0.36 * clamp01(industrialRepeat.length / 8) +
    0.22 * clamp01((0.6 - spreadArea) / 0.6) +
    0.18 * clamp01((8 - industrialDeltaDeviation) / 8) +
    0.16 * clamp01(industrialRepeat.length / 5);
  const wuiScore = 0.08 +
    0.25 * dayFraction +
    0.22 * clamp01((meanFrp - 5) / 25) +
    0.2 * clamp01(recurrence.length / 10) +
    0.25 * clamp01((spreadArea - 0.05) / 2);
  const wasteScore = 0.06 +
    0.3 * nightFraction +
    0.32 * clamp01((14 - meanFrp) / 14) +
    0.22 * Number(members.length === 1) +
    0.1 * clamp01((0.35 - spreadArea) / 0.35);
  const grasslandScore = 0.08 +
    0.2 * dayFraction +
    0.24 * clamp01((24 - maxDT) / 24) +
    0.3 * clamp01((spreadArea - 0.25) / 4) +
    0.18 * clamp01(viirsCount / 10);
  const isForestBiome = biome.code === "FOREST_PINE_MIXED" || biome.code === "SHRUBLAND_MAQUIS";
  if (isForestBiome) {
    forestScore *= 2.4;
    agricultureScore *= 0.05;
  } else if (biome.code === "CROPLAND_AGRICULTURE" && dayCount > 0) {
    agricultureScore *= 2.2;
  } else if (biome.code === "NON_FUEL_SURFACE") {
    forestScore *= 0.05;
    agricultureScore *= 0.05;
    grasslandScore *= 0.05;
  }
  const scores = [
    forestScore,
    agricultureScore,
    industrialScore,
    wuiScore,
    wasteScore,
    grasslandScore,
  ];
  let rounded;
  if (biome.code === "STA_INDUSTRIAL_PORT" || biome.code === "STA_VOLCANIC") {
    rounded = [1, 0, 92, 5, 2, 0];
  } else {
    const maxScore = Math.max(...scores);
    const expScores = scores.map(score => Math.exp((score - maxScore) / 0.22));
    rounded = normalizedPercentages(
      expScores,
      1,
      isForestBiome ? 0.05 : null,
    );
  }
  const rankedScores = FIRE_SOURCE_LABELS.map((label, index) => ({
    label,
    category: FIRE_SOURCE_CATEGORIES[index],
    relativeScore: rounded[index],
  })).sort((a, b) => b.relativeScore - a.relativeScore);
  const humanFactorScore = Math.max(0, Math.min(99, Math.round(
    99 * (
      dayFraction * 0.32 +
      (agricultureScore + industrialScore + wuiScore) / 3 * 0.48 +
      clamp01(recurrence.length / 20) * 0.2
    )
  )));
  return {
    rankedScores,
    biome,
    recurrenceCount: recurrence.length,
    recurrenceMonths: recurrenceMonthSummary.length ? recurrenceMonthSummary : ["Yoğun ay verisi yok"],
    recurrenceLabel: recurrence.length
      ? `YÜKLÜ VERİDE YÜKSEK TEKERRÜR (${recurrence.length} kayıt)`
      : "İLK KEZ / NADİR (yüklü veri içinde)",
    humanFactorScore,
    industrialRepeatCount: industrialRepeat.length,
    industrialDeltaDeviation,
    evidenceScope: "Mevcut tarayıcı veri kümesi",
    model: "TURQUA land-cover constrained heuristic relative-score ranking v2 (uncalibrated)",
  };
}

function updateTelemetry(sourceLabel) {
  const points = state.filteredPoints;
  const clusters = state.clusters;
  const normalizedIndex = points.reduce((sum, point) => {
    const sensorWeight = point.sensor === "MODIS" ? 1.0 : (0.14 * 0.14);
    return sum + sensorWeight / (point.scan_km * point.track_km);
  }, 0);
  const rawPointCount = points.length;
  const correctionPercent = rawPointCount
    ? ((rawPointCount - normalizedIndex) / rawPointCount) * 100
    : null;
  const counts = {
    tmRaw: points.length,
    tmClusters: clusters.length,
    tmMulti: clusters.filter(cluster => cluster.sources.length > 1).length,
  };
  for (const [id, value] of Object.entries(counts)) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }
  const normalizedElement = document.getElementById("sensorAdjustedIndex");
  if (normalizedElement) normalizedElement.textContent = normalizedIndex.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  const correctionElement = document.getElementById("sensorCorrection");
  if (correctionElement) correctionElement.textContent = correctionPercent == null
    ? "VERİ YOK"
    : `${correctionPercent >= 0 ? "+" : ""}${correctionPercent.toFixed(1)}%`;
  const bridgeNote = document.getElementById("sensorBridgeNote");
  if (bridgeNote) bridgeNote.textContent =
    "MODIS 1 km² ve VIIRS 0,14 km² ağırlığı piksel alanına göre normalize edilir; MODIS emekliliği sonrası VIIRS aynı eşdeğer indeksle izlenir.";
  updateAoiCriticalAlarm();
  const badge = document.getElementById("sourceStatus");
  if (badge) {
    const source = sourceLabel.toUpperCase().includes("FIRMS") ? "NASA FIRMS" : sourceLabel;
    badge.textContent = `${source} ACTIVE / ${points.length.toLocaleString("en-US")} DETECTIONS`;
    badge.className = "source-status ok";
  }
}

function updateAoiCriticalAlarm() {
  const anomalyText = document.getElementById("activityAnomaly")?.textContent || "";
  const anomalyMatch = anomalyText.match(/^\s*\+?(\d+(?:\.\d+)?)%/);
  const anomalyCritical = Number(anomalyMatch?.[1]) >= 25;
  const activeFoci = state.clusters.filter(cluster =>
    cluster.sensorCounts.MODIS > 0 &&
    cluster.sensorCounts.VIIRS > 0 &&
    (cluster.rawFrp > 50 || anomalyCritical)
  ).length;
  const alarm = document.getElementById("aoiCriticalAlarm");
  if (alarm) {
    alarm.hidden = activeFoci === 0;
    alarm.textContent = activeFoci
      ? `[! AOI KRİTİK ALARM: ${activeFoci} AKTİF ODAK]`
      : "";
    alarm.title = anomalyCritical
      ? "Çoklu sensör teyitli odaklar ve seçili AOI için +25% veya üzeri anomalide tetiklendi."
      : "Çoklu sensör teyitli ve FRP > 50 MW odaklarında tetiklendi.";
  }
  return activeFoci;
}

function updateMapAndTelemetry(sourceLabel = state.sourceLabel) {
  state.sourceLabel = sourceLabel;
  const minDT = Number(document.getElementById("dTSlider").value);
  const fireFeatures = [];
  const footprintFeatures = [];
  const hullFeatures = [];
  const clusterByPoint = new Map();
  for (const cluster of state.clusters) {
    for (const member of cluster.members) clusterByPoint.set(member, cluster);
  }

  for (const point of state.points) {
    if (point.delta_t < minDT) continue;
    const cluster = clusterByPoint.get(point);
    fireFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [point.lon, point.lat] },
      properties: {
        kind: "point",
        sensor: point.sensor,
        confidence_raw: point.confidenceRaw,
        confidence_kind: point.confidenceKind,
        confidence_category: point.confidenceCategory,
        density_weight: state.activityMetric === "frp"
          ? (point.sensor === "MODIS" ? 1 : 0.14) * point.frp / (point.scan_km * point.track_km)
          : (point.sensor === "MODIS" ? 1 : 0.14) / (point.scan_km * point.track_km),
        cluster_id: cluster?.id ?? null,
        regime: cluster?.regime ?? "KARIŞIK / SINIFLANDIRILMAMIŞ",
        modis_count: cluster?.sensorCounts.MODIS ?? (point.sensor === "MODIS" ? 1 : 0),
        viirs_count: cluster?.sensorCounts.VIIRS ?? (point.sensor === "VIIRS" ? 1 : 0),
        detection_count: cluster?.members.length ?? 1,
        sensor_count: cluster?.sources.length ?? 1,
        multi_sensor_support: (cluster?.sources.length ?? 1) > 1,
        confidence_summary: cluster
          ? summarizeConfidence(cluster.members)
          : summarizeConfidence([point]),
        cluster_frp: cluster?.harmonizedFrp ?? point.frp,
        raw_cluster_frp: cluster?.rawFrp ?? point.frp,
        biomass_burn_rate_kg_s: cluster?.biomassBurnRateKgS ?? 0.368 * point.frp,
        co_emission_g_s: cluster?.coEmissionGS ?? 0.368 * point.frp * 104,
        cluster_delta_t: cluster?.meanDT ?? point.delta_t,
        fire_intelligence: cluster?.intelligence ?? null,
        biome: cluster?.biome ?? null,
        age_hours: Math.max(0, (Date.now() - point.ts) / 3600000),
        lat: point.lat,
        lon: point.lon,
        acq_date: point.acq_date,
        acq_time: point.acq_time,
        popup: popupPoint(point),
      },
    });
    footprintFeatures.push(footprintPolygon(point));
  }

  for (const cluster of state.clusters) {
    if (cluster.maxDT < minDT) continue;
    if (cluster.hull.length >= 4) {
      hullFeatures.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [cluster.hull] },
        properties: { id: cluster.id },
      });
    }
    fireFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cluster.lon, cluster.lat] },
      properties: {
        ...clusterProperties(cluster),
        kind: "cluster",
        sensor: "MERGED",
        popup: popupCluster(cluster),
      },
    });
  }
  updateMapData(fireFeatures, footprintFeatures, hullFeatures);
  updateTelemetry(sourceLabel);
}

function processRecords(records, sourceLabel, { epsKm = 0.8, maxPoints = null } = {}) {
  state.rawRecords = records;
  state.maxPoints = maxPoints;
  state.allPoints = records.map(normalizeRaw).filter(Boolean);
  state.epsKm = epsKm;
  state.sourceLabel = sourceLabel;
  const result = applyDataQuery();
  if (records.length > 0 && state.allPoints.length === 0) {
    const badge = document.getElementById("sourceStatus");
    if (badge) {
      badge.textContent = "DATA SCHEMA ERROR";
      badge.className = "source-status err";
    }
  }
  return { validCount: state.allPoints.length, displayedCount: state.points.length, filteredCount: result };
}

function applyDataQuery({
  epsKm = state.epsKm,
  bounds = state.bounds,
  startMonth = state.startMonth,
  endMonth = state.endMonth,
  selectedDate = null,
  maxPoints = state.maxPoints,
} = {}) {
  state.epsKm = epsKm;
  state.bounds = bounds;
  state.startMonth = startMonth;
  state.endMonth = endMonth;
  state.selectedDate = selectedDate;
  state.maxPoints = maxPoints;
  const start = `${startMonth}-01`;
  const endDate = new Date(`${endMonth}-01T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(0);
  const end = endDate.toISOString().slice(0, 10);
  state.rangePoints = state.allPoints.filter(point =>
    point.acq_date >= start &&
    point.acq_date <= end &&
    (!bounds || (
      point.lon >= bounds.minLon &&
      point.lon <= bounds.maxLon &&
      point.lat >= bounds.minLat &&
      point.lat <= bounds.maxLat
    ))
  );
  state.filteredPoints = selectedDate
    ? state.rangePoints.filter(point => point.acq_date === selectedDate)
    : state.rangePoints;
  const rankedPoints = [...state.filteredPoints].sort((a, b) => b.frp - a.frp);
  state.points = maxPoints == null ? rankedPoints : rankedPoints.slice(0, maxPoints);
  recluster(epsKm);
  return state.filteredPoints.length;
}

function mergeRecords(records, sourceLabel = state.sourceLabel) {
  state.rawRecords.push(...records);
  state.rawRecords = [...new Map(state.rawRecords.map(record => [recordKey(record), record])).values()];
  state.allPoints = state.rawRecords.map(normalizeRaw).filter(Boolean);
  state.sourceLabel = sourceLabel;
  applyDataQuery();
  return { uniqueCount: state.rawRecords.length, validCount: state.allPoints.length };
}

function recordKey(input) {
  const row = unwrapRecord(input);
  return [
    row._sensor || row.sensor || row.satellite || "",
    row.acq_date || "",
    String(row.acq_time || "").padStart(4, "0"),
    row.latitude ?? row.lat ?? "",
    row.longitude ?? row.lon ?? "",
  ].join("|");
}

function setActivityMetric(metric) {
  state.activityMetric = metric === "frp" ? "frp" : "count";
  updateMapAndTelemetry();
}

function recluster(epsKm = state.epsKm) {
  state.epsKm = epsKm;
  const persistenceIndex = persistentDayIndex(state.allPoints);
  const clusterIndexes = stDbscan(state.points, epsKm);
  state.clusters = clusterIndexes.map((indexes, id) => {
    const members = indexes.map(index => state.points[index]);
    const weights = members.map(() => 1);
    const lat = members.reduce((sum, member) => sum + member.lat, 0) / members.length;
    const lon = weightedLongitude(members, weights);
    const sources = [...new Set(members.map(member => member.sensor))].sort();
    const hull = convexHull(members);
    const spreadAreaKm2 = hullAreaKm2(hull);
    const intelligence = analyzeFireIntelligence(
      { lat, lon, members, spreadAreaKm2 },
      state.allPoints,
      null,
      { persistenceIndex },
    );
    return {
      id, lat, lon, members, sources,
      flags: classifyError(members),
      maxDT: Math.max(...members.map(member => member.delta_t)),
      hull,
      sensorCounts: {
        MODIS: members.filter(member => member.sensor === "MODIS").length,
        VIIRS: members.filter(member => member.sensor === "VIIRS").length,
      },
      harmonizedFrp: members.reduce((sum, member) =>
        sum + member.frp, 0),
      rawFrp: members.reduce((sum, member) => sum + member.frp, 0),
      biomassBurnRateKgS: 0.368 * members.reduce((sum, member) => sum + member.frp, 0),
      coEmissionGS: 0.368 * members.reduce((sum, member) => sum + member.frp, 0) * 104,
      meanDT: members.reduce((sum, member) => sum + member.delta_t, 0) / members.length,
      spreadAreaKm2,
      biome: intelligence.biome,
      intelligence,
      confidenceSummary: summarizeConfidence(members),
      regime: intelligence.rankedScores[0].label,
    };
  });
  updateMapAndTelemetry();
}

function updateClusterBiome(clusterId, context = {}) {
  const cluster = state.clusters.find(item => item.id === Number(clusterId));
  if (!cluster) return null;
  cluster.intelligence = analyzeFireIntelligence(cluster, state.allPoints, null, {
    ...context,
    persistenceIndex: context.persistenceIndex || persistentDayIndex(state.allPoints),
  });
  cluster.biome = cluster.intelligence.biome;
  cluster.regime = cluster.intelligence.rankedScores[0].label;
  updateMapAndTelemetry();
  return cluster;
}

function exportGeoJSON() {
  const minDT = Number(document.getElementById("dTSlider").value);
  const clusterByPoint = new Map();
  for (const cluster of state.clusters) {
    for (const point of cluster.members) clusterByPoint.set(point, cluster);
  }
  const features = state.points
    .filter(point => point.delta_t >= minDT)
    .map(point => {
      const cluster = clusterByPoint.get(point);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.lon, point.lat] },
        properties: {
          feature_type: "detection",
          sensor: point.sensor,
          acq_date: point.acq_date,
          acq_time_utc: point.acq_time,
          frp_mw: point.frp,
          delta_t_k: point.delta_t,
          confidence_raw: point.confidenceRaw,
          confidence_kind: point.confidenceKind,
          age_hours: Math.max(0, (Date.now() - point.ts) / 3600000),
          cluster_id: cluster?.id ?? null,
          fire_regime: cluster?.regime ?? null,
        },
      };
    });
  for (const cluster of state.clusters) {
    if (cluster.maxDT < minDT || cluster.hull.length < 4) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [cluster.hull] },
      properties: { feature_type: "cluster_hull", ...clusterProperties(cluster) },
    });
  }
  const collection = {
    type: "FeatureCollection",
    name: "TURQUA_FIRE_HARMONY",
    metadata: {
      source: state.sourceLabel,
      start_month: state.startMonth,
      end_month: state.endMonth,
      aoi: state.bounds,
      generated_at_utc: new Date().toISOString(),
    },
    features,
  };
  const blob = new Blob([JSON.stringify(collection)], { type: "application/geo+json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "turqua-fire-harmony.geojson";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

const YEARS = Array.from({ length: 27 }, (_, index) => 2000 + index);
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const PRODUCTS = [
  { id: "MODIS_SP", from: "2000-11-01" },
  { id: "VIIRS_SNPP_SP", from: "2012-01-20" },
  { id: "VIIRS_NOAA20_SP", from: "2018-04-01" },
  { id: "VIIRS_NOAA21_NRT", from: "2024-01-17" },
];
const PRESETS = {
  turkey: { minLat: 35.8, maxLat: 42.1, minLon: 25.6, maxLon: 44.8 },
  mediterranean: { minLat: 30, maxLat: 47, minLon: -6, maxLon: 37 },
  amazon: { minLat: -18, maxLat: 5, minLon: -75, maxLon: -44 },
  northamerica: { minLat: 24, maxLat: 60, minLon: -130, maxLon: -65 },
  usa: { minLat: 24.5, maxLat: 49.4, minLon: -125, maxLon: -66.9 },
  canada: { minLat: 42, maxLat: 70, minLon: -141, maxLon: -52 },
  california: { minLat: 32.5, maxLat: 42, minLon: -124.5, maxLon: -114.1 },
  global: { minLat: -60, maxLat: 75, minLon: -180, maxLon: 180 },
};
const PALETTES = {
  amber_gold: ["#3D2600", "#F59E0B", "#FACC15"],
  solar_yellow: ["#2D2600", "#D97706", "#FDE047"],
  ylorrd: ["#FACC15", "#F59E0B", "#EF4444"],
  aerospace: ["#002B36", "#00B4D8", "#00F0FF"],
  inferno: ["#7F1D1D", "#EF4444", "#F59E0B"],
  viridis: ["#1E3A5F", "#14B8A6", "#FACC15"],
};
const DB_NAME = "fireharmony-historical";
const COVERAGE_STORE = "coverage";
const DB_VERSION = 2;
const MAX_RETRIES = 2;

let logger = () => {};
let archiveController = null;
let cancelAoiDrawing = null;
let nextRequestAt = 0;
let currentMonths = new Map();
let archiveCoverage = [];
let refreshRevision = 0;
let coverageByProduct = new Map();
let coverageMonthCache = new Map();
let databasePromise;
let selectedPalette = "ylorrd";
let calendarExpanded = true;
let activeYearsOnly = false;
let playbackDates = [];
let playbackTimer = null;

function log(message, cls = "") {
  logger(message, cls);
}

function stopPlayback() {
  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = null;
  const button = document.getElementById("playbackToggle");
  if (button) {
    button.textContent = "OYNAT";
    button.setAttribute("aria-pressed", "false");
  }
}

function syncPlaybackControls() {
  const slider = document.getElementById("playbackRange");
  const dateLabel = document.getElementById("playbackDate");
  const button = document.getElementById("playbackToggle");
  if (!slider || !dateLabel || !button) return;
  playbackDates = [...new Set(state.rangePoints.map(point => point.acq_date))].sort();
  const selectedIndex = state.selectedDate ? playbackDates.indexOf(state.selectedDate) : -1;
  slider.min = "0";
  slider.max = String(Math.max(0, playbackDates.length - 1));
  slider.value = String(selectedIndex >= 0 ? selectedIndex : 0);
  slider.disabled = playbackDates.length === 0;
  button.disabled = playbackDates.length < 2;
  dateLabel.textContent = selectedIndex >= 0
    ? `${state.selectedDate} · ${selectedIndex + 1}/${playbackDates.length}`
    : playbackDates.length
      ? `TÜMÜ · ${playbackDates.length} TESPİT GÜNÜ`
      : "VERİ YOK";
}

function selectPlaybackDate(index) {
  const date = playbackDates[index];
  if (!date) return;
  applyDataQuery({
    bounds: state.bounds,
    startMonth: state.startMonth,
    endMonth: state.endMonth,
    epsKm: state.epsKm,
    selectedDate: date,
  });
  syncPlaybackControls();
}

function advancePlayback() {
  const selectedIndex = playbackDates.indexOf(state.selectedDate);
  const nextIndex = selectedIndex < 0 ? 0 : (selectedIndex + 1) % playbackDates.length;
  selectPlaybackDate(nextIndex);
}

function openDatabase() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("Tarayıcı IndexedDB desteği yok"));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(COVERAGE_STORE)) {
        const store = database.createObjectStore(COVERAGE_STORE, { keyPath: "key" });
        store.createIndex("areaKey", "areaKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Arşiv veritabanı açılamadı"));
  });
  return databasePromise;
}

async function putCache(coverageEntry) {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(COVERAGE_STORE, "readwrite");
    transaction.objectStore(COVERAGE_STORE).put(coverageEntry);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Arşiv veritabanı işlemi başarısız"));
    transaction.onabort = () => reject(transaction.error || new Error("Arşiv veritabanı işlemi iptal edildi"));
  }));
}

async function getAreaCache(areaKey) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(COVERAGE_STORE, "readonly");
    const request = transaction.objectStore(COVERAGE_STORE).index("areaKey").getAll(IDBKeyRange.only(areaKey));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Önbellek okunamadı"));
  });
}

function readBoundsFromInputs() {
  const read = id => {
    const raw = document.getElementById(id).value.trim();
    if (!raw) throw new Error("AOI koordinat alanları boş bırakılamaz");
    return Number(raw);
  };
  const bounds = {
    minLat: read("minLat"),
    maxLat: read("maxLat"),
    minLon: read("minLon"),
    maxLon: read("maxLon"),
  };
  if (Object.values(bounds).some(value => !Number.isFinite(value))) throw new Error("AOI koordinatları sayısal olmalı");
  if (bounds.minLat < -90 || bounds.maxLat > 90 || bounds.minLat >= bounds.maxLat) {
    throw new Error("Enlem sınırları -90 ile 90 arasında ve min < max olmalı");
  }
  if (bounds.minLon < -180 || bounds.maxLon > 180 || bounds.minLon >= bounds.maxLon) {
    throw new Error("Boylam sınırları -180 ile 180 arasında ve min < max olmalı");
  }
  return bounds;
}

function updateQuery({ redraw = true } = {}) {
  stopPlayback();
  const startMonth = document.getElementById("startMonth").value;
  const endMonth = document.getElementById("endMonth").value;
  if (!startMonth || !endMonth || startMonth > endMonth) {
    throw new Error("Başlangıç ayı bitiş ayından önce veya aynı olmalı");
  }
  const bounds = document.getElementById("globalMode").checked ? null : readBoundsFromInputs();
  applyDataQuery({ bounds, startMonth, endMonth, epsKm: state.epsKm });
  updateAOI(bounds);
  focusAOI(bounds);
  window.dispatchEvent(new CustomEvent("turqua:aoi-changed", { detail: { bounds } }));
  if (redraw) void refreshCalendar();
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function monthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return { start: dateString(start), end: dateString(end) };
}

function monthOf(date) {
  return String(date).slice(0, 7);
}

function monthIndexFor(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return year * 12 + monthNumber - 1;
}

function monthFromIndex(index) {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function areaKey(bounds) {
  if (!bounds) return "world";
  return [
    bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat,
  ].map(value => Number(value).toFixed(6)).join(",");
}

function csvRows(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const split = line => {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"' && quoted) {
        cell += '"';
        index++;
      } else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        cells.push(cell.trim());
        cell = "";
      } else cell += char;
    }
    cells.push(cell.trim());
    return cells;
  };
  const headers = split(lines[0]).map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).toLowerCase()
  );
  return lines.slice(1).map(split).filter(row => row.length === headers.length)
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function makeJobs(startMonth, endMonth, area) {
  const rangeStart = monthRange(startMonth).start;
  const requestedEnd = monthRange(endMonth).end;
  const today = dateString(new Date());
  const rangeEnd = requestedEnd < today ? requestedEnd : today;
  if (rangeStart > rangeEnd) return [];
  const jobs = [];
  const firstMonth = new Date(`${startMonth}-01T00:00:00Z`);
  const lastMonth = new Date(`${endMonth}-01T00:00:00Z`);
  for (const monthCursor = firstMonth; monthCursor <= lastMonth; monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1)) {
    const month = monthCursor.toISOString().slice(0, 7);
    const { start: monthStart, end: monthEnd } = monthRange(month);
    const lastDay = monthEnd < rangeEnd ? monthEnd : rangeEnd;
    for (const product of PRODUCTS) {
      const firstDay = product.from > monthStart ? product.from : monthStart;
      if (firstDay > lastDay) continue;
      let cursor = new Date(`${firstDay}T00:00:00Z`);
      const last = new Date(`${lastDay}T00:00:00Z`);
      while (cursor <= last) {
        const chunkStart = new Date(cursor);
        const chunkEnd = new Date(Math.min(last.getTime(), cursor.getTime() + 9 * 86400000));
        const days = Math.round((chunkEnd - chunkStart) / 86400000) + 1;
        jobs.push({
          product: product.id,
          start: dateString(chunkStart),
          end: dateString(chunkEnd),
          days,
          area,
        });
        cursor = new Date(chunkEnd.getTime() + 86400000);
      }
    }
  }
  return jobs;
}

function cachedKey(area, product, end, days) {
  return `${area}|${product}|${end}|${days}`;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchArchiveJob(job, key, signal, includeRecords = false) {
  const areaPath = job.area === "world" ? "world" : job.area;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${job.product}/${areaPath}/${job.days}/${job.end}`;
  let lastError;
  let text;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) throw new DOMException("İndirme durduruldu", "AbortError");
    const now = Date.now();
    const wait = Math.max(0, nextRequestAt - now);
    nextRequestAt = Math.max(now, nextRequestAt) + 150;
    if (wait) await delay(wait);
    if (signal.aborted) throw new DOMException("İndirme durduruldu", "AbortError");
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const responseText = await response.text();
      if (/^(invalid|error)/i.test(responseText.trim())) throw new Error("FIRMS API isteği reddetti");
      text = responseText;
      break;
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError") throw error;
      if (attempt < MAX_RETRIES) await delay(700 * (attempt + 1));
    }
  }
  if (text == null) throw lastError || new Error("FIRMS arşiv yanıtı alınamadı");
  const records = csvRows(text).map(row => ({ ...row, _sensor: job.product }));
  const monthTotals = monthIndex(records);
  const keyId = cachedKey(job.area, job.product, job.end, job.days);
  const downloadedAt = new Date().toISOString();
  const metadata = {
    key: keyId,
    areaKey: job.area,
    product: job.product,
    start: job.start,
    end: job.end,
    monthly: [...monthTotals].map(([month, values]) => ({ month, ...values })),
    recordCount: records.length,
    downloadedAt,
    ...(includeRecords ? { records } : {}),
  };
  await putCache(metadata);
  return { recordCount: records.length, records: includeRecords ? records : [] };
}

function normalizeActivityRow(row) {
  const value = row?.raw ? row.raw : row;
  const sensorValue = String(row.sensor || value._sensor || value.sensor || value.satellite || "").toUpperCase();
  const sensor = sensorValue.includes("MODIS") ? "MODIS" : "VIIRS";
  const date = row.acq_date || value.acq_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const scan = Number(row.scan_km ?? value.scan_km ?? value.scan);
  const track = Number(row.track_km ?? value.track_km ?? value.track);
  const frp = Number(row.frp ?? value.frp ?? value.frp_mw);
  const lat = Number(row.lat ?? value.latitude ?? value.lat);
  const lon = Number(row.lon ?? value.longitude ?? value.lon);
  if (![scan, track, frp, lat, lon].every(Number.isFinite) || scan <= 0 || track <= 0) return null;
  const bounds = state.bounds;
  if (bounds && (lat < bounds.minLat || lat > bounds.maxLat || lon < bounds.minLon || lon > bounds.maxLon)) return null;
  const factor = sensor === "MODIS" ? 1.0 : (0.14 * 0.14);
  const area = scan * track;
  return {
    date: String(date),
    sensor,
    countDensity: factor / area,
    frpDensity: factor * frp / area,
  };
}

function monthIndex(rows) {
  const aggregate = new Map();
  for (const row of rows) {
    const normalized = normalizeActivityRow(row);
    if (!normalized) continue;
    const key = monthOf(normalized.date);
    const value = aggregate.get(key) || { countDensity: 0, frpDensity: 0, detections: 0 };
    value.countDensity += normalized.countDensity;
    value.frpDensity += normalized.frpDensity;
    value.detections += 1;
    aggregate.set(key, value);
  }
  return aggregate;
}

function intervalsCover(product, start, end) {
  const intervals = coverageByProduct.get(product) || [];
  let cursor = start;
  for (const [intervalStart, intervalEnd] of intervals) {
    if (intervalEnd < cursor) continue;
    if (intervalStart > cursor) return false;
    if (intervalEnd >= end) return true;
    const next = new Date(`${intervalEnd}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = dateString(next);
  }
  return false;
}

function fullyCoveredMonth(month) {
  if (coverageMonthCache.has(month)) return coverageMonthCache.get(month);
  const { start, end } = monthRange(month);
  const year = Number(month.slice(0, 4));
  const requiredProducts = PRODUCTS.filter(product => product.from.slice(0, 4) <= String(year));
  const covered = requiredProducts.every(product => {
    const requiredStart = product.from > start ? product.from : start;
    return intervalsCover(product.id, requiredStart, end);
  });
  coverageMonthCache.set(month, covered);
  return covered;
}

function selectedMetric(activity) {
  return document.getElementById("activityMetric").value === "frp"
    ? activity?.frpDensity || 0
    : activity?.countDensity || 0;
}

function historicalValues(monthNumber, referenceYear = null) {
  const sameMonth = [];
  for (const year of YEARS) {
    if (referenceYear != null && year >= referenceYear) continue;
    const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const activity = currentMonths.get(month);
    const complete = fullyCoveredMonth(month);
    if (complete || activity?.detections > 0) {
      sameMonth.push({ year, month, value: selectedMetric(activity), complete });
    }
  }
  const covered20Years = sameMonth.filter(row =>
    row.year >= 2006 && row.year <= 2025 && row.complete
  );
  const hasFull20YearBaseline = covered20Years.length === 20;
  if (sameMonth.length || hasFull20YearBaseline) {
    return {
      rows: hasFull20YearBaseline ? covered20Years : sameMonth,
      full20YearBaseline: hasFull20YearBaseline,
      label: hasFull20YearBaseline
        ? "20-YEAR HISTORICAL MEDIAN"
        : `ARCHIVE MEDIAN (${sameMonth.length} MO)`,
    };
  }

  const excludedMonth = referenceYear == null
    ? null
    : `${referenceYear}-${String(monthNumber).padStart(2, "0")}`;
  const loadedMonths = [...currentMonths.entries()]
    .filter(([month, activity]) => month !== excludedMonth && activity.detections > 0)
    .map(([month, activity]) => ({
      year: Number(month.slice(0, 4)),
      month,
      value: selectedMetric(activity),
      complete: false,
    }));
  if (loadedMonths.length) {
    return {
      rows: loadedMonths,
      full20YearBaseline: false,
      label: `LOADED PERIOD MONTHLY MEDIAN (${loadedMonths.length} MO)`,
    };
  }

  return {
    rows: [],
    full20YearBaseline: false,
    label: "NO COMPARABLE ARCHIVE FOR SAME MONTH",
  };
}

function baselineFor(monthNumber, excludedYear = null) {
  const history = historicalValues(monthNumber, excludedYear);
  return {
    ...history,
    value: history.rows.length ? median(history.rows.map(row => row.value)) : null,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function fmt(value) {
  if (value == null || !Number.isFinite(value)) return "NO DATA";
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

function anomalyFor(value, baseline) {
  if (value == null || baseline == null || baseline === 0) return null;
  return ((value - baseline) / baseline) * 100;
}

function anomalyLabel(anomaly, loadedPeriodBaseline = false) {
  if (anomaly == null) return "INSUFFICIENT COVERAGE";
  if (loadedPeriodBaseline) {
    return `LOADED PERIOD: ${anomaly >= 0 ? "+" : ""}${anomaly.toFixed(1)}% [NON-SEASONAL]`;
  }
  if (anomaly >= 25) return `+${anomaly.toFixed(1)}% [CRITICAL PEAK]`;
  if (anomaly <= -20) return `${anomaly.toFixed(1)}% [NORMAL ALTI]`;
  return `${anomaly >= 0 ? "+" : ""}${anomaly.toFixed(1)}% [WITHIN BASELINE]`;
}

function paletteColor(value, max) {
  if (!max || value <= 0) return "transparent";
  const colors = PALETTES[selectedPalette] || PALETTES.ylorrd;
  const ratio = Math.min(1, value / max);
  const index = Math.min(2, Math.floor(ratio * 3));
  return colors[index];
}

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  if (!grid) return;
  grid.replaceChildren();
  const activeYears = YEARS.filter(year => [...currentMonths.entries()].some(([month, activity]) =>
    Number(month.slice(0, 4)) === year && activity.detections > 0
  ));
  const displayedYears = activeYearsOnly ? activeYears : YEARS;
  grid.classList.toggle("active-years", activeYearsOnly);
  grid.style.gridTemplateRows = activeYearsOnly
    ? `15px repeat(${displayedYears.length}, minmax(28px, 1fr))`
    : "";
  const heading = document.createElement("div");
  heading.className = "calendar-cell calendar-corner";
  heading.textContent = "YIL";
  grid.append(heading);
  for (const month of MONTHS) {
    const cell = document.createElement("div");
    cell.className = "calendar-cell calendar-month";
    cell.textContent = month.slice(0, 3);
    grid.append(cell);
  }
  const values = [...currentMonths.values()].map(selectedMetric).filter(value => value > 0);
  const max = values.length ? Math.max(...values) : 0;
  document.getElementById("colorbarMax").textContent = fmt(max);
  updateColorbars();
  for (const year of displayedYears) {
    const yearCell = document.createElement("div");
    yearCell.className = "calendar-cell calendar-year";
    yearCell.textContent = String(year);
    grid.append(yearCell);
    for (let monthNumber = 1; monthNumber <= 12; monthNumber++) {
      const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const activity = currentMonths.get(month);
      const complete = fullyCoveredMonth(month);
      const value = activity ? selectedMetric(activity) : complete ? 0 : null;
      const isSelectedYear = year === Number(document.getElementById("endMonth").value.slice(0, 4));
      const history = baselineFor(monthNumber, year);
      const baseline = history.value;
      const anomaly = value != null ? anomalyFor(value, baseline) : null;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `calendar-cell calendar-value${complete ? " covered" : ""}${isSelectedYear ? " selected-year" : ""}`;
      cell.style.backgroundColor = paletteColor(value || 0, max);
      if (activeYearsOnly && value != null) cell.textContent = fmt(value);
      cell.setAttribute("role", "gridcell");
      const loadedPeriodBaseline = history.label.startsWith("LOADED PERIOD");
      cell.title = `${year} ${MONTHS[monthNumber - 1]} | Uyumlaştırılmış yoğunluk: ${fmt(value)} | ${history.label}: ${fmt(baseline)} | Anomali: ${anomalyLabel(anomaly, loadedPeriodBaseline)} | Kayıt: ${activity?.detections || 0}${complete ? " | TAM ARŞİV" : activity ? " | KISMİ / YEREL" : " | VERİ YOK"}`;
      cell.setAttribute("aria-label", cell.title);
      cell.classList.toggle("no-data", value == null);
      cell.addEventListener("click", () => {
        const monthText = `${year}-${String(monthNumber).padStart(2, "0")}`;
        document.getElementById("startMonth").value = monthText;
        document.getElementById("endMonth").value = monthText;
        try {
          updateQuery();
        } catch (error) {
          log(error.message, "err");
        }
      });
      grid.append(cell);
    }
  }
  document.getElementById("calendarStatus").textContent =
    `AOI ${state.bounds ? "bounded" : "global"} | ${activeYears.length} active years | ${archiveCoverage.length} archive intervals | Missing months are not zero activity.`;
  renderAnomalyChart();
  syncPlaybackControls();
}

function renderAnomalyChart() {
  const canvas = document.getElementById("monthlyChart");
  const context = canvas?.getContext("2d");
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(220, canvas.clientWidth);
  const height = 118;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#070B1E";
  context.fillRect(0, 0, width, height);
  const selectedYear = Number(document.getElementById("endMonth").value.slice(0, 4));
  const series = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const history = baselineFor(month, selectedYear);
    const baseline = history.value;
    const monthKey = `${selectedYear}-${String(month).padStart(2, "0")}`;
    const selected = currentMonths.get(monthKey);
    const selectedValue = selected
      ? selectedMetric(selected)
      : fullyCoveredMonth(monthKey) ? 0 : null;
    return { baseline, selected: selectedValue };
  });
  const max = Math.max(1, ...series.flatMap(item => [item.baseline || 0, item.selected || 0]));
  const pad = 12;
  const groupWidth = (width - 2 * pad) / 12;
  const chartHeight = height - 31;
  context.strokeStyle = "#2C3239";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(pad, chartHeight + 0.5);
  context.lineTo(width - pad, chartHeight + 0.5);
  context.stroke();
  series.forEach((item, index) => {
    const center = pad + index * groupWidth + groupWidth / 2;
    const barWidth = Math.max(2, groupWidth * 0.28);
    for (const [offset, value, color] of [
      [-barWidth / 2, item.baseline, "#14B8A6"],
      [barWidth / 2, item.selected, (PALETTES[selectedPalette] || PALETTES.ylorrd)[1]],
    ]) {
      if (value == null || value <= 0) continue;
      const barHeight = Math.max(1, (value / max) * (chartHeight - 4));
      context.fillStyle = color;
      context.fillRect(center + offset, chartHeight - barHeight, barWidth, barHeight);
    }
    context.fillStyle = "#8C959F";
    context.font = "8px IBM Plex Mono, monospace";
    context.textAlign = "center";
    context.fillText(MONTHS[index].slice(0, 3), center, height - 8);
  });
  context.fillStyle = "#14B8A6";
  context.fillRect(pad, 4, 6, 6);
  context.fillStyle = "#8C959F";
  context.textAlign = "left";
  context.fillText("MEDIAN", pad + 9, 10);
  context.fillStyle = (PALETTES[selectedPalette] || PALETTES.ylorrd)[1];
  context.fillRect(pad + 58, 4, 6, 6);
  context.fillStyle = "#8C959F";
  context.fillText(String(selectedYear), pad + 67, 10);

  const focusMonth = Number(document.getElementById("endMonth").value.slice(5, 7));
  const focusKey = `${selectedYear}-${String(focusMonth).padStart(2, "0")}`;
  const current = currentMonths.get(focusKey);
  const currentIsComplete = fullyCoveredMonth(focusKey);
  const history = baselineFor(focusMonth, selectedYear);
  const baseline = history.value;
  const actual = current ? selectedMetric(current) : currentIsComplete ? 0 : null;
  const anomaly = actual != null ? anomalyFor(actual, baseline) : null;
  const currentElement = document.getElementById("currentActivity");
  const medianElement = document.getElementById("historicalMedian");
  const anomalyElement = document.getElementById("activityAnomaly");
  document.getElementById("historicalMedianLabel").textContent = history.label;
  currentElement.textContent = fmt(actual);
  medianElement.textContent = baseline == null
    ? `KAPSAMA YETERSİZ (${history.rows.length} ay)`
    : fmt(baseline);
  const loadedPeriodBaseline = history.label.startsWith("YÜKLÜ DÖNEM");
  anomalyElement.textContent = anomalyLabel(anomaly, loadedPeriodBaseline);
  anomalyElement.className = !loadedPeriodBaseline && anomaly != null && anomaly >= 25 ? "warn" : "";
  window.dispatchEvent(new CustomEvent("turqua:anomaly-updated"));
}

async function refreshCalendar({ focusLatestLocalMonth = false } = {}) {
  stopPlayback();
  const revision = ++refreshRevision;
  try {
    const bounds = state.bounds;
    const key = areaKey(bounds);
    const cachedEntries = await getAreaCache(key);
    if (revision !== refreshRevision) return;
    archiveCoverage = cachedEntries.map(({ product, start, end }) => ({ product, start, end }));
    coverageByProduct = new Map();
    for (const product of PRODUCTS) {
      coverageByProduct.set(product.id, archiveCoverage
        .filter(entry => entry.product === product.id)
        .map(entry => [entry.start, entry.end])
        .sort((a, b) => a[0].localeCompare(b[0])));
    }
    coverageMonthCache = new Map();
    const archiveMonths = new Map();
    try {
      const staticRes = await fetch("data/monthly_tr.json", { cache: "no-store" });
      if (staticRes.ok) {
        const staticData = await staticRes.json();
        for (const item of staticData.series || []) {
          if (item.status !== "no_observation" && item.harmonized_bd != null) {
            archiveMonths.set(item.ym, {
              countDensity: Number(item.harmonized_bd),
              frpDensity: Number(item.harmonized_bd) * 18.5,
              detections: Number(item.raw_hotspots || Math.round(item.harmonized_bd)),
              status: item.status,
            });
            for (const prod of PRODUCTS) {
              const list = coverageByProduct.get(prod.id) || [];
              const mRange = monthRange(item.ym);
              list.push([mRange.start, mRange.end]);
              coverageByProduct.set(prod.id, list);
            }
          }
        }
      }
    } catch (_) {}
    try {
      const staticRes = await fetch("data/monthly_tr.json", { cache: "no-store" });
      if (staticRes.ok) {
        const staticData = await staticRes.json();
        for (const item of staticData.series || []) {
          if (item.status !== "no_observation" && item.harmonized_bd != null) {
            archiveMonths.set(item.ym, {
              countDensity: Number(item.harmonized_bd),
              frpDensity: Number(item.harmonized_bd) * 18.5,
              detections: Number(item.raw_hotspots || Math.round(item.harmonized_bd)),
              status: item.status,
            });
            for (const prod of PRODUCTS) {
              const list = coverageByProduct.get(prod.id) || [];
              const mRange = monthRange(item.ym);
              list.push([mRange.start, mRange.end]);
              coverageByProduct.set(prod.id, list);
            }
          }
        }
      }
    } catch (_) {}
    for (const entry of cachedEntries) {
      for (const item of entry.monthly) {
        const total = archiveMonths.get(item.month) || { countDensity: 0, frpDensity: 0, detections: 0 };
        total.countDensity += item.countDensity;
        total.frpDensity += item.frpDensity;
        total.detections += item.detections;
        archiveMonths.set(item.month, total);
      }
    }
    const localAllRows = state.allPoints.map(point => ({
      lat: point.lat,
      lon: point.lon,
      acq_date: point.acq_date,
      acq_time: point.acq_time,
      sensor: point.sensor,
      scan_km: point.scan_km,
      track_km: point.track_km,
      frp: point.frp,
    }));
    const localMonths = monthIndex(localAllRows);
    const isLocalSource = state.sourceLabel.startsWith("YEREL") || state.sourceLabel.startsWith("DOSYA");
    const endMonthControl = document.getElementById("endMonth");
    if (focusLatestLocalMonth && isLocalSource &&
      !localMonths.has(endMonthControl.value) && !archiveMonths.has(endMonthControl.value)) {
      const latestMonth = [...localMonths.keys()]
        .filter(month => !endMonthControl.max || month <= endMonthControl.max)
        .sort()
        .at(-1);
      if (latestMonth) {
        const startMonthControl = document.getElementById("startMonth");
        if (startMonthControl.value > latestMonth) startMonthControl.value = latestMonth;
        endMonthControl.value = latestMonth;
        applyDataQuery({
          bounds: state.bounds,
          startMonth: startMonthControl.value,
          endMonth: latestMonth,
          epsKm: state.epsKm,
        });
      }
    }
    const localRows = state.rangePoints.map(point => ({
      lat: point.lat,
      lon: point.lon,
      acq_date: point.acq_date,
      acq_time: point.acq_time,
      sensor: point.sensor,
      scan_km: point.scan_km,
      track_km: point.track_km,
      frp: point.frp,
    }));
    currentMonths = archiveMonths;
    for (const [month, activity] of monthIndex(localRows)) {
      if (!currentMonths.has(month)) currentMonths.set(month, activity);
    }
    renderCalendar();
  } catch (error) {
    if (revision !== refreshRevision) return;
    log(`Takvim önbelleği okunamadı: ${error.message}`, "err");
    document.getElementById("calendarStatus").textContent = `ARŞİV HATASI: ${error.message}`;
  }
}

async function downloadHistoricalArchive({ includeRecords = false } = {}) {
  if (archiveController) return;
  const button = document.getElementById("loadArchive");
  const stopButton = document.getElementById("stopArchive");
  const progress = document.getElementById("archiveProgress");
  const progressText = document.getElementById("archiveProgressText");
  button.disabled = true;
  try {
    updateQuery({ redraw: false });
    const startInput = document.getElementById("startMonth");
    const endMonth = document.getElementById("endMonth").value;
    let startMonth = startInput.value;
    const startIndex = monthIndexFor(startMonth);
    const endIndex = monthIndexFor(endMonth);
    if (endIndex - startIndex >= 12) {
      const requestedStart = startMonth;
      startMonth = monthFromIndex(endIndex - 11);
      startInput.value = startMonth;
      updateQuery({ redraw: false });
      const rangeNotice = `Geniş tarih aralığı kota koruması için son 12 aya indirildi: ${startMonth}–${endMonth}`;
      log(rangeNotice, "warn");
      document.getElementById("calendarStatus").textContent = rangeNotice;
      progressText.textContent = `ARŞİV: ${startMonth}–${endMonth} (son 12 ay; seçim ${requestedStart}–${endMonth} idi)`;
    }
    const area = areaKey(state.bounds);
    const jobs = makeJobs(startMonth, endMonth, area);
    if (!jobs.length) {
      log("Seçili zaman aralığı henüz gerçekleşmedi; gelecek dönemler indirilemez", "warn");
      return;
    }
    const cache = await getAreaCache(area);
    const cacheByKey = new Map(cache.map(entry => [entry.key, entry]));
    const pending = jobs.filter(job => {
      const entry = cacheByKey.get(cachedKey(job.area, job.product, job.end, job.days));
      return !entry || (includeRecords && !Array.isArray(entry.records));
    });
    if (!pending.length) {
      log("Seçili NASA FIRMS tarih aralığı tarayıcı önbelleğinde mevcut", "ok");
      await refreshCalendar();
      return includeRecords
        ? cache.flatMap(entry => Array.isArray(entry.records) ? entry.records : [])
        : [];
    }
    const key = document.getElementById("mapKey").value.trim();
    if (!key) {
      document.getElementById("settingsDialog").showModal();
      throw new Error("Tarihsel FIRMS arşivi için ayarlara NASA MAP_KEY girin");
    }
    archiveController = new AbortController();
    stopButton.hidden = false;
    progress.max = pending.length;
    progress.value = 0;
    let downloadedRecords = 0;
    const downloadedRows = [];
    let failures = 0;
    let fatalError = null;
    let cursor = 0;
    let completed = 0;
    const worker = async () => {
      while (!archiveController.signal.aborted) {
        const index = cursor++;
        if (index >= pending.length) return;
        const job = pending[index];
        try {
          const result = await fetchArchiveJob(job, key, archiveController.signal, includeRecords);
          downloadedRecords += result.recordCount;
          downloadedRows.push(...result.records);
        } catch (error) {
          if (error.name === "AbortError") return;
          failures++;
          log(`${job.product} ${job.start}..${job.end}: ${error.message}`, "err");
          if (error.name === "QuotaExceededError") {
            fatalError = error;
            archiveController.abort();
            return;
          }
        }
        completed++;
        progress.value = completed;
        progressText.textContent = `ARŞİV: ${completed}/${pending.length} İSTEK | ${downloadedRecords} TESPİT | ${failures} HATA`;
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()));
    const stopped = archiveController.signal.aborted && !fatalError;
    if (failures) log(`${failures} tarih aralığı indirilemedi; başarısız aralıklar tekrar çalıştırılabilir`, "warn");
    const archiveStatus = fatalError ? "YEREL DEPOLAMA HATASI" : stopped ? "DURDURULDU" : failures ? "KISMİ" : "TAMAMLANDI";
    log(
      `Tarihsel arşiv ${archiveStatus.toLowerCase()}: ${downloadedRecords} kayıt`,
      fatalError ? "err" : stopped || failures ? "warn" : "ok",
    );
    progressText.textContent = `ARŞİV: ${archiveStatus} | ${downloadedRecords} TESPİT | ${failures} HATA`;
    await refreshCalendar();
    if (includeRecords) {
      const updatedCache = await getAreaCache(area);
      return updatedCache.flatMap(entry => Array.isArray(entry.records) ? entry.records : []);
    }
    return downloadedRows;
  } catch (error) {
    log(`Tarihsel arşiv başlatılamadı: ${error.message}`, "err");
    progressText.textContent = `ARŞİV HATASI: ${error.message}`;
    return [];
  } finally {
    archiveController = null;
    button.disabled = false;
    stopButton.hidden = true;
  }
}

function escapeCSV(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCSV(filename, headers, rows) {
  const content = [headers, ...rows].map(row => row.map(escapeCSV).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCalendarCSV() {
  const selected = document.getElementById("activityMetric").value;
  const rows = [];
  for (const year of YEARS) {
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const activity = currentMonths.get(monthKey);
      const complete = fullyCoveredMonth(monthKey);
      const value = activity ? selectedMetric(activity) : complete ? 0 : null;
      const history = baselineFor(month, year);
      const baseline = history.value;
      const anomaly = value != null ? anomalyFor(value, baseline) : null;
      rows.push([
        year,
        String(month).padStart(2, "0"),
        selected,
        value ?? "",
        activity?.countDensity ?? "",
        activity?.frpDensity ?? "",
        activity?.detections ?? 0,
        baseline ?? "",
        anomaly ?? "",
        complete ? "COMPLETE" : activity ? "PARTIAL" : "NO_DATA",
        history.rows.length,
        history.label,
      ]);
    }
  }
  downloadCSV("turqua-fire-map-alarm-calendar-2000-2026.csv", [
    "year", "month", "selected_metric", "harmonized_index", "detection_density_km2",
    "frp_density_mw_km2", "detections", "historical_median",
    "anomaly_percent", "coverage", "baseline_sample_count", "baseline_label",
  ], rows);
}

function exportResultsCSV() {
  const minDT = Number(document.getElementById("dTSlider").value);
  const rows = state.clusters
    .filter(cluster => cluster.maxDT >= minDT)
    .map(cluster => {
    const members = cluster.members;
    const date = members.reduce((earliest, point) => point.acq_date < earliest ? point.acq_date : earliest, members[0].acq_date);
    const time = members.find(point => point.acq_date === date)?.acq_time || "";
    const area = members.reduce((sum, point) => sum + point.scan_km * point.track_km, 0);
    const frp = members.reduce((sum, point) =>
      sum + point.frp, 0);
    const delta = members.reduce((sum, point) => sum + point.delta_t, 0) / members.length;
    const key = date.slice(0, 7);
    const month = Number(key.slice(5, 7));
    const history = baselineFor(month, Number(date.slice(0, 4)));
    const baseline = history.value;
    const activity = currentMonths.get(key);
    const currentValue = activity ? selectedMetric(activity) : fullyCoveredMonth(key) ? 0 : null;
    const anomaly = currentValue == null ? null : anomalyFor(currentValue, baseline);
    const flags = (cluster.flags || []).map(flag => flag.code).join("|");
    return [
      cluster.id,
      cluster.lat,
      cluster.lon,
      date,
      time,
      (cluster.sources || []).join("|"),
      members.length,
      cluster.sources.length,
      cluster.confidenceSummary,
      frp,
      delta,
      area,
      anomalyLabel(anomaly, history.label.startsWith("YÜKLÜ DÖNEM")),
      cluster.regime,
    ];
  });
  downloadCSV("turqua-fire-map-alarm-results.csv", [
    "cluster_id", "lat", "lon", "acq_date", "acq_time", "sensors_merged",
    "detection_count", "sensor_count", "confidence_source_values",
    "harmonized_frp_mw", "delta_t_k", "pixel_area_km2", "anomaly_status",
    "fire_regime",
  ], rows);
}

function applyPreset(name) {
  if (name === "global") {
    document.getElementById("globalMode").checked = true;
    updateQuery();
    return;
  }
  document.getElementById("globalMode").checked = false;
  const bounds = PRESETS[name];
  for (const [key, value] of Object.entries(bounds)) {
    const input = document.getElementById(key);
    input.value = value;
  }
  updateQuery();
}

function initCalendar(setLogger) {
  logger = setLogger;
  const endMonthControl = document.getElementById("endMonth");
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (endMonthControl.value > currentMonth) endMonthControl.value = currentMonth;
  for (const button of document.querySelectorAll("[data-aoi-preset]")) {
    button.addEventListener("click", () => {
      try {
        applyPreset(button.dataset.aoiPreset);
      } catch (error) {
        log(error.message, "err");
      }
    });
  }
  const drawButton = document.getElementById("drawAoi");
  drawButton.addEventListener("click", () => {
    if (cancelAoiDrawing) {
      cancelAoiDrawing();
      cancelAoiDrawing = null;
      drawButton.textContent = "DRAW AOI BOX ON GLOBE";
      updateAOI(state.bounds);
      return;
    }
    log("Select start and end corners on the globe to draw AOI box", "warn");
    drawButton.textContent = "CANCEL DRAWING";
    cancelAoiDrawing = beginAoiDrawing(bounds => {
      cancelAoiDrawing = null;
      drawButton.textContent = "DRAW AOI BOX ON GLOBE";
      if (!bounds) {
        updateAOI(state.bounds);
        log("AOI rectangle must span at least 0.1 degrees", "warn");
        return;
      }
      document.getElementById("globalMode").checked = false;
      document.getElementById("minLat").value = bounds.minLat.toFixed(2);
      document.getElementById("maxLat").value = bounds.maxLat.toFixed(2);
      document.getElementById("minLon").value = bounds.minLon.toFixed(2);
      document.getElementById("maxLon").value = bounds.maxLon.toFixed(2);
      try {
        updateQuery();
      } catch (error) {
        log(error.message, "err");
      }
    });
  });
  for (const id of ["minLat", "maxLat", "minLon", "maxLon", "startMonth", "endMonth"]) {
    document.getElementById(id).addEventListener("change", () => {
      try {
        updateQuery();
      } catch (error) {
        log(error.message, "err");
      }
    });
  }
  document.getElementById("globalMode").addEventListener("change", event => {
    if (!event.target.checked) {
      try {
        updateQuery();
      } catch (error) {
        log(error.message, "err");
      }
    }
  });
  document.getElementById("loadArchive").addEventListener("click", downloadHistoricalArchive);
  document.getElementById("stopArchive").addEventListener("click", () => archiveController?.abort());
  document.getElementById("exportResults").addEventListener("click", exportResultsCSV);
  document.getElementById("exportCalendar").addEventListener("click", exportCalendarCSV);
  document.getElementById("playbackRange").addEventListener("input", event => {
    stopPlayback();
    selectPlaybackDate(Number(event.currentTarget.value));
  });
  document.getElementById("playbackToggle").addEventListener("click", event => {
    if (playbackTimer) {
      stopPlayback();
      return;
    }
    if (playbackDates.length < 2) return;
    event.currentTarget.textContent = "DURAKLAT";
    event.currentTarget.setAttribute("aria-pressed", "true");
    advancePlayback();
    playbackTimer = setInterval(advancePlayback, 1200);
  });
  document.getElementById("activityMetric").addEventListener("change", event => {
    setActivityMetric(event.target.value);
    setMapActivityMetric(event.target.value);
    renderCalendar();
  });
  document.getElementById("colorPalette").addEventListener("change", event => {
    selectedPalette = event.target.value;
    setMapColorRamp(PALETTES[selectedPalette] || PALETTES.ylorrd);
    renderCalendar();
    updateColorbars();
  });
  document.getElementById("toggleCalendar").addEventListener("click", event => {
    calendarExpanded = !calendarExpanded;
    document.getElementById("calendarBody").hidden = !calendarExpanded;
    document.querySelector(".calendar-panel").classList.toggle("collapsed", !calendarExpanded);
    event.target.textContent = calendarExpanded ? "COLLAPSE" : "EXPAND";
    event.target.setAttribute("aria-expanded", String(calendarExpanded));
  });
  document.getElementById("toggleCalendarScope").addEventListener("click", event => {
    activeYearsOnly = !activeYearsOnly;
    event.currentTarget.setAttribute("aria-pressed", String(activeYearsOnly));
    event.currentTarget.textContent = activeYearsOnly ? "ALL YEARS" : "ACTIVE YEARS";
    renderCalendar();
  });
  window.addEventListener("resize", renderAnomalyChart);
  document.getElementById("colorPalette").dispatchEvent(new Event("change"));
  try {
    updateQuery({ redraw: false });
  } catch (error) {
    log(error.message, "err");
  }
  void refreshCalendar();
}

function updateColorbars() {
  const colors = PALETTES[selectedPalette] || PALETTES.ylorrd;
  const gradient = `linear-gradient(to right, ${colors.join(", ")})`;
  const cb = document.getElementById("colorbar");
  if (cb) cb.style.background = gradient;
  const mcb = document.getElementById("mapColorbar");
  if (mcb) mcb.style.background = gradient;
  const isFrp = document.getElementById("activityMetric")?.value === "frp";
  const mapMaximum = (state.filteredPoints || []).reduce((maximum, point) => {
    const weight = point.sensor === "MODIS" ? 1 : 0.14;
    const pixelArea = (point.scan_km || 1) * (point.track_km || 1);
    const value = isFrp ? weight * (point.frp || 0) / pixelArea : weight / pixelArea;
    return Math.max(maximum, value);
  }, 0);
  const mcbMax = document.getElementById("mapColorbarMax");
  if (mcbMax) mcbMax.textContent = fmt(mapMaximum);
}

function refreshActivityCalendar(options) {
  return refreshCalendar(options);
}

  window.__TQ.downloadHistoricalArchive = downloadHistoricalArchive;
  window.__TQ.exportCalendarCSV = exportCalendarCSV;
  window.__TQ.exportResultsCSV = exportResultsCSV;
  window.__TQ.initCalendar = initCalendar;
  window.__TQ.refreshActivityCalendar = refreshActivityCalendar;
})();

// === proof-lab.js ===
(function() {
const { map } = window.__TQ;

// TURQUA // FIRE HARMONY — Interactive Calendar Bridge, Raw/Harmonized Toggle & Solver Modal


let precomputedMonthly = null;
let currentMode = "harmonized"; // "harmonized" | "raw"

async function initProofLab() {
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

function updateSolverMath() {
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

function updateInlineProof() {}

  window.__TQ.initProofLab = initProofLab;
  window.__TQ.updateInlineProof = updateInlineProof;
  window.__TQ.updateSolverMath = updateSolverMath;
})();

// === api.js ===
(function() {
const { initProofLab, updateInlineProof, updateSolverMath } = window.__TQ;
const CASE_STUDIES_OFFLINE = window.CASE_STUDIES_OFFLINE || window.TURQUA_CASE_STUDIES_OFFLINE || window.__TQ.CASE_STUDIES_OFFLINE || {};
const { applyDataQuery, clusterProperties, exportGeoJSON, popupCluster, mergeRecords, processRecords, recluster, state, updateClusterBiome, updateAoiCriticalAlarm, updateMapAndTelemetry } = window.__TQ;
const { focusAOI, setMapLogger, setMapLayers, setMapOrbits, setMapSelectionHandler, setGibsDate, setGibsLayerMode, setTerrainEnabled, fetchIgbpLandCover, activePopup, updateAOI } = window.__TQ;
const { downloadHistoricalArchive, initCalendar, refreshActivityCalendar } = window.__TQ;


const DEFAULT_MAP_KEY = ""; // Secret removed per Rule #4




const TURKEY_BOUNDS = { minLat: 35.8, maxLat: 42.1, minLon: 25.6, maxLon: 44.8 };
const FIRMS_PRODUCTS = ["MODIS_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"];
const MAX_GLOBAL_POINTS = 5000;
const CASE_STUDIES = {
  "mediterranean-2021": {
    label: "2021 Akdeniz mega yangını",
    bounds: { minLat: 35.8, maxLat: 40.2, minLon: 25.6, maxLon: 37.0 },
    startMonth: "2021-07",
    endMonth: "2021-09",
  },
  "canakkale-hatay-2023": {
    label: "2023 Çanakkale / Hatay",
    bounds: { minLat: 35.8, maxLat: 41.5, minLon: 25.6, maxLon: 37.0 },
    startMonth: "2023-07",
    endMonth: "2023-09",
  },
  "current-2026": {
    label: "2026 güncel sezon",
    bounds: TURKEY_BOUNDS,
    startMonth: "2026-01",
    endMonth: "2026-10",
  },
  "payas-sta": {
    label: "Payas / İskenderun STA kontrolü",
    bounds: { minLat: 36.55, maxLat: 36.90, minLon: 36.10, maxLon: 36.32 },
    startMonth: "2025-01",
    endMonth: "2026-10",
  },
};
const ORBIT_SATELLITES = [
  { name: "TERRA", norad: 25994, sensor: "MODIS" },
  { name: "AQUA", norad: 27424, sensor: "MODIS" },
  { name: "SUOMI-NPP", norad: 37849, sensor: "VIIRS" },
  { name: "NOAA-20", norad: 43013, sensor: "VIIRS" },
  { name: "NOAA-21", norad: 54234, sensor: "VIIRS" },
];
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const NEWS_RSS_PROXY = "https://api.rss2json.com/v1/api.json";
const orbitFeatures = { type: "FeatureCollection", features: [] };
const tleCache = new Map();
const TLE_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const TLE_STORAGE_KEY = "turqua-celestrak-tle-cache-v1";
const FALLBACK_TLES = {
  25994: {
    line1: "1 25994U 99068A   26310.93869816  .00000294  00000+0  68704-4 0  9996",
    line2: "2 25994  97.9279 354.6965 0003352 122.9272 313.4202 14.61190472430456",
  },
  27424: {
    line1: "1 27424U 02022A   26310.93029461  .00000629  00000+0  13468-3 0  9992",
    line2: "2 27424  98.4480 283.2154 0000971 104.9472 276.8476 14.62265510304136",
  },
  37849: {
    line1: "1 37849U 11061A   26310.93258102  .00000049  00000+0  44550-4 0  9996",
    line2: "2 37849  98.8103 250.9093 0000735 294.1881  65.9218 14.19541218778692",
  },
  43013: {
    line1: "1 43013U 17073A   26310.80557179  .00000064  00000+0  51592-4 0  9998",
    line2: "2 43013  98.7912 249.0698 0000867 136.3134 223.8111 14.19535302464701",
  },
  54234: {
    line1: "1 54234U 22150A   26310.90660153  .00000025  00000+0  32726-4 0  9990",
    line2: "2 54234  98.7192 247.3576 0002444 124.1364 236.0044 14.19557144206799",
  },
};
let nextSatellitePass = null;
let orbitRefreshTimer = null;
let orbitCountdownTimer = null;
let selectedEventRevision = 0;
let lastNominatimRequest = 0;
const locationCache = new Map();

function log(message, cls = "") {
  const badge = document.getElementById("sourceStatus");
  if (!badge) return;
  badge.textContent = String(message);
  badge.className = `source-status${cls ? ` ${cls}` : ""}`;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseLine = line => {
    const cells = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === "," && !quoted) {
        cells.push(value.trim());
        value = "";
      } else {
        value += character;
      }
    }
    cells.push(value.trim());
    return cells;
  };
  const header = parseLine(lines[0]).map((name, index) =>
    (index === 0 ? name.replace(/^\uFEFF/, "") : name).toLowerCase()
  );
  return lines.slice(1).map(parseLine)
    .filter(cells => cells.length === header.length)
    .map(cells => Object.fromEntries(header.map((key, index) => [key, cells[index]])));
}

function readJSONRecords(data) {
  const records = Array.isArray(data) ? data : (data.features || data.points);
  if (!Array.isArray(records)) throw new Error("JSON içinde kayıt dizisi bulunamadı");
  return records;
}

async function loadLocalJSON() {
  log("Yerel /harmonized_fires.json okunuyor");
  try {
    const response = await fetch("harmonized_fires.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const records = readJSONRecords(await response.json());
    document.getElementById("globalMode").checked = true; state.bounds = null; updateAOI(null); const result = processRecords(records, "YEREL / JSON", { epsKm: currentEpsilon() });
    setGibsDateFromLatestData();
    selectLargestCluster();
    void refreshActivityCalendar({ focusLatestLocalMonth: true });
    log(`${result.validCount}/${records.length} geçerli tespit / ${result.displayedCount} gösteriliyor`,
      result.validCount === 0 ? "err" : result.validCount < records.length ? "warn" : "ok");
  } catch (error) {
    log(`Yerel veri yüklenemedi (${error.message}). API veya dosya kullanın.`, "warn");
  }
}

function currentEpsilon() {
  return Number(document.getElementById("epsSlider").value);
}

async function applyCaseStudy(id, { offerArchive = true } = {}) {
  const study = CASE_STUDIES[id];
  if (!study) return;
  const bounds = study.bounds;
  for (const [field, value] of Object.entries({
    minLat: bounds.minLat,
    maxLat: bounds.maxLat,
    minLon: bounds.minLon,
    maxLon: bounds.maxLon,
    startMonth: study.startMonth,
    endMonth: study.endMonth,
  })) {
    document.getElementById(field).value = String(value);
  }
  document.getElementById("globalMode").checked = false;
  applyDataQuery({
    bounds,
    startMonth: study.startMonth,
    endMonth: study.endMonth,
    epsKm: currentEpsilon(),
  });
  updateAOI(bounds);
  focusAOI(bounds);
  window.dispatchEvent(new CustomEvent("turqua:aoi-changed", { detail: { bounds } }));
  selectLargestCluster();
  void refreshActivityCalendar();

  let count = state.filteredPoints.length;
  const offlinePackage = (typeof CASE_STUDIES_OFFLINE !== "undefined" && CASE_STUDIES_OFFLINE[id]) ||
    (typeof window !== "undefined" && window.CASE_STUDIES_OFFLINE && window.CASE_STUDIES_OFFLINE[id]);

  if ((!count || count < 5) && offlinePackage && offlinePackage.length) {
    log(`${study.label.toUpperCase()}: Loading offline case package...`, "ok");
    mergeRecords(offlinePackage, `OFFLINE CASE: ${study.label}`);
    applyDataQuery({
      bounds,
      startMonth: study.startMonth,
      endMonth: study.endMonth,
      epsKm: currentEpsilon(),
    });
    count = state.filteredPoints.length;
  }

  selectLargestCluster();
  void refreshActivityCalendar();

  log(count
    ? `${study.label.toLocaleUpperCase("tr-TR")}: ${count.toLocaleString("tr-TR")} tespit 🔥`
    : `${study.label.toLocaleUpperCase("tr-TR")}: seçili dönemde yüklü veri yok`,
  count ? "ok" : "warn");
}

async function fetchProduct(product, area, key) {
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${product}/${area}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const header = text.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, "").toLowerCase();
  if (!header.split(",").some(column => column.trim().replace(/^"|"$/g, "") === "latitude")) {
    throw new Error(text.slice(0, 80).trim());
  }
  return parseCSV(text);
}

async function loadLiveFIRMS(globalMode) {
  const key = document.getElementById("mapKey").value.trim() || DEFAULT_MAP_KEY;
  if (!key) {
    document.getElementById("globalMode").checked = false;
    document.getElementById("settingsDialog").showModal();
    log("FOR LIVE DATA ENTER NASA FIRMS MAP_KEY IN SETTINGS", "warn");
    return;
  }
  const bounds = globalMode ? null : TURKEY_BOUNDS;
  const area = globalMode ? "world/1" :
    `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}/3`;
  const modeName = globalMode ? "GLOBAL" : "REGIONAL";
  const button = document.getElementById("btnLive");
  button.disabled = true;
  log(`FETCHING NASA FIRMS DATA / ${modeName}`, "warn");
  log(`FIRMS API request initiated (${modeName})`);

  const results = await Promise.all(FIRMS_PRODUCTS.map(async product => {
    try {
      const records = await fetchProduct(product, area, key);
      log(`${product}: ${records.length} records`, "ok");
      return { records: records.map(record => ({ ...record, _sensor: product })), error: null };
    } catch (error) {
      const message = `${product}: HATA - ${error.message}`;
      log(message, "err");
      return { records: [], error: message };
    }
  }));
  const records = results.flatMap(result => result.records);
  const errors = results.filter(result => result.error);
  button.disabled = false;
  if (records.length === 0) {
    log("FIRMS: No records received. Check API key and AOI bounds.", "err");
    log("FIRMS ERROR / CHECK KEY AND NETWORK", "err");
    return;
  }

  const liveMonths = records.map(record => String(record.acq_date || "").match(/^(\d{4}-\d{2})-\d{2}$/)?.[1])
    .filter(Boolean)
    .sort();
  if (liveMonths.length) {
    const startMonth = liveMonths[0];
    const endMonth = liveMonths[liveMonths.length - 1];
    document.getElementById("startMonth").value = startMonth;
    document.getElementById("endMonth").value = endMonth;
    state.startMonth = startMonth;
    state.endMonth = endMonth;
  }
  document.getElementById("globalMode").checked = globalMode;
  applyDataQuery({
    bounds,
    startMonth: state.startMonth,
    endMonth: state.endMonth,
    epsKm: currentEpsilon(),
  });
  updateAOI(bounds);
  focusAOI(bounds);
  const result = processRecords(records, `FIRMS / ${modeName}`, {
    epsKm: currentEpsilon(),
    maxPoints: globalMode ? MAX_GLOBAL_POINTS : null,
  });
  setGibsDateFromLatestData();
  selectLargestCluster();
  void refreshActivityCalendar({ focusLatestLocalMonth: true });
  const notices = [];
  if (globalMode && result.validCount > MAX_GLOBAL_POINTS) {
    notices.push(`Showing highest FRP detections (max ${MAX_GLOBAL_POINTS})`);
  }
  if (errors.length) notices.push(`${errors.length} FIRMS ürünü yüklenemedi`);
  if (!result.validCount) {
    log("FIRMS responses do not contain recognized fire points", "err");
  } else {
    const message = `${result.displayedCount} detections / ${stateClusterCount()} clusters processed`;
    log(notices.length ? `${message}; ${notices.join("; ")}` : message, notices.length ? "warn" : "ok");
  }
}

function stateClusterCount() {
  return document.getElementById("tmClusters").textContent;
}

function setGibsDateFromLatestData() {
  const latestDate = state.allPoints.reduce(
    (latest, point) => point.acq_date > latest ? point.acq_date : latest,
    "",
  );
  if (latestDate) setGibsDate(latestDate);
}

function renderFireIntelligence(intelligence) {
  const list = document.getElementById("probabilityList");
  list.replaceChildren();
  const rankedScores = intelligence?.rankedScores || [];
  const primary = rankedScores[0];
  document.getElementById("intelligenceLead").textContent = primary
    ? `${primary.relativeScore}/100 · ${primary.label}`
    : "Sınıflandırma verisi yok";
  for (const item of rankedScores) {
    const row = document.createElement("div");
    row.className = "probability-row";
    row.dataset.category = item.category || "unknown";
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("b");
    value.textContent = `${item.relativeScore}/100`;
    const bar = document.createElement("progress");
    bar.max = 100;
    bar.value = item.relativeScore;
    bar.setAttribute("aria-label", `${item.label}: göreli sezgisel skor ${item.relativeScore}/100; kalibre edilmiş olasılık değildir`);
    row.append(label, value, bar);
    list.append(row);
  }
  document.getElementById("recurrenceSummary").textContent =
    intelligence?.recurrenceLabel || "Tekerrür verisi yok";
  const months = intelligence?.recurrenceMonths || [];
  document.getElementById("recurrenceMonths").textContent =
    `Mevsimsel tekerrür (yüklü kayıtlar): ${months.join(" / ")}`;
  document.getElementById("humanFactor").textContent = intelligence
    ? `${intelligence.humanFactorScore}/99 gösterge skoru (olasılık değildir)`
    : "Hesaplanamadı";
}

function renderBiome(biome) {
  document.getElementById("eventBiome").textContent = biome
    ? `${biome.label} | ${biome.source}`
    : "Arazi sınıfı belirlenemedi";
  document.getElementById("eventFuelLoad").textContent =
    biome?.fuelLoad || "Yanıcı madde tipi belirlenemedi";
}

function classifyLandType(data) {
  const type = `${data.category || ""} ${data.type || ""} ${data.addresstype || ""} ${data.name || ""} ${data.display_name || ""}`.toLowerCase();
  const address = data.address || {};
  const addressTypes = `${address.landuse || ""} ${address.natural || ""} ${address.leisure || ""} ${address.amenity || ""} ${address.industrial || ""} ${address.man_made || ""}`.toLowerCase();
  const tags = Object.values(data.extratags || {}).join(" ");
  const value = `${type} ${addressTypes} ${tags}`.toLowerCase();
  if (/industrial|port|harbou?r|dock|refinery|plant|works|quarry|mine|liman|tersane|rafineri|sanayi/.test(value)) return "LİMAN / ENDÜSTRİYEL TESİS (OSM)";
  if (/forest|wood|national_park|nature_reserve|orman|çam|koru/.test(value)) return "ORMAN ÖRTÜSÜ (OSM)";
  if (/scrub|heath|chaparral|makilik|çalılık|maki/.test(value)) return "AKDENİZ MAKİLİĞİ (OSM)";
  if (/farmland|farm|meadow|orchard|vineyard|field|tarla|çiftlik|bağ|bahçe/.test(value)) return "TARIM ARAZİSİ (OSM)";
  if (/grass|grassland|steppe|pasture|bozkır|mera|otlak/.test(value)) return "BOZKIR / MERA (OSM)";
  if (/residential|suburb|city|town|village|yerleşim|mahalle|köy|şehir/.test(value)) return "YERLEŞİM / KENTSEL ARA YÜZ (OSM)";
  return "ARAZİ SINIFI DOĞRULANAMADI";
}

function updateSelectedBiome(clusterId, context, revision) {
  if (revision !== selectedEventRevision || clusterId == null) return null;
  const cluster = updateClusterBiome(clusterId, context);
  if (!cluster) return null;
  renderBiome(cluster.biome);
  renderFireIntelligence(cluster.intelligence);
  document.getElementById("selectedRegime").textContent = cluster.regime;
  if (activePopup && activePopup.isOpen()) { activePopup.setHTML(popupCluster(cluster)); }
  return cluster;
}

async function fetchElevation(lat, lon) {
  try {
    const zoom = 12;
    const xCount = 2 ** zoom;
    const mercatorLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const latRad = mercatorLat * Math.PI / 180;
    const tileX = (lon + 180) / 360 * xCount;
    const tileY = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * xCount;
    const x = Math.max(0, Math.min(xCount - 1, Math.floor(tileX)));
    const y = Math.max(0, Math.min(xCount - 1, Math.floor(tileY)));
    const response = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`);
    if (!response.ok) throw new Error(`DEM HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("DEM pikseli için canvas context açılamadı");
    const pixelX = Math.max(0, Math.min(255, Math.floor((tileX - x) * 256)));
    const pixelY = Math.max(0, Math.min(255, Math.floor((tileY - y) * 256)));
    context.drawImage(bitmap, pixelX, pixelY, 1, 1, 0, 0, 1, 1);
    bitmap.close();
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return (red * 256 + green + blue / 256) - 32768;
  } catch (error) {
    log(`RAKIM DEM SORGUSU BAŞARISIZ: ${error.message}`, "warn");
    return null;
  }
}

async function fetchNews(regionName, date, revision) {
  const fireQuery = `"${regionName}" (yangın OR wildfire OR fire)`;
  const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  const dateQuery = eventDate && !Number.isNaN(eventDate.getTime())
    ? ` after:${new Date(eventDate.getTime() - 86400000).toISOString().slice(0, 10)} before:${new Date(eventDate.getTime() + 4 * 86400000).toISOString().slice(0, 10)}`
    : "";
  const query = `${fireQuery}${dateQuery}`;
  const searchUrl = `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=tr`;
  const link = document.getElementById("newsLink");
  link.href = searchUrl;
  const summary = document.getElementById("newsSummary");
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`;
    const response = await fetch(`${NEWS_RSS_PROXY}?rss_url=${encodeURIComponent(rssUrl)}`);
    if (!response.ok) throw new Error(`Haber RSS HTTP ${response.status}`);
    const payload = await response.json();
    if (revision !== selectedEventRevision) return;
    if (payload.status === "error") throw new Error(payload.message || "Haber RSS yanıtı hata bildirdi");
    const items = (Array.isArray(payload.items) ? payload.items : [])
      .filter(item => /yangın|alev|yanma|wildfire|wild\s*fire|fire|burn/i.test(
        `${item.title || ""} ${item.description || ""}`,
      ))
      .slice(0, 3);
    summary.textContent = items.length
      ? `Aday başlıklar (resmî doğrulama değildir): ${items.map(item => item.title).join(" | ")}`
      : "Bu tarih aralığında yangınla ilgili aday başlık bulunamadı; bu, olay/haber olmadığı anlamına gelmez.";
  } catch (error) {
    if (revision === selectedEventRevision) {
      summary.textContent = `Haber taraması başarısız (${error.message}); Google News arama bağlantısını kullanın.`;
    }
  }
}

async function resolveEventLocation(properties, revision) {
  const lat = Number(properties.lat);
  const lon = Number(properties.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const coordinates = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  document.getElementById("eventLocation").textContent = `OSM konum sorgusu: ${coordinates}`;
  document.getElementById("eventElevation").textContent = "Rakım: DEM sorgulanıyor";
  const cached = locationCache.get(coordinates);
  let place;
  if (cached) {
    place = cached;
  } else {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequest));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastNominatimRequest = Date.now();
    try {
      const url = `${NOMINATIM_ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&extratags=1&namedetails=1`;
      const response = await fetch(url, { headers: { "Accept-Language": "tr,en" } });
      if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
      const data = await response.json();
      const address = data.address || {};
      const locality = address.city || address.town || address.village ||
        address.municipality || address.county || address.state || "Yer adı bulunamadı";
      const stateName = address.state && address.state !== locality ? `, ${address.state}` : "";
      place = {
        regionName: `${locality}${stateName}`,
        terrain: classifyLandType(data),
        osmData: data,
      };
      locationCache.set(coordinates, place);
    } catch {
      place = {
        regionName: "Konum servisine erişilemedi",
        terrain: "ARAZİ SINIFI DOĞRULANAMADI",
        osmData: null,
      };
    }
  }
  if (revision !== selectedEventRevision) return;
  const initialBiome = updateSelectedBiome(properties.cluster_id, {
    osmData: place.osmData,
  }, revision);
  if (initialBiome) place.terrain = initialBiome.biome.label;
  const [elevation, landCover] = await Promise.all([
    fetchElevation(lat, lon),
    fetchIgbpLandCover(lat, lon).catch(error => {
      if (revision === selectedEventRevision) {
        log(`NASA GIBS IGBP örneği alınamadı: ${error.message}`, "warn");
      }
      return null;
    }),
  ]);
  if (revision !== selectedEventRevision) return;
  const refinedBiome = updateSelectedBiome(properties.cluster_id, {
    osmData: place.osmData,
    elevationM: elevation,
    igbpClass: landCover?.classCode,
  }, revision);
  if (refinedBiome) place.terrain = refinedBiome.biome.label;
  document.getElementById("eventLocation").textContent =
    `${place.regionName} | ${place.terrain} | ${coordinates}`;
  document.getElementById("eventElevation").textContent = elevation == null
    ? "Rakım: DEM değeri alınamadı"
    : `Rakım: ${Math.round(elevation).toLocaleString("tr-TR")} m (Terrarium DEM)`;
  await fetchNews(place.regionName, String(properties.acq_date || "").slice(0, 10), revision);
}

function showSelectedEvent(properties, { fromMap = false } = {}) {
  const panel = document.getElementById("selectedEvent");
  panel.hidden = false;
  document.getElementById("selectedRegime").textContent =
    properties.regime || "KARIŞIK / SINIFLANDIRILMAMIŞ";
  document.getElementById("selectedSensors").textContent =
    `${properties.modis_count ?? 0} / ${properties.viirs_count ?? 0}`;
  document.getElementById("selectedConfidence").textContent =
    properties.confidence_summary || "Kaynak confidence alanı yok";
  const bowTieExpansion = Number(properties.bow_tie_expansion);
  document.getElementById("selectedBowTie").textContent =
    Number.isFinite(bowTieExpansion) ? `${bowTieExpansion.toFixed(2)}× Nadir` : "VERİ YOK";
  const frp = Number(properties.cluster_frp);
  const deltaT = Number(properties.cluster_delta_t);
  document.getElementById("selectedThermal").textContent =
    `${Number.isFinite(frp) ? frp.toFixed(1) : "VERİ YOK"} MW / ${Number.isFinite(deltaT) ? deltaT.toFixed(1) : "VERİ YOK"} K`;
  const biomassRate = Number(properties.biomass_burn_rate_kg_s);
  const coEmission = Number(properties.co_emission_g_s);
  document.getElementById("selectedEmissions").textContent =
    `${Number.isFinite(biomassRate) ? biomassRate.toFixed(2) : "VERİ YOK"} kg/s biyokütle / ${Number.isFinite(coEmission) ? coEmission.toFixed(1) : "VERİ YOK"} g/s CO`;
  const intelligence = properties.fire_intelligence;
  renderFireIntelligence(intelligence);
  renderBiome(properties.biome || intelligence?.biome);
  const currentDate = properties.acq_date || state.clusters.find(cluster =>
    cluster.id === properties.cluster_id
  )?.members[0]?.acq_date || "";
  if (fromMap && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
    setGibsDate(currentDate);
  }
  document.getElementById("fieldValidation").textContent =
    `NASA FIRMS DETECTED (${currentDate || "tarih yok"}) / REPORTED: bu uygulamada resmi ihbar eşlemesi yok.`;
  document.getElementById("eventLocation").textContent = "OSM konum sorgusu bekleniyor";
  document.getElementById("eventElevation").textContent = "Rakım: DEM sorgulanıyor";
  document.getElementById("newsSummary").textContent = "Bölge haberleri sorgulanıyor";
  const revision = ++selectedEventRevision;
  updateInlineProof(properties); void resolveEventLocation({ ...properties, acq_date: currentDate }, revision);
}

function selectLargestCluster() {
  const cluster = [...state.clusters].sort((a, b) =>
    b.members.length - a.members.length || b.harmonizedFrp - a.harmonizedFrp
  )[0];
  if (cluster) {
    showSelectedEvent(clusterProperties(cluster));
  } else {
    document.getElementById("selectedEvent").hidden = true;
    selectedEventRevision++;
  }
}

function tleEpochDate(line1) {
  const yearPart = Number(line1.slice(18, 20));
  const dayOfYear = Number(line1.slice(20, 32));
  if (!Number.isFinite(yearPart) || !Number.isFinite(dayOfYear)) return null;
  const year = yearPart < 57 ? 2000 + yearPart : 1900 + yearPart;
  return new Date(Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000);
}

function readCachedTLE(norad) {
  try {
    const stored = JSON.parse(localStorage.getItem(TLE_STORAGE_KEY) || "{}");
    const entry = stored[norad];
    if (!entry || typeof entry.line1 !== "string" || typeof entry.line2 !== "string" ||
      !entry.line1.startsWith("1 ") || !entry.line2.startsWith("2 ") ||
      Number(entry.line1.slice(2, 7)) !== norad ||
      Number(entry.line2.slice(2, 7)) !== norad) return null;
    const epoch = tleEpochDate(entry.line1);
    if (!epoch || Number.isNaN(epoch.getTime())) return null;
    return { ...entry, epoch, source: "ÖNBELLEK TLE" };
  } catch (error) {
    log(`TLE ÖNBELLEĞİ OKUNAMADI: ${error.message}`, "warn");
    return null;
  }
}

function persistTLE(tle, norad) {
  try {
    const stored = JSON.parse(localStorage.getItem(TLE_STORAGE_KEY) || "{}");
    stored[norad] = {
      name: tle.name,
      line1: tle.line1,
      line2: tle.line2,
      fetchedAt: tle.fetchedAt,
    };
    localStorage.setItem(TLE_STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    log(`TLE ÇEVRİMDIŞI ÖNBELLEĞE YAZILAMADI: ${error.message}`, "warn");
  }
}

async function getTLE(satelliteInfo) {
  const cached = tleCache.get(satelliteInfo.norad);
  if (cached && Date.now() - cached.fetchedAt < TLE_CACHE_TTL_MS) return cached;

  const fallback = FALLBACK_TLES[satelliteInfo.norad];
  const offlineFallback = cached || readCachedTLE(satelliteInfo.norad) || (fallback ? {
    ...fallback,
    name: satelliteInfo.name,
    epoch: tleEpochDate(fallback.line1),
    fetchedAt: Date.now(),
    source: "GÖMÜLÜ YEDEK TLE",
  } : null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satelliteInfo.norad}&FORMAT=tle`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`CelesTrak HTTP ${response.status}`);
    const lines = (await response.text()).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const line1 = lines.find(line => line.startsWith("1 "));
    const line2 = lines.find(line => line.startsWith("2 "));
    if (!line1 || !line2) throw new Error("TLE yanıtı beklenen biçimde değil");
    if (Number(line1.slice(2, 7)) !== satelliteInfo.norad ||
      Number(line2.slice(2, 7)) !== satelliteInfo.norad) {
      throw new Error("TLE yanıtındaki NORAD kimliği eşleşmiyor");
    }
    const epoch = tleEpochDate(line1);
    if (!epoch || Number.isNaN(epoch.getTime())) throw new Error("TLE epoch tarihi okunamadı");
    const tle = {
      name: satelliteInfo.name,
      line1,
      line2,
      epoch,
      fetchedAt: Date.now(),
      source: "CELESTRAK",
    };
    tleCache.set(satelliteInfo.norad, tle);
    persistTLE(tle, satelliteInfo.norad);
    return tle;
  } catch (error) {
    if (offlineFallback) {
      return {
        ...offlineFallback,
        name: satelliteInfo.name,
        source: offlineFallback.source || "ÖNBELLEK TLE",
      };
    }
    throw new Error(`CelesTrak verisi alınamadı ve kullanılabilir TLE önbelleği yok: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function propagatedPosition(satelliteLibrary, satrec, date) {
  const propagated = satelliteLibrary.propagate(satrec, date);
  if (!propagated?.position) return null;
  const geodetic = satelliteLibrary.eciToGeodetic(
    propagated.position,
    satelliteLibrary.gstime(date),
  );
  const latitude = geodetic.latitude * 180 / Math.PI;
  const longitude = ((geodetic.longitude * 180 / Math.PI + 540) % 360) - 180;
  return { lat: latitude, lon: longitude };
}

function insideBounds(position, bounds) {
  return position && position.lat >= bounds.minLat && position.lat <= bounds.maxLat &&
    position.lon >= bounds.minLon && position.lon <= bounds.maxLon;
}

function orbitLine(satelliteLibrary, satrec, from, sampleCount = 61, stepMs = 120000) {
  const coordinates = [];
  for (let index = 0; index < sampleCount; index++) {
    const position = propagatedPosition(
      satelliteLibrary,
      satrec,
      new Date(from.getTime() + index * stepMs),
    );
    if (position) coordinates.push([position.lon, position.lat]);
  }
  return coordinates.length > 1 ? coordinates : null;
}

function nextAoiCrossing(satelliteLibrary, satrec, now, bounds) {
  const stepMs = 30000;
  const horizonMs = 72 * 60 * 60 * 1000;
  for (let offset = 0; offset <= horizonMs; offset += stepMs) {
    const at = new Date(now.getTime() + offset);
    if (insideBounds(propagatedPosition(satelliteLibrary, satrec, at), bounds)) return at;
  }
  return null;
}

function updatePassCountdown() {
  const badge = document.getElementById("passStatus");
  if (!badge || !nextSatellitePass) return;
  const remaining = Math.max(0, nextSatellitePass.at.getTime() - Date.now());
  const minutes = Math.ceil(remaining / 60000);
  const cachedLabel = nextSatellitePass.source === "CELESTRAK" ? "" : " · CACHED TLE";
  badge.textContent = `NEXT PASS: ${nextSatellitePass.name} (${minutes} min)${cachedLabel}`;
  badge.title = `Calculated AOI pass: ${nextSatellitePass.at.toISOString()} — ${nextSatellitePass.source}; SGP4 TLE orbital model`;
}

async function refreshSatelliteTelemetry() {
  const badge = document.getElementById("passStatus");
  const satelliteLibrary = globalThis.satellite;
  if (!satelliteLibrary?.twoline2satrec) {
    if (badge) badge.textContent = "ORBIT PASS: SGP4 SATELLITE.JS UNAVAILABLE";
    log("SATELLITE TELEMETRY: satellite.js unavailable", "warn");
    return;
  }

  if (badge) badge.textContent = "ORBIT PASS: FETCHING TLE DATA";
  const bounds = state.bounds || TURKEY_BOUNDS;
  const now = new Date();
  const results = await Promise.allSettled(ORBIT_SATELLITES.map(async satelliteInfo => {
    const tle = await getTLE(satelliteInfo);
    const satrec = satelliteLibrary.twoline2satrec(tle.line1, tle.line2);
    const crossing = nextAoiCrossing(satelliteLibrary, satrec, now, bounds);
    return {
      name: satelliteInfo.name,
      tle,
      crossing,
      coordinates: orbitLine(satelliteLibrary, satrec, now),
      source: tle.source,
    };
  }));
  const satellites = results
    .filter(result => result.status === "fulfilled")
    .map(result => result.value);
  const failures = results.filter(result => result.status === "rejected");
  orbitFeatures.features = satellites
    .filter(item => item.coordinates)
    .map(item => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: item.coordinates },
      properties: {
        satellite: item.name,
        tle_source: item.source,
        tle_epoch: item.tle.epoch.toISOString(),
      },
    }));
  setMapOrbits(orbitFeatures, document.getElementById("orbitToggle").checked);

  const passes = satellites.filter(item => item.crossing).sort((a, b) =>
    a.crossing - b.crossing
  );
  nextSatellitePass = passes.length
    ? { name: passes[0].name, at: passes[0].crossing, source: passes[0].source }
    : null;
  if (nextSatellitePass) {
    updatePassCountdown();
  } else if (failures.length === ORBIT_SATELLITES.length) {
    if (badge) badge.textContent = "ORBIT PASS: TLE / CACHE UNAVAILABLE";
  } else {
    if (badge) badge.textContent = "NO PASS IN NEXT 72H";
  }

  const staleTles = satellites.filter(item =>
    now.getTime() - item.tle.epoch.getTime() > 14 * 86400000
  );
  const warnings = [];
  if (failures.length) warnings.push(`${failures.length} satellite TLEs unavailable`);
  if (staleTles.length) warnings.push(`${staleTles.length} TLEs older than 14 days`);
  const cachedTles = satellites.filter(item => item.tle.source !== "CELESTRAK");
  if (cachedTles.length) warnings.push(`${cachedTles.length} orbits calculated from cached reference TLE`);
  if (warnings.length) {
    badge.title = warnings.join("; ");
    log(`UYDU TELEMETRİSİ: ${warnings.join("; ")}`, "warn");
  }
}

function startSatelliteTelemetry() {
  void refreshSatelliteTelemetry();
  if (orbitRefreshTimer) clearInterval(orbitRefreshTimer);
  if (orbitCountdownTimer) clearInterval(orbitCountdownTimer);
  orbitRefreshTimer = setInterval(() => void refreshSatelliteTelemetry(), 15 * 60 * 1000);
  orbitCountdownTimer = setInterval(updatePassCountdown, 10000);
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const isJSON = file.name.toLowerCase().endsWith(".json");
      const records = isJSON ? readJSONRecords(JSON.parse(event.target.result)) : parseCSV(event.target.result);
      const result = processRecords(records, `DOSYA: ${file.name.slice(0, 20)}`, {
        epsKm: currentEpsilon(),
      });
      setGibsDateFromLatestData();
      selectLargestCluster();
      void refreshActivityCalendar({ focusLatestLocalMonth: true });
      log(`Dosya: ${result.validCount}/${records.length} geçerli tespit`,
        result.validCount === 0 ? "err" : result.validCount < records.length ? "warn" : "ok");
    } catch (error) {
      log(`Dosya hatası: ${error.message}`, "err");
    }
  };
  reader.onerror = () => log(`Dosya okunamadı: ${file.name}`, "err");
  reader.readAsText(file);
}

function chooseLiveMode() {
  const dialog = document.getElementById("liveModeDialog");
  dialog.returnValue = "";
  dialog.showModal();
}

document.getElementById("btnLocal").addEventListener("click", loadLocalJSON);
document.getElementById("btnLive").addEventListener("click", chooseLiveMode);
document.querySelectorAll("[data-case-study]").forEach(button => {
  button.addEventListener("click", () => applyCaseStudy(button.dataset.caseStudy));
});
document.getElementById("fileInput").addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) loadFile(file);
  event.target.value = "";
});

document.getElementById("liveModeDialog").addEventListener("click", event => {
  const button = event.target.closest("[data-live-mode]");
  if (!button) return;
  const globalMode = button.dataset.liveMode === "global";
  document.getElementById("globalMode").checked = globalMode;
  event.currentTarget.returnValue = "selected";
  document.getElementById("liveModeDialog").close();
  loadLiveFIRMS(globalMode);
});
document.getElementById("liveModeDialog").addEventListener("close", () => {
  if (document.getElementById("liveModeDialog").returnValue === "selected") return;
  if (!document.getElementById("globalMode").checked) return;
  document.getElementById("globalMode").checked = false;
});
document.getElementById("globalMode").addEventListener("change", event => {
  if (event.target.checked) {
    chooseLiveMode();
  }
});

document.getElementById("saveKey").addEventListener("click", () => {
  const key = document.getElementById("mapKey").value.trim() || DEFAULT_MAP_KEY;
  try {
    if (key) sessionStorage.setItem("turqua_firms_map_key", key);
    else sessionStorage.removeItem("turqua_firms_map_key");
    log(key ? "FIRMS KEY READY FOR THIS SESSION" : "API KEY EMPTY", key ? "ok" : "warn");
  } catch (error) {
    log(`FIRMS ANAHTARI OTURUMDA SAKLANAMADI: ${error.message}`, "err");
  }
});
document.getElementById("settingsButton").addEventListener("click", () =>
  document.getElementById("settingsDialog").showModal()
);
document.getElementById("settingsLive").addEventListener("click", () => {
  document.getElementById("settingsDialog").close();
  chooseLiveMode();
});
document.getElementById("toggleAoi").addEventListener("click", event => {
  const panel = document.querySelector(".hud-tl");
  const expanded = panel.classList.toggle("drawer-hidden");
  event.currentTarget.setAttribute("aria-expanded", String(!expanded));
  if (!expanded && window.matchMedia("(max-width: 760px)").matches) {
    document.querySelector(".telemetry").classList.add("drawer-hidden");
    document.getElementById("toggleTelemetry").setAttribute("aria-expanded", "false");
  }
});
document.getElementById("toggleTelemetry").addEventListener("click", event => {
  const panel = document.querySelector(".telemetry");
  const expanded = panel.classList.toggle("drawer-hidden");
  event.currentTarget.setAttribute("aria-expanded", String(!expanded));
  if (!expanded && window.matchMedia("(max-width: 760px)").matches) {
    document.querySelector(".hud-tl").classList.add("drawer-hidden");
    document.getElementById("toggleAoi").setAttribute("aria-expanded", "false");
  }
});
document.getElementById("closeTelemetry").addEventListener("click", () => {
  document.querySelector(".telemetry").classList.add("drawer-hidden");
  document.getElementById("toggleTelemetry").setAttribute("aria-expanded", "false");
});
document.getElementById("openLegal").addEventListener("click", () =>
  document.getElementById("legalDialog").showModal()
);
document.getElementById("dTSlider").addEventListener("input", event => {
  document.getElementById("dTVal").textContent = `${event.target.value} K`;
  updateFilters();
});
document.getElementById("epsSlider").addEventListener("input", event => {
  const epsilon = Number(event.target.value);
  document.getElementById("epsVal").textContent = `${epsilon.toFixed(1)} km`;
  recluster(epsilon);
});
document.getElementById("epsSlider").addEventListener("change", selectLargestCluster);

function updateFilters() {
  updateMapAndTelemetry();
}

const layerControlIds = [
  "layerMODIS", "layerVIIRS", "layerClusters", "layerFootprints", "layerDensity",
  "layerLandCover", "layerTimeAge",
];
for (const id of layerControlIds) {
  document.getElementById(id).addEventListener("change", () => {
    setMapLayers({
      showMODIS: document.getElementById("layerMODIS").checked,
      showVIIRS: document.getElementById("layerVIIRS").checked,
      showClusters: document.getElementById("layerClusters").checked,
      showFootprints: document.getElementById("layerFootprints").checked,
      showDensity: document.getElementById("layerDensity").checked,
      showLandCover: document.getElementById("layerLandCover").checked,
      showTimeAge: document.getElementById("layerTimeAge").checked,
    });
  });
}

let terrainEnabled = false;
document.getElementById("terrainToggle").addEventListener("click", event => {
  terrainEnabled = !terrainEnabled;
  setTerrainEnabled(terrainEnabled);
  event.currentTarget.textContent =
    `3D TERRAIN / ELEVATION: ${terrainEnabled ? "ON" : "OFF"}`;
  if (terrainEnabled) log("3D TERRAIN ENABLED / TERRARIUM DEM", "ok");
});
document.getElementById("orbitToggle").addEventListener("change", event => {
  setMapOrbits(orbitFeatures, event.currentTarget.checked);
});
document.getElementById("exportGeoJSON").addEventListener("click", exportGeoJSON);
document.getElementById("gibsLayerMode").addEventListener("change", event => {
  setGibsLayerMode(event.currentTarget.value);
});
document.getElementById("gibsDate").addEventListener("change", event => {
  try {
    setGibsDate(event.currentTarget.value);
  } catch (error) {
    log(`GIBS TARİHİ GEÇERSİZ: ${error.message}`, "err");
  }
});
window.addEventListener("turqua:anomaly-updated", updateAoiCriticalAlarm);
window.addEventListener("turqua:aoi-changed", () => {
  selectLargestCluster();
  void refreshSatelliteTelemetry();
});
setInterval(() => {
  if (document.getElementById("layerTimeAge").checked) updateMapAndTelemetry();
}, 60 * 1000);

setMapLogger(log);
setMapSelectionHandler(showSelectedEvent);
log("TURQUA FIRE MAP ALARM / NASA FIRMS HAZIR", "ok");
try {
  document.getElementById("mapKey").value = sessionStorage.getItem("turqua_firms_map_key") || DEFAULT_MAP_KEY;
} catch (error) {
  log(`FIRMS ANAHTARI OTURUMDAN OKUNAMADI: ${error.message}`, "warn");
}
initCalendar(log);
loadLocalJSON();
startSatelliteTelemetry();

const mobileDrawerQuery = window.matchMedia("(max-width: 760px)");
if (mobileDrawerQuery.matches) {
  document.querySelector(".telemetry").classList.add("drawer-hidden");
  document.getElementById("toggleTelemetry").setAttribute("aria-expanded", "false");
}
mobileDrawerQuery.addEventListener("change", event => {
  const telemetry = document.querySelector(".telemetry");
  telemetry.classList.toggle("drawer-hidden", event.matches);
  document.querySelector(".hud-tl").classList.remove("drawer-hidden");
  document.getElementById("toggleAoi").setAttribute("aria-expanded", "true");
  document.getElementById("toggleTelemetry").setAttribute("aria-expanded", String(!event.matches));
});

initProofLab();

})();
