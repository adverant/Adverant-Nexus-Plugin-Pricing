import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PricingService } from '../services/pricing.service.js';
import { ValidationError } from '../types/index.js';
import type { Logger } from 'pino';

// Request validation schemas
const CalculatePriceSchema = z.object({
  propertyId: z.string().uuid(),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  checkIn: z.string().datetime().optional(),
  checkOut: z.string().datetime().optional(),
  lengthOfStay: z.number().int().min(1).optional(),
  daysUntilArrival: z.number().int().min(0).optional(),
  occupancyRate: z.number().min(0).max(1).optional()
});

const PriceCalendarSchema = z.object({
  propertyId: z.string().uuid(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
});

const PriceOverrideSchema = z.object({
  propertyId: z.string().uuid(),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  overridePrice: z.number().positive(),
  reason: z.string().min(1),
  createdBy: z.string().min(1),
  validUntil: z.string().datetime().optional()
});

const BulkUpdateSchema = z.object({
  propertyId: z.string().uuid(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
});

export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly logger: Logger
  ) {}

  /**
   * Calculate price for a property on a specific date
   * GET /api/v1/pricing/:propertyId/calculate
   */
  async calculatePrice(
    request: FastifyRequest<{
      Params: { propertyId: string };
      Querystring: {
        date: string;
        checkIn?: string;
        checkOut?: string;
        lengthOfStay?: string;
        daysUntilArrival?: string;
        occupancyRate?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const input = {
        propertyId: request.params.propertyId,
        date: request.query.date,
        checkIn: request.query.checkIn,
        checkOut: request.query.checkOut,
        lengthOfStay: request.query.lengthOfStay
          ? parseInt(request.query.lengthOfStay, 10)
          : undefined,
        daysUntilArrival: request.query.daysUntilArrival
          ? parseInt(request.query.daysUntilArrival, 10)
          : undefined,
        occupancyRate: request.query.occupancyRate
          ? parseFloat(request.query.occupancyRate)
          : undefined
      };

      const validated = CalculatePriceSchema.parse(input);

      const result = await this.pricingService.calculatePrice({
        propertyId: validated.propertyId,
        date: new Date(validated.date),
        checkIn: validated.checkIn ? new Date(validated.checkIn) : undefined,
        checkOut: validated.checkOut ? new Date(validated.checkOut) : undefined,
        lengthOfStay: validated.lengthOfStay,
        daysUntilArrival: validated.daysUntilArrival,
        occupancyRate: validated.occupancyRate
      });

      return reply.status(200).send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
      }
      throw error;
    }
  }

  /**
   * Get pricing calendar for a date range
   * GET /api/v1/pricing/:propertyId/calendar
   */
  async getPricingCalendar(
    request: FastifyRequest<{
      Params: { propertyId: string };
      Querystring: { startDate: string; endDate: string };
    }>,
    reply: FastifyReply
  ) {
    try {
      const input = {
        propertyId: request.params.propertyId,
        startDate: request.query.startDate,
        endDate: request.query.endDate
      };

      const validated = PriceCalendarSchema.parse(input);

      const calendar = await this.pricingService.calculatePriceCalendar(
        validated.propertyId,
        new Date(validated.startDate),
        new Date(validated.endDate)
      );

      return reply.status(200).send({
        success: true,
        data: {
          propertyId: validated.propertyId,
          startDate: validated.startDate,
          endDate: validated.endDate,
          prices: calendar
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
      }
      throw error;
    }
  }

  /**
   * Create manual price override
   * POST /api/v1/pricing/:propertyId/override
   */
  async createPriceOverride(
    request: FastifyRequest<{
      Params: { propertyId: string };
      Body: {
        date: string;
        overridePrice: number;
        reason: string;
        createdBy: string;
        validUntil?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const input = {
        propertyId: request.params.propertyId,
        ...request.body
      };

      const validated = PriceOverrideSchema.parse(input);

      await this.pricingService.createPriceOverride(
        validated.propertyId,
        new Date(validated.date),
        validated.overridePrice,
        validated.reason,
        validated.createdBy,
        validated.validUntil ? new Date(validated.validUntil) : undefined
      );

      return reply.status(201).send({
        success: true,
        message: 'Price override created successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
      }
      throw error;
    }
  }

  /**
   * Bulk update prices for a date range
   * POST /api/v1/pricing/:propertyId/bulk-update
   */
  async bulkUpdatePrices(
    request: FastifyRequest<{
      Params: { propertyId: string };
      Body: { startDate: string; endDate: string };
    }>,
    reply: FastifyReply
  ) {
    try {
      const input = {
        propertyId: request.params.propertyId,
        ...request.body
      };

      const validated = BulkUpdateSchema.parse(input);

      const updated = await this.pricingService.bulkUpdatePrices(
        validated.propertyId,
        new Date(validated.startDate),
        new Date(validated.endDate)
      );

      return reply.status(200).send({
        success: true,
        data: {
          updated,
          message: `Successfully updated ${updated} prices`
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
      }
      throw error;
    }
  }
}
