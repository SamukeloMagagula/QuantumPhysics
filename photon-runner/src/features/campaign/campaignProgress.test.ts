import { beforeEach, describe, expect, it } from 'vitest';
import { getCompletedScenes, markSceneComplete, nextCampaignScreen } from './campaignProgress';

beforeEach(() => {
  localStorage.clear();
});

describe('campaign progress', () => {
  it('starts with nothing complete, pointing at scene 1', () => {
    expect(getCompletedScenes()).toEqual([]);
    expect(nextCampaignScreen()).toBe('campaign-scene1');
  });

  it('marks a scene complete and persists it', () => {
    markSceneComplete('scene1');
    expect(getCompletedScenes()).toEqual(['scene1']);
    expect(nextCampaignScreen()).toBe('campaign-scene2');
  });

  it('does not duplicate an already-completed scene', () => {
    markSceneComplete('scene1');
    markSceneComplete('scene1');
    expect(getCompletedScenes()).toEqual(['scene1']);
  });

  it('points back at scene 1 (replay) once both scenes are complete', () => {
    markSceneComplete('scene1');
    markSceneComplete('scene2');
    expect(getCompletedScenes()).toEqual(['scene1', 'scene2']);
    expect(nextCampaignScreen()).toBe('campaign-scene1');
  });
});
