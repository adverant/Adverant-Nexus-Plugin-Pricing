import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/config.js';

/**
 * Simple API key authentication middleware
 * In production, this should use JWT tokens or OAuth
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    return reply.status(401).send({
      success: false,
      error: 'Missing API key',
      message: 'Please provide an API key in the x-api-key header'
    });
  }

  if (apiKey !== config.auth.apiKey) {
    return reply.status(403).send({
      success: false,
      error: 'Invalid API key',
      message: 'The provided API key is invalid'
    });
  }

  // Authentication successful, continue
}

/**
 * Optional authentication - allows requests with or without auth
 * Useful for public endpoints that provide more data when authenticated
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const apiKey = request.headers['x-api-key'] as string;

  if (apiKey && apiKey !== config.auth.apiKey) {
    return reply.status(403).send({
      success: false,
      error: 'Invalid API key',
      message: 'The provided API key is invalid'
    });
  }

  // Continue regardless of auth status
}
