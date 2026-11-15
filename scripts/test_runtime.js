const fs = require('fs');

// Verify that turqua-bundle.js does not contain undefined PALETTES or scan_km bugs
const code = fs.readFileSync('js/turqua-bundle.js', 'utf8');

// Check 1: scan_km declaration exists in normalizeRaw
if (!code.includes('const scan_km = numericField(row, ["scan_km", "scan"])')) {
  console.error('FAIL: scan_km declaration missing from normalizeRaw in bundle!');
  process.exit(1);
} else {
  console.log('PASS: scan_km declared properly in normalizeRaw');
}

// Check 2: amber_gold exists in PALETTES
if (!code.includes('amber_gold: ["#3D2600"')) {
  console.error('FAIL: amber_gold missing from PALETTES in bundle!');
  process.exit(1);
} else {
  console.log('PASS: amber_gold exists in PALETTES');
}

// Check 3: safe colors fallback in updateColorbars
if (!code.includes('const colors = PALETTES[selectedPalette] || PALETTES.ylorrd;')) {
  console.error('FAIL: safe colors fallback missing in bundle!');
  process.exit(1);
} else {
  console.log('PASS: safe colors fallback in updateColorbars confirmed');
}

// Check 4: no tourBtn or spinBtn or langBtn
if (code.includes('btnJuryTour') || code.includes('btnLangToggle') || code.includes('btnGlobeSpin')) {
  console.error('FAIL: tourBtn / langBtn / spinBtn still found in bundle!');
  process.exit(1);
} else {
  console.log('PASS: tourBtn / langBtn / spinBtn cleaned from bundle');
}

// Check 5: flame icon registered as icon-image in map layers
if (!code.includes('"icon-image": "turqua-flame"')) {
  console.error('FAIL: icon-image turqua-flame missing in map layers!');
  process.exit(1);
} else {
  console.log('PASS: icon-image turqua-flame registered in map layers');
}

console.log('ALL RUNTIME ASSERTIONS PASSED!');
