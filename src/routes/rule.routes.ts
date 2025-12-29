import { FastifyInstance } from 'fastify';
import { RuleController } from '../controllers/rule.controller.js';

export async function ruleRoutes(
  fastify: FastifyInstance,
  controller: RuleController
) {
  // Get all pricing rules
  fastify.get(
    '/',
    {
      schema: {
        description: 'Get all pricing rules',
        tags: ['rules'],
        querystring: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' },
            includeGlobal: { type: 'boolean' }
          }
        }
      }
    },
    controller.getRules.bind(controller)
  );

  // Create pricing rule
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new pricing rule',
        tags: ['rules'],
        body: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            type: {
              type: 'string',
              enum: [
                'SEASONAL',
                'WEEKEND',
                'LAST_MINUTE',
                'LENGTH_OF_STAY',
                'ORPHAN_DAY',
                'EVENT_BASED',
                'OCCUPANCY_BASED',
                'COMPETITOR_BASED',
                'CUSTOM'
              ]
            },
            priority: { type: 'number' },
            config: { type: 'object' },
            conditions: { type: 'object' },
            adjustment: { type: 'number' },
            adjustmentType: {
              type: 'string',
              enum: ['MULTIPLIER', 'FIXED_AMOUNT', 'PERCENTAGE']
            },
            minPrice: { type: 'number', minimum: 0 },
            maxPrice: { type: 'number', minimum: 0 },
            validFrom: { type: 'string', format: 'date-time' },
            validUntil: { type: 'string', format: 'date-time' },
            active: { type: 'boolean' }
          },
          required: [
            'name',
            'type',
            'priority',
            'config',
            'conditions',
            'adjustment',
            'adjustmentType',
            'validFrom'
          ]
        }
      }
    },
    controller.createRule.bind(controller)
  );

  // Update pricing rule
  fastify.put(
    '/:id',
    {
      schema: {
        description: 'Update an existing pricing rule',
        tags: ['rules'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' }
          },
          required: ['id']
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            type: { type: 'string' },
            priority: { type: 'number' },
            config: { type: 'object' },
            conditions: { type: 'object' },
            adjustment: { type: 'number' },
            adjustmentType: { type: 'string' },
            minPrice: { type: 'number' },
            maxPrice: { type: 'number' },
            validFrom: { type: 'string', format: 'date-time' },
            validUntil: { type: 'string', format: 'date-time' },
            active: { type: 'boolean' }
          }
        }
      }
    },
    controller.updateRule.bind(controller)
  );

  // Delete pricing rule
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Delete a pricing rule',
        tags: ['rules'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' }
          },
          required: ['id']
        }
      }
    },
    controller.deleteRule.bind(controller)
  );

  // Create preset rules
  fastify.post(
    '/presets/:propertyId',
    {
      schema: {
        description: 'Create preset pricing rules for a property',
        tags: ['rules'],
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
            basePrice: { type: 'number', minimum: 0 }
          },
          required: ['basePrice']
        }
      }
    },
    controller.createPresetRules.bind(controller)
  );
}
