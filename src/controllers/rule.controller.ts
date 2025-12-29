import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RuleEngineService } from '../services/rule-engine.service.js';
import { RuleType, CreatePricingRuleInput } from '../types/index.js';
import type { Logger } from 'pino';

// Validation schemas
const CreateRuleSchema = z.object({
  propertyId: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.nativeEnum(RuleType),
  priority: z.number().int(),
  config: z.record(z.unknown()),
  conditions: z.object({
    dateRange: z
      .object({
        start: z.string().datetime(),
        end: z.string().datetime()
      })
      .optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    occupancyThreshold: z
      .object({
        min: z.number().min(0).max(1).optional(),
        max: z.number().min(0).max(1).optional()
      })
      .optional(),
    daysUntilArrival: z
      .object({
        min: z.number().int().min(0).optional(),
        max: z.number().int().min(0).optional()
      })
      .optional(),
    lengthOfStay: z
      .object({
        min: z.number().int().min(1).optional(),
        max: z.number().int().min(1).optional()
      })
      .optional(),
    customConditions: z.record(z.unknown()).optional()
  }),
  adjustment: z.number(),
  adjustmentType: z.enum(['MULTIPLIER', 'FIXED_AMOUNT', 'PERCENTAGE']),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
  active: z.boolean().optional()
});

const UpdateRuleSchema = CreateRuleSchema.partial();

export class RuleController {
  constructor(
    private readonly ruleEngine: RuleEngineService,
    private readonly logger: Logger
  ) {}

  /**
   * Get all pricing rules
   * GET /api/v1/rules
   */
  async getRules(
    request: FastifyRequest<{
      Querystring: { propertyId?: string; includeGlobal?: string };
    }>,
    reply: FastifyReply
  ) {
    try {
      const propertyId = request.query.propertyId;
      const includeGlobal =
        request.query.includeGlobal === undefined ||
        request.query.includeGlobal === 'true';

      const rules = await this.ruleEngine.getRules(propertyId, includeGlobal);

      return reply.status(200).send({
        success: true,
        data: rules
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new pricing rule
   * POST /api/v1/rules
   */
  async createRule(
    request: FastifyRequest<{ Body: CreatePricingRuleInput }>,
    reply: FastifyReply
  ) {
    try {
      const validated = CreateRuleSchema.parse(request.body);

      // Transform dates in conditions
      const conditions = {
        ...validated.conditions,
        dateRange: validated.conditions.dateRange
          ? {
              start: new Date(validated.conditions.dateRange.start),
              end: new Date(validated.conditions.dateRange.end)
            }
          : undefined
      };

      const rule = await this.ruleEngine.createRule({
        ...validated,
        conditions,
        validFrom: new Date(validated.validFrom),
        validUntil: validated.validUntil
          ? new Date(validated.validUntil)
          : undefined
      });

      return reply.status(201).send({
        success: true,
        data: rule
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
   * Update an existing pricing rule
   * PUT /api/v1/rules/:id
   */
  async updateRule(
    request: FastifyRequest<{
      Params: { id: string };
      Body: Partial<CreatePricingRuleInput>;
    }>,
    reply: FastifyReply
  ) {
    try {
      const ruleId = request.params.id;
      const validated = UpdateRuleSchema.parse(request.body);

      // Transform dates in conditions if present
      const conditions = validated.conditions
        ? {
            ...validated.conditions,
            dateRange: validated.conditions.dateRange
              ? {
                  start: new Date(validated.conditions.dateRange.start),
                  end: new Date(validated.conditions.dateRange.end)
                }
              : undefined
          }
        : undefined;

      const updates = {
        ...validated,
        ...(conditions && { conditions }),
        ...(validated.validFrom && { validFrom: new Date(validated.validFrom) }),
        ...(validated.validUntil && {
          validUntil: new Date(validated.validUntil)
        })
      };

      const rule = await this.ruleEngine.updateRule(ruleId, updates);

      return reply.status(200).send({
        success: true,
        data: rule
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
   * Delete a pricing rule
   * DELETE /api/v1/rules/:id
   */
  async deleteRule(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const ruleId = request.params.id;
      await this.ruleEngine.deleteRule(ruleId);

      return reply.status(200).send({
        success: true,
        message: 'Rule deleted successfully'
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create preset rules for a property
   * POST /api/v1/rules/presets/:propertyId
   */
  async createPresetRules(
    request: FastifyRequest<{
      Params: { propertyId: string };
      Body: { basePrice: number };
    }>,
    reply: FastifyReply
  ) {
    try {
      const { propertyId } = request.params;
      const { basePrice } = request.body;

      if (!basePrice || basePrice <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'Base price must be a positive number'
        });
      }

      await this.ruleEngine.createPresetRules(propertyId, basePrice);

      return reply.status(201).send({
        success: true,
        message: 'Preset rules created successfully'
      });
    } catch (error) {
      throw error;
    }
  }
}
