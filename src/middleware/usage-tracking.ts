/**
 * Usage Tracking Middleware for Pricing Service
 *
 * Production-grade middleware that tracks API usage and reports to nexus-auth.
 * Implements fire-and-forget pattern for non-blocking usage reporting.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// ============================================================================
// Configuration
// ============================================================================

const SERVICE_NAME = 'pricing';

const USAGE_TRACKING_CONFIG = {
  trackingEndpoint: process.env.USAGE_TRACKING_URL || 'http://nexus-auth:9101/internal/track-usage',
  batchSize: parseInt(process.env.USAGE_BATCH_SIZE || '10', 10),
  batchFlushIntervalMs: parseInt(process.env.USAGE_BATCH_FLUSH_MS || '5000', 10),
  enableBatching: process.env.USAGE_ENABLE_BATCHING === 'true',
  enableDetailedMetrics: process.env.USAGE_DETAILED_METRICS !== 'false',
  charsPerToken: 4,
  trackingTimeoutMs: parseInt(process.env.USAGE_TRACKING_TIMEOUT_MS || '5000', 10),
  maxRetries: parseInt(process.env.USAGE_MAX_RETRIES || '2', 10),
  retryDelayMs: parseInt(process.env.USAGE_RETRY_DELAY_MS || '1000', 10),
};

// ============================================================================
// Types
// ============================================================================

interface UsageReport {
  userId: string;
  apiKeyId?: string;
  organizationId?: string;
  appId?: string;
  appUserId?: string;
  externalUserId?: string;
  departmentId?: string;
  region?: string;
  complianceMode?: string;
  courseId?: string;
  projectContext?: Record<string, unknown>;
  service: string;
  operation: string;
  model?: string;
  pluginType?: string;
  pluginId?: string;
  pluginName?: string;
  inputTokens: number;
  outputTokens: number;
  embeddingCount: number;
  gpuSeconds: number;
  storageBytes: number;
  bandwidthBytes: number;
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;
  durationMs: number;
  httpStatus: number;
  metadata?: Record<string, unknown>;
}

interface TrackedRequest extends FastifyRequest {
  _usageTracking?: {
    startTime: number;
    inputTokens?: number;
    outputTokens?: number;
    embeddingCount?: number;
    model?: string;
    operation?: string;
    gpuSeconds?: number;
    storageBytes?: number;
    bandwidthBytes?: number;
  };
}

// ============================================================================
// Batch Queue
// ============================================================================

const usageQueue: UsageReport[] = [];
let batchFlushTimer: NodeJS.Timeout | null = null;

function queueReport(report: UsageReport): void {
  usageQueue.push(report);

  if (usageQueue.length >= USAGE_TRACKING_CONFIG.batchSize) {
    flushBatch();
  } else if (!batchFlushTimer) {
    batchFlushTimer = setTimeout(flushBatch, USAGE_TRACKING_CONFIG.batchFlushIntervalMs);
  }
}

async function flushBatch(): Promise<void> {
  if (batchFlushTimer) {
    clearTimeout(batchFlushTimer);
    batchFlushTimer = null;
  }

  if (usageQueue.length === 0) return;

  const batch = usageQueue.splice(0, USAGE_TRACKING_CONFIG.batchSize);

  await Promise.allSettled(batch.map((report) => sendUsageReport(report)));
}

// ============================================================================
// Token Counting
// ============================================================================

function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  const cleanText = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(cleanText.length / USAGE_TRACKING_CONFIG.charsPerToken);
}

// ============================================================================
// Operation Detection
// ============================================================================

function detectOperation(req: FastifyRequest): string {
  const path = req.url.toLowerCase();
  const method = req.method.toUpperCase();

  // Pricing service operations
  if (path.includes('/pricing/calculate')) return 'price_calculation';
  if (path.includes('/pricing/quote')) return 'quote_generation';
  if (path.includes('/pricing/estimate')) return 'estimate';
  if (path.includes('/rules')) return 'rule_management';
  if (path.includes('/analytics')) return 'analytics';
  if (path.includes('/market')) return 'market_analysis';
  if (path.includes('/forecast')) return 'forecasting';
  if (path.includes('/optimization')) return 'optimization';

  return `${method.toLowerCase()}_${path.split('/').filter(Boolean).pop() || 'unknown'}`;
}

// ============================================================================
// Usage Report Sending
// ============================================================================

async function sendUsageReport(report: UsageReport, retryCount = 0): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USAGE_TRACKING_CONFIG.trackingTimeoutMs);

  try {
    const response = await fetch(USAGE_TRACKING_CONFIG.trackingEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'true',
        'X-Source': `nexus-${SERVICE_NAME}`,
      },
      body: JSON.stringify(report),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 204 || response.ok) {
      return;
    }

    if (response.status >= 500 && retryCount < USAGE_TRACKING_CONFIG.maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, USAGE_TRACKING_CONFIG.retryDelayMs));
      return sendUsageReport(report, retryCount + 1);
    }
  } catch (error) {
    clearTimeout(timeout);

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (!errorMessage.includes('abort') && retryCount < USAGE_TRACKING_CONFIG.maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, USAGE_TRACKING_CONFIG.retryDelayMs));
      return sendUsageReport(report, retryCount + 1);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function isExemptPath(path: string): boolean {
  const exemptPaths = ['/health', '/healthz', '/ready', '/readiness', '/liveness', '/startup', '/metrics', '/ping', '/', '/version'];
  return exemptPaths.some((exempt) => path === exempt || path.startsWith(`${exempt}/`) || path.startsWith('/health'));
}

function extractUserId(req: FastifyRequest): string | undefined {
  const user = (req as any).user;
  if (user?.id) return user.id;
  if (user?.userId) return user.userId;

  const headerUserId = req.headers['x-user-id'];
  if (typeof headerUserId === 'string' && headerUserId) return headerUserId;

  const apiKeyUserId = req.headers['x-api-key-user-id'];
  if (typeof apiKeyUserId === 'string' && apiKeyUserId) return apiKeyUserId;

  return undefined;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractApiKeyId(req: FastifyRequest): string | undefined {
  const apiKeyId = req.headers['x-api-key-id'];
  if (typeof apiKeyId === 'string' && apiKeyId && UUID_REGEX.test(apiKeyId)) return apiKeyId;
  return undefined;
}

function extractAppUserId(req: FastifyRequest): string | undefined {
  const appUserId = req.headers['x-app-user-id'];
  return typeof appUserId === 'string' ? appUserId : undefined;
}

function extractExternalUserId(req: FastifyRequest): string | undefined {
  const externalUserId = req.headers['x-external-user-id'];
  return typeof externalUserId === 'string' ? externalUserId : undefined;
}

function extractPluginType(req: FastifyRequest): string | undefined {
  const pluginType = req.headers['x-plugin-type'];
  if (typeof pluginType === 'string' && (pluginType === 'core' || pluginType === 'marketplace')) return pluginType;
  return 'core';
}

function extractPluginId(req: FastifyRequest): string | undefined {
  const pluginId = req.headers['x-plugin-id'];
  return typeof pluginId === 'string' ? pluginId : undefined;
}

function extractPluginName(req: FastifyRequest): string | undefined {
  const pluginName = req.headers['x-plugin-name'];
  return typeof pluginName === 'string' ? pluginName : undefined;
}

function extractHeader(req: FastifyRequest, headerName: string): string | undefined {
  const value = req.headers[headerName];
  return typeof value === 'string' ? value : undefined;
}

function extractProjectContext(req: FastifyRequest): Record<string, unknown> | undefined {
  const body = req.body as any;
  if (body && typeof body === 'object' && body.projectContext) {
    return body.projectContext as Record<string, unknown>;
  }
  const headerContext = req.headers['x-project-context'];
  if (typeof headerContext === 'string') {
    try {
      return JSON.parse(headerContext) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// ============================================================================
// Middleware Implementation
// ============================================================================

export async function usageTrackingMiddleware(
  req: TrackedRequest,
  reply: FastifyReply
): Promise<void> {
  if (isExemptPath(req.url)) {
    return;
  }

  req._usageTracking = {
    startTime: Date.now(),
  };

  // Track on response finish
  reply.then(() => {
    const userId = extractUserId(req);
    if (!userId) return;

    const durationMs = Date.now() - (req._usageTracking?.startTime || Date.now());
    const operation = req._usageTracking?.operation || detectOperation(req);

    const bodyStr = req.body ? JSON.stringify(req.body) : '';
    const inputTokens = req._usageTracking?.inputTokens ?? estimateTokens(bodyStr);
    const outputTokens = req._usageTracking?.outputTokens ?? 0;

    const report: UsageReport = {
      userId,
      apiKeyId: extractApiKeyId(req),
      organizationId: extractHeader(req, 'x-organization-id') || extractHeader(req, 'x-company-id'),
      appId: extractHeader(req, 'x-app-id'),
      appUserId: extractAppUserId(req),
      externalUserId: extractExternalUserId(req),
      departmentId: extractHeader(req, 'x-department-id'),
      region: extractHeader(req, 'x-region'),
      complianceMode: extractHeader(req, 'x-compliance-mode'),
      courseId: extractHeader(req, 'x-course-id'),
      projectContext: extractProjectContext(req),
      service: SERVICE_NAME,
      operation,
      model: req._usageTracking?.model,
      pluginType: extractPluginType(req),
      pluginId: extractPluginId(req),
      pluginName: extractPluginName(req),
      inputTokens,
      outputTokens,
      embeddingCount: req._usageTracking?.embeddingCount || 0,
      gpuSeconds: req._usageTracking?.gpuSeconds || 0,
      storageBytes: req._usageTracking?.storageBytes || 0,
      bandwidthBytes: req._usageTracking?.bandwidthBytes || 0,
      requestId: extractHeader(req, 'x-request-id') || req.id,
      sessionId: extractHeader(req, 'x-session-id'),
      ipAddress: req.ip,
      durationMs,
      httpStatus: reply.statusCode,
      metadata: USAGE_TRACKING_CONFIG.enableDetailedMetrics
        ? { method: req.method, path: req.url, userAgent: req.headers['user-agent'], contentLength: req.headers['content-length'] }
        : undefined,
    };

    if (USAGE_TRACKING_CONFIG.enableBatching) {
      queueReport(report);
    } else {
      sendUsageReport(report).catch(() => {
        // Fire-and-forget, swallow errors
      });
    }
  }, () => {
    // Error case - still try to track
    const userId = extractUserId(req);
    if (!userId) return;

    const durationMs = Date.now() - (req._usageTracking?.startTime || Date.now());
    const operation = req._usageTracking?.operation || detectOperation(req);

    const report: UsageReport = {
      userId,
      service: SERVICE_NAME,
      operation,
      inputTokens: 0,
      outputTokens: 0,
      embeddingCount: 0,
      gpuSeconds: 0,
      storageBytes: 0,
      bandwidthBytes: 0,
      requestId: extractHeader(req, 'x-request-id') || req.id,
      durationMs,
      httpStatus: reply.statusCode || 500,
    };

    sendUsageReport(report).catch(() => {});
  });
}

// ============================================================================
// Public Helpers
// ============================================================================

export function setTokenUsage(
  req: TrackedRequest,
  usage: { inputTokens?: number; outputTokens?: number; embeddingCount?: number; model?: string }
): void {
  if (!req._usageTracking) req._usageTracking = { startTime: Date.now() };
  if (usage.inputTokens !== undefined) req._usageTracking.inputTokens = usage.inputTokens;
  if (usage.outputTokens !== undefined) req._usageTracking.outputTokens = usage.outputTokens;
  if (usage.embeddingCount !== undefined) req._usageTracking.embeddingCount = usage.embeddingCount;
  if (usage.model !== undefined) req._usageTracking.model = usage.model;
}

export function setOperation(req: TrackedRequest, operation: string): void {
  if (!req._usageTracking) req._usageTracking = { startTime: Date.now() };
  req._usageTracking.operation = operation;
}

export function setResourceUsage(
  req: TrackedRequest,
  usage: { gpuSeconds?: number; storageBytes?: number; bandwidthBytes?: number }
): void {
  if (!req._usageTracking) req._usageTracking = { startTime: Date.now() };
  if (usage.gpuSeconds !== undefined) req._usageTracking.gpuSeconds = usage.gpuSeconds;
  if (usage.storageBytes !== undefined) req._usageTracking.storageBytes = usage.storageBytes;
  if (usage.bandwidthBytes !== undefined) req._usageTracking.bandwidthBytes = usage.bandwidthBytes;
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

export async function flushPendingReports(): Promise<void> {
  console.log(`[Usage Tracking] Flushing pending reports: ${usageQueue.length}`);
  await flushBatch();
}

process.on('beforeExit', async () => {
  await flushPendingReports();
});
