# NexusPricing - Technical Documentation

## API Reference

### Base URL

```
https://api.adverant.ai/proxy/nexus-pricing/api/v1/pricing
```

### Authentication

All API requests require a Bearer token in the Authorization header:

```bash
Authorization: Bearer YOUR_API_KEY
```

#### Required Scopes

| Scope | Description |
|-------|-------------|
| `pricing:read` | Read pricing data and analysis |
| `pricing:write` | Create and modify pricing rules |
| `pricing:optimize` | Access optimization features |
| `pricing:analytics` | Access revenue analytics |

---

## API Endpoints

### Price Optimization

#### Get Optimal Price Recommendation

```http
POST /optimize
```

**Request Body:**

```json
{
  "productId": "SKU-12345",
  "currentPrice": 99.99,
  "costBasis": 45.00,
  "objective": "maximize_revenue | maximize_profit | maximize_volume | target_margin",
  "constraints": {
    "minPrice": 79.99,
    "maxPrice": 149.99,
    "targetMargin": 0.40,
    "competitorPriceBuffer": 0.05
  },
  "context": {
    "channel": "amazon | shopify | retail",
    "region": "us-east",
    "customerSegment": "premium",
    "inventoryLevel": 500,
    "daysOfSupply": 45
  },
  "includeScenarios": true
}
```

**Response:**

```json
{
  "recommendationId": "rec_price123",
  "productId": "SKU-12345",
  "currentPrice": 99.99,
  "optimalPrice": 119.99,
  "expectedImpact": {
    "revenueChange": "+12.5%",
    "volumeChange": "-3.2%",
    "marginChange": "+18.7%",
    "profitChange": "+15.3%"
  },
  "confidence": 0.87,
  "analysis": {
    "currentElasticity": -1.4,
    "optimalElasticity": -1.1,
    "marketPosition": "premium",
    "pricePerceptionScore": 78
  },
  "competitorContext": {
    "averageMarketPrice": 109.99,
    "percentilePosition": 75,
    "nearestCompetitor": {
      "price": 114.99,
      "difference": "+4.3%"
    }
  },
  "scenarios": [
    {
      "price": 109.99,
      "revenueImpact": "+8.2%",
      "volumeImpact": "+2.1%",
      "marginImpact": "+10.5%"
    },
    {
      "price": 119.99,
      "revenueImpact": "+12.5%",
      "volumeImpact": "-3.2%",
      "marginImpact": "+18.7%"
    },
    {
      "price": 129.99,
      "revenueImpact": "+9.8%",
      "volumeImpact": "-8.5%",
      "marginImpact": "+22.1%"
    }
  ],
  "rationale": [
    "Current price is 9% below market average",
    "High elasticity suggests room for price increase",
    "Competitor raised prices 5% in last 30 days",
    "Strong inventory position supports higher pricing"
  ],
  "generated_at": "2025-01-15T10:00:00Z"
}
```

### Product Analysis

#### Get Product Pricing Analysis

