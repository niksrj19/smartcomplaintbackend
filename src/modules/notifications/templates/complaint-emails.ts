import type { EmailMessage } from '../../../ports/mailer.js';
import type {
  ComplaintAssignedPayload,
  ComplaintCreatedPayload,
  ComplaintSlaBreachedPayload,
  ComplaintStatusChangedPayload,
  Status,
} from '../../../shared/events/complaint.events.js';

/** Citizen text goes into HTML — always escape it */
function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(heading: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
      <tr><td style="background:#0f766e;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold">Smart City Helpdesk</td></tr>
      <tr><td style="padding:24px">
        <h2 style="margin:0 0 16px;font-size:20px">${heading}</h2>
        ${body}
        <p style="margin:24px 0 0;font-size:12px;color:#7b8794">You can check your complaint's status any time by sharing the ticket number in the Smart City chat.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function detailsTable(rows: [string, string][]): string {
  return `<table cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="color:#52606d;width:140px;border-bottom:1px solid #e4e7eb">${esc(k)}</td><td style="border-bottom:1px solid #e4e7eb">${esc(v)}</td></tr>`,
    )
    .join('')}</table>`;
}

const STATUS_TEXT: Record<Status, string> = {
  SUBMITTED: 'Submitted',
  ASSIGNED: 'Assigned to an officer',
  IN_PROGRESS: 'Work in progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

export function complaintReceivedEmail(p: ComplaintCreatedPayload): EmailMessage {
  const rows: [string, string][] = [
    ['Ticket number', p.ticketNumber],
    ['Issue', p.title],
    ['Location', p.address],
    ['Department', p.department.name],
    ['Priority', p.priority],
  ];
  return {
    to: p.citizen.email,
    subject: `Complaint registered: ${p.ticketNumber}`,
    html: layout(
      `We've received your complaint`,
      `<p>Hi ${esc(p.citizen.name)},</p><p>Thank you for reporting this. Your complaint has been registered and sent to the right department.</p>${detailsTable(rows)}`,
    ),
    text: `Hi ${p.citizen.name},\n\nYour complaint has been registered.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nSmart City Helpdesk`,
  };
}

/** Department inbox alert — sent for every new complaint, flagged loudly when critical */
export function newComplaintForDepartmentEmail(p: ComplaintCreatedPayload): EmailMessage {
  const urgent = p.priority === 'CRITICAL' || p.priority === 'HIGH';
  const rows: [string, string][] = [
    ['Ticket number', p.ticketNumber],
    ['Priority', p.priority],
    ['Category', p.category],
    ['Issue', p.title],
    ['Description', p.description],
    ['Location', p.address],
    ['Photos', String(p.photoKeys.length)],
    ['Respond by', new Date(p.slaDueAt).toLocaleString('en-IN')],
  ];
  return {
    to: p.department.contactEmail,
    subject: `${urgent ? `[${p.priority}] ` : ''}New complaint ${p.ticketNumber}: ${p.title}`,
    html: layout(`New complaint for ${esc(p.department.name)}`, detailsTable(rows)),
    text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}

export function complaintAssignedEmail(p: ComplaintAssignedPayload): EmailMessage {
  return {
    to: p.citizen.email,
    subject: `Update on ${p.ticketNumber}: assigned to an officer`,
    html: layout(
      'Your complaint has been assigned',
      `<p>Hi ${esc(p.citizen.name)},</p><p>Your complaint <b>${esc(p.ticketNumber)}</b> ("${esc(p.title)}") has been assigned to an officer at ${esc(p.department.name)}, who will look into it.</p>`,
    ),
    text: `Hi ${p.citizen.name},\n\nYour complaint ${p.ticketNumber} ("${p.title}") has been assigned to an officer at ${p.department.name}.\n\nSmart City Helpdesk`,
  };
}

export function statusChangedEmail(p: ComplaintStatusChangedPayload): EmailMessage {
  const status = STATUS_TEXT[p.newStatus];
  const remark = p.remark ? `<p><b>Note from the department:</b> ${esc(p.remark)}</p>` : '';
  return {
    to: p.citizen.email,
    subject: `Update on ${p.ticketNumber}: ${status}`,
    html: layout(
      `Status update: ${esc(status)}`,
      `<p>Hi ${esc(p.citizen.name)},</p><p>The status of your complaint <b>${esc(p.ticketNumber)}</b> ("${esc(p.title)}") changed from <b>${esc(STATUS_TEXT[p.oldStatus])}</b> to <b>${esc(status)}</b>.</p>${remark}`,
    ),
    text: `Hi ${p.citizen.name},\n\nYour complaint ${p.ticketNumber} is now: ${status}.${p.remark ? `\nNote: ${p.remark}` : ''}\n\nSmart City Helpdesk`,
  };
}

/** Escalation alert for the department inbox (and the assigned officer, if any) */
export function slaBreachedEmail(p: ComplaintSlaBreachedPayload, to: string): EmailMessage {
  const rows: [string, string][] = [
    ['Ticket number', p.ticketNumber],
    ['Issue', p.title],
    ['Priority', p.priority],
    ['Current status', STATUS_TEXT[p.status]],
    ['Assigned officer', p.officer?.name ?? 'Not assigned'],
    ['Was due', new Date(p.slaDueAt).toLocaleString('en-IN')],
  ];
  return {
    to,
    subject: `[SLA BREACH] ${p.ticketNumber}: ${p.title}`,
    html: layout(
      `SLA deadline missed — ${esc(p.department.name)}`,
      `<p>This complaint has passed its response deadline and has been escalated. Please act on it as soon as possible.</p>${detailsTable(rows)}`,
    ),
    text: `SLA deadline missed — escalated.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
  };
}
