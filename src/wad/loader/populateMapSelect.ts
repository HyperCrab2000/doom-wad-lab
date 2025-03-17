import { Wad } from '@/parser/interfaces/Wad';

export function populateMapSelect(
  mapSelectEl: HTMLSelectElement,
  wad: Wad,
  onSelect: (mapName: string) => void
) {
  const mapNames = Object.keys(wad.maps);
  mapSelectEl.innerHTML = '';
  mapNames.forEach((mapName) => {
    const option = document.createElement('option');
    option.value = mapName;
    option.innerText = mapName;
    mapSelectEl.appendChild(option);
  });

  // Select the first map by default
  if (mapNames[0]) {
    mapSelectEl.value = mapNames[0];
    onSelect(mapNames[0]);
  }
}
