import { config as dotenvConfig } from 'dotenv';
import { ServiceConfig } from '../types/index.js';

// Load environment variables
dotenvConfig();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

export const config: ServiceConfig = {
  port: getEnvNumber('PORT', 9030),
  host: getEnvVar('HOST', '0.0.0.0'),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),

  database: {
    url: getEnvVar('DATABASE_URL')
  },

  mlService: {
    url: getEnvVar('ML_SERVICE_URL', 'http://nexus-pricing-ml:8000'),
    timeout: getEnvNumber('ML_SERVICE_TIMEOUT', 30000)
  },

  redis: {
    url: getEnvVar('REDIS_URL', 'redis://nexus-redis:6379')
  },

  auth: {
    jwtSecret: getEnvVar('JWT_SECRET'),
    apiKey: getEnvVar('API_KEY')
  },

  rateLimit: {
    max: getEnvNumber('RATE_LIMIT_MAX', 100),
    timeWindow: getEnvNumber('RATE_LIMIT_TIMEWINDOW', 60000)
  },

  pricing: {
    defaultCurrency: getEnvVar('DEFAULT_CURRENCY', 'USD'),
    minPriceFactor: parseFloat(getEnvVar('MIN_PRICE_FACTOR', '0.5')),
    maxPriceFactor: parseFloat(getEnvVar('MAX_PRICE_FACTOR', '3.0')),
    defaultHorizonDays: getEnvNumber('DEFAULT_PRICING_HORIZON_DAYS', 365)
  },

  features: {
    enableCompetitorTracking: getEnvBoolean('ENABLE_COMPETITOR_TRACKING', false),
    enableEventDetection: getEnvBoolean('ENABLE_EVENT_DETECTION', false),
    enableABTesting: getEnvBoolean('ENABLE_AB_TESTING', true),
    enablePriceNotifications: getEnvBoolean('ENABLE_PRICE_NOTIFICATIONS', true),
    enableAutoPricing: getEnvBoolean('ENABLE_AUTO_PRICING', false)
  },

  integrations: {
    propertyManagementUrl: getEnvVar(
      'PROPERTY_MANAGEMENT_URL',
      'http://nexus-property-management:9020'
    ),
    nexusGraphRAGUrl: getEnvVar(
      'NEXUS_GRAPHRAG_URL',
      'http://nexus-graphrag:8080'
    )
  }
};

export default config;
