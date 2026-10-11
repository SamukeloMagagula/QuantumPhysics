import { isWin, type AttackState } from './qkdAttack';
import type { RoomId } from './pqRooms';

export const ASSIGNMENTS: { target: string; room: RoomId; title: string; briefing: string; reward: string }[] = [
  { target: 'testbed', room: 'ops', title: 'Find the meeting place', briefing: 'Your team needs a rendezvous clue. Test the University link: capture at least 1,000 pulses and learn 30% of the key without being spotted.', reward: 'Meet at the observatory. Bring the blue case.' },
  { target: 'metro', room: 'comms-centre', title: 'Find the missing courier', briefing: 'The courier never reached the observatory. The Metro link holds the next clue. Scan its defences, capture 1,000 pulses, and learn 35% of the key.', reward: 'The courier changed route. Check the north service tunnel.' },
  { target: 'gov', room: 'ops', title: 'Follow the tunnel route', briefing: 'A sealed route record could explain the detour. The Government link monitors its detectors: reusing the dazzle trick at full strength will get you caught. Capture 1,000 pulses and learn 40% of the key.', reward: 'The courier is safe. The blue case is locked in the archive.' },
  { target: 'blacksite', room: 'comms-centre', title: 'Recover the blue case', briefing: 'One last record identifies the case. Blacksite monitors every quiet attack. Mix tools at lower strengths, watch the alarm forecast, and leave as soon as you have 1,000 pulses and 45% of the key.', reward: 'Archive locker 7. The team recovered the blue case — operation complete.' },
];
export interface FacilityStory { access: boolean; completed: number }
const KEY = 'photon-runner:facility-story:v1';
export function readFacilityStory(): FacilityStory {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value?.access === true && Number.isInteger(value.completed) && value.completed >= 0 && value.completed <= ASSIGNMENTS.length)
      return { access: true, completed: value.completed };
  } catch { /* Storage can be unavailable; the current visit still works. */ }
  return { access: false, completed: 0 };
}
export function saveFacilityStory(story: FacilityStory): void {
  try { localStorage.setItem(KEY, JSON.stringify(story)); } catch { /* Keep in-memory progress. */ }
}
export function completeAssignment(story: FacilityStory, session: AttackState | null, room: RoomId): FacilityStory {
  const task = ASSIGNMENTS[story.completed];
  if (!story.access || !task || task.room !== room || session?.target.id !== task.target ||
    !isWin(session)) return story;
  return { ...story, completed: story.completed + 1 };
}
