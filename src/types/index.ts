import { Decimal } from '@prisma/client/runtime/library';

// Pricing Types
export interface PricingFactors {
  seasonalFactor: number;
  weekendFactor: number;
  demandFactor: number;
  eventFactor: number;
  lastMinuteFactor: number;
  losDiscountFactor: number;
}

export interface PriceCalculationInput {
  propertyId: string;
  date: Date;
  checkIn?: Date;
  checkOut?: Date;
  lengthOfStay?: number;
  daysUntilArrival?: number;
  occupancyRate?: number;
}

export interface PriceCalculationResult {
  date: Date;
  basePrice: number;
  calculatedPrice: number;
  finalPrice: number;
  factors: PricingFactors;
  appliedRules: AppliedRule[];
  currency: string;
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  adjustment: number;
  adjustmentType: 'MULTIPLIER' | 'FIXED_AMOUNT' | 'PERCENTAGE';
}

// Rule Engine Types
export interface RuleConditions {
  dateRange?: {
    start: Date;
    end: Date;
  };
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
  occupancyThreshold?: {
    min?: number;
    max?: number;
  };
  daysUntilArrival?: {
    min?: number;
    max?: number;
  };
  lengthOfStay?: {
    min?: number;
    max?: number;
  };
  customConditions?: Record<string, unknown>;
}

export interface RuleConfig {
  formula?: string;
  parameters?: Record<string, number>;
  events?: string[];
  competitors?: string[];
}

export interface CreatePricingRuleInput {
  propertyId?: string;
  name: string;
  description?: string;
  type: RuleType;
  priority: number;
  config: RuleConfig;
  conditions: RuleConditions;
  adjustment: number;
  adjustmentType: 'MULTIPLIER' | 'FIXED_AMOUNT' | 'PERCENTAGE';
  minPrice?: number;
  maxPrice?: number;
  validFrom: Date;
  validUntil?: Date;
  active?: boolean;
}

export enum RuleType {
  SEASONAL = 'SEASONAL',
  WEEKEND = 'WEEKEND',
  LAST_MINUTE = 'LAST_MINUTE',
  LENGTH_OF_STAY = 'LENGTH_OF_STAY',
  ORPHAN_DAY = 'ORPHAN_DAY',
  EVENT_BASED = 'EVENT_BASED',
  OCCUPANCY_BASED = 'OCCUPANCY_BASED',
  COMPETITOR_BASED = 'COMPETITOR_BASED',
  CUSTOM = 'CUSTOM'
}

// Market Analysis Types
export interface MarketData {
  propertyId: string;
  date: Date;
  competitorPrices?: number[];
  localEvents?: LocalEvent[];
  occupancyRate?: number;
  demandScore?: number;
}

export interface LocalEvent {
  name: string;
  date: Date;
  category: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  distance?: number;
}

export interface ForecastData {
  date: Date;
  predictedOccupancy: number;
  predictedDemand: number;
  predictedRevenue: number;
  confidence: number;
}

// Analytics Types
export interface RevenueMetrics {
  propertyId: string;
  periodStart: Date;
  periodEnd: Date;
  totalBookings: number;
  totalRevenue: number;
  totalNights: number;
  averageDailyRate: number;
  revPAN: number;
  occupancyRate: number;
  pickupRate?: number;
  cancellationRate?: number;
  avgLeadTime?: number;
}

export interface PricingCalendar {
  propertyId: string;
  startDate: Date;
  endDate: Date;
  prices: DailyPrice[];
}

export interface DailyPrice {
  date: Date;
  price: number;
  available: boolean;
  booked: boolean;
  factors: Partial<PricingFactors>;
}

// ML Types
export interface MLForecastRequest {
  propertyId: string;
  startDate: Date;
  endDate: Date;
  modelType: 'DEMAND' | 'OCCUPANCY' | 'REVENUE';
  historicalData?: HistoricalDataPoint[];
}

export interface HistoricalDataPoint {
  date: Date;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface MLForecastResponse {
  propertyId: string;
  modelType: string;
  forecast: ForecastPoint[];
  accuracy?: number;
  mape?: number;
  generatedAt: Date;
}

export interface ForecastPoint {
  date: Date;
  predictedValue: number;
  lowerBound?: number;
  upperBound?: number;
  confidence: number;
}

export interface MLTrainingRequest {
  modelType: 'PROPHET' | 'LSTM' | 'OPTIMIZATION';
  propertyId?: string;
  trainingData: HistoricalDataPoint[];
  parameters?: Record<string, unknown>;
}

export interface MLTrainingResponse {
  jobId: string;
  modelType: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  accuracy?: number;
  mape?: number;
  errorMessage?: string;
}

// Price Override Types
export interface PriceOverrideInput {
  propertyId: string;
  date: Date;
  overridePrice: number;
  reason: string;
  createdBy: string;
  validUntil?: Date;
}

// A/B Testing Types
export interface ExperimentConfig {
  name: string;
  description?: string;
  propertyId: string;
  variantA: PricingStrategyConfig;
  variantB: PricingStrategyConfig;
  trafficSplit: number;
  startDate: Date;
  endDate: Date;
}

export interface PricingStrategyConfig {
  baseAdjustment: number;
  rules: string[];
  enableML: boolean;
  parameters?: Record<string, unknown>;
}

export interface ExperimentResults {
  experimentId: string;
  name: string;
  variantA: VariantResults;
  variantB: VariantResults;
  winner?: 'A' | 'B' | 'INCONCLUSIVE';
  confidenceLevel?: number;
}

export interface VariantResults {
  revenue: number;
  bookings: number;
  avgDailyRate: number;
  occupancyRate: number;
}

// Configuration Types
export interface ServiceConfig {
  port: number;
  host: string;
  logLevel: string;
  database: {
    url: string;
  };
  mlService: {
    url: string;
    timeout: number;
  };
  redis: {
    url: string;
  };
  auth: {
    jwtSecret: string;
    apiKey: string;
  };
  rateLimit: {
    max: number;
    timeWindow: number;
  };
  pricing: {
    defaultCurrency: string;
    minPriceFactor: number;
    maxPriceFactor: number;
    defaultHorizonDays: number;
  };
  features: {
    enableCompetitorTracking: boolean;
    enableEventDetection: boolean;
    enableABTesting: boolean;
    enablePriceNotifications: boolean;
    enableAutoPricing: boolean;
  };
  integrations: {
    propertyManagementUrl: string;
    nexusGraphRAGUrl: string;
  };
}

// Error Types
export class PricingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PricingError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends PricingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends PricingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', 404, context);
    this.name = 'NotFoundError';
  }
}

export class MLServiceError extends PricingError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ML_SERVICE_ERROR', 503, context);
    this.name = 'MLServiceError';
  }
}