```http
GET /products/:id/analysis
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | Analysis period (7d, 30d, 90d) |
| `include_competitors` | boolean | Include competitor data |
| `include_elasticity` | boolean | Calculate price elasticity |

**Response:**

```json
{
  "productId": "SKU-12345",
  "name": "Premium Widget",
  "category": "Electronics",
  "currentPrice": 99.99,
  "priceHistory": [
    { "date": "2025-01-01", "price": 89.99, "volume": 150 },
    { "date": "2025-01-08", "price": 94.99, "volume": 135 },
    { "date": "2025-01-15", "price": 99.99, "volume": 120 }
  ],
  "elasticity": {
    "coefficient": -1.4,
    "confidence": 0.92,
    "interpretation": "moderately_elastic",
    "optimal_range": { "min": 95.00, "max": 125.00 }
  },
  "competitorPrices": [
    { "competitor": "Competitor A", "price": 114.99, "lastUpdated": "2025-01-14" },
    { "competitor": "Competitor B", "price": 104.99, "lastUpdated": "2025-01-15" },
    { "competitor": "Competitor C", "price": 119.99, "lastUpdated": "2025-01-13" }
  ],
  "marketPosition": {
    "percentile": 35,
    "position": "value",
    "averageMarketPrice": 112.99,
    "priceGap": -11.5
  },
  "seasonality": {
    "currentFactor": 1.0,
    "peakMonths": ["november", "december"],
    "troughMonths": ["january", "february"],
    "seasonalityStrength": 0.35
  },
  "recommendations": [
    {
      "action": "increase_price",
      "target": 109.99,
      "expectedImpact": "+8% revenue",
      "confidence": "high"
    }
  ]
}
```

### Demand Forecasting

#### Generate Demand Forecast

```http
POST /forecast
```

**Request Body:**

```json
{
  "productIds": ["SKU-12345", "SKU-12346"],
  "forecastPeriod": 30,
  "granularity": "daily | weekly",
  "priceScenarios": [
    { "price": 99.99 },
    { "price": 109.99 },
    { "price": 119.99 }
  ],
  "includeFactors": ["seasonality", "trends", "events", "weather"],
  "events": [
    {
      "date": "2025-02-14",
      "type": "holiday",
      "name": "Valentine's Day",
      "expectedImpact": 1.3
    }
  ]
}
```

**Response:**

```json
{
  "forecastId": "fcst_abc123",
  "generatedAt": "2025-01-15T10:00:00Z",
  "period": {
    "start": "2025-01-15",
    "end": "2025-02-14"
  },
  "forecasts": [
    {
      "productId": "SKU-12345",
      "scenarios": [
        {
          "price": 99.99,
          "predictedVolume": 3200,
          "predictedRevenue": 319968,
          "confidence": { "low": 2800, "high": 3600 }
        },
        {
          "price": 109.99,
          "predictedVolume": 2900,
          "predictedRevenue": 318971,
          "confidence": { "low": 2500, "high": 3300 }
        },
        {
          "price": 119.99,
          "predictedVolume": 2500,
          "predictedRevenue": 299975,
          "confidence": { "low": 2100, "high": 2900 }
        }
      ],
      "timeSeries": [
        { "date": "2025-01-15", "volume": 100, "revenue": 9999 },
        { "date": "2025-01-16", "volume": 105, "revenue": 10499 }
      ],
      "factors": {
        "trend": 0.02,
        "seasonality": 0.95,
        "eventImpact": 1.3
      }
    }
  ],
  "modelMetrics": {
    "mape": 8.5,
    "rmse": 15.2,
    "r2": 0.89
  }
}
```

### Competitive Monitoring

#### List Competitor Prices

```http
GET /competitors
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `productId` | string | Filter by product |
| `channel` | string | Filter by channel |
| `includeHistory` | boolean | Include price history |
| `days` | number | History period |

**Response:**

```json
{
  "productId": "SKU-12345",
  "competitors": [
    {
      "competitorId": "comp_001",
      "name": "Competitor A",
      "channel": "amazon",
      "currentPrice": 114.99,
      "lastUpdated": "2025-01-15T09:30:00Z",
      "inStock": true,
      "priceHistory": [
        { "date": "2025-01-08", "price": 109.99 },
        { "date": "2025-01-15", "price": 114.99 }
      ],
      "priceChange": {
        "amount": 5.00,
        "percentage": 4.5,
        "direction": "up"
      },
      "rating": 4.2,
      "reviewCount": 1250
    }
  ],
  "marketSummary": {
    "averagePrice": 112.99,
    "minPrice": 94.99,
    "maxPrice": 129.99,
    "priceRange": 34.00,
    "yourPosition": "below_average"
  },
  "alerts": [
    {
      "type": "competitor_price_change",
      "competitor": "Competitor A",
      "oldPrice": 109.99,
      "newPrice": 114.99,
      "timestamp": "2025-01-15T09:30:00Z"
    }
  ]
}
```

### Pricing Rules

#### Create Pricing Rule

```http
POST /rules
```

**Request Body:**

