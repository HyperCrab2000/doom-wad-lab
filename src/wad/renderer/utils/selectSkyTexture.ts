export const selectSkyTexture = (mapName: string): string => {
  // Handle Doom 1
  if (mapName.startsWith('E1')) {
    return 'SKY1';
  } else if (mapName.startsWith('E2')) {
    return 'SKY2';
  } else if (mapName.startsWith('E3')) {
    return 'SKY3';
  } else if (mapName.startsWith('E4')) {
    return 'SKY4';
  }

  // Handle Doom II (MAP01 to MAP32)
  if (mapName.startsWith('MAP')) {
    const mapNumber = parseInt(mapName.slice(3), 10);
    if (mapNumber >= 1 && mapNumber <= 11) return 'SKY1';
    if (mapNumber >= 12 && mapNumber <= 20) return 'SKY2';
    if (mapNumber >= 21) return 'SKY3';
  }

  // Fallback
  return 'SKY1';
};
