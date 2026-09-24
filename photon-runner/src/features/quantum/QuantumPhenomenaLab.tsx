import React from 'react';
import { Zap, RefreshCw, Layers, Sparkles, Activity, Compass, Cpu, Send, Lock } from 'lucide-react';
import { useQuantumPhenomena } from './useQuantumPhenomena';
import { EveInterceptReport, EveDossier } from './EveReports';

export function QuantumPhenomenaLab() {
  const {
    activeSceneMode,
    setActiveSceneMode,
    aliceBit,
    setAliceBit,
    aliceBasis,
    setAliceBasis,
    alicePolarization,
    setAlicePolarization,
    bobBasis,
    setBobBasis,
    isFiring,
    photonProgress,
    measuredBit,
    isMatch,
    cameraPreset,
    setCameraPreset,
    showEMWave,
    setShowEMWave,
    eveEnabled,
    setEveEnabled,
    eveReport,
    setEveReport,
    EVE_STATS_ZERO,
    eveStats,
    setEveStats,
    batchResults,
    setBatchResults,
    mountRef,
    getPolarizationLabel,
    checkBasisMatch,
    handleFirePhoton
  } = useQuantumPhenomena();

  return (
    <div className="min-h-full w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-cyan-500/40 p-5 rounded-3xl backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded-lg text-xs font-mono font-bold text-cyan-400 uppercase">
              Quantum Phenomena 3D Simulator
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs font-mono text-slate-400">BB84 Physical Hardware Protocol</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-white mt-1.5 flex items-center gap-2">
            <Sparkles className="text-yellow-400" size={24} />
            {activeSceneMode === 'scene2_polarization'
              ? 'Scene 2: Single-Photon Polarization & Superposition Lab'
              : 'Scene 3: Quantum Encoding & Measurement Logic Matrix'}
          </h1>
        </div>

        <div className="flex gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 font-mono text-xs">
          <button
            onClick={() => setActiveSceneMode('scene2_polarization')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeSceneMode === 'scene2_polarization'
                ? 'bg-cyan-600 text-slate-950 shadow-lg shadow-cyan-900/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass size={15} /> Scene 2: Polarization Lab
          </button>
          <button
            onClick={() => setActiveSceneMode('scene3_encoding')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeSceneMode === 'scene3_encoding'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cpu size={15} /> Scene 3: Encoding & Decoding
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[420px] relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          <div className="absolute top-4 left-4 flex flex-wrap gap-2 z-10">
            <button
              onClick={() => setCameraPreset('bench')}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                cameraPreset === 'bench' ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-900/80 text-slate-300 border-slate-700'
              }`}
            >
              Full Bench View
            </button>
            <button
              onClick={() => setCameraPreset('alice')}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                cameraPreset === 'alice' ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-900/80 text-slate-300 border-slate-700'
              }`}
            >
              Alice Station
            </button>
            <button
              onClick={() => setCameraPreset('bob')}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                cameraPreset === 'bob' ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-900/80 text-slate-300 border-slate-700'
              }`}
            >
              Bob Station
            </button>
            <button
              onClick={() => setCameraPreset('top')}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                cameraPreset === 'top' ? 'bg-purple-500 text-slate-950 border-purple-400' : 'bg-slate-900/80 text-slate-300 border-slate-700'
              }`}
            >
              Top View (Overhead)
            </button>
            <button
              onClick={() => setShowEMWave(!showEMWave)}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                showEMWave ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'bg-slate-900/80 text-slate-500 border-slate-800'
              }`}
            >
              {showEMWave ? 'EM Wave Vector ON' : 'EM Wave OFF'}
            </button>
            <button
              onClick={() => {
                setEveEnabled(!eveEnabled);
                setEveStats(EVE_STATS_ZERO);
                setEveReport(null);
              }}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                eveEnabled ? 'bg-rose-500/20 text-rose-300 border-rose-500/50' : 'bg-slate-900/80 text-slate-500 border-slate-800'
              }`}
            >
              {eveEnabled ? 'Eve tap ACTIVE' : 'Put Eve on the line'}
            </button>
          </div>

          {eveEnabled && <EveDossier stats={eveStats} onReset={() => setEveStats(EVE_STATS_ZERO)} />}

          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 border border-slate-800/80 backdrop-blur-md p-3 rounded-2xl flex items-center justify-between font-mono text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Activity className="text-cyan-400 animate-pulse" size={16} />
              <span>
                PHOTON PROGRESS: <strong>{(photonProgress * 100).toFixed(0)}%</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span>
                STATE: <strong className="text-yellow-400">{getPolarizationLabel(alicePolarization)}</strong>
              </span>
              <span>
                FILTER: <strong className="text-purple-400">{bobBasis === 'plus' ? 'Rectilinear (+)' : 'Diagonal (X)'}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl backdrop-blur-md flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between border-b border-slate-800 pb-2">
              <span>Quantum Controls & Physics</span>
              <span className="text-cyan-400">{activeSceneMode === 'scene2_polarization' ? 'Scene 2' : 'Scene 3'}</span>
            </div>

            {activeSceneMode === 'scene2_polarization' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold text-cyan-400">1. Select Alice Polarization State:</label>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <button
                      onClick={() => setAlicePolarization(0)}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-left flex items-center justify-between ${
                        alicePolarization === 0 ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span>Vertical 0°</span>
                      <span className="text-lg">|</span>
                    </button>
                    <button
                      onClick={() => setAlicePolarization(1)}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-left flex items-center justify-between ${
                        alicePolarization === 1 ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span>Horizontal 90°</span>
                      <span className="text-lg">-</span>
                    </button>
                    <button
                      onClick={() => setAlicePolarization(2)}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-left flex items-center justify-between ${
                        alicePolarization === 2 ? 'bg-purple-500/20 text-purple-300 border-purple-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span>Diag Left -45°</span>
                      <span className="text-lg">\</span>
                    </button>
                    <button
                      onClick={() => setAlicePolarization(3)}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-left flex items-center justify-between ${
                        alicePolarization === 3 ? 'bg-purple-500/20 text-purple-300 border-purple-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span>Diag Right +45°</span>
                      <span className="text-lg">/</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold text-emerald-400">2. Select Bob Measurement Filter:</label>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <button
                      onClick={() => setBobBasis('plus')}
                      className={`p-3 rounded-xl border font-bold transition-all text-center ${
                        bobBasis === 'plus' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      Rectilinear (+)
                    </button>
                    <button
                      onClick={() => setBobBasis('cross')}
                      className={`p-3 rounded-xl border font-bold transition-all text-center ${
                        bobBasis === 'cross' ? 'bg-purple-500/20 text-purple-300 border-purple-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      Diagonal (X)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-slate-950/90 rounded-2xl border border-cyan-500/30 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-cyan-400 border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Send size={13} /> ALICE ENCODING SECTION (TRANSMITTER)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-cyan-950 text-cyan-300 rounded border border-cyan-800">STEP 1</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Alice Bit Choice</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setAliceBit(0)}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                            aliceBit === 0 ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          Bit 0
                        </button>
                        <button
                          onClick={() => setAliceBit(1)}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                            aliceBit === 1 ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          Bit 1
                        </button>
                      </div>
                    </div>

                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Alice Encoding Basis</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setAliceBasis('plus')}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                            aliceBasis === 'plus' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          + (Rect)
                        </button>
                        <button
                          onClick={() => setAliceBasis('cross')}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                            aliceBasis === 'cross' ? 'bg-purple-500 text-white shadow-md' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          X (Diag)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-900 rounded-xl border border-slate-800 font-mono text-xs flex justify-between items-center text-slate-300">
                    <span className="text-[11px]">Encoded Photon State:</span>
                    <strong className="text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/30">
                      {getPolarizationLabel(alicePolarization)}
                    </strong>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/90 rounded-2xl border border-purple-500/30 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-purple-400 border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Lock size={13} /> BOB DECODING SECTION (RECEIVER)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-950 text-purple-300 rounded border border-purple-800">STEP 2</span>
                  </div>

                  <div className="space-y-1.5 font-mono text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Bob Aperture Filter Basis</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setBobBasis('plus')}
                        className={`p-2 rounded-xl border font-bold transition-all text-center ${
                          bobBasis === 'plus' ? 'bg-purple-500/20 text-purple-300 border-purple-400 shadow-md' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        Rectilinear (+) Slit
                      </button>
                      <button
                        onClick={() => setBobBasis('cross')}
                        className={`p-2 rounded-xl border font-bold transition-all text-center ${
                          bobBasis === 'cross' ? 'bg-purple-500/20 text-purple-300 border-purple-400 shadow-md' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        Diagonal (X) Slit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleFirePhoton}
              disabled={isFiring}
              className={`w-full py-3.5 rounded-2xl font-mono font-bold text-sm transition-all shadow-xl flex items-center justify-center gap-2 ${
                isFiring
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-yellow-500 via-amber-400 to-emerald-400 text-slate-950 hover:brightness-110 shadow-amber-950/40'
              }`}
            >
              {isFiring ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
              {isFiring ? 'Emitting Quantum Photon...' : 'Fire Single Quantum Photon'}
            </button>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-400">
              <span>MEASUREMENT RESULT:</span>
              <span className={`font-bold ${isMatch ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isMatch ? 'DETERMINISTIC PASS' : 'PHYSICAL COLLISION (SUPERPOSITION)'}
              </span>
            </div>

            {measuredBit !== null ? (
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                <div className="flex justify-between items-center text-sm font-bold">
                  <span className="text-slate-200">Bob Measured Bit:</span>
                  <span className="text-xl text-yellow-400 px-2 py-0.5 bg-yellow-400/10 rounded-lg border border-yellow-400/30">
                    {measuredBit}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                  {isMatch
                    ? "100% Passage: The photon's spatial oval shape aligned perfectly with Bob's aperture slot (+ or X) and glided through cleanly!"
                    : "50% Superposition Collapse: The photon's oval orientation struck the solid frame of Bob's plate! It entered a quantum superposition state and collapsed randomly upon measurement."}
                </p>
                {eveEnabled && eveReport && <EveInterceptReport report={eveReport} />}
              </div>
            ) : (
              <div className="p-3 bg-slate-900/50 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-[11px]">
                Click "Fire Single Quantum Photon" to test aperture alignment.
              </div>
            )}
          </div>

          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800/80 font-mono text-[11px] space-y-1.5 text-slate-400">
            <div className="text-cyan-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Sparkles size={12} /> Physical Geometry Mechanics
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-1.5 bg-slate-900 rounded-lg border border-slate-800/80">
                <span className="text-yellow-400 font-bold">Photon Shape:</span>
                <p className="text-slate-300">
                  Elongated Oval rotating to match <strong className="text-white">| - / \</strong>
                </p>
              </div>
              <div className="p-1.5 bg-slate-900 rounded-lg border border-slate-800/80">
                <span className="text-purple-400 font-bold">Bob Aperture:</span>
                <p className="text-slate-300">
                  Physical cutout slot forming <strong className="text-white">+</strong> or <strong className="text-white">X</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeSceneMode === 'scene3_encoding' && (
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-3xl backdrop-blur-md space-y-4 animate-in fade-in">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-lg font-bold text-purple-300 flex items-center gap-2 font-sans">
                <Layers size={20} /> Scene 3: Quantum Encoding & Decoding Truth Matrix
              </h3>
              <p className="text-slate-400 text-xs font-mono mt-0.5">
                Bit + Alice Basis = Single Photon State → Bob Filter Basis → Measured Bit Outcome
              </p>
            </div>

            {batchResults.length > 0 && (
              <button
                onClick={() => setBatchResults([])}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono"
              >
                Clear Log
              </button>
            )}
          </div>

          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-yellow-400 font-bold flex items-center gap-1.5">
                <Zap size={14} /> INTERACTIVE LINKING CONNECTIONS
              </span>
              <span className="text-slate-400 text-[11px]">Click buttons to re-route quantum path</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative font-mono text-xs">
              <svg className="hidden md:block absolute inset-0 w-full h-full pointer-events-none z-0">
                <defs>
                  <linearGradient id="linkGradMatch" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#eab308" />
                    <stop offset="50%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                  <linearGradient id="linkGradClash" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#eab308" />
                    <stop offset="50%" stopColor="#c084fc" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <path
                  d="M 170 110 C 230 110, 250 110, 310 110"
                  stroke={checkBasisMatch(alicePolarization, bobBasis) ? 'url(#linkGradMatch)' : 'url(#linkGradClash)'}
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray="6 4"
                  className="animate-pulse"
                />
                <path
                  d="M 450 110 C 510 110, 530 110, 590 110"
                  stroke={checkBasisMatch(alicePolarization, bobBasis) ? 'url(#linkGradMatch)' : 'url(#linkGradClash)'}
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray="6 4"
                  className="animate-pulse"
                />
              </svg>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 z-10">
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1 flex justify-between">
                  <span>1. ALICE PHOTON</span>
                  <span className="text-yellow-400">STATE</span>
                </div>
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      setAliceBit(0);
                      setAliceBasis('plus');
                    }}
                    className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                      alicePolarization === 0 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>Vertical | (0°)</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Bit 0 +</span>
                  </button>
                  <button
                    onClick={() => {
                      setAliceBit(1);
                      setAliceBasis('plus');
                    }}
                    className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                      alicePolarization === 1 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>Horizontal - (90°)</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Bit 1 +</span>
                  </button>
                  <button
                    onClick={() => {
                      setAliceBit(0);
                      setAliceBasis('cross');
                    }}
                    className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                      alicePolarization === 2 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>Diag Left \ (-45°)</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Bit 0 X</span>
                  </button>
                  <button
                    onClick={() => {
                      setAliceBit(1);
                      setAliceBasis('cross');
                    }}
                    className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                      alicePolarization === 3 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>Diag Right / (+45°)</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Bit 1 X</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 z-10">
                <div className="text-purple-400 font-bold border-b border-slate-800 pb-1 flex justify-between">
                  <span>2. BOB FILTER</span>
                  <span className="text-purple-300">APERTURE</span>
                </div>
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => setBobBasis('plus')}
                    className={`w-full p-3.5 rounded-xl border text-center transition-all ${
                      bobBasis === 'plus' ? 'bg-purple-500/20 text-purple-300 border-purple-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <div className="text-sm font-bold">Rectilinear (+)</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Vertical | & Horizontal - Slits</div>
                  </button>

                  <button
                    onClick={() => setBobBasis('cross')}
                    className={`w-full p-3.5 rounded-xl border text-center transition-all ${
                      bobBasis === 'cross' ? 'bg-purple-500/20 text-purple-300 border-purple-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <div className="text-sm font-bold">Diagonal (X)</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Diagonal \ & / Slits</div>
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3 z-10 flex flex-col justify-between">
                <div>
                  <div className="text-emerald-400 font-bold border-b border-slate-800 pb-1 flex justify-between">
                    <span>3. DECODED OUTCOME</span>
                    <span className="text-emerald-300">RESULT</span>
                  </div>

                  <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-2">
                    <div className="flex justify-center items-center gap-2">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border ${
                          checkBasisMatch(alicePolarization, bobBasis)
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-950/50'
                            : 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-lg shadow-amber-950/50'
                        }`}
                      >
                        {measuredBit !== null ? measuredBit : aliceBit}
                      </div>
                    </div>

                    <div className="text-[11px] font-bold">
                      {checkBasisMatch(alicePolarization, bobBasis) ? (
                        <span className="text-emerald-400">100% Certain (Bases Matched)</span>
                      ) : (
                        <span className="text-amber-400">50% Random (Bases Clash)</span>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-400 leading-tight">
                      {checkBasisMatch(alicePolarization, bobBasis)
                        ? 'Deterministic photon passage through aligned slit geometry.'
                        : 'Photon enters quantum superposition & collapses randomly upon detection.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleFirePhoton}
                  disabled={isFiring}
                  className="w-full py-2 bg-gradient-to-r from-yellow-500 to-emerald-400 text-slate-950 rounded-lg font-bold text-xs hover:brightness-110"
                >
                  Simulate Link Photon
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 font-bold border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
              <span>TRUTH MATRIX BY TRANSMITTER & RECEIVER BASES</span>
              <span className="text-cyan-400">ALICE ENCODING ↔ BOB DECODING</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-2xl border border-cyan-500/30 space-y-2">
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <Send size={13} /> ALICE SECTION: RECTILINEAR (+) ENCODING
                  </span>
                  <span className="text-[10px] bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800 text-cyan-300">BASIS 0</span>
                </div>
                <div className="space-y-1.5 text-slate-300">
                  <div className="flex justify-between items-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div>
                      <strong className="text-white font-bold">Bit 0 (+)</strong> → Vertical 0° (<span className="text-yellow-400">|</span>)
                    </div>
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Bob (+) → Bit 0 (100% Pass)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div>
                      <strong className="text-white font-bold">Bit 1 (+)</strong> → Horizontal 90° (<span className="text-yellow-400">-</span>)
                    </div>
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Bob (+) → Bit 1 (100% Pass)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-amber-950/20 border border-amber-500/30 rounded-lg text-amber-300">
                    <div className="text-[11px]">
                      Any Bit (+) vs <strong className="text-purple-300 font-bold">Bob Diagonal (X)</strong>
                    </div>
                    <span className="font-bold text-[10px] bg-amber-900/40 px-2 py-0.5 rounded border border-amber-600/50">
                      50/50 Superposition Collapse
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-purple-500/30 space-y-2">
                <div className="text-purple-400 font-bold border-b border-slate-800 pb-1.5 flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <Send size={13} /> ALICE SECTION: DIAGONAL (X) ENCODING
                  </span>
                  <span className="text-[10px] bg-purple-950 px-1.5 py-0.5 rounded border border-purple-800 text-purple-300">BASIS 1</span>
                </div>
                <div className="space-y-1.5 text-slate-300">
                  <div className="flex justify-between items-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div>
                      <strong className="text-white font-bold">Bit 0 (X)</strong> → Diag Left -45° (<span className="text-yellow-400">\</span>)
                    </div>
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Bob (X) → Bit 0 (100% Pass)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div>
                      <strong className="text-white font-bold">Bit 1 (X)</strong> → Diag Right +45° (<span className="text-yellow-400">/</span>)
                    </div>
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Bob (X) → Bit 1 (100% Pass)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-amber-950/20 border border-amber-500/30 rounded-lg text-amber-300">
                    <div className="text-[11px]">
                      Any Bit (X) vs <strong className="text-cyan-300 font-bold">Bob Rectilinear (+)</strong>
                    </div>
                    <span className="font-bold text-[10px] bg-amber-900/40 px-2 py-0.5 rounded border border-amber-600/50">
                      50/50 Superposition Collapse
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {batchResults.length > 0 && (
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 overflow-x-auto">
              <div className="text-xs font-mono font-bold text-slate-400 mb-2">LIVE EMISSION LOG HISTORY:</div>
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-900 text-slate-400 uppercase">
                  <tr>
                    <th className="p-2">#</th>
                    <th className="p-2">Alice Bit</th>
                    <th className="p-2">Alice Basis</th>
                    <th className="p-2">Polarization State</th>
                    <th className="p-2">Bob Basis</th>
                    <th className="p-2">Measured Bit</th>
                    <th className="p-2">Match Status</th>
                    <th className="p-2">Quantum Phenomenon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {batchResults.map((res) => (
                    <tr key={res.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="p-2 text-slate-500">#{res.id}</td>
                      <td className="p-2 font-bold text-cyan-400">{res.aliceBit}</td>
                      <td className="p-2 text-slate-300">{res.aliceBasis === 'plus' ? '+' : 'X'}</td>
                      <td className="p-2 text-yellow-400 font-bold">{res.pol}</td>
                      <td className="p-2 text-purple-400 font-bold">{res.bobBasis === 'plus' ? '+' : 'X'}</td>
                      <td className="p-2 font-bold text-emerald-400">{res.measuredBit}</td>
                      <td className="p-2">
                        {res.matched ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">MATCHED</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">CLASH</span>
                        )}
                      </td>
                      <td className="p-2 text-slate-400">{res.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