```json
{
  "name": "Competitor Price Match",
  "description": "Match competitor price within 5%",
  "active": true,
  "priority": 10,
  "conditions": [
    {
      "field": "competitor_price",
      "operator": "less_than",
      "value": "our_price",
      "margin": 0.05
    }
  ],
  "action": {
    "type": "set_price",
    "method": "formula",
    "formula": "competitor_price * 0.98",
    "constraints": {
      "minMargin": 0.20,
      "minPrice": 50.00,
      "maxPrice": 200.00
    }
  },
  "applicableTo": {
    "products": ["SKU-12345", "SKU-12346"],
    "categories": ["electronics"],
    "channels": ["amazon", "shopify"]
  },
  "schedule": {
    "startDate": "2025-01-15",
    "endDate": "2025-03-15",
    "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "timezone": "America/New_York"
  }
}
```

**Response:**

```json
{
  "ruleId": "rule_abc123",
  "name": "Competitor Price Match",
  "status": "active",
  "applicableProducts": 2,
  "lastTriggered": null,
  "createdAt": "2025-01-15T10:00:00Z"
}
```

### A/B Testing

#### Start A/B Test

```http
POST /ab-tests
```

**Request Body:**

```json
{
  "name": "Premium Widget Price Test",
  "productId": "SKU-12345",
  "variants": [
    { "name": "control", "price": 99.99, "trafficPercentage": 33 },
    { "name": "variant_a", "price": 109.99, "trafficPercentage": 33 },
    { "name": "variant_b", "price": 119.99, "trafficPercentage": 34 }
  ],
  "targetMetric": "revenue | profit | conversion",
  "minimumSampleSize": 1000,
  "confidenceLevel": 0.95,
  "duration": {
    "type": "fixed | until_significance",
    "days": 14
  },
  "segmentation": {
    "enabled": true,
    "dimensions": ["region", "customer_type"]
  }
}
```

**Response:**

```json
{
  "testId": "test_abc123",
  "name": "Premium Widget Price Test",
  "status": "running",
  "variants": [
    { "name": "control", "price": 99.99, "trafficPercentage": 33 },
    { "name": "variant_a", "price": 109.99, "trafficPercentage": 33 },
    { "name": "variant_b", "price": 119.99, "trafficPercentage": 34 }
  ],
  "startDate": "2025-01-15T10:00:00Z",
  "estimatedEndDate": "2025-01-29T10:00:00Z",
  "currentResults": null
}
```

#### Get A/B Test Results

```http
GET /ab-tests/:id/results
```

**Response:**

```json
{
  "testId": "test_abc123",
  "status": "completed",
  "startDate": "2025-01-15T10:00:00Z",
  "endDate": "2025-01-29T10:00:00Z",
  "totalSamples": 4500,
  "results": {
    "variants": [
      {
        "name": "control",
        "price": 99.99,
        "samples": 1485,
        "conversions": 148,
        "conversionRate": 0.0997,
        "revenue": 14798.52,
        "revenuePerVisitor": 9.97
      },
      {
        "name": "variant_a",
        "price": 109.99,
        "samples": 1492,
        "conversions": 134,
        "conversionRate": 0.0898,
        "revenue": 14738.66,
        "revenuePerVisitor": 9.88
      },
      {
        "name": "variant_b",
        "price": 119.99,
        "samples": 1523,
        "conversions": 122,
        "conversionRate": 0.0801,
        "revenue": 14638.78,
        "revenuePerVisitor": 9.61
      }
    ],
    "winner": {
      "variant": "control",
      "metric": "revenuePerVisitor",
      "improvement": null,
      "confidence": 0.92
    },
    "statisticalSignificance": true,
    "recommendation": "Keep current price of $99.99. Higher prices showed reduced conversion without sufficient revenue gains."
  },
  "segmentResults": {
    "region": {
      "us-east": { "winner": "control" },
      "us-west": { "winner": "variant_a" }
    }
  }
}
```

### Revenue Analytics

#### Get Revenue Analytics

