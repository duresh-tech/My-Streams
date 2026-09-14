import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** The one business a tenant user is mapped to; every billing call is scoped to it. */
export async function getMappedBusinessId(
  prisma: PrismaService,
  tenantUserId: string,
): Promise<string> {
  const mapping = await prisma.tenantMappedBusiness.findFirst({
    where: { tenantUserId, status: 'ACTIVE' },
    select: { tenantBusinessId: true },
  });
  if (!mapping) {
    throw new ForbiddenException('Your account is not mapped to a business');
  }
  return mapping.tenantBusinessId;
}
