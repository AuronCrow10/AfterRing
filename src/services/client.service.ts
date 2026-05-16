// src/services/client.service.ts
import { prisma } from '../config/db';
import type { Client, ClientNumber } from '@prisma/client';
import logger from '../config/logger';

class ClientService {
  async findClientByTwilioNumber(
    phoneNumber: string
  ): Promise<{ client: Client; clientNumber: ClientNumber } | null> {
    const record = await prisma.clientNumber.findFirst({
      where: { twilioPhoneNumber: phoneNumber },
      include: { client: true }
    });

    if (!record) {
      logger.warn({ phoneNumber }, 'ClientNumber not found for Twilio number');
      return null;
    }

    const { client, ...rest } = record as any;
    return {
      client: client as Client,
      clientNumber: rest as ClientNumber
    };
  }

  async getClientById(id: string): Promise<Client | null> {
    return prisma.client.findUnique({ where: { id } });
  }
}

export const clientService = new ClientService();
