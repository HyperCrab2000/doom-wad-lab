const fs = require('fs');
const path = require('path');

const inputDir = path.resolve(__dirname, 'raw_from_pk3');
const outputDir = path.resolve(__dirname, 'converted_kvx');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const files = fs.readdirSync(inputDir);

let validCount = 0;
let invalidCount = 0;

files.forEach(file => {
  if (path.extname(file).toLowerCase() !== '.kvx') return;

  files.forEach(file => {
    if (path.extname(file).toLowerCase() !== '.kvx') return;

    const inputPath = path.join(inputDir, file);
    const rawData = fs.readFileSync(inputPath);
    const kvxData = rawData.slice(16);

    const hexDump = Array.from(kvxData.slice(0, 32))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ');

    console.log(`🔍 ${file} hex dump: ${hexDump}`);
  });

  const inputPath = path.join(inputDir, file);
  const outputPath = path.join(outputDir, file);

  const rawData = fs.readFileSync(inputPath);

  if (rawData.length <= 16) {
    console.warn(`⚠️ Skipping ${file}, file too small`);
    return;
  }

  // Strip the first 16 bytes (Doom lump header)
  const kvxData = rawData.slice(16);

  // Validate Kvxl magic header
  const magic = kvxData.slice(0, 4).toString('ascii');
  if (magic === 'Kvxl') {
    fs.writeFileSync(outputPath, kvxData);
    console.log(`✅ Converted & validated: ${file}`);
    validCount++;
  } else {
    console.warn(`❌ Invalid KVX file after conversion: ${file} (found header "${magic}")`);
    invalidCount++;
  }
});

console.log(`\n🎉 Conversion complete!`);
console.log(`✅ Valid KVX files: ${validCount}`);
console.log(`❌ Invalid KVX files: ${invalidCount}`);