// Debug normalise function (updated to match reportService.js)
function normalise(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    // Remove punctuation EXCEPT dots between digits (e.g. '1.5' stays, 'Pvt.' → 'Pvt')
    .replace(/(?<!\d)\.(?!\d)/g, '')
    .replace(/[;,:!?()\/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d)\s+(g|kg|ml|l|gm|gms|ltr|ltrs|cm|mm)\b/g, '$1$2')
    .replace(/gms?\b/g, 'g')
    .replace(/mls?\b/g, 'ml')
    .replace(/ltrs?\b/g, 'l');
}

console.log('--- Results ---');
console.log('normalise("250 gms"):', JSON.stringify(normalise('250 gms')));
console.log('normalise("1.5 ltrs"):', JSON.stringify(normalise('1.5 ltrs')));
console.log('normalise("500 g"):', JSON.stringify(normalise('500 g')));
console.log('normalise("100 ml"):', JSON.stringify(normalise('100 ml')));
console.log('normalise("Pvt. Ltd."):', JSON.stringify(normalise('Pvt. Ltd.')));
console.log('normalise("Mumbai 400057"):', JSON.stringify(normalise('Mumbai 400057')));
