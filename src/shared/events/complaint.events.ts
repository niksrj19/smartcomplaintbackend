/**
 * Event contracts shared by the producer (outbox) and every Kafka consumer.
 * Topic names follow the design: one topic per event type.
 */
export const COMPLAINT_TOPICS = {
  created: 'complaint.created',
  assigned: 'complaint.assigned',
  statusChanged: 'complaint.status-changed',
  slaBreached: 'complaint.sla-breached',
  deadLetter: 'complaint.dlq',
} as const;

export type ComplaintEventType = (typeof COMPLAINT_TOPICS)[Exclude<keyof typeof COMPLAINT_TOPICS, 'deadLetter'>];

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type Status = 'SUBMITTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REJECTED';

interface CitizenRef {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface DepartmentRef {
  id: string;
  code: string;
  name: string;
  contactEmail: string;
}

export interface ComplaintCreatedPayload {
  complaintId: string;
  ticketNumber: string;
  citizen: CitizenRef;
  department: DepartmentRef;
  category: string;
  priority: Priority;
  title: string;
  description: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  photoKeys: string[];
  slaDueAt: string;
  createdAt: string;
}

export interface ComplaintAssignedPayload {
  complaintId: string;
  ticketNumber: string;
  title: string;
  priority: Priority;
  citizen: CitizenRef;
  department: DepartmentRef;
  officer: { id: string; name: string; email: string };
  /** null = auto-assigned by the routing service */
  assignedById: string | null;
  assignedAt: string;
}

export interface ComplaintStatusChangedPayload {
  complaintId: string;
  ticketNumber: string;
  title: string;
  citizen: CitizenRef;
  department: DepartmentRef;
  oldStatus: Status;
  newStatus: Status;
  remark: string | null;
  changedById: string | null;
  changedAt: string;
}

export interface ComplaintSlaBreachedPayload {
  complaintId: string;
  ticketNumber: string;
  title: string;
  priority: Priority;
  status: Status;
  department: DepartmentRef;
  officer: { id: string; name: string; email: string } | null;
  slaDueAt: string;
  escalatedAt: string;
}
