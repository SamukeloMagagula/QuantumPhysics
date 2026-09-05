import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Page, PageHeader, Tag } from './ui/Page';
import { getLab } from './labRegistry';
import { createGuestStore, mountLab } from './labFramework';

interface LabRunnerProps {
  labId: string;
  onExit?: () => void;
}

/**
 * The shell a lab runs inside.
 *
 * The lab itself is vanilla DOM built by the module, so this only supplies
 * the frame: where you are, how hard it is, whether you have finished it
 * before, and a way back. Everything is drawn from the same theme tokens as
 * the dashboard, so a lab looks like part of the product in either theme.
 */
export function LabRunner({ labId, onExit }: LabRunnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lab = getLab(labId);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!lab) return;
    setDone(createGuestStore().isComplete(lab.id));
  }, [lab]);

  useEffect(() => {
    if (!containerRef.current || !lab) return;
    const store = createGuestStore();
    mountLab(containerRef.current, lab, store, () => setDone(true));
  }, [labId, lab]);

  const tone: Record<string, string> = {
    beginner: 'var(--ok)',
    intermediate: 'var(--warn)',
    advanced: 'var(--danger)',
  };

  if (!lab) {
    return (
      <Page width="reading">
        <p className="text-[var(--danger)] font-mono text-sm">Lab not found.</p>
      </Page>
    );
  }

  return (
    <Page width="reading">
      <PageHeader
        eyebrow={lab.category}
        title={lab.title}
        actions={
          <>
            {done && <Tag tone="var(--ok)">Completed</Tag>}
            <Tag tone={tone[lab.difficulty] ?? 'var(--ink-3)'}>{lab.difficulty}</Tag>
            {onExit && (
              <button onClick={onExit} className="btn btn-ghost px-3 py-2 text-xs">
                <ArrowLeft size={13} /> Back to labs
              </button>
            )}
          </>
        }
      />
      <div ref={containerRef} className="space-y-4" />
    </Page>
  );
}
