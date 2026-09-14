import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  CreateTenantCustomerServerDto,
  CreateTenantCustomerServerSelfDto,
  UpdateTenantCustomerServerDto,
  UpdateTenantCustomerServerSelfDto,
} from './dto/tenant-customer-server.dto';
import { TenantCustomerServerListQueryDto } from './dto/tenant-customer-server-query.dto';

const ASSIGNMENT_INCLUDE = {
  tenantCustomer: {
    select: { id: true, customerCode: true, fName: true, lName: true, status: true },
  },
  tenantFlussonicServer: { select: { id: true, systemCode: true, name: true, status: true } },
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
} satisfies Prisma.TenantCustomerServerInclude;

type AssignmentRow = Prisma.TenantCustomerServerGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE;
}>;

/**
 * Renames the vendor-specific column and relation to the neutral API names, so
 * the client apps never carry the vendor name - the same contract the streams
 * and streaming-servers modules use.
 */
function serializeAssignment(
  row: AssignmentRow & { streamsUsed: number; streamsRemaining: number | null },
) {
  const { tenantFlussonicServerId, tenantFlussonicServer, ...rest } = row;
  return { ...rest, serverId: tenantFlussonicServerId, server: tenantFlussonicServer };
}

@Injectable()
export class TenantCustomerServersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: TenantCustomerServerListQueryDto) {
    return this.list(query, null);
  }

  async findOne(id: string) {
    const assignment = await this.prisma.tenantCustomerServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return this.withUsage([assignment]).then((rows) => serializeAssignment(rows[0]));
  }

  async create(dto: CreateTenantCustomerServerDto, actorId?: string) {
    const { serverId, ...fields } = dto;
    await this.assertCustomerInBusiness(dto.tenantCustomerId, dto.tenantBusinessId);
    await this.assertServerInBusiness(serverId, dto.tenantBusinessId);
    const revoked = await this.findRevokedAssignment(dto.tenantCustomerId, serverId);
    if (dto.isDedicated) {
      await this.assertServerFreeForDedication(serverId, dto.tenantCustomerId);
    }
    // Streams can already exist on the pair - adopted from the server, or left
    // from an earlier assignment - so a limit below them would put the customer
    // instantly over quota, exactly as when lowering it on update.
    await this.assertLimitCoversUsage(dto.tenantCustomerId, serverId, dto.streamLimit);

    const timestamp = now();
    const data = {
      ...fields,
      tenantFlussonicServerId: serverId,
      updatedAt: timestamp,
      updatedBy: actorId,
    };

    // Reviving keeps the row's id and code, but createdAt/By record this grant
    // rather than the revoked one: the assignment shown is the current one.
    const saved = revoked
      ? await this.prisma.tenantCustomerServer.update({
          where: { id: revoked.id },
          data: {
            ...data,
            // The create DTO carries no status, so a revived grant starts
            // active like a fresh one.
            status: 'ACTIVE',
            createdAt: timestamp,
            createdBy: actorId,
            deletedAt: null,
            deletedBy: null,
          },
          include: ASSIGNMENT_INCLUDE,
        })
      : await this.prisma.tenantCustomerServer.create({
          data: {
            id: newId(),
            systemCode: newSystemCode('CSV'),
            ...data,
            createdAt: timestamp,
            createdBy: actorId,
          },
          include: ASSIGNMENT_INCLUDE,
        });
    return this.withUsage([saved]).then((rows) => serializeAssignment(rows[0]));
  }

  async update(id: string, dto: UpdateTenantCustomerServerDto, actorId?: string) {
    const assignment = await this.prisma.tenantCustomerServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const { serverId, tenantCustomerId, ...fields } = dto;
    // Set when the pair being moved onto holds a revoked assignment, which the
    // unique pair constraint makes us clear out of the way first.
    let revokedOnTarget: { id: string } | null = null;
    const nextCustomerId = tenantCustomerId ?? assignment.tenantCustomerId;
    const nextServerId = serverId ?? assignment.tenantFlussonicServerId;
    const reassigned =
      nextCustomerId !== assignment.tenantCustomerId ||
      nextServerId !== assignment.tenantFlussonicServerId;

    const usedOnCurrent = await this.countStreams(
      assignment.tenantCustomerId,
      assignment.tenantFlussonicServerId,
    );

    if (reassigned) {
      // Streams belong to a (customer, server) pair and do not follow the
      // assignment. Moving it while streams exist would leave them running
      // with nothing granting access - the same hazard as revoking.
      if (usedOnCurrent > 0) {
        throw new BadRequestException(
          `This customer has ${usedOnCurrent} stream(s) on the current server. Move or delete them before reassigning.`,
        );
      }
      await this.assertCustomerInBusiness(nextCustomerId, assignment.tenantBusinessId);
      await this.assertServerInBusiness(nextServerId, assignment.tenantBusinessId);
      revokedOnTarget = await this.findRevokedAssignment(nextCustomerId, nextServerId, id);
    }

    // Lowering a limit below what the customer already uses would leave them
    // instantly over quota with no way to tell why a create fails later.
    if (reassigned) {
      await this.assertLimitCoversUsage(nextCustomerId, nextServerId, dto.streamLimit);
    } else if (dto.streamLimit != null && dto.streamLimit < usedOnCurrent) {
      throw new BadRequestException(
        `This customer already has ${usedOnCurrent} stream(s) on this server; the limit cannot be set below that`,
      );
    }
    if (dto.isDedicated) {
      await this.assertServerFreeForDedication(nextServerId, nextCustomerId);
    }

    const writeUpdate = () =>
      this.prisma.tenantCustomerServer.update({
        where: { id },
        data: {
          ...fields,
          ...(tenantCustomerId ? { tenantCustomerId } : {}),
          ...(serverId ? { tenantFlussonicServerId: serverId } : {}),
          updatedAt: now(),
          updatedBy: actorId,
        },
        include: ASSIGNMENT_INCLUDE,
      });

    // Discarding the revoked row loses nothing - it grants no access and its
    // streams were already required to be gone before it could be revoked -
    // and both writes go together so a failure cannot delete the old record
    // without completing the move.
    const updated = revokedOnTarget
      ? (
          await this.prisma.$transaction([
            this.prisma.tenantCustomerServer.delete({ where: { id: revokedOnTarget.id } }),
            writeUpdate(),
          ])
        )[1]
      : await writeUpdate();
    return this.withUsage([updated]).then((rows) => serializeAssignment(rows[0]));
  }

  async remove(id: string, actorId?: string) {
    const assignment = await this.prisma.tenantCustomerServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    // Revoking a server the customer still has streams on would orphan them:
    // the streams keep running with no assignment backing them.
    const used = await this.countStreams(
      assignment.tenantCustomerId,
      assignment.tenantFlussonicServerId,
    );
    if (used > 0) {
      throw new BadRequestException(
        `This customer still has ${used} stream(s) on this server. Move or delete them first.`,
      );
    }

    const timestamp = now();
    await this.prisma.tenantCustomerServer.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: timestamp,
        deletedBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      },
    });
    return { success: true };
  }

  /**
   * Attaches how many streams the customer currently has on each server, so the
   * UI can show real usage against the limit rather than the limit alone.
   * Counted in one grouped query rather than per row.
   */
  private async withUsage(rows: AssignmentRow[]) {
    if (rows.length === 0) return [];
    const grouped = await this.prisma.tenantStream.groupBy({
      by: ['tenantCustomerId', 'tenantFlussonicServerId'],
      where: {
        status: { not: 'DELETED' },
        tenantCustomerId: { in: rows.map((r) => r.tenantCustomerId) },
        tenantFlussonicServerId: { in: rows.map((r) => r.tenantFlussonicServerId) },
      },
      _count: { _all: true },
    });

    const key = (customerId: string | null, serverId: string) => `${customerId}|${serverId}`;
    const counts = new Map(
      grouped.map((g) => [key(g.tenantCustomerId, g.tenantFlussonicServerId), g._count._all]),
    );

    return rows.map((row) => {
      const streamsUsed = counts.get(key(row.tenantCustomerId, row.tenantFlussonicServerId)) ?? 0;
      return {
        ...row,
        streamsUsed,
        // Null limit means unlimited, so there is no remaining count to give.
        streamsRemaining: row.streamLimit === null ? null : Math.max(0, row.streamLimit - streamsUsed),
      };
    });
  }

  private async countStreams(customerId: string, serverId: string): Promise<number> {
    return this.prisma.tenantStream.count({
      where: {
        tenantCustomerId: customerId,
        tenantFlussonicServerId: serverId,
        status: { not: 'DELETED' },
      },
    });
  }

  private async list(query: TenantCustomerServerListQueryDto, businessScope: string | null) {
    const {
      page,
      limit,
      search,
      status,
      tenantBusinessId,
      tenantCustomerId,
      serverId,
      isDedicated,
      sortBy,
      sortOrder,
    } = query;

    const where: Prisma.TenantCustomerServerWhereInput = {
      status: status ? status : { not: 'DELETED' },
      ...(businessScope ? { tenantBusinessId: businessScope } : {}),
      ...(tenantBusinessId && !businessScope ? { tenantBusinessId } : {}),
      ...(tenantCustomerId ? { tenantCustomerId } : {}),
      ...(serverId ? { tenantFlussonicServerId: serverId } : {}),
      ...(isDedicated !== undefined ? { isDedicated } : {}),
      ...(search
        ? {
            OR: [
              { systemCode: { contains: search } },
              { remark: { contains: search } },
              { tenantCustomer: { customerCode: { contains: search } } },
              { tenantCustomer: { fName: { contains: search } } },
              { tenantFlussonicServer: { name: { contains: search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantCustomerServer.findMany({
        where,
        include: ASSIGNMENT_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantCustomerServer.count({ where }),
    ]);
    const rows = (await this.withUsage(items)).map(serializeAssignment);
    return listResponse(rows, total, page, limit);
  }

  private async assertCustomerInBusiness(customerId: string, tenantBusinessId: string) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id: customerId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!customer) throw new BadRequestException('Customer does not exist for this business');
  }

  private async assertServerInBusiness(serverId: string, tenantBusinessId: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id: serverId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!server) throw new BadRequestException('Server does not exist for this business');
  }

  /**
   * Refuses a duplicate live assignment, and returns the revoked one when the
   * pair was assigned before.
   *
   * A (customer, server) pair is unique in the database, so a soft-deleted row
   * keeps occupying it. That is a storage detail, not a business rule: a
   * revoked assignment must not stop the pair being assigned again, so the
   * callers recycle the row instead of reporting a conflict.
   */
  private async findRevokedAssignment(customerId: string, serverId: string, excludeId?: string) {
    const existing = await this.prisma.tenantCustomerServer.findFirst({
      where: {
        tenantCustomerId: customerId,
        tenantFlussonicServerId: serverId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing && existing.status !== 'DELETED') {
      throw new BadRequestException('This customer is already assigned to this server');
    }
    return existing;
  }

  /**
   * Refuses a stream limit the customer's existing streams on that server
   * already exceed. Null means unlimited, so nothing to check.
   */
  private async assertLimitCoversUsage(
    customerId: string,
    serverId: string,
    streamLimit: number | null | undefined,
  ) {
    if (streamLimit == null) return;
    const used = await this.countStreams(customerId, serverId);
    if (streamLimit < used) {
      throw new BadRequestException(
        `This customer already has ${used} stream(s) on this server; the limit cannot be set below that`,
      );
    }
  }

  /** A dedicated server cannot also be assigned to anyone else. */
  private async assertServerFreeForDedication(serverId: string, customerId: string) {
    const others = await this.prisma.tenantCustomerServer.count({
      where: {
        tenantFlussonicServerId: serverId,
        tenantCustomerId: { not: customerId },
        status: { not: 'DELETED' },
      },
    });
    if (others > 0) {
      throw new BadRequestException(
        `This server is assigned to ${others} other customer(s), so it cannot be marked dedicated`,
      );
    }
  }

  // ---------- Tenant self-service (scoped to the caller's business) ----------

  async findAllForTenantUser(tenantUserId: string, query: TenantCustomerServerListQueryDto) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.list(query, tenantBusinessId);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    const assignment = await this.prisma.tenantCustomerServer.findFirst({
      where: { id, tenantBusinessId, status: { not: 'DELETED' } },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return this.withUsage([assignment]).then((rows) => serializeAssignment(rows[0]));
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantCustomerServerSelfDto) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.create({ ...dto, tenantBusinessId }, tenantUserId);
  }

  async updateForTenantUser(
    tenantUserId: string,
    id: string,
    dto: UpdateTenantCustomerServerSelfDto,
  ) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.update(id, dto, tenantUserId);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.remove(id, tenantUserId);
  }

  private async getMappedBusinessId(tenantUserId: string): Promise<string> {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { tenantUserId, status: 'ACTIVE' },
      select: { tenantBusinessId: true },
    });
    if (!mapping) {
      throw new ForbiddenException('Your account is not mapped to a business');
    }
    return mapping.tenantBusinessId;
  }
}
