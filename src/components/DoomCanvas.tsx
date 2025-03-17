import React, { useEffect, useRef, useState } from 'react';
import type { Wad } from '../interfaces/Wad';
import { drawMap } from '../render/drawMap';
import { renderGame } from '../render/renderGame';
import { loadWadFromBlob } from '../wad/loadWadFromBlob';

export const DoomCanvas: React.FC = () => {
    const wadSelectRef = useRef<HTMLSelectElement>(null);
    const mapSelectRef = useRef<HTMLSelectElement>(null);
    const mapCanvasRef = useRef<HTMLCanvasElement>(null);
    const gameCanvasRef = useRef<HTMLCanvasElement>(null);

    const [wad, setWad] = useState<Wad | null>(null);
    const [game, setGame] = useState<any>(null);

    useEffect(() => {
        if (gameCanvasRef.current && !game) {
            const g = renderGame(gameCanvasRef.current);
            setGame(g);
        }
    }, [game]);

    const loadWad = async (wadPath: string) => {
        const result = await fetch(wadPath);
        const wadData = loadWadFromBlob(await result.arrayBuffer());
        setWad(wadData);
        loadMapList(wadData);
    };

    const loadMapList = (wadData: Wad) => {
        if (!mapSelectRef.current) return;

        const mapNames = Object.keys(wadData.maps);
        mapSelectRef.current.innerHTML = "";
        mapNames.forEach((mapName) => {
            const option = document.createElement('option');
            option.value = mapName;
            option.innerText = mapName;
            mapSelectRef.current?.appendChild(option);
        });

        mapSelectRef.current.value = mapNames[0];
        loadMap(mapNames[0], wadData);
    };

    const loadMap = (mapName: string, wadData: Wad) => {
        if (!mapCanvasRef.current || !game) return;
        const map = wadData.maps[mapName];
        drawMap(mapCanvasRef.current, map);
        game.loadWad(wadData, map);
    };

    return (
        <>
            <div style={{ marginBottom: '1rem' }}>
                <label>Select WAD: </label>
                <select
                    ref={wadSelectRef}
                    onChange={(e) => loadWad(e.target.value)}
                    defaultValue=""
                >
                    <option value="" disabled>Select a wad</option>
                    <option value="/wads/DOOM1.WAD">DOOM1</option>
                    <option value="/wads/DOOM2.WAD">DOOM2</option>
                </select>
            </div>

            {wad && (
                <div style={{ marginBottom: '1rem' }}>
                    <label>Select Map: </label>
                    <select
                        ref={mapSelectRef}
                        onChange={(e) => loadMap(e.target.value, wad)}
                    />
                </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
                <canvas
                    ref={mapCanvasRef}
                    width="400"
                    height="400"
                    style={{ border: '1px solid black' }}
                />
                <canvas
                    ref={gameCanvasRef}
                    width="640"
                    height="480"
                    style={{ border: '1px solid black' }}
                />
            </div>
        </>
    );
};