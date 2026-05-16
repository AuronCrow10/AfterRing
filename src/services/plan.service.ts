// src/services/plan.service.ts
import { prisma } from '../config/db';
import { usageService } from './usage.service';
import logger from '../config/logger';

export interface PlanCheckResult {
  allowed: boolean;
  usedMinutes: number;
  limitMinutes: number;
  hardLimit: boolean;
}

class PlanService {
  async checkClientPlanLimit(clientId: string, now: Date): Promise<PlanCheckResult> {
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });

    if (!client) {
      logger.error({ clientId }, 'Client not found in plan check');
      throw new Error('Client not found');
    }

    const usedMinutes = await usageService.getClientUsedMinutesThisMonth(clientId, now);
    const limitMinutes = client.planMinutesLimit;
    const allowed = usedMinutes < limitMinutes;

    const result: PlanCheckResult = {
      allowed,
      usedMinutes,
      limitMinutes,
      hardLimit: client.hardLimit
    };

    logger.info(
      { clientId, usedMinutes, limitMinutes, allowed, hardLimit: client.hardLimit },
      'Plan check result'
    );

    return result;
  }
}

export const planService = new PlanService();
