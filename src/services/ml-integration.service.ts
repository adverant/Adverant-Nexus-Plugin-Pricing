import axios, { AxiosInstance } from 'axios';
import {
  MLForecastRequest,
  MLForecastResponse,
  MLTrainingRequest,
  MLTrainingResponse,
  HistoricalDataPoint,
  MLServiceError
} from '../types/index.js';
import { config } from '../config/config.js';
import type { Logger } from 'pino';

export class MLIntegrationService {
  private readonly client: AxiosInstance;

  constructor(private readonly logger: Logger) {
    this.client = axios.create({
      baseURL: config.mlService.url,
      timeout: config.mlService.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        this.logger.error({ error }, 'ML service request failed');
        throw new MLServiceError(
          error.message || 'ML service request failed',
          {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status
          }
        );
      }
    );
  }

  /**
   * Get forecast from ML service
   */
  async getForecast(
    request: MLForecastRequest
  ): Promise<MLForecastResponse> {
    this.logger.info({ request }, 'Requesting ML forecast');

    try {
      const response = await this.client.post<MLForecastResponse>(
        '/forecast',
        {
          propertyId: request.propertyId,
          startDate: request.startDate.toISOString(),
          endDate: request.endDate.toISOString(),
          modelType: request.modelType.toLowerCase(),
          historicalData: request.historicalData?.map(point => ({
            date: point.date.toISOString(),
            value: point.value,
            metadata: point.metadata
          }))
        }
      );

      // Transform response dates back to Date objects
      return {
        ...response.data,
        forecast: response.data.forecast.map(point => ({
          ...point,
          date: new Date(point.date)
        })),
        generatedAt: new Date(response.data.generatedAt)
      };
    } catch (error) {
      // If ML service is unavailable, return fallback forecast
      if (axios.isAxiosError(error) && !error.response) {
        this.logger.warn('ML service unavailable, using fallback forecast');
        return this.getFallbackForecast(request);
      }
      throw error;
    }
  }

  /**
   * Request model training
   */
  async trainModel(
    request: MLTrainingRequest
  ): Promise<MLTrainingResponse> {
    this.logger.info({ request }, 'Requesting ML model training');

    const response = await this.client.post<MLTrainingResponse>(
      '/train',
      {
        modelType: request.modelType.toLowerCase(),
        propertyId: request.propertyId,
        trainingData: request.trainingData.map(point => ({
          date: point.date.toISOString(),
          value: point.value,
          metadata: point.metadata
        })),
        parameters: request.parameters
      }
    );

    return response.data;
  }

  /**
   * Get training job status
   */
  async getTrainingStatus(jobId: string): Promise<MLTrainingResponse> {
    this.logger.debug({ jobId }, 'Fetching training status');

    const response = await this.client.get<MLTrainingResponse>(
      `/train/status/${jobId}`
    );

    return response.data;
  }

  /**
   * Get optimal price recommendation from ML
   */
  async getOptimalPrice(
    propertyId: string,
    date: Date,
    context: {
      basePrice: number;
      currentOccupancy: number;
      competitorPrices?: number[];
      events?: Array<{ impact: string }>;
    }
  ): Promise<{ recommendedPrice: number; confidence: number }> {
    this.logger.info({ propertyId, date, context }, 'Requesting optimal price');

    try {
      const response = await this.client.post<{
        recommendedPrice: number;
        confidence: number;
      }>('/optimize-price', {
        propertyId,
        date: date.toISOString(),
        context
      });

      return response.data;
    } catch (error) {
      // Fallback to base price if ML service fails
      this.logger.warn('ML optimization unavailable, using base price');
      return {
        recommendedPrice: context.basePrice,
        confidence: 0.5
      };
    }
  }

  /**
   * Get revenue forecast
   */
  async getRevenueForecast(
    propertyId: string,
    startDate: Date,
    endDate: Date,
    averagePrice: number
  ): Promise<MLForecastResponse> {
    this.logger.info(
      { propertyId, startDate, endDate },
      'Requesting revenue forecast'
    );

    const response = await this.client.post<MLForecastResponse>(
      '/forecast/revenue',
      {
        propertyId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        averagePrice
      }
    );

    return {
      ...response.data,
      forecast: response.data.forecast.map(point => ({
        ...point,
        date: new Date(point.date)
      })),
      generatedAt: new Date(response.data.generatedAt)
    };
  }

  /**
   * Health check for ML service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      this.logger.warn('ML service health check failed');
      return false;
    }
  }

  /**
   * Get model performance metrics
   */
  async getModelMetrics(
    modelType: 'PROPHET' | 'LSTM' | 'OPTIMIZATION',
    propertyId?: string
  ): Promise<{
    accuracy: number;
    mape: number;
    rmse: number;
    lastTrained: Date;
  }> {
    const response = await this.client.get('/models/metrics', {
      params: {
        modelType: modelType.toLowerCase(),
        propertyId
      }
    });

    return {
      ...response.data,
      lastTrained: new Date(response.data.lastTrained)
    };
  }

  /**
   * Fallback forecast when ML service is unavailable
   * Uses simple historical averaging
   */
  private getFallbackForecast(
    request: MLForecastRequest
  ): MLForecastResponse {
    const daysDiff =
      Math.ceil(
        (request.endDate.getTime() - request.startDate.getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    // Generate simple forecast based on historical average
    const historicalAvg = request.historicalData
      ? request.historicalData.reduce((sum, point) => sum + point.value, 0) /
        request.historicalData.length
      : 0.5; // Default to 50% occupancy

    const forecast = Array.from({ length: daysDiff }, (_, i) => {
      const date = new Date(request.startDate);
      date.setDate(date.getDate() + i);

      return {
        date,
        predictedValue: historicalAvg,
        lowerBound: historicalAvg * 0.8,
        upperBound: historicalAvg * 1.2,
        confidence: 0.5 // Low confidence for fallback
      };
    });

    return {
      propertyId: request.propertyId,
      modelType: 'FALLBACK',
      forecast,
      accuracy: 0.5,
      mape: 0.2,
      generatedAt: new Date()
    };
  }

  /**
   * Prepare historical data for training
   */
  async prepareTrainingData(
    propertyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<HistoricalDataPoint[]> {
    // This would fetch actual booking/occupancy data from the property management service
    // For now, return placeholder
    this.logger.info(
      { propertyId, startDate, endDate },
      'Preparing training data'
    );

    // TODO: Fetch actual data from property management service
    return [];
  }

  /**
   * Submit feedback on forecast accuracy
   */
  async submitForecastFeedback(
    forecastId: string,
    actualValue: number,
    forecastedValue: number
  ): Promise<void> {
    await this.client.post('/feedback', {
      forecastId,
      actualValue,
      forecastedValue,
      error: Math.abs(actualValue - forecastedValue),
      percentageError: Math.abs(
        (actualValue - forecastedValue) / actualValue
      )
    });

    this.logger.info({ forecastId }, 'Submitted forecast feedback');
  }
}
