// src/services/tools-router.service.ts
import type { Client, CallSession } from '@prisma/client';
import logger from '../config/logger';
import { prisma } from '../config/db';
import { planService } from './plan.service';
import { completeTwilioCall } from '../config/twilio';
import { getIntakeFlowForClient } from './intake-config.service';
import type { IntakeStep } from '../types/intake';
import { emailService } from './email.service';

export interface ToolCallContext {
  client: Client;
  callSession: CallSession;
}

class ToolsRouterService {
  async handleFunctionCall(
    name: string,
    argsJson: string,
    context: ToolCallContext
  ): Promise<any> {
    switch (name) {
      case 'check_plan_status':
        return this.handleCheckPlanStatus(argsJson, context);
      case 'save_intake_lead':
        return this.handleSaveIntakeLead(argsJson, context);
      case 'end_call':
        return this.handleEndCall(context);
      default:
        logger.warn({ name }, 'Unknown tool/function name');
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async handleCheckPlanStatus(_argsJson: string, context: ToolCallContext) {
    const now = new Date();
    const result = await planService.checkClientPlanLimit(context.client.id, now);
    return {
      allowed: result.allowed,
      usedMinutes: result.usedMinutes,
      limitMinutes: result.limitMinutes,
      hardLimit: result.hardLimit
    };
  }

  private async handleSaveIntakeLead(argsJson: string, context: ToolCallContext) {
    let args: any;
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch (err) {
      logger.error({ err, argsJson }, 'Failed to parse save_intake_lead arguments');
      throw new Error('Invalid arguments for save_intake_lead');
    }

    const existing = await prisma.intakeLead.findFirst({
      where: { callSessionId: context.callSession.id }
    });

    if (existing) {
      logger.warn(
        { callSessionId: context.callSession.id, intakeLeadId: existing.id },
        'save_intake_lead called more than once'
      );
      return {
        ok: false,
        id: existing.id,
        error: 'intake_lead_already_saved'
      };
    }

    let name: string = args.name;
    let phone: string = args.phone;
    const email: string | null = args.email ?? null;
    let reason: string = args.reason;
    let preferredContactTime: string = args.preferredContactTime;
    let extraFields: Record<string, any> | undefined = this.extractExtraFields(args);
    const summary: string = args.summary;

    const flow = await getIntakeFlowForClient(
      context.client.id,
      context.client.locale
    );

    const hydrated = this.applySummaryFallback(summary, flow.steps as IntakeStep[], {
      name,
      phone,
      reason,
      preferredContactTime,
      extraFields
    });

    name = hydrated.name;
    phone = hydrated.phone;
    reason = hydrated.reason;
    preferredContactTime = hydrated.preferredContactTime;
    extraFields = hydrated.extraFields;

    const missing = await this.findMissingRequiredFields(context, {
      name,
      phone,
      reason,
      preferredContactTime,
      extraFields
    });

    const timeValidation = this.validatePreferredContactTime(
      preferredContactTime
    );
    if (!timeValidation.ok) {
      const label = this.getPreferredContactTimeLabel(flow.steps as IntakeStep[]);
      logger.warn(
        {
          callSessionId: context.callSession.id,
          preferredContactTime
        },
        'save_intake_lead invalid preferredContactTime'
      );
      return {
        ok: false,
        error: 'invalid_preferred_contact_time',
        missing: [{ id: 'preferredContactTime', label }]
      };
    }

    if (missing.length > 0) {
      logger.warn(
        {
          callSessionId: context.callSession.id,
          missing,
          extraFieldKeys: extraFields ? Object.keys(extraFields) : []
        },
        'save_intake_lead missing required fields'
      );
      return {
        ok: false,
        error: 'missing_required_fields',
        missing
      };
    }

    const lead = await prisma.intakeLead.create({
      data: {
        clientId: context.client.id,
        callSessionId: context.callSession.id,
        capturedName: name,
        capturedPhone: phone,
        capturedEmail: email,
        capturedReason: reason,
        preferredContactTime,
        rawSummary: summary,
        ...(extraFields ? { extraFields } : {})
      }
    });

    logger.info(
      {
        clientId: context.client.id,
        callSessionId: context.callSession.id,
        intakeLeadId: lead.id
      },
      'Intake lead saved'
    );

    void emailService.sendIntakeLeadEmail(context.client, lead, context.callSession);

    return {
      id: lead.id,
      ok: true
    };
  }

  private extractExtraFields(args: Record<string, any>): Record<string, any> | undefined {
    const base = (args.extraFields && typeof args.extraFields === 'object') ? { ...args.extraFields } : {};
    const known = new Set([
      'clientId',
      'callSessionId',
      'name',
      'phone',
      'email',
      'reason',
      'preferredContactTime',
      'summary',
      'extraFields'
    ]);

    for (const [key, value] of Object.entries(args)) {
      if (known.has(key)) continue;
      if (value === undefined || value === null) continue;
      base[key] = value;
    }

    return Object.keys(base).length > 0 ? base : undefined;
  }

  private async findMissingRequiredFields(
    context: ToolCallContext,
    args: {
      name: string;
      phone: string;
      reason: string;
      preferredContactTime: string;
      extraFields?: Record<string, any>;
    }
  ): Promise<Array<{ id: string; label: string }>> {
    const flow = await getIntakeFlowForClient(
      context.client.id,
      context.client.locale
    );

    const valueById: Record<string, string | undefined> = {
      name: args.name,
      phone: args.phone,
      reason: args.reason,
      preferredContactTime: args.preferredContactTime
    };

    const extras = args.extraFields ?? {};
    const normalizedExtras: Record<string, string> = {};
    for (const [key, value] of Object.entries(extras)) {
      if (value === undefined || value === null) continue;
      const normalized = this.normalizeKey(key);
      if (!normalized) continue;
      normalizedExtras[normalized] = String(value);
    }
    const missing: Array<{ id: string; label: string }> = [];

    for (const step of flow.steps as IntakeStep[]) {
      if (!step.required) continue;
      const normalizedId = this.normalizeKey(step.id);
      const normalizedLabel = this.normalizeKey(step.label);
      const raw =
        valueById[step.id] ??
        (extras[step.id] as string | undefined) ??
        (normalizedId ? normalizedExtras[normalizedId] : undefined) ??
        (normalizedLabel ? normalizedExtras[normalizedLabel] : undefined);
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      if (!trimmed) {
        missing.push({ id: step.id, label: step.label });
      }
    }

    return missing;
  }

  private normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private getPreferredContactTimeLabel(steps: IntakeStep[]): string {
    const match = steps.find((step) => step.id === 'preferredContactTime');
    if (match?.label) return match.label;
    return 'Preferred contact time';
  }

  private validatePreferredContactTime(value: string): { ok: boolean } {
    if (!value || typeof value !== 'string') {
      return { ok: false };
    }
    const trimmed = value.trim();
    if (!trimmed) return { ok: false };

    const now = new Date();
    const max = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    if (dateOnlyMatch) {
      const [year, month, day] = trimmed.split('-').map((part) => parseInt(part, 10));
      const date = new Date(year, month - 1, day);
      if (Number.isNaN(date.getTime())) return { ok: false };
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfMax = new Date(max.getFullYear(), max.getMonth(), max.getDate());
      if (date < startOfToday || date > endOfMax) return { ok: false };
      return { ok: true };
    }

    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      return { ok: false };
    }
    const when = new Date(parsed);
    if (when < now || when > max) return { ok: false };
    return { ok: true };
  }

  private applySummaryFallback(
    summary: string,
    steps: IntakeStep[],
    data: {
      name: string;
      phone: string;
      reason: string;
      preferredContactTime: string;
      extraFields?: Record<string, any>;
    }
  ) {
    if (!summary || typeof summary !== 'string') {
      return data;
    }

    const extraFields = data.extraFields ? { ...data.extraFields } : {};
    const knownMap: Record<string, string> = {
      name: data.name,
      phone: data.phone,
      reason: data.reason,
      preferredContactTime: data.preferredContactTime
    };

    for (const step of steps) {
      const current = knownMap[step.id] ?? (extraFields[step.id] as string | undefined);
      if (current && String(current).trim()) continue;

      const value =
        this.extractValueFromSummary(summary, step.label) ??
        this.extractValueFromSummary(summary, step.id);
      if (!value) continue;

      if (step.id in knownMap) {
        knownMap[step.id] = value;
      } else {
        extraFields[step.id] = value;
      }
    }

    return {
      name: knownMap.name,
      phone: knownMap.phone,
      reason: knownMap.reason,
      preferredContactTime: knownMap.preferredContactTime,
      extraFields: Object.keys(extraFields).length > 0 ? extraFields : data.extraFields
    };
  }

  private extractValueFromSummary(summary: string, label: string): string | null {
    if (!label) return null;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\s*[:\\-]\\s*([^,\\.\\n]+)`, 'i');
    const match = summary.match(regex);
    if (!match || !match[1]) return null;
    return match[1].trim();
  }

  private async handleEndCall(context: ToolCallContext) {
    const callSid = context.callSession.twilioCallSid;
    const lead = await prisma.intakeLead.findFirst({
      where: { callSessionId: context.callSession.id }
    });

    if (!lead) {
      logger.warn(
        { callSid, callSessionId: context.callSession.id },
        'Ignored end_call tool before intake lead was saved'
      );
      return {
        ok: false,
        error: 'lead_not_saved'
      };
    }

    try {
      await completeTwilioCall(callSid);
      logger.info({ callSid }, 'Call ended via end_call tool');
      return { ok: true };
    } catch (err) {
      logger.error({ err, callSid }, 'Failed to end call via end_call tool');
      return { ok: false, error: 'end_call_failed' };
    }
  }
}

export const toolsRouterService = new ToolsRouterService();
export type ToolsRouterServiceType = ToolsRouterService;
