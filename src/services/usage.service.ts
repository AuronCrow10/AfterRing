// src/services/usage.service.ts
import { prisma } from '../config/db';
import logger from '../config/logger';
import { getCurrentMonthStart, diffInSecondsCeil } from '../utils/time';

export type CallSessionStatus = 'active' | 'completed' | 'failed' | 'rejected' | 'blocked_plan_limit';

class UsageService {
  async getCallSessionByCallSid(callSid: string) {
    return prisma.callSession.findUnique({
      where: { twilioCallSid: callSid }
    });
  }

  async updateMediaStreamToken(callSessionId: string, mediaStreamToken: string) {
    return prisma.callSession.update({
      where: { id: callSessionId },
      data: { mediaStreamToken }
    });
  }
  async startCallSession(params: {
    clientId: string;
    clientNumberId: string;
    callSid: string;
    fromNumber: string;
    toNumber: string;
    mediaStreamToken: string;
  }) {
    const now = new Date();
    const session = await prisma.callSession.create({
      data: {
        clientId: params.clientId,
        clientNumberId: params.clientNumberId,
        twilioCallSid: params.callSid,
        mediaStreamToken: params.mediaStreamToken,
        fromNumber: params.fromNumber,
        toNumber: params.toNumber,
        startedAt: now,
        status: 'active'
      }
    });
    logger.info(
      {
        callSid: params.callSid,
        clientId: params.clientId,
        clientNumberId: params.clientNumberId,
        callSessionId: session.id
      },
      'Call session started'
    );
    return session;
  }

  async markBlockedByPlan(params: {
    clientId: string;
    clientNumberId: string;
    callSid: string;
    fromNumber: string;
    toNumber: string;
  }) {
    const now = new Date();
    const session = await prisma.callSession.create({
      data: {
        clientId: params.clientId,
        clientNumberId: params.clientNumberId,
        twilioCallSid: params.callSid,
        fromNumber: params.fromNumber,
        toNumber: params.toNumber,
        startedAt: now,
        endedAt: now,
        billableSeconds: 0,
        status: 'blocked_plan_limit'
      }
    });
    logger.info(
      {
        callSid: params.callSid,
        clientId: params.clientId,
        clientNumberId: params.clientNumberId,
        callSessionId: session.id
      },
      'Call session blocked by plan limit'
    );
    return session;
  }

  async finishCallSession(
    callSid: string,
    status: Exclude<CallSessionStatus, 'active'>
  ): Promise<void> {
    const existing = await prisma.callSession.findUnique({
      where: { twilioCallSid: callSid }
    });

    if (!existing) {
      logger.warn({ callSid }, 'finishCallSession called for unknown CallSid');
      return;
    }

    if (existing.endedAt) {
      logger.info(
        { callSid, callSessionId: existing.id },
        'finishCallSession already completed'
      );
      return;
    }

    const now = new Date();
    const startedAt = existing.startedAt;
    const seconds = diffInSecondsCeil(startedAt, now);
    const billedSeconds = Math.ceil(seconds / 60) * 60;

    await prisma.callSession.update({
      where: { id: existing.id },
      data: {
        endedAt: now,
        billableSeconds: billedSeconds,
        status
      }
    });

    logger.info(
      { callSid, callSessionId: existing.id, status, billableSeconds: seconds },
      'Call session finished'
    );
  }

  async getClientUsedMinutesThisMonth(clientId: string, now: Date): Promise<number> {
    const monthStart = getCurrentMonthStart(now);

    const aggregate = await prisma.callSession.aggregate({
      _sum: {
        billableSeconds: true
      },
      where: {
        clientId,
        startedAt: {
          gte: monthStart
        },
        status: {
          notIn: ['rejected', 'blocked_plan_limit']
        },
        endedAt: {
          not: null
        }
      }
    });

    const totalSeconds = aggregate._sum.billableSeconds ?? 0;
    const minutes = Math.ceil(totalSeconds / 60);
    return minutes;
  }
}

export const usageService = new UsageService();
