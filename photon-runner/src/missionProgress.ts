import { Role } from './sceneTypes';

const STORAGE_KEY = 'photon-runner:missionsCompleted';

function readCompleted(): Role[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getCompletedRoles(): Role[] {
  return readCompleted();
}

export function markRoleCompleted(role: Role): void {
  try {
    const cur = readCompleted();
    if (!cur.includes(role)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...cur, role]));
    }
  } catch {
    // Progress just won't persist across reloads this session.
  }
}
