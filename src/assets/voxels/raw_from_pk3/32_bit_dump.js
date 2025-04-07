files.forEach((file) => {
  if (path.extname(file).toLowerCase() !== '.kvx') return;

  const inputPath = path.join(inputDir, file);
  const rawData = fs.readFileSync(inputPath);
  const kvxData = rawData.slice(16);

  const hexDump = Array.from(kvxData.slice(0, 32))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');

  console.log(`🔍 ${file} hex dump: ${hexDump}`);
});
