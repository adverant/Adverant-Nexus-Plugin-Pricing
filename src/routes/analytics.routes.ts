import { FastifyInstance } from 'fastify';
import { AnalyticsController } from '../controllers/analytics.controller.js';

export async function analyticsRoutes(
  fastify: FastifyInstance,
  controller: AnalyticsController
) {
  // Get revenue analytics
  fastify.get(
    '/:propertyId',
    {
      schema: {
        description: 'Get revenue analytics for a property',
        tags: ['analytics'],
        params: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' }
          },
          required: ['propertyId']
        },
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' }
          },
          required: ['startDate', 'endDate']
        }
      }
    },
    controller.getAnalytics.bind(controller)
  );

  // Get market trends
  fastify.get(
    '/:propertyId/trends',
    {
      schema: {
        description: 'Get market trends for a property',
        tags: ['analytics'],
        params: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' }
          },
          required: ['propertyId']
        },
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' }
          },
          required: ['startDate', 'endDate']
        }
      }
    },
    controller.getMarketTrends.bind(controller)
  );

  // Get forecast
  fastify.get(
    '/:propertyId/forecast',
    {
      schema: {
        description: 'Get forecast for a property',
        tags: ['forecast'],
        params: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' }
          },
          required: ['propertyId']
        },
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            modelType: {
              type: 'string',
              enum: ['DEMAND', 'OCCUPANCY', 'REVENUE']
            }
          },
          required: ['startDate', 'endDate']
        }
      }
    },
    controller.getForecast.bind(controller)
  );

  // Train ML model
  fastify.post(
    '/ml/train',
    {
      schema: {
        description: 'Train ML models',
        tags: ['ml'],
        body: {
          type: 'object',
          properties: {
            modelType: {
              type: 'string',
              enum: ['PROPHET', 'LSTM', 'OPTIMIZATION']
            },
            propertyId: { type: 'string', format: 'uuid' },
            parameters: { type: 'object' }
          },
          required: ['modelType']
        }
      }
    },
    controller.trainModel.bind(controller)
  );

  // Get training status
  fastify.get(
    '/ml/train/status/:jobId',
    {
      schema: {
        description: 'Get ML model training status',
        tags: ['ml'],
        params: {
          type: 'object',
          properties: {
            jobId: { type: 'string' }
          },
          required: ['jobId']
        }
      }
    },
    controller.getTrainingStatus.bind(controller)
  );
}
