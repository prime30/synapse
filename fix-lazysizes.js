const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'theme-workspace', 'assets', 'lazysizes.min.js');
let content = fs.readFileSync(filePath, 'utf8');

const beforeCount = (content.match(/new URLSearchParams/g) || []).length;
console.log('URLSearchParams occurrences before:', beforeCount);

// Fix 1: bgset handler
const bgsetOld = 'a="1"!=new URLSearchParams(n).get("width")';
const bgsetNew = 'a="1"!=new URLSearchParams((n||"").split("?")[1]||"").get("width")';

if (content.includes(bgsetOld)) {
  content = content.replace(bgsetOld, bgsetNew);
  console.log('Fixed bgset URLSearchParams');
} else {
  console.log('WARNING: bgset pattern not found');
}

// Fix 2: rias b() function
const riasOld = 'return"1"!=new URLSearchParams(t).get("width")?';
const riasNew = 'return"1"!=new URLSearchParams((t||"").split("?")[1]||"").get("width")?';

if (content.includes(riasOld)) {
  content = content.replace(riasOld, riasNew);
  console.log('Fixed rias URLSearchParams');
} else {
  console.log('WARNING: rias pattern not found');
}

const afterCount = (content.match(/new URLSearchParams/g) || []).length;
console.log('URLSearchParams occurrences after:', afterCount);

fs.writeFileSync(filePath, content, 'utf8');
console.log('File saved successfully');
