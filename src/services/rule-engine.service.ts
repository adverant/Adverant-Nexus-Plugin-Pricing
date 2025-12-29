import { PrismaClient } from '@prisma/client';
import { getDay } from 'date-fns';
import {
  CreatePricingRuleInput,
  RuleConditions,
  AppliedRule,
  ValidationError
} from '../types/index.js';
import type { Logger } from 'pino';

interface RuleContext {
  daysUntilArrival?: number;
  lengthOfStay?: number;
  occupancyRate?: number;
  dayOfWeek?: number;
}

export class RuleEngineService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {}

  /**
   * Apply all active pricing rules for a property
   * Rules are evaluated in priority order (highest first)
   */
  async applyRules(
    propertyId: string,
    date: Date,
    currentPrice: number,
    context: RuleContext = {}
  ): Promise<{ price: number; appliedRules: AppliedRule[] }> {
    this.logger.debug({ propertyId, date, currentPrice, context }, 'Applying pricing rules');

    // Fetch active rules for this property (both property-specific and global)
    const rules = await this.prisma.pricingRule.findMany({
      where: {
        OR: [{ propertyId }, { propertyId: null }], // Property or global rules
        active: true,
        validFrom: { lte: date },
        OR: [{ validUntil: null }, { validUntil: { gte: date } }]
      },
      orderBy: { priority: 'desc' } // Higher priority first
    });

    if (rules.length === 0) {
      return { price: currentPrice, appliedRules: [] };
    }

    let adjustedPrice = currentPrice;
    const appliedRules: AppliedRule[] = [];

    // Add day of week to context
    const enrichedContext: RuleContext = {
      ...context,
      dayOfWeek: getDay(date)
    };

    // Apply each rule in priority order
    for (const rule of rules) {
      const conditions = rule.conditions as RuleConditions;

      // Check if rule conditions are met
      if (!this.evaluateConditions(conditions, date, enrichedContext)) {
        continue;
      }

      // Apply the rule adjustment
      const previousPrice = adjustedPrice;
      adjustedPrice = this.applyAdjustment(
        adjustedPrice,
        Number(rule.adjustment),
        rule.adjustmentType as 'MULTIPLIER' | 'FIXED_AMOUNT' | 'PERCENTAGE'
      );

      // Apply rule-specific constraints
      if (rule.minPrice && adjustedPrice < Number(rule.minPrice)) {
        adjustedPrice = Number(rule.minPrice);
      }
      if (rule.maxPrice && adjustedPrice > Number(rule.maxPrice)) {
        adjustedPrice = Number(rule.maxPrice);
      }

      // Record applied rule
      appliedRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.type,
        adjustment: Number(rule.adjustment),
        adjustmentType: rule.adjustmentType as 'MULTIPLIER' | 'FIXED_AMOUNT' | 'PERCENTAGE'
      });

      this.logger.debug(
        {
          ruleId: rule.id,
          ruleName: rule.name,
          previousPrice,
          newPrice: adjustedPrice
        },
        'Applied pricing rule'
      );
    }

    return { price: adjustedPrice, appliedRules };
  }

  /**
   * Evaluate if rule conditions are met
   */
  private evaluateConditions(
    conditions: RuleConditions,
    date: Date,
    context: RuleContext
  ): boolean {
    // Date range check
    if (conditions.dateRange) {
      const start = new Date(conditions.dateRange.start);
      const end = new Date(conditions.dateRange.end);
      if (date < start || date > end) {
        return false;
      }
    }

    // Day of week check
    if (conditions.daysOfWeek && conditions.daysOfWeek.length > 0) {
      const dayOfWeek = context.dayOfWeek ?? getDay(date);
      if (!conditions.daysOfWeek.includes(dayOfWeek)) {
        return false;
      }
    }

    // Occupancy threshold check
    if (conditions.occupancyThreshold && context.occupancyRate !== undefined) {
      const { min, max } = conditions.occupancyThreshold;
      if (min !== undefined && context.occupancyRate < min) {
        return false;
      }
      if (max !== undefined && context.occupancyRate > max) {
        return false;
      }
    }

    // Days until arrival check
    if (conditions.daysUntilArrival && context.daysUntilArrival !== undefined) {
      const { min, max } = conditions.daysUntilArrival;
      if (min !== undefined && context.daysUntilArrival < min) {
        return false;
      }
      if (max !== undefined && context.daysUntilArrival > max) {
        return false;
      }
    }

    // Length of stay check
    if (conditions.lengthOfStay && context.lengthOfStay !== undefined) {
      const { min, max } = conditions.lengthOfStay;
      if (min !== undefined && context.lengthOfStay < min) {
        return false;
      }
      if (max !== undefined && context.lengthOfStay > max) {
        return false;
      }
    }

    // Custom conditions evaluation
    if (conditions.customConditions) {
      // Evaluate custom conditions (can be extended based on requirements)
      // For now, we assume custom conditions are always met
      this.logger.debug({ customConditions: conditions.customConditions }, 'Custom conditions present');
    }

    return true;
  }

  /**
   * Apply pricing adjustment based on type
   */
  private applyAdjustment(
    currentPrice: number,
    adjustment: number,
    adjustmentType: 'MULTIPLIER' | 'FIXED_AMOUNT' | 'PERCENTAGE'
  ): number {
    switch (adjustmentType) {
      case 'MULTIPLIER':
        return currentPrice * adjustment;

      case 'FIXED_AMOUNT':
        return currentPrice + adjustment;

      case 'PERCENTAGE':
        return currentPrice * (1 + adjustment / 100);

      default:
        this.logger.warn({ adjustmentType }, 'Unknown adjustment type');
        return currentPrice;
    }
  }

  /**
   * Create a new pricing rule
   */
  async createRule(input: CreatePricingRuleInput) {
    this.logger.info({ input }, 'Creating pricing rule');

    this.validateRuleInput(input);

    const rule = await this.prisma.pricingRule.create({
      data: {
        propertyId: input.propertyId,
        name: input.name,
        description: input.description,
        type: input.type,
        priority: input.priority,
        config: input.config as any,
        conditions: input.conditions as any,
        adjustment: input.adjustment,
        adjustmentType: input.adjustmentType,
        minPrice: input.minPrice,
        maxPrice: input.maxPrice,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        active: input.active ?? true
      }
    });

    return rule;
  }

  /**
   * Update an existing pricing rule
   */
  async updateRule(
    ruleId: string,
    updates: Partial<CreatePricingRuleInput>
  ) {
    this.logger.info({ ruleId, updates }, 'Updating pricing rule');

    const rule = await this.prisma.pricingRule.update({
      where: { id: ruleId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.description !== undefined && {
          description: updates.description
        }),
        ...(updates.type && { type: updates.type }),
        ...(updates.priority !== undefined && { priority: updates.priority }),
        ...(updates.config && { config: updates.config as any }),
        ...(updates.conditions && { conditions: updates.conditions as any }),
        ...(updates.adjustment !== undefined && {
          adjustment: updates.adjustment
        }),
        ...(updates.adjustmentType && {
          adjustmentType: updates.adjustmentType
        }),
        ...(updates.minPrice !== undefined && { minPrice: updates.minPrice }),
        ...(updates.maxPrice !== undefined && { maxPrice: updates.maxPrice }),
        ...(updates.validFrom && { validFrom: updates.validFrom }),
        ...(updates.validUntil !== undefined && {
          validUntil: updates.validUntil
        }),
        ...(updates.active !== undefined && { active: updates.active })
      }
    });

    return rule;
  }

  /**
   * Delete a pricing rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    await this.prisma.pricingRule.delete({
      where: { id: ruleId }
    });
  }

  /**
   * Get all rules for a property
   */
  async getRules(propertyId?: string, includeGlobal = true) {
    const where: any = { active: true };

    if (propertyId) {
      where.OR = [{ propertyId }];
      if (includeGlobal) {
        where.OR.push({ propertyId: null });
      }
    } else {
      where.propertyId = null;
    }

    return await this.prisma.pricingRule.findMany({
      where,
      orderBy: { priority: 'desc' }
    });
  }

  /**
   * Validate rule input
   */
  private validateRuleInput(input: CreatePricingRuleInput): void {
    if (!input.name) {
      throw new ValidationError('Rule name is required');
    }

    if (!input.type) {
      throw new ValidationError('Rule type is required');
    }

    if (input.adjustment === undefined) {
      throw new ValidationError('Adjustment value is required');
    }

    if (!input.adjustmentType) {
      throw new ValidationError('Adjustment type is required');
    }

    if (!input.validFrom) {
      throw new ValidationError('Valid from date is required');
    }

    // Validate adjustment type values
    if (input.adjustmentType === 'MULTIPLIER') {
      if (input.adjustment <= 0) {
        throw new ValidationError('Multiplier must be positive');
      }
    }

    if (input.adjustmentType === 'PERCENTAGE') {
      if (input.adjustment < -100) {
        throw new ValidationError('Percentage cannot be less than -100%');
      }
    }

    // Validate min/max constraints
    if (
      input.minPrice !== undefined &&
      input.maxPrice !== undefined &&
      input.minPrice > input.maxPrice
    ) {
      throw new ValidationError('Min price cannot be greater than max price');
    }

    // Validate date range
    if (
      input.validUntil &&
      new Date(input.validUntil) < new Date(input.validFrom)
    ) {
      throw new ValidationError('Valid until date must be after valid from date');
    }
  }

  /**
   * Create preset rules for common scenarios
   */
  async createPresetRules(propertyId: string, basePrice: number): Promise<void> {
    const today = new Date();
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const presets: CreatePricingRuleInput[] = [
      // Weekend premium
      {
        name: 'Weekend Premium',
        description: 'Apply 20% premium on Friday-Sunday',
        type: 'WEEKEND',
        priority: 10,
        config: {},
        conditions: {
          daysOfWeek: [5, 6, 0] // Friday, Saturday, Sunday
        },
        adjustment: 1.2,
        adjustmentType: 'MULTIPLIER',
        validFrom: today,
        propertyId
      },

      // Last minute discount
      {
        name: 'Last Minute Discount',
        description: 'Apply 15% discount for bookings within 3 days',
        type: 'LAST_MINUTE',
        priority: 20,
        config: {},
        conditions: {
          daysUntilArrival: { min: 0, max: 3 }
        },
        adjustment: -15,
        adjustmentType: 'PERCENTAGE',
        validFrom: today,
        propertyId
      },

      // Weekly discount
      {
        name: 'Weekly Stay Discount',
        description: 'Apply 10% discount for 7+ night stays',
        type: 'LENGTH_OF_STAY',
        priority: 15,
        config: {},
        conditions: {
          lengthOfStay: { min: 7 }
        },
        adjustment: -10,
        adjustmentType: 'PERCENTAGE',
        validFrom: today,
        propertyId
      },

      // High occupancy premium
      {
        name: 'High Demand Premium',
        description: 'Apply 25% premium when occupancy > 80%',
        type: 'OCCUPANCY_BASED',
        priority: 25,
        config: {},
        conditions: {
          occupancyThreshold: { min: 0.8 }
        },
        adjustment: 1.25,
        adjustmentType: 'MULTIPLIER',
        validFrom: today,
        propertyId
      },

      // Low occupancy discount
      {
        name: 'Low Demand Discount',
        description: 'Apply 15% discount when occupancy < 30%',
        type: 'OCCUPANCY_BASED',
        priority: 25,
        config: {},
        conditions: {
          occupancyThreshold: { max: 0.3 }
        },
        adjustment: -15,
        adjustmentType: 'PERCENTAGE',
        validFrom: today,
        propertyId
      }
    ];

    // Create all preset rules
    for (const preset of presets) {
      try {
        await this.createRule(preset);
      } catch (error) {
        this.logger.warn(
          { error, ruleName: preset.name },
          'Failed to create preset rule'
        );
      }
    }

    this.logger.info({ propertyId }, 'Created preset pricing rules');
  }
}
