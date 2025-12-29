import { PrismaClient } from '@prisma/client';
import { differenceInDays } from 'date-fns';
import {
  MarketData,
  LocalEvent,
  ForecastData,
  NotFoundError
} from '../types/index.js';
import { MLIntegrationService } from './ml-integration.service.js';
import { config } from '../config/config.js';
import type { Logger } from 'pino';

export class MarketAnalysisService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mlService: MLIntegrationService,
    private readonly logger: Logger
  ) {}

  /**
   * Get or create market analysis for a specific date
   */
  async getMarketAnalysis(propertyId: string, date: Date) {
    // Try to fetch existing analysis
    const existing = await this.prisma.marketAnalysis.findUnique({
      where: {
        propertyId_analysisDate: {
          propertyId,
          analysisDate: date
        }
      }
    });

    if (existing) {
      return existing;
    }

    // Generate new analysis
    return await this.generateMarketAnalysis(propertyId, date);
  }

  /**
   * Generate market analysis for a date
   */
  private async generateMarketAnalysis(propertyId: string, date: Date) {
    this.logger.info({ propertyId, date }, 'Generating market analysis');

    const [competitorData, events, forecast] = await Promise.allSettled([
      this.fetchCompetitorPrices(propertyId, date),
      this.fetchLocalEvents(propertyId, date),
      this.getForecast(propertyId, date)
    ]);

    // Extract values from settled promises
    const competitorPrices =
      competitorData.status === 'fulfilled' ? competitorData.value : [];
    const localEvents =
      events.status === 'fulfilled' ? events.value : [];
    const forecastData =
      forecast.status === 'fulfilled' ? forecast.value : null;

    // Calculate metrics
    const averageCompetitorPrice =
      competitorPrices.length > 0
        ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length
        : null;

    const demandScore = this.calculateDemandScore(
      forecastData,
      localEvents,
      competitorPrices
    );

    // Store analysis
    const analysis = await this.prisma.marketAnalysis.create({
      data: {
        propertyId,
        analysisDate: date,
        averageCompetitorPrice,
        marketOccupancy: forecastData?.predictedOccupancy,
        demandScore,
        localEvents: localEvents as any,
        predictedOccupancy: forecastData?.predictedOccupancy,
        predictedDemand: forecastData?.predictedDemand,
        confidenceScore: forecastData?.confidence
      }
    });

    return analysis;
  }

  /**
   * Fetch competitor prices (placeholder - can integrate with external APIs)
   */
  private async fetchCompetitorPrices(
    propertyId: string,
    date: Date
  ): Promise<number[]> {
    if (!config.features.enableCompetitorTracking) {
      return [];
    }

    // TODO: Integrate with competitor pricing APIs (e.g., Transparent Intelligence, OTA Insight)
    // For now, return placeholder data
    this.logger.debug(
      { propertyId, date },
      'Competitor tracking not implemented - returning placeholder'
    );

    return [];
  }

  /**
   * Fetch local events affecting pricing (placeholder)
   */
  private async fetchLocalEvents(
    propertyId: string,
    date: Date
  ): Promise<LocalEvent[]> {
    if (!config.features.enableEventDetection) {
      return [];
    }

    // TODO: Integrate with event APIs (e.g., PredictHQ, Eventbrite)
    // For now, return placeholder data
    this.logger.debug(
      { propertyId, date },
      'Event detection not implemented - returning placeholder'
    );

    return [];
  }

  /**
   * Get forecast data from ML service
   */
  private async getForecast(
    propertyId: string,
    date: Date
  ): Promise<ForecastData | null> {
    try {
      const response = await this.mlService.getForecast({
        propertyId,
        startDate: date,
        endDate: date,
        modelType: 'OCCUPANCY'
      });

      if (response.forecast.length === 0) {
        return null;
      }

      const forecastPoint = response.forecast[0];

      return {
        date,
        predictedOccupancy: forecastPoint.predictedValue,
        predictedDemand: forecastPoint.predictedValue, // Same for now
        predictedRevenue: 0, // Calculated separately
        confidence: forecastPoint.confidence
      };
    } catch (error) {
      this.logger.warn({ error, propertyId, date }, 'Failed to get ML forecast');
      return null;
    }
  }

  /**
   * Calculate demand score based on various factors
   */
  private calculateDemandScore(
    forecast: ForecastData | null,
    events: LocalEvent[],
    competitorPrices: number[]
  ): number {
    let score = 0.5; // Base score

    // Factor in forecast
    if (forecast) {
      score += forecast.predictedOccupancy * 0.4; // Up to +0.4
      score = Math.min(score, 1.0);
    }

    // Factor in events
    const highImpactEvents = events.filter(e => e.impact === 'HIGH').length;
    const mediumImpactEvents = events.filter(e => e.impact === 'MEDIUM').length;

    score += highImpactEvents * 0.15;
    score += mediumImpactEvents * 0.075;
    score = Math.min(score, 1.0);

    // Factor in competitor pricing (if available)
    if (competitorPrices.length > 0) {
      // If many competitors have high prices, demand is likely high
      const avgCompetitorPrice =
        competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length;

      // This is a simplified calculation
      // In reality, you'd compare against historical averages
      if (avgCompetitorPrice > 200) {
        score += 0.1;
      }
    }

    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * Get market trends over a period
   */
  async getMarketTrends(
    propertyId: string,
    startDate: Date,
    endDate: Date
  ) {
    const analyses = await this.prisma.marketAnalysis.findMany({
      where: {
        propertyId,
        analysisDate: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { analysisDate: 'asc' }
    });

    if (analyses.length === 0) {
      return {
        averageDemand: 0,
        averageOccupancy: 0,
        trend: 'STABLE' as const,
        eventDays: 0
      };
    }

    const avgDemand =
      analyses.reduce(
        (sum, a) => sum + (Number(a.demandScore) || 0),
        0
      ) / analyses.length;

    const avgOccupancy =
      analyses.reduce(
        (sum, a) => sum + (Number(a.predictedOccupancy) || 0),
        0
      ) / analyses.length;

    // Calculate trend
    const firstHalf = analyses.slice(0, Math.floor(analyses.length / 2));
    const secondHalf = analyses.slice(Math.floor(analyses.length / 2));

    const firstHalfAvg =
      firstHalf.reduce(
        (sum, a) => sum + (Number(a.demandScore) || 0),
        0
      ) / firstHalf.length;

    const secondHalfAvg =
      secondHalf.reduce(
        (sum, a) => sum + (Number(a.demandScore) || 0),
        0
      ) / secondHalf.length;

    let trend: 'INCREASING' | 'DECREASING' | 'STABLE';
    if (secondHalfAvg > firstHalfAvg * 1.1) {
      trend = 'INCREASING';
    } else if (secondHalfAvg < firstHalfAvg * 0.9) {
      trend = 'DECREASING';
    } else {
      trend = 'STABLE';
    }

    // Count event days
    const eventDays = analyses.filter(a => {
      const events = (a.localEvents as LocalEvent[] | null) || [];
      return events.length > 0;
    }).length;

    return {
      averageDemand: avgDemand,
      averageOccupancy: avgOccupancy,
      trend,
      eventDays,
      dataPoints: analyses.length
    };
  }

  /**
   * Get occupancy forecast for a date range
   */
  async getOccupancyForecast(
    propertyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ForecastData[]> {
    try {
      const response = await this.mlService.getForecast({
        propertyId,
        startDate,
        endDate,
        modelType: 'OCCUPANCY'
      });

      return response.forecast.map(point => ({
        date: point.date,
        predictedOccupancy: point.predictedValue,
        predictedDemand: point.predictedValue,
        predictedRevenue: 0,
        confidence: point.confidence
      }));
    } catch (error) {
      this.logger.error(
        { error, propertyId, startDate, endDate },
        'Failed to get occupancy forecast'
      );
      return [];
    }
  }

  /**
   * Update market analysis with actual data
   */
  async updateMarketAnalysis(
    propertyId: string,
    date: Date,
    actualOccupancy: number
  ): Promise<void> {
    await this.prisma.marketAnalysis.updateMany({
      where: {
        propertyId,
        analysisDate: date
      },
      data: {
        marketOccupancy: actualOccupancy
      }
    });
  }

  /**
   * Bulk generate market analysis for date range
   */
  async generateBulkAnalysis(
    propertyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    let generated = 0;
    const daysToAnalyze = differenceInDays(endDate, startDate) + 1;

    for (let i = 0; i < daysToAnalyze; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);

      try {
        await this.generateMarketAnalysis(propertyId, currentDate);
        generated++;
      } catch (error) {
        this.logger.error(
          { error, propertyId, date: currentDate },
          'Failed to generate market analysis'
        );
      }
    }

    return generated;
  }
}
