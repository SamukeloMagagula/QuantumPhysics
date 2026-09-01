const STORAGE_KEY = 'photon-runner:campaignProgress';

export type CampaignSceneId = 'scene1' | 'scene2';

function readCompleted(): CampaignSceneId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getCompletedScenes(): CampaignSceneId[] {
  return readCompleted();
}

export function markSceneComplete(id: CampaignSceneId): void {
  try {
    const cur = readCompleted();
    if (!cur.includes(id)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...cur, id]));
    }
  } catch {
    // Progress just won't persist across reloads this session.
  }
}

export function nextCampaignScreen(): 'campaign-scene1' | 'campaign-scene2' {
  const done = readCompleted();
  if (!done.includes('scene1')) return 'campaign-scene1';
  if (!done.includes('scene2')) return 'campaign-scene2';
  return 'campaign-scene1'; // both complete — replay from the start
}
