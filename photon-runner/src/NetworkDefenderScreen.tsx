import React, { useEffect, useRef, useState } from 'react';
import { startNetworkDefender } from './networkDefenderRun';

export function NetworkDefenderScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Click threats before they reach your servers on the left.');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startNetworkDefender(canvas, (score) => {
      setStatus(`Game over — score ${score}.`);
    });
  }, []);

  return (
    <div className="min-h-full px-4 py-6 max-w-3xl mx-auto space-y-4 text-center">
      <h1 className="text-2xl font-bold text-white">Network Defender</h1>
      <p className="text-slate-400 text-sm font-mono">{status}</p>
      <canvas ref={canvasRef} className="border border-slate-800 rounded-xl max-w-full mx-auto touch-none" />
    </div>
  );
}
