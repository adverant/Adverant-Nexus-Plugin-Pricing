import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { config } from './config/config.js';
import { PricingService } from './services/pricing.service.js';
import { RuleEngineService } from './services/rule-engine.service.js';
import { MarketAnalysisService } from './services/market-analysis.service.js';
import { MLIntegrationService } from './services/ml-integration.service.js';
import { PricingController } from './controllers/pricing.controller.js';
import { RuleController } from './controllers/rule.controller.js';
import { AnalyticsController } from './controllers/analytics.controller.js';
import { pricingRoutes } from './routes/pricing.routes.js';
import { ruleRoutes } from './routes/rule.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { usageTrackingMiddleware, flushPendingReports } from './middleware/usage-tracking.js';
import { PricingError } from './types/index.js';

async function buildServer() {
  // Initialize Fastify with logging
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname'
              }
            }
          : undefined
    }
  });

  // Initialize Prisma
  const prisma = new PrismaClient({
    log:
      config.logLevel === 'debug'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error']
  });

  // Test database connection
  try {
    await prisma.$connect();
    fastify.log.info('Database connection established');
  } catch (error) {
    fastify.log.error({ error }, 'Failed to connect to database');
    throw error;
  }

  // Register plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true
  });

  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow
  });

  // Usage tracking middleware (after body parsing)
  fastify.addHook('onRequest', usageTrackingMiddleware);

  // Initialize services
  const mlService = new MLIntegrationService(fastify.log);
  const marketAnalysisService = new MarketAnalysisService(
    prisma,
    mlService,
    fastify.log
  );
  const ruleEngineService = new RuleEngineService(prisma, fastify.log);
  const pricingService = new PricingService(
    prisma,
    ruleEngineService,
    marketAnalysisService,
    fastify.log
  );

  // Initialize controllers
  const pricingController = new PricingController(pricingService, fastify.log);
  const ruleController = new RuleController(ruleEngineService, fastify.log);
  const analyticsController = new AnalyticsController(
    prisma,
    marketAnalysisService,
    mlService,
    fastify.log
  );

  // Health check endpoint (public)
  fastify.get('/health', async (request, reply) => {
    const dbHealthy = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    const mlHealthy = await mlService.healthCheck();

    const healthy = dbHealthy;
    const status = healthy ? 200 : 503;

    return reply.status(status).send({
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        ml: mlHealthy ? 'healthy' : 'degraded'
      }
    });
  });

  // Register API routes with authentication
  fastify.register(
    async (instance) => {
      // Apply authentication middleware to all routes in this scope
      instance.addHook('onRequest', authMiddleware);

      // Register route groups
      await instance.register(
        async (pricingScope) => {
          await pricingRoutes(pricingScope, pricingController);
        },
        { prefix: '/api/v1/pricing' }
      );

      await instance.register(
        async (ruleScope) => {
          await ruleRoutes(ruleScope, ruleController);
        },
        { prefix: '/api/v1/rules' }
      );

      await instance.register(
        async (analyticsScope) => {
          await analyticsRoutes(analyticsScope, analyticsController);
        },
        { prefix: '/api/v1/analytics' }
      );
    }
  );

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof PricingError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.code,
        message: error.message,
        context: error.context
      });
    }

    // Log unexpected errors
    fastify.log.error({ error, url: request.url }, 'Unhandled error');

    return reply.status(500).send({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'An unexpected error occurred'
    });
  });

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      fastify.log.info(`Received ${signal}, closing server...`);
      await flushPendingReports();
      await fastify.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  });

  return fastify;
}

// Start server
async function start() {
  try {
    const server = await buildServer();

    await server.listen({
      port: config.port,
      host: config.host
    });

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  🎯 Nexus Pricing Service                                     ║
║                                                               ║
║  Status: Running                                              ║
║  Port: ${config.port.toString().padEnd(58)}║
║  Environment: ${process.env.NODE_ENV?.padEnd(49) || 'development'.padEnd(49)}║
║                                                               ║
║  API Documentation:                                           ║
║  • Pricing: /api/v1/pricing                                   ║
║  • Rules: /api/v1/rules                                       ║
║  • Analytics: /api/v1/analytics                               ║
║  • Health: /health                                            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