```http
GET /analytics/revenue
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string | Start of date range |
| `end_date` | string | End of date range |
| `group_by` | string | `day`, `week`, `month`, `product`, `category` |
| `compare_period` | string | Previous period comparison |

**Response:**

```json
{
  "period": {
    "start": "2025-01-01",
    "end": "2025-01-31"
  },
  "summary": {
    "totalRevenue": 1250000,
    "totalOrders": 12500,
    "averageOrderValue": 100.00,
    "averageMargin": 0.42,
    "priceChangesApplied": 45
  },
  "comparison": {
    "previousPeriod": {
      "revenue": 1150000,
      "change": "+8.7%"
    }
  },
  "byProduct": [
    {
      "productId": "SKU-12345",
      "name": "Premium Widget",
      "revenue": 125000,
      "orders": 1250,
      "averagePrice": 100.00,
      "priceOptimizationImpact": "+$12,500"
    }
  ],
  "priceOptimizationImpact": {
    "revenueGain": 85000,
    "revenueGainPercentage": 6.8,
    "recommendationsApplied": 45,
    "recommendationsIgnored": 12
  },
  "elasticityInsights": [
    {
      "productId": "SKU-12345",
      "currentElasticity": -1.2,
      "optimalPriceRange": { "min": 95, "max": 115 },
      "currentPrice": 99.99,
      "recommendation": "Consider testing $109.99"
    }
  ]
}
```

---

## Rate Limits

| Tier | Optimize/min | Forecast/hour | Competitors/min |
|------|--------------|---------------|-----------------|
| Starter | 10 | 5 | 30 |
| Professional | 50 | 50 | 100 |
| Enterprise | 500 | Unlimited | 500 |

---

## Data Models

### PriceRecommendation

```typescript
interface PriceRecommendation {
  recommendationId: string;
  productId: string;
  currentPrice: number;
  optimalPrice: number;
  expectedImpact: PriceImpact;
  confidence: number;
  analysis: PriceAnalysis;
  competitorContext: CompetitorContext;
  scenarios: PriceScenario[];
  rationale: string[];
  generated_at: string;
}

interface PriceImpact {
  revenueChange: string;
  volumeChange: string;
  marginChange: string;
  profitChange: string;
}

interface PriceAnalysis {
  currentElasticity: number;
  optimalElasticity: number;
  marketPosition: string;
  pricePerceptionScore: number;
}

interface PriceScenario {
  price: number;
  revenueImpact: string;
  volumeImpact: string;
  marginImpact: string;
}
```

### PricingRule

```typescript
interface PricingRule {
  ruleId: string;
  name: string;
  description?: string;
  active: boolean;
  priority: number;
  conditions: RuleCondition[];
  action: RuleAction;
  applicableTo: RuleScope;
  schedule?: RuleSchedule;
  lastTriggered?: string;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

interface RuleCondition {
  field: string;
  operator: 'equals' | 'less_than' | 'greater_than' | 'between' | 'in';
  value: unknown;
  margin?: number;
}

interface RuleAction {
  type: 'set_price' | 'adjust_percentage' | 'adjust_amount' | 'match_competitor';
  method?: 'fixed' | 'formula';
  value?: number;
  formula?: string;
  constraints: ActionConstraints;
}

interface ActionConstraints {
  minMargin?: number;
  maxMargin?: number;
  minPrice?: number;
  maxPrice?: number;
}
```

### ABTest

```typescript
interface ABTest {
  testId: string;
  name: string;
  productId: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  variants: TestVariant[];
  targetMetric: 'revenue' | 'profit' | 'conversion' | 'volume';
  minimumSampleSize: number;
  confidenceLevel: number;
  duration: TestDuration;
  startDate?: string;
  endDate?: string;
  results?: TestResults;
  createdAt: string;
}

interface TestVariant {
  name: string;
  price: number;
  trafficPercentage: number;
}

interface TestResults {
  variants: VariantResult[];
  winner?: WinnerInfo;
  statisticalSignificance: boolean;
  recommendation: string;
}
```

---

## SDK Integration

### JavaScript/TypeScript

```typescript
import { NexusClient } from '@adverant/nexus-sdk';

const client = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY
});

// Get optimal price
const recommendation = await client.pricing.optimize({
  productId: 'SKU-12345',
  currentPrice: 99.99,
  costBasis: 45.00,
  objective: 'maximize_revenue',
  constraints: {
    minPrice: 79.99,
    maxPrice: 149.99
  }
});

console.log(`Optimal price: $${recommendation.optimalPrice}`);
console.log(`Expected revenue change: ${recommendation.expectedImpact.revenueChange}`);

// Create pricing rule
const rule = await client.pricing.rules.create({
  name: 'Competitor Match',
  conditions: [
    { field: 'competitor_price', operator: 'less_than', value: 'our_price' }
  ],
  action: {
    type: 'match_competitor',
    constraints: { minMargin: 0.20 }
  }
});

