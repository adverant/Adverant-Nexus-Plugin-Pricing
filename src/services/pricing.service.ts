import { PrismaClient } from '@prisma/client';
import { addDays, differenceInDays, getDay, isWeekend } from 'date-fns';
import {
  PriceCalculationInput,
  PriceCalculationResult,
  PricingFactors,
  NotFoundError,
  ValidationError,
  AppliedRule
} from '../types/index.js';
import { RuleEngineService } from './rule-engine.service.js';
import { MarketAnalysisService } from './market-analysis.service.js';
import { config } from '../config/config.js';
import type { Logger } from 'pino';

export class PricingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ruleEngine: RuleEngineService,
    private readonly marketAnalysis: MarketAnalysisService,
    private readonly logger: Logger
  ) {}

  /**
   * Calculate dynamic price for a property on a specific date
   */
  async calculatePrice(
    input: PriceCalculationInput
  ): Promise<PriceCalculationResult> {
    this.logger.info({ input }, 'Calculating price');

    // Validate input
    this.validateInput(input);

    // Get base price configuration
    const basePriceConfig = await this.prisma.propertyBasePrice.findUnique({
      where: { propertyId: input.propertyId }
    });

    if (!basePriceConfig) {
      throw new NotFoundError(
        `Base price not configured for property ${input.propertyId}`,
        { propertyId: input.propertyId }
      );
    }

    const basePrice = Number(basePriceConfig.basePrice);

    // Check for manual overrides first
    const override = await this.checkPriceOverride(input.propertyId, input.date);
    if (override) {
      return {
        date: input.date,
        basePrice,
        calculatedPrice: Number(override.overridePrice),
        finalPrice: Number(override.overridePrice),
        factors: this.getDefaultFactors(),
        appliedRules: [],
        currency: basePriceConfig.currency
      };
    }

    // Calculate pricing factors
    const factors = await this.calculatePricingFactors(input);

    // Apply base factors to get calculated price
    let calculatedPrice = this.applyFactors(basePrice, factors);

    // Apply pricing rules
    const { price: ruleAdjustedPrice, appliedRules } =
      await this.ruleEngine.applyRules(input.propertyId, input.date, calculatedPrice, {
        daysUntilArrival: input.daysUntilArrival,
        lengthOfStay: input.lengthOfStay,
        occupancyRate: input.occupancyRate
      });

    calculatedPrice = ruleAdjustedPrice;

    // Apply min/max constraints
    const finalPrice = this.applyPriceConstraints(
      calculatedPrice,
      basePriceConfig.minPrice ? Number(basePriceConfig.minPrice) : undefined,
      basePriceConfig.maxPrice ? Number(basePriceConfig.maxPrice) : undefined,
      basePrice
    );

    // Store the calculated price
    await this.storeDynamicPrice({
      propertyId: input.propertyId,
      date: input.date,
      basePrice,
      calculatedPrice,
      finalPrice,
      factors,
      appliedRules,
      currency: basePriceConfig.currency
    });

    return {
      date: input.date,
      basePrice,
      calculatedPrice,
      finalPrice,
      factors,
      appliedRules,
      currency: basePriceConfig.currency
    };
  }

  /**
   * Calculate prices for a date range (pricing calendar)
   */
  async calculatePriceCalendar(
    propertyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PriceCalculationResult[]> {
    this.logger.info({ propertyId, startDate, endDate }, 'Calculating price calendar');

    const results: PriceCalculationResult[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const result = await this.calculatePrice({
        propertyId,
        date: new Date(currentDate),
        daysUntilArrival: differenceInDays(currentDate, new Date())
      });

      results.push(result);
      currentDate = addDays(currentDate, 1);
    }

    return results;
  }

  /**
   * Calculate all pricing factors
   */
  private async calculatePricingFactors(
    input: PriceCalculationInput
  ): Promise<PricingFactors> {
    const [
      seasonalFactor,
      weekendFactor,
      demandFactor,
      eventFactor,
      lastMinuteFactor,
      losDiscountFactor
    ] = await Promise.all([
      this.calculateSeasonalFactor(input.date),
      this.calculateWeekendFactor(input.date),
      this.calculateDemandFactor(input.propertyId, input.date, input.occupancyRate),
      this.calculateEventFactor(input.propertyId, input.date),
      this.calculateLastMinuteFactor(input.daysUntilArrival),
      this.calculateLengthOfStayDiscount(input.lengthOfStay)
    ]);

    return {
      seasonalFactor,
      weekendFactor,
      demandFactor,
      eventFactor,
      lastMinuteFactor,
      losDiscountFactor
    };
  }

  /**
   * Seasonal pricing factor based on month and historical patterns
   */
  private async calculateSeasonalFactor(date: Date): Promise<number> {
    const month = date.getMonth();

    // Basic seasonal adjustments (can be enhanced with ML)
    const seasonalMap: Record<number, number> = {
      0: 0.85, // January - low season
      1: 0.90, // February
      2: 0.95, // March
      3: 1.05, // April - shoulder season
      4: 1.15, // May
      5: 1.30, // June - high season
      6: 1.35, // July - peak
      7: 1.35, // August - peak
      8: 1.20, // September - high season
      9: 1.10, // October - shoulder
      10: 0.95, // November
      11: 1.00  // December - holiday season
    };

    return seasonalMap[month] ?? 1.0;
  }

  /**
   * Weekend premium factor
   */
  private async calculateWeekendFactor(date: Date): Promise<number> {
    if (isWeekend(date)) {
      return 1.20; // 20% weekend premium
    }

    const dayOfWeek = getDay(date);
    // Thursday and Friday get slight premium
    if (dayOfWeek === 4 || dayOfWeek === 5) {
      return 1.05;
    }

    return 1.0;
  }

  /**
   * Demand-based pricing factor using occupancy and market data
   */
  private async calculateDemandFactor(
    propertyId: string,
    date: Date,
    providedOccupancy?: number
  ): Promise<number> {
    try {
      // Get market analysis data
      const marketData = await this.marketAnalysis.getMarketAnalysis(
        propertyId,
        date
      );

      // Use provided occupancy or fetch from market data
      const occupancy = providedOccupancy ?? Number(marketData?.predictedOccupancy ?? 0.5);

      // Dynamic pricing based on occupancy
      // Higher occupancy = higher prices
      if (occupancy >= 0.9) return 1.50;  // 90%+ occupancy: +50%
      if (occupancy >= 0.8) return 1.35;  // 80-90%: +35%
      if (occupancy >= 0.7) return 1.20;  // 70-80%: +20%
      if (occupancy >= 0.6) return 1.10;  // 60-70%: +10%
      if (occupancy >= 0.5) return 1.00;  // 50-60%: base
      if (occupancy >= 0.4) return 0.95;  // 40-50%: -5%
      if (occupancy >= 0.3) return 0.90;  // 30-40%: -10%
      return 0.85;  // <30%: -15% to stimulate demand

    } catch (error) {
      this.logger.warn({ error, propertyId, date }, 'Failed to get demand factor');
      return 1.0; // Default to neutral
    }
  }

  /**
   * Event-based pricing factor for local events
   */
  private async calculateEventFactor(
    propertyId: string,
    date: Date
  ): Promise<number> {
    if (!config.features.enableEventDetection) {
      return 1.0;
    }

    try {
      const marketData = await this.marketAnalysis.getMarketAnalysis(
        propertyId,
        date
      );

      if (!marketData?.localEvents) {
        return 1.0;
      }

      const events = marketData.localEvents as Array<{
        impact: string;
        date: Date;
      }>;

      // Check for events on or near this date
      const relevantEvents = events.filter(event => {
        const eventDate = new Date(event.date);
        const daysDiff = Math.abs(differenceInDays(date, eventDate));
        return daysDiff <= 2; // Events within 2 days
      });

      if (relevantEvents.length === 0) {
        return 1.0;
      }

      // Apply event impact
      const maxImpact = relevantEvents.reduce((max, event) => {
        const impactMap: Record<string, number> = {
          HIGH: 1.50,
          MEDIUM: 1.25,
          LOW: 1.10
        };
        const impact = impactMap[event.impact] ?? 1.0;
        return Math.max(max, impact);
      }, 1.0);

      return maxImpact;

    } catch (error) {
      this.logger.warn({ error, propertyId, date }, 'Failed to get event factor');
      return 1.0;
    }
  }

  /**
   * Last-minute booking pricing
   */
  private async calculateLastMinuteFactor(
    daysUntilArrival?: number
  ): Promise<number> {
    if (!daysUntilArrival) {
      return 1.0;
    }

    // Last-minute discounts to fill inventory
    if (daysUntilArrival <= 1) return 0.80;  // Day before: -20%
    if (daysUntilArrival <= 3) return 0.90;  // 2-3 days: -10%
    if (daysUntilArrival <= 7) return 0.95;  // Week before: -5%

    // Early booking premium
    if (daysUntilArrival >= 90) return 1.10;  // 90+ days: +10%
    if (daysUntilArrival >= 60) return 1.05;  // 60+ days: +5%

    return 1.0;
  }

  /**
   * Length of stay discounts
   */
  private async calculateLengthOfStayDiscount(
    lengthOfStay?: number
  ): Promise<number> {
    if (!lengthOfStay || lengthOfStay < 2) {
      return 1.0;
    }

    // Volume discounts for longer stays
    if (lengthOfStay >= 30) return 0.75;  // Monthly: -25%
    if (lengthOfStay >= 14) return 0.85;  // 2+ weeks: -15%
    if (lengthOfStay >= 7) return 0.90;   // Week: -10%
    if (lengthOfStay >= 3) return 0.95;   // 3+ nights: -5%

    return 1.0;
  }

  /**
   * Apply all factors to base price
   */
  private applyFactors(basePrice: number, factors: PricingFactors): number {
    return (
      basePrice *
      factors.seasonalFactor *
      factors.weekendFactor *
      factors.demandFactor *
      factors.eventFactor *
      factors.lastMinuteFactor *
      factors.losDiscountFactor
    );
  }

  /**
   * Apply min/max price constraints
   */
  private applyPriceConstraints(
    price: number,
    minPrice: number | undefined,
    maxPrice: number | undefined,
    basePrice: number
  ): number {
    // Default constraints based on config
    const absoluteMin = basePrice * config.pricing.minPriceFactor;
    const absoluteMax = basePrice * config.pricing.maxPriceFactor;

    const effectiveMin = minPrice ?? absoluteMin;
    const effectiveMax = maxPrice ?? absoluteMax;

    return Math.min(Math.max(price, effectiveMin), effectiveMax);
  }

  /**
   * Check for manual price overrides
   */
  private async checkPriceOverride(propertyId: string, date: Date) {
    return await this.prisma.priceOverride.findFirst({
      where: {
        propertyId,
        date,
        active: true,
        validFrom: { lte: new Date() },
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }]
      }
    });
  }

  /**
   * Store calculated price in database
   */
  private async storeDynamicPrice(data: {
    propertyId: string;
    date: Date;
    basePrice: number;
    calculatedPrice: number;
    finalPrice: number;
    factors: PricingFactors;
    appliedRules: AppliedRule[];
    currency: string;
  }): Promise<void> {
    try {
      await this.prisma.dynamicPrice.upsert({
        where: {
          propertyId_date: {
            propertyId: data.propertyId,
            date: data.date
          }
        },
        create: {
          propertyId: data.propertyId,
          date: data.date,
          basePrice: data.basePrice,
          calculatedPrice: data.calculatedPrice,
          finalPrice: data.finalPrice,
          currency: data.currency,
          seasonalFactor: data.factors.seasonalFactor,
          weekendFactor: data.factors.weekendFactor,
          demandFactor: data.factors.demandFactor,
          eventFactor: data.factors.eventFactor,
          lastMinuteFactor: data.factors.lastMinuteFactor,
          losDiscountFactor: data.factors.losDiscountFactor,
          appliedRuleIds: data.appliedRules.map(r => r.ruleId)
        },
        update: {
          calculatedPrice: data.calculatedPrice,
          finalPrice: data.finalPrice,
          seasonalFactor: data.factors.seasonalFactor,
          weekendFactor: data.factors.weekendFactor,
          demandFactor: data.factors.demandFactor,
          eventFactor: data.factors.eventFactor,
          lastMinuteFactor: data.factors.lastMinuteFactor,
          losDiscountFactor: data.factors.losDiscountFactor,
          appliedRuleIds: data.appliedRules.map(r => r.ruleId),
          updatedAt: new Date()
        }
      });

      // Track price changes for auditing
      const previousPrice = await this.prisma.dynamicPrice.findFirst({
        where: {
          propertyId: data.propertyId,
          date: data.date
        },
        select: { finalPrice: true }
      });

      if (
        previousPrice &&
        Number(previousPrice.finalPrice) !== data.finalPrice
      ) {
        const changePercent =
          ((data.finalPrice - Number(previousPrice.finalPrice)) /
            Number(previousPrice.finalPrice)) *
          100;

        await this.prisma.priceChangeHistory.create({
          data: {
            propertyId: data.propertyId,
            date: data.date,
            previousPrice: previousPrice.finalPrice,
            newPrice: data.finalPrice,
            changePercent,
            reason: 'Automatic recalculation',
            triggeredBy: 'SYSTEM'
          }
        });
      }
    } catch (error) {
      this.logger.error({ error, data }, 'Failed to store dynamic price');
      // Don't fail the request if storage fails
    }
  }

  /**
   * Create manual price override
   */
  async createPriceOverride(
    propertyId: string,
    date: Date,
    overridePrice: number,
    reason: string,
    createdBy: string,
    validUntil?: Date
  ): Promise<void> {
    await this.prisma.priceOverride.create({
      data: {
        propertyId,
        date,
        overridePrice,
        reason,
        createdBy,
        validUntil
      }
    });

    // Recalculate price to update the stored value
    await this.calculatePrice({ propertyId, date });
  }

  /**
   * Bulk update prices for a date range
   */
  async bulkUpdatePrices(
    propertyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    let updated = 0;
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      await this.calculatePrice({ propertyId, date: new Date(currentDate) });
      updated++;
      currentDate = addDays(currentDate, 1);
    }

    return updated;
  }

  /**
   * Get default factors (neutral)
   */
  private getDefaultFactors(): PricingFactors {
    return {
      seasonalFactor: 1.0,
      weekendFactor: 1.0,
      demandFactor: 1.0,
      eventFactor: 1.0,
      lastMinuteFactor: 1.0,
      losDiscountFactor: 1.0
    };
  }

  /**
   * Validate calculation input
   */
  private validateInput(input: PriceCalculationInput): void {
    if (!input.propertyId) {
      throw new ValidationError('Property ID is required');
    }

    if (!input.date) {
      throw new ValidationError('Date is required');
    }

    if (input.lengthOfStay !== undefined && input.lengthOfStay < 1) {
      throw new ValidationError('Length of stay must be at least 1 night');
    }

    if (
      input.daysUntilArrival !== undefined &&
      input.daysUntilArrival < 0
    ) {
      throw new ValidationError('Days until arrival cannot be negative');
    }

    if (
      input.occupancyRate !== undefined &&
      (input.occupancyRate < 0 || input.occupancyRate > 1)
    ) {
      throw new ValidationError('Occupancy rate must be between 0 and 1');
    }
  }
}
