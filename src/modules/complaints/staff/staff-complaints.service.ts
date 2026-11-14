import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffPrincipal } from '../../auth-core/auth-core.types.js';
import { StorageService } from '../../storage/storage.service.js';
import { ASSIGNABLE_STATUSES, OPEN_STATUSES, allowedNextStatuses, checkTransition } from './complaint-workflow.js';
import type { AssignComplaintDto, ListStaffComplaintsQuery, UpdateStatusDto } from './dto/staff-complaints.schemas.js';
import { StaffComplaintsRepository } from './staff-complaints.repository.js';

@Injectable()
export class StaffComplaintsService {
  constructor(
    private readonly repo: StaffComplaintsRepository,
    private readonly storage: StorageService,
  ) {}

  async list(actor: StaffPrincipal, query: ListStaffComplaintsQuery) {
    const { items, total } = await this.repo.list(actor, query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Full detail incl. citizen contact, photos, timeline, duplicates, the chat that created it, and what you may do next */
  async detail(actor: StaffPrincipal, id: string) {
    const c = await this.repo.findDetail(actor, id);
    if (!c) throw new NotFoundException('Complaint not found');

    const photos = await Promise.all(
      c.attachments.map(async (a) => {
        const link = await this.storage.createViewUrl(a.objectKey);
        return { url: link.url, contentType: a.contentType, expiresAt: link.expiresAt };
      }),
    );
    const isAssignee = c.assignedOfficerId === actor.id;
    const now = new Date();

    return {
      id: c.id,
      ticketNumber: c.ticketNumber,
      title: c.title,
      description: c.description,
      category: c.category,
      priority: c.priority,
      status: c.status,
      address: c.address,
      latitude: c.latitude,
      longitude: c.longitude,
      department: c.department,
      assignedOfficer: c.assignedOfficer,
      citizen: c.citizen,
      slaDueAt: c.slaDueAt,
      isOverdue: !!c.slaDueAt && c.slaDueAt < now && OPEN_STATUSES.includes(c.status),
      escalatedAt: c.escalatedAt,
      resolvedAt: c.resolvedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      photos,
      timeline: c.statusHistory.map((h) => ({
        from: h.oldStatus,
        to: h.newStatus,
        remark: h.remark,
        by: h.changedBy ? { name: h.changedBy.name, role: h.changedBy.role } : { name: 'System', role: null },
        at: h.createdAt,
      })),
      duplicateOf: c.duplicateOf,
      duplicates: c.duplicates,
      chatTranscript: c.session?.messages ?? [],
      // The frontend uses this to show only the buttons that will actually work
      allowedActions: {
        nextStatuses: allowedNextStatuses(c.status, actor.role, isAssignee),
        canAssign: actor.role !== 'OFFICER' && ASSIGNABLE_STATUSES.includes(c.status),
      },
    };
  }

  async assign(actor: StaffPrincipal, id: string, dto: AssignComplaintDto) {
    const c = await this.repo.findForUpdate(actor, id);
    if (!c) throw new NotFoundException('Complaint not found');
    if (!ASSIGNABLE_STATUSES.includes(c.status)) {
      throw new BadRequestException(`A ${c.status} complaint cannot be assigned`);
    }
    if (c.assignedOfficerId === dto.officerId) {
      throw new ConflictException('This officer is already assigned');
    }

    const officer = await this.repo.findStaffUser(dto.officerId);
    if (!officer || officer.role !== 'OFFICER' || !officer.isActive) {
      throw new BadRequestException('Choose an active officer');
    }
    if (officer.departmentId !== c.departmentId) {
      throw new ForbiddenException("The officer must belong to the complaint's department");
    }

    const ok = await this.repo.assign({ complaintId: id, fromStatus: c.status, officer, actor, remark: dto.remark });
    if (!ok) throw new ConflictException('The complaint was just changed by someone else. Please refresh.');
    return this.detail(actor, id);
  }

  async changeStatus(actor: StaffPrincipal, id: string, dto: UpdateStatusDto) {
    const c = await this.repo.findForUpdate(actor, id);
    if (!c) throw new NotFoundException('Complaint not found');

    const problem = checkTransition({
      from: c.status,
      to: dto.status,
      role: actor.role,
      isAssignee: c.assignedOfficerId === actor.id,
      remark: dto.remark,
    });
    if (problem) throw new BadRequestException(problem);

    const ok = await this.repo.changeStatus({ complaintId: id, from: c.status, to: dto.status, actor, remark: dto.remark });
    if (!ok) throw new ConflictException('The complaint was just changed by someone else. Please refresh.');
    return this.detail(actor, id);
  }
}
