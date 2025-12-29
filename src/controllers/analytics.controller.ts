import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { differenceInDays } from 'date-fns';
import { MarketAnalysisService } from '../services/market-analysis.service.js';
import { MLIntegrationService } from '../services/ml-integration.service.js';
import type { Logger } from 'pino';

// Validation schemas
const AnalyticsQuerySchema = z.object({
  propertyId: z.string().uuid(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
});

const ForecastQuerySchema = z.object({
  propertyId: z.string().uuid(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  modelType: z.enum(['DEMAND', 'OCCUPANCY', 'REVENUE']).optional()
});

const TrainingRequestSchema = z.object({
  modelType: z.enum(['PROPHET', 'LSTM', 'OPTIMIZATION']),
  propertyId: z.string().uuid().optional(),
  parameters: z.record(z.unknown()).optional()
});

export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly marketAnalysis: MarketAnalysisService,
    private readonly mlService: MLIntegrationService,
    private readonly logger: Logger
  ) {}

  /**
   * Get revenue analytics for a property
   * GET /api/v1/analytics/:propertyId
   */
  async getAnalytics(
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

      const validated = AnalyticsQuerySchema.parse(input);

      const analytics = await this.calculateAnalytics(
        validated.propertyId,
        new Date(validated.startDate),
        new Date(validated.endDate)
      );

      return reply.status(200).send({
        success: true,
        data: analytics
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
   * Get forecast for a property
   * GET /api/v1/forecast/:propertyId
   */
  async getForecast(
    request: FastifyRequest<{
      Params: { propertyId: string };
      Querystring: {
        startDate: string;
        endDate: string;
        modelType?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const input = {
        propertyId: request.params.propertyId,
        startDate: request.query.startDate,
        endDate: request.query.endDate,
        modelType: request.query.modelType || 'OCCUPANCY'
      };

      const validated = ForecastQuerySchema.parse(input);

      const forecast = await this.mlService.getForecast({
        propertyId: validated.propertyId,
        startDate: new Date(validated.startDate),
        endDate: new Date(validated.endDate),
        modelType: (validated.modelType || 'OCCUPANCY') as
          | 'DEMAND'
          | 'OCCUPANCY'
          | 'REVENUE'
      });

      return reply.status(200).send({
        success: true,
        data: forecast
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
   * Get market trends
   * GET /api/v1/analytics/:propertyId/trends
   */
  async getMarketTrends(
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

      const validated = AnalyticsQuerySchema.parse(input);

      const trends = await this.marketAnalysis.getMarketTrends(
        validated.propertyId,
        new Date(validated.startDate),
        new Date(validated.endDate)
      );

      return reply.status(200).send({
        success: true,
        data: trends
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
   * Train ML models
   * POST /api/v1/ml/train
   */
  async trainModel(
    request: FastifyRequest<{
      Body: {
        modelType: 'PROPHET' | 'LSTM' | 'OPTIMIZATION';
        propertyId?: string;
        parameters?: Record<string, unknown>;
      };
    }>,
    reply: FastifyReply
  ) {
    try {
      const validated = TrainingRequestSchema.parse(request.body);

      // Prepare training data
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12); // 12 months of data

      const trainingData = validated.propertyId
        ? await this.mlService.prepareTrainingData(
            validated.propertyId,
            startDate,
            endDate
          )
        : [];

      const result = await this.mlService.trainModel({
        modelType: validated.modelType,
        propertyId: validated.propertyId,
        trainingData,
        parameters: validated.parameters
      });

      return reply.status(202).send({
        success: true,
        data: result,
        message: 'Model training initiated'
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
   * Get training status
   * GET /api/v1/ml/train/status/:jobId
   */
  async getTrainingStatus(
    request: FastifyRequest<{ Params: { jobId: string } }>,
    reply: FastifyReply
  ) {
    try {
      const status = await this.mlService.getTrainingStatus(
        request.params.jobId
      );

      return reply.status(200).send({
        success: true,
        data: status
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate comprehensive analytics
   */
  private async calculateAnalytics(
    propertyId: string,
    startDate: Date,
    endDate: Date
  ) {
    // Get price history
    const prices = await this.prisma.dynamicPrice.findMany({
      where: {
        propertyId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { date: 'asc' }
    });

    if (prices.length === 0) {
      return {
        propertyId,
        periodStart: startDate,
        periodEnd: endDate,
        totalDays: differenceInDays(endDate, startDate) + 1,
        averageDailyRate: 0,
        revPAN: 0,
        occupancyRate: 0,
        priceHistory: []
      };
    }

    // Calculate ADR (Average Daily Rate)
    const totalPrice = prices.reduce(
      (sum, p) => sum + Number(p.finalPrice),
      0
    );
    const averageDailyRate = totalPrice / prices.length;

    // Get revenue analytics if exists
    const revenueAnalytics = await this.prisma.revenueAnalytics.findFirst({
      where: {
        propertyId,
        periodStart: startDate,
        periodEnd: endDate
      }
    });

    // Calculate metrics
    const totalDays = differenceInDays(endDate, startDate) + 1;
    const occupancyRate = revenueAnalytics
      ? Number(revenueAnalytics.occupancyRate)
      : 0.5; // Default estimate

    const revPAN = averageDailyRate * occupancyRate;

    // Price trend analysis
    const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
    const secondHalf = prices.slice(Math.floor(prices.length / 2));

    const firstHalfAvg =
      firstHalf.reduce((sum, p) => sum + Number(p.finalPrice), 0) /
      firstHalf.length;
    const secondHalfAvg =
      secondHalf.reduce((sum, p) => sum + Number(p.finalPrice), 0) /
      secondHalf.length;

    const priceTrend =
      secondHalfAvg > firstHalfAvg * 1.05
        ? 'INCREASING'
        : secondHalfAvg < firstHalfAvg * 0.95
          ? 'DECREASING'
          : 'STABLE';

    // Price volatility (standard deviation)
    const avgPrice = totalPrice / prices.length;
    const variance =
      prices.reduce((sum, p) => {
        const diff = Number(p.finalPrice) - avgPrice;
        return sum + diff * diff;
      }, 0) / prices.length;
    const volatility = Math.sqrt(variance);

    return {
      propertyId,
      periodStart: startDate,
      periodEnd: endDate,
      totalDays,
      averageDailyRate,
      revPAN,
      occupancyRate,
      totalRevenue: revenueAnalytics
        ? Number(revenueAnalytics.totalRevenue)
        : 0,
      totalBookings: revenueAnalytics?.totalBookings || 0,
      pickupRate: revenueAnalytics
        ? Number(revenueAnalytics.pickupRate)
        : null,
      cancellationRate: revenueAnalytics
        ? Number(revenueAnalytics.cancellationRate)
        : null,
      avgLeadTime: revenueAnalytics
        ? Number(revenueAnalytics.avgLeadTime)
        : null,
      priceTrend,
      priceVolatility: volatility,
      minPrice: Math.min(...prices.map(p => Number(p.finalPrice))),
      maxPrice: Math.max(...prices.map(p => Number(p.finalPrice))),
      priceHistory: prices.map(p => ({
        date: p.date,
        price: Number(p.finalPrice),
        factors: {
          seasonal: Number(p.seasonalFactor),
          weekend: Number(p.weekendFactor),
          demand: Number(p.demandFactor),
          event: Number(p.eventFactor),
          lastMinute: Number(p.lastMinuteFactor),
          lengthOfStay: Number(p.losDiscountFactor)
        }
      }))
    };
  }
}
