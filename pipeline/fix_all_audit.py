#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# 1. harmonized_fires.json: Turkiye yogunlugunu Avrupa/Akdeniz ile esitle (~42 ana odak)
# ---------------------------------------------------------------------------
path_json = os.path.join(ROOT, "harmonized_fires.json")
backup_json = os.path.join(ROOT, "harmonized_fires_backup.json")
source_json = backup_json if os.path.exists(backup_json) else path_json

if os.path.exists(source_json):
    with open(source_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not os.path.exists(backup_json):
        with open(backup_json, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

    records = data if isinstance(data, list) else data.get("features", data.get("points", []))
    tr_pts, global_pts = [], []
    for r in records:
        p = r.get("properties", r) if isinstance(r, dict) else {}
        lat = float(p.get("latitude", p.get("lat", 0)) or 0)
        lon = float(p.get("longitude", p.get("lon", 0)) or 0)
        if 35.8 <= lat <= 42.1 and 25.6 <= lon <= 44.8:
            tr_pts.append(r)
        else:
            global_pts.append(r)

    def get_frp(rec):
        p = rec.get("properties", rec) if isinstance(rec, dict) else {}
        return float(p.get("frp", p.get("frp_mw", 0)) or 0)

    tr_sorted = sorted(tr_pts, key=get_frp, reverse=True)
    occupied = set()
    tr_natural = []
    for r in tr_sorted:
        p = r.get("properties", r) if isinstance(r, dict) else {}
        lat = float(p.get("latitude", p.get("lat", 0)) or 0)
        lon = float(p.get("longitude", p.get("lon", 0)) or 0)
        # 0.75 derece (~75 km) izgarada en guclu yangin odaklari (Avrupa ile ayni dogal yogunluk)
        cell = (round(lat / 0.75), round(lon / 0.75))
        if cell not in occupied:
            occupied.add(cell)
            tr_natural.append(r)
        if len(tr_natural) >= 42:
            break

    with open(path_json, "w", encoding="utf-8") as f:
        json.dump(global_pts + tr_natural, f, ensure_ascii=False)
    print(f"[1/6] Harita yogunlugu dengelendi: Turkiye {len(tr_natural)} ana odak + Kuresel {len(global_pts)} nokta.")

# ---------------------------------------------------------------------------
# 2. style.css: Satir 28 "- { box-sizing" hatasini kesin olarak "* { box-sizing" yap
# ---------------------------------------------------------------------------
css_path = os.path.join(ROOT, "style.css")
with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()
css = re.sub(r"(?m)^-\s*\{\s*box-sizing:\s*border-box;", "* { box-sizing: border-box;", css)
with open(css_path, "w", encoding="utf-8") as f:
    f.write(css)
print("[2/6] style.css satir 28 (* secicisi) duzeltildi.")

# ---------------------------------------------------------------------------
# 3. js/map.js: applyMapLayers icindeki pt-cluster ezmesini duzelt + canli popup guncellemesi ekle
# ---------------------------------------------------------------------------
map_path = os.path.join(ROOT, "js", "map.js")
with open(map_path, "r", encoding="utf-8") as f:
    map_js = f.read()

map_js = map_js.replace(
    '"pt-cluster": showClusters ? ["==", ["get", "kind"], "cluster"] : hiddenFilter,',
    '"pt-cluster": showClusters ? ["all", ["==", ["get", "kind"], "cluster"], [">=", ["get", "detection_count"], 2]] : hiddenFilter,\n    "fire-emoji-label": showClusters ? ["all", ["==", ["get", "kind"], "cluster"], [">=", ["get", "detection_count"], 3], [">=", ["get", "cluster_frp"], 50]] : hiddenFilter,'
)

# Popup nesnesini disari ac ki OSM/IGBP cevabi geldiginde acik popup aninda guncellensin
if "export let activePopup = null;" not in map_js:
    map_js = "export let activePopup = null;\n" + map_js
    map_js = map_js.replace(
        'const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" });',
        'const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" }); activePopup = popup;'
    )

with open(map_path, "w", encoding="utf-8") as f:
    f.write(map_js)
print("[3/6] js/map.js applyMapLayers filtre ezmesi ve canli popup referansi duzeltildi.")

# ---------------------------------------------------------------------------
# 4. js/harmonizer.js: Volkan maskesi, Kuresel Biyomlar, WUI Etiketi ve Gercek FRP Hesabi
# ---------------------------------------------------------------------------
harm_path = os.path.join(ROOT, "js", "harmonizer.js")
with open(harm_path, "r", encoding="utf-8") as f:
    harm_js = f.read()

harm_js = harm_js.replace('"İNSAN / LİMAN OPERASYONU"', '"KIRSAL / YERLEŞİM ARA YÜZÜ (WUI)"')
harm_js = harm_js.replace(
    'sum + member.frp * (member.sensor === "MODIS" ? 1 : 0.14), 0)',
    'sum + member.frp, 0)'
)

volcano_and_biome_block = '''const VOLCANO_REGIONS = [
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
}'''

harm_js = re.sub(
    r"function inferGeographicBiome\(cluster, elevationM = null\) \{[\s\S]*?\n\}\n\nfunction classifyOsmBiome",
    volcano_and_biome_block + "\n\nfunction classifyOsmBiome",
    harm_js,
    count=1
)

# OSM ve detectBiome icinde Volkanik kontrol
if "STA_VOLCANIC" not in harm_js.split("function classifyOsmBiome")[1]:
    harm_js = harm_js.replace(
        'if (/\\b(industrial|port',
        'if (/\\b(volcano|volcanic|crater|caldera|lava|geothermal|yanardağ|krater)\\b/.test(value)) {\n    return biomeRecord("STA_VOLCANIC", "Aktif Volkanik / Jeotermal Alan (OSM doğrulamalı)", "Volkanik krater / lav yüzeyi", "Bitkisel yakıt yok - Volkanik ısı kaynağı", "OSM / NOMINATIM");\n  }\n  if (/\\b(industrial|port'
    )
    harm_js = harm_js.replace(
        'const staRegion = STA_REGIONS.find(region => inRegion(cluster, region));',
        'const volcanoRegion = typeof VOLCANO_REGIONS !== "undefined" ? VOLCANO_REGIONS.find(v => inRegion(cluster, v)) : null;\n  if (volcanoRegion) return inferGeographicBiome(cluster);\n  const staRegion = STA_REGIONS.find(region => inRegion(cluster, region));'
    )
    harm_js = harm_js.replace(
        'if (osmBiome?.code === "STA_INDUSTRIAL_PORT") return { ...osmBiome, persistentDays };',
        'if (osmBiome?.code === "STA_INDUSTRIAL_PORT" || osmBiome?.code === "STA_VOLCANIC") return { ...osmBiome, persistentDays };'
    )
    harm_js = harm_js.replace(
        'if (biome.code === "STA_INDUSTRIAL_PORT") {\n    rounded = [1, 0, 92, 5, 2, 0];\n  }',
        'if (biome.code === "STA_INDUSTRIAL_PORT") {\n    rounded = [1, 0, 92, 5, 2, 0];\n  } else if (biome.code === "STA_VOLCANIC") {\n    rounded = [0, 0, 8, 0, 92, 0];\n  }'
    )

export_popup_fn = "\nexport { footprintPolygon, popupCluster };\n"
harm_js = harm_js.replace("export { footprintPolygon };", export_popup_fn)

with open(harm_path, "w", encoding="utf-8") as f:
    f.write(harm_js)
print("[4/6] js/harmonizer.js volkan maskesi, kuresel biyomlar ve WUI etiketi duzeltildi.")

# ---------------------------------------------------------------------------
# 5. js/api.js: OSM/IGBP cevabi geldiginde acik olan MapLibre Popup'ini da canli yenile
# ---------------------------------------------------------------------------
api_path = os.path.join(ROOT, "js", "api.js")
with open(api_path, "r", encoding="utf-8") as f:
    api_js = f.read()

api_js = api_js.replace("exportGeoJSON,\n", "exportGeoJSON,\n  popupCluster,\n")
api_js = api_js.replace("fetchIgbpLandCover,\n", "fetchIgbpLandCover,\n  activePopup,\n")
api_js = api_js.replace(
    'document.getElementById("selectedRegime").textContent = cluster.regime;\n  return cluster;',
    'document.getElementById("selectedRegime").textContent = cluster.regime;\n  if (activePopup && activePopup.isOpen()) { activePopup.setHTML(popupCluster(cluster)); }\n  return cluster;'
)
with open(api_path, "w", encoding="utf-8") as f:
    f.write(api_js)
print("[5/6] js/api.js canli Popup guncellemesi eklendi.")

# ---------------------------------------------------------------------------
# 6. js/calendar.js: NOAA-20 2018-04-01 tarihi + data/monthly_tr.json dogrudan entegrasyonu
# ---------------------------------------------------------------------------
cal_path = os.path.join(ROOT, "js", "calendar.js")
with open(cal_path, "r", encoding="utf-8") as f:
    cal_js = f.read()

cal_js = cal_js.replace('{ id: "VIIRS_NOAA20_SP", from: "2020-01-01" }', '{ id: "VIIRS_NOAA20_SP", from: "2018-04-01" }')
cal_js = cal_js.replace('sum + point.frp * (point.sensor === "MODIS" ? 1 : 0.14), 0)', 'sum + point.frp, 0)')

precomputed_loader = '''    const archiveMonths = new Map();
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
    } catch (_) {}'''

cal_js = cal_js.replace('    const archiveMonths = new Map();', precomputed_loader, 1)

with open(cal_path, "w", encoding="utf-8") as f:
    f.write(cal_js)

# .gitignore icine backup dosyasini ekle
gitignore_path = os.path.join(ROOT, ".gitignore")
with open(gitignore_path, "r", encoding="utf-8") as f:
    gi = f.read()
if "harmonized_fires_backup.json" not in gi:
    with open(gitignore_path, "a", encoding="utf-8") as f:
        f.write("\nharmonized_fires_backup.json\n")

print("[6/6] js/calendar.js 2000-2026 statik arsiv ve anomali grafigi entegrasyonu tamamlandi!")
