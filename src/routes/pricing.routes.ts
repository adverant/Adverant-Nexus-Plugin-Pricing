import { FastifyInstance } from 'fastify';
import { PricingController } from '../controllers/pricing.controller.js';

export async function pricingRoutes(
  fastify: FastifyInstance,
  controller: PricingController
) {
  // Calculate price for a specific date
  fastify.get(
    '/:propertyId/calculate',
    {
      schema: {
        description: 'Calculate dynamic price for a property on a specific date',
        tags: ['pricing'],
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
            date: { type: 'string', format: 'date' },
            checkIn: { type: 'string', format: 'date' },
            checkOut: { type: 'string', format: 'date' },
            lengthOfStay: { type: 'number', minimum: 1 },
            daysUntilArrival: { type: 'number', minimum: 0 },
            occupancyRate: { type: 'number', minimum: 0, maximum: 1 }
          },
          required: ['date']
        }
      }
    },
    controller.calculatePrice.bind(controller)
  );

  // Get pricing calendar
  fastify.get(
    '/:propertyId/calendar',
    {
      schema: {
        description: 'Get pricing calendar for a date range',
        tags: ['pricing'],
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
    controller.getPricingCalendar.bind(controller)
  );

  // Create price override
  fastify.post(
    '/:propertyId/override',
    {
      schema: {
        description: 'Create manual price override',
        tags: ['pricing'],
        params: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' }
          },
          required: ['propertyId']
        },
        body: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            overridePrice: { type: 'number', minimum: 0 },
            reason: { type: 'string', minLength: 1 },
            createdBy: { type: 'string', minLength: 1 },
            validUntil: { type: 'string', format: 'date-time' }
          },
          required: ['date', 'overridePrice', 'reason', 'createdBy']
        }
      }
    },
    controller.createPriceOverride.bind(controller)
  );

  // Bulk update prices
  fastify.post(
    '/:propertyId/bulk-update',
    {
      schema: {
        description: 'Bulk update prices for a date range',
        tags: ['pricing'],
        params: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' }
          },
          required: ['propertyId']
        },
        body: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' }
          },
          required: ['startDate', 'endDate']
        }
      }
    },
    controller.bulkUpdatePrices.bind(controller)
  );
}
