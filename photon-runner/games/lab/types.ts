export type Role = 'alice' | 'bob' | 'eve';

export interface RoleInfo {
  id: Role;
  name: string;
  title: string;
  color: number;
  colorClass: string;
  blurb: string;
}

export const ROLES: Record<Role, RoleInfo> = {
  alice: {
    id: 'alice',
    name: 'Alice',
    title: 'Transmitter',
    color: 0x22d3ee,
    colorClass: 'text-cyan-400',
    blurb: 'Generate photons and send them down the fiber to Bob.',
  },
  bob: {
    id: 'bob',
    name: 'Bob',
    title: 'Receiver',
    color: 0x22c55e,
    colorClass: 'text-emerald-400',
    blurb: 'Catch incoming photons and help build the shared key.',
  },
  eve: {
    id: 'eve',
    name: 'Eve',
    title: 'Eavesdropper',
    color: 0xf43f5e,
    colorClass: 'text-rose-400',
    blurb: 'Sneak onto the fiber and see what you can learn — without getting caught.',
  },
};