// Start A/B test
const test = await client.pricing.abTests.create({
  name: 'Price Test',
  productId: 'SKU-12345',
  variants: [
    { name: 'control', price: 99.99, trafficPercentage: 50 },
    { name: 'variant_a', price: 109.99, trafficPercentage: 50 }
  ],
  targetMetric: 'revenue',
  duration: { type: 'fixed', days: 14 }
});
```

### Python

```python
from nexus_sdk import NexusClient

client = NexusClient(api_key=os.environ["NEXUS_API_KEY"])

# Get price optimization
recommendation = client.pricing.optimize(
    product_id="SKU-12345",
    current_price=99.99,
    cost_basis=45.00,
    objective="maximize_revenue",
    constraints={
        "min_price": 79.99,
        "max_price": 149.99
    }
)

print(f"Optimal price: ${recommendation['optimalPrice']}")
print(f"Confidence: {recommendation['confidence'] * 100}%")

for rationale in recommendation["rationale"]:
    print(f"  - {rationale}")

# Get competitor prices
competitors = client.pricing.competitors(product_id="SKU-12345")
print(f"Average market price: ${competitors['marketSummary']['averagePrice']}")

# Generate demand forecast
forecast = client.pricing.forecast(
    product_ids=["SKU-12345"],
    forecast_period=30,
    price_scenarios=[
        {"price": 99.99},
        {"price": 109.99}
    ]
)
```

---

## Webhook Events

| Event | Description |
|-------|-------------|
| `price.recommendation` | New price recommendation |
| `price.changed` | Price updated via rule |
| `competitor.price_change` | Competitor price detected |
| `rule.triggered` | Pricing rule executed |
| `test.completed` | A/B test concluded |
| `test.significance` | Test reached significance |

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `PRODUCT_NOT_FOUND` | 404 | Product does not exist |
| `RULE_NOT_FOUND` | 404 | Pricing rule not found |
| `TEST_NOT_FOUND` | 404 | A/B test not found |
| `OPTIMIZATION_FAILED` | 500 | Price optimization error |
| `INSUFFICIENT_DATA` | 400 | Not enough data for analysis |
| `RULE_CONFLICT` | 400 | Conflicting pricing rules |
| `SKU_LIMIT_EXCEEDED` | 402 | SKU limit for tier exceeded |

---

## Deployment Requirements

### Container Specifications

| Resource | Value |
|----------|-------|
| CPU | 2000m (2 cores) |
| Memory | 4096 MB |
| Disk | 5 GB |
| Timeout | 300,000 ms (5 min) |
| Max Concurrent Jobs | 10 |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis for caching |
| `MAGEAGENT_URL` | Yes | MageAgent for ML |
| `GRAPHRAG_URL` | Yes | GraphRAG for patterns |

### Health Checks

| Endpoint | Purpose |
|----------|---------|
| `/health` | General health check |
| `/ready` | Readiness probe |
| `/live` | Liveness probe |

---

## Quotas and Limits

### By Pricing Tier

| Limit | Starter | Professional | Enterprise |
|-------|---------|--------------|------------|
| SKUs | 1,000 | 25,000 | Unlimited |
| Price Updates/day | 100 | 10,000 | Unlimited |
| Competitors Monitored | 3 | 25 | Unlimited |
| Custom Rules | 5 | 50 | Unlimited |
| A/B Tests | - | Yes | Yes |
| Demand Forecasting | Basic | Advanced | Custom |
| API Access | Basic | Full | Full + Webhooks |

### Pricing

| Tier | Monthly | Annual |
|------|---------|--------|
| Starter | $199 | $1,990 |
| Professional | $599 | $5,990 |
| Enterprise | Custom | Custom |

---

## Support

- **Documentation**: [docs.adverant.ai/plugins/nexus-pricing](https://docs.adverant.ai/plugins/nexus-pricing)
- **Discord**: [discord.gg/adverant](https://discord.gg/adverant)
- **Email**: support@adverant.ai
- **GitHub Issues**: [Report a bug](https://github.com/adverant/Adverant-Nexus-Plugin-Pricing/issues)
