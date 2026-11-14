import type { ComplaintStatus, StaffRole } from '../../../generated/prisma/client.js';

/**
 * The complaint lifecycle as a state machine — the single source of truth for who may move
 * a complaint from which status to which. Pure functions, no database: easy to test and reason about.
 *
 *   SUBMITTED ──assign──► ASSIGNED ──► IN_PROGRESS ──► RESOLVED ──► CLOSED
 *       │                    │              │              │
 *       └──────► REJECTED ◄──┴──────────────┘              └──► IN_PROGRESS (reopen)
 *
 * Moving to ASSIGNED happens only through the assign action (it needs an officer).
 */
const TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  SUBMITTED: ['REJECTED'],
  ASSIGNED: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: [],
};

/** What officers may do themselves (on complaints assigned to them) */
const OFFICER_TRANSITIONS: Partial<Record<ComplaintStatus, ComplaintStatus[]>> = {
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
};

/** A remark is mandatory when the citizen deserves an explanation */
const REMARK_REQUIRED: [ComplaintStatus, ComplaintStatus][] = [
  ['SUBMITTED', 'REJECTED'],
  ['ASSIGNED', 'REJECTED'],
  ['IN_PROGRESS', 'REJECTED'],
  ['IN_PROGRESS', 'RESOLVED'],
  ['RESOLVED', 'IN_PROGRESS'],
];

export const OPEN_STATUSES: ComplaintStatus[] = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS'];
export const ASSIGNABLE_STATUSES: ComplaintStatus[] = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS'];

export interface TransitionCheck {
  from: ComplaintStatus;
  to: ComplaintStatus;
  role: StaffRole;
  /** Is the acting officer the one assigned to this complaint? */
  isAssignee: boolean;
  remark?: string;
}

/** Returns null if allowed, otherwise a human-readable reason */
export function checkTransition({ from, to, role, isAssignee, remark }: TransitionCheck): string | null {
  if (from === to) return `Complaint is already ${from}`;
  if (to === 'ASSIGNED') return 'Use the assign action to assign an officer';
  if (!TRANSITIONS[from].includes(to)) {
    const allowed = TRANSITIONS[from];
    return allowed.length
      ? `Cannot move from ${from} to ${to}. Allowed: ${allowed.join(', ')}`
      : `${from} complaints can no longer be changed`;
  }
  if (role === 'OFFICER') {
    if (!isAssignee) return 'Only the assigned officer can update this complaint';
    if (!OFFICER_TRANSITIONS[from]?.includes(to)) return `Officers cannot move a complaint from ${from} to ${to}`;
  }
  const needsRemark = REMARK_REQUIRED.some(([f, t]) => f === from && t === to);
  if (needsRemark && !remark?.trim()) return `A remark is required when moving from ${from} to ${to}`;
  return null;
}

export function allowedNextStatuses(from: ComplaintStatus, role: StaffRole, isAssignee: boolean): ComplaintStatus[] {
  return TRANSITIONS[from].filter((to) => checkTransition({ from, to, role, isAssignee, remark: 'x' }) === null);
}
