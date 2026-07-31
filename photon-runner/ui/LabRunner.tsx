import React, { useEffect, useRef } from 'react';
import { getLab } from '../labs/registry';
import { createGuestStore, mountLab } from '../labs/framework';

interface LabRunnerProps {
  labId: string;
}

export function LabRunner({ labId }: LabRunnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lab = getLab(labId);

  useEffect(() => {
    if (!containerRef.current || !lab) return;
    const store = createGuestStore();
    mountLab(containerRef.current, lab, store);
  }, [labId, lab]);

  return (
    <div className="min-h-full px-4 py-6 max-w-2xl mx-auto space-y-4">
      {!lab && <p className="text-rose-400 font-mono text-sm">Lab not found.</p>}
      <div ref={containerRef} className="space-y-4" />
    </div>
  );
}
