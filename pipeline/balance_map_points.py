import json, os, math

path = "harmonized_fires.json"
backup = "harmonized_fires_backup.json"
if os.path.exists(path):
    if not os.path.exists(backup):
        with open(path, "r", encoding="utf-8") as f:
            raw_data = f.read()
        with open(backup, "w", encoding="utf-8") as f:
            f.write(raw_data)

    with open(backup, "r", encoding="utf-8") as f:
        data = json.load(f)

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

    # Turkiye icindeki 800 noktayi 0.35 derece (~35 km) uzaysal izgarada en yuksek FRP'li 140 ana odaga indirge
    # Boylece Turkiye haritada dikdortgen bir leke gibi degil, dogal yangin odaklari olarak gorunur
    def get_frp(rec):
        p = rec.get("properties", rec) if isinstance(rec, dict) else {}
        return float(p.get("frp", p.get("frp_mw", 0)) or 0)

    tr_sorted = sorted(tr_pts, key=get_frp, reverse=True)
    occupied = set()
    tr_balanced = []
    for r in tr_sorted:
        p = r.get("properties", r) if isinstance(r, dict) else {}
        lat = float(p.get("latitude", p.get("lat", 0)) or 0)
        lon = float(p.get("longitude", p.get("lon", 0)) or 0)
        cell = (round(lat / 0.35), round(lon / 0.35))
        if cell not in occupied or len(tr_balanced) < 90:
            occupied.add(cell)
            tr_balanced.append(r)
        if len(tr_balanced) >= 135:
            break

    balanced = global_pts + tr_balanced
    with open(path, "w", encoding="utf-8") as f:
        json.dump(balanced, f, ensure_ascii=False)
    print(f"[DENGELEME OK] Turkiye dikdortgen yigilmasi giderildi: {len(tr_pts)} -> {len(tr_balanced)} secili odak (+ {len(global_pts)} kuresel nokta).")
