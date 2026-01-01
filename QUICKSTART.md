# NexusPricing Quick Start Guide

**Increase revenue by 12-18% with AI-powered dynamic pricing** - Join 800+ businesses using NexusPricing to optimize over $2B in annual transactions.

> "NexusPricing increased our RevPAR by 23% in the first quarter. The competitive intelligence alone pays for itself." - David Chen, Revenue Director, Pacific Hospitality Group

---

## The NexusPricing Advantage

| Metric | Before NexusPricing | After NexusPricing | Impact |
|--------|---------------------|-------------------|--------|
| Revenue per Unit | Baseline | +12-18% | **Proven ROI** |
| Price Update Speed | Daily/Weekly | Real-time | **24/7 optimization** |
| Competitive Monitoring | Manual | Automated | **25 competitors tracked** |
| Demand Forecasting | Spreadsheets | AI-Powered | **94% accuracy** |

**Average customer sees 15% revenue lift within 60 days.**

---

## Prerequisites

| Requirement | Minimum | Purpose |
|-------------|---------|---------|
| Nexus Platform | v1.0.0+ | Plugin runtime |
| Node.js | v20+ | SDK (TypeScript) |
| Python | v3.9+ | SDK (Python) |
| API Key | - | Authentication |

---

## Installation (Choose Your Method)

### Method 1: Nexus Marketplace (Recommended)

1. Navigate to **Marketplace** in your Nexus Dashboard
2. Search for "NexusPricing"
3. Click **Install** and select your tier
4. The plugin activates automatically within 60 seconds

### Method 2: Nexus CLI

```bash
nexus plugin install nexus-pricing
nexus config set PRICING_API_KEY your-api-key-here
```

### Method 3: Direct API

```bash
curl -X POST "https://api.adverant.ai/v1/plugins/install" \
  -H "Authorization: Bearer YOUR_NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pluginId": "nexus-pricing",
    "tier": "professional",
    "autoActivate": true
  }'
```

---

## Your First 5 Minutes: Get Price Optimization

### Step 1: Set Your API Key

```bash
export NEXUS_API_KEY="your-api-key-here"
```

### Step 2: Get Optimal Price Recommendation

```bash
curl -X POST "https://api.adverant.ai/proxy/nexus-pricing/api/v1/optimize" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "sku_oceanview_suite",
    "currentPrice": 299.00,
    "date": "2026-01-15",
    "constraints": {
      "minPrice": 199.00,
      "maxPrice": 599.00
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "sku_oceanview_suite",
    "currentPrice": 299.00,
    "recommendedPrice": 349.00,
    "confidence": 0.92,
    "expectedRevenueLift": 0.16,
    "factors": {
      "demandScore": 0.85,
      "competitorAverage": 329.00,
      "seasonalityIndex": 1.18,
      "eventImpact": "Convention in city (+15%)"
    },
    "validUntil": "2026-01-15T23:59:59Z"
  }
}
```

---

## Core API Endpoints

**Base URL:** `https://api.adverant.ai/proxy/nexus-pricing/api/v1`

### Price Optimization

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| `POST` | `/optimize` | Get optimal price recommendation | 300/min |
| `GET` | `/products/:id/analysis` | Get product pricing analysis | 300/min |
| `POST` | `/forecast` | Generate demand forecast | 100/min |
| `GET` | `/competitors` | List competitor prices | 60/min |
| `POST` | `/rules` | Create pricing rule | 60/min |
| `POST` | `/ab-tests` | Start A/B test | 30/min |
| `GET` | `/analytics/revenue` | Get revenue analytics | 300/min |

### Demand Forecasting

```bash
curl -X POST "https://api.adverant.ai/proxy/nexus-pricing/api/v1/forecast" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "sku_oceanview_suite",
    "forecastDays": 30,
    "includeEvents": true,
    "includeSeasonality": true
  }'
```

**Response:**
```json
{
  "productId": "sku_oceanview_suite",
  "forecast": [
    {
      "date": "2026-01-15",
      "predictedDemand": 0.78,
      "optimalPrice": 349.00,
      "confidence": 0.91,
      "events": ["City Convention"]
    },
    {
      "date": "2026-01-16",
      "predictedDemand": 0.82,
      "optimalPrice": 369.00,
      "confidence": 0.89,
      "events": ["City Convention"]
    }
  ],
  "accuracy": 0.94,
  "modelVersion": "v2.3"
}
```

### Competitor Monitoring

```bash
curl -X GET "https://api.adverant.ai/proxy/nexus-pricing/api/v1/competitors?productId=sku_oceanview_suite" \
  -H "Authorization: Bearer $NEXUS_API_KEY"
```

**Response:**
```json
{
  "productId": "sku_oceanview_suite",
  "competitors": [
    {
      "name": "Seaside Resort",
      "currentPrice": 329.00,
      "priceHistory": [319, 329, 339, 329],
      "trend": "stable"
    },
    {
      "name": "Harbor View Hotel",
      "currentPrice": 289.00,
      "priceHistory": [279, 289, 289, 289],
      "trend": "stable"
    }
  ],
  "marketPosition": {
    "yourPrice": 299.00,
    "marketAverage": 309.00,
    "percentile": 45
  },
  "lastUpdated": "2026-01-01T10:00:00Z"
}
```

---

## SDK Examples

### TypeScript/JavaScript

```bash
npm install @adverant/nexus-sdk
```

```typescript
import { NexusClient } from '@adverant/nexus-sdk';

const nexus = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY!
});

const pricing = nexus.plugin('nexus-pricing');

// Get optimal price for a product
const optimization = await pricing.optimize({
  productId: 'sku_oceanview_suite',
  currentPrice: 299.00,
  date: '2026-01-15',
  constraints: {
    minPrice: 199.00,
    maxPrice: 599.00
  }
});

console.log(`Recommended: $${optimization.recommendedPrice}`);
console.log(`Expected lift: ${optimization.expectedRevenueLift * 100}%`);

// Set up automated pricing rule
const rule = await pricing.rules.create({
  name: 'Weekend Premium',
  productIds: ['sku_oceanview_suite', 'sku_garden_view'],
  conditions: {
    dayOfWeek: ['friday', 'saturday'],
    minDaysAdvance: 7
  },
  action: {
    type: 'percentage_increase',
    value: 15
  },
  priority: 1,
  active: true
});

console.log(`Rule created: ${rule.ruleId}`);

// Start A/B test
const abTest = await pricing.abTests.create({
  name: 'Price Elasticity Test',
  productId: 'sku_oceanview_suite',
  variants: [
    { name: 'control', priceModifier: 0 },
    { name: 'premium', priceModifier: 0.10 },
    { name: 'discount', priceModifier: -0.05 }
  ],
  trafficSplit: [50, 25, 25],
  duration: 14, // days
  successMetric: 'revenue_per_visitor'
});

console.log(`A/B Test started: ${abTest.testId}`);
```

### Python

```bash
pip install nexus-sdk
```

```python
import os
from nexus_sdk import NexusClient

client = NexusClient(api_key=os.environ["NEXUS_API_KEY"])
pricing = client.plugin("nexus-pricing")

# Get optimal price
optimization = pricing.optimize(
    product_id="sku_oceanview_suite",
    current_price=299.00,
    date="2026-01-15",
    constraints={
        "min_price": 199.00,
        "max_price": 599.00
    }
)

print(f"Recommended: ${optimization.recommended_price}")
print(f"Confidence: {optimization.confidence * 100}%")
print(f"Key factors: {optimization.factors}")

# Generate demand forecast
forecast = pricing.forecast.create(
    product_id="sku_oceanview_suite",
    forecast_days=30,
    include_events=True
)

for day in forecast.predictions[:7]:
    print(f"{day.date}: Demand {day.predicted_demand:.0%}, Optimal ${day.optimal_price}")

# Get revenue analytics
analytics = pricing.analytics.revenue(
    period="last_30_days",
    group_by="product",
    include_comparison=True
)

print(f"Total Revenue: ${analytics.total_revenue:,.2f}")
print(f"vs Previous Period: {analytics.period_comparison:+.1%}")
```

---

## Pricing

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| **Monthly Price** | $199 | $599 | Custom |
| **SKUs Managed** | 1,000 | 25,000 | Unlimited |
| **Price Updates/Day** | 100 | 10,000 | Unlimited |
| **Competitors Tracked** | 3 | 25 | Unlimited |
| **Demand Forecasting** | Basic | Advanced | Advanced |
| **A/B Testing** | - | Yes | Yes |
| **Custom Rules** | 5 | Unlimited | Unlimited |
| **API Access** | Limited | Full | Full |
| **Webhooks** | - | - | Yes |
| **Dedicated Support** | - | - | Yes |

**14-day free trial. No credit card required.**

[Start Free Trial](https://marketplace.adverant.ai/plugins/nexus-pricing)

---

## Rate Limits

| Tier | Requests/Minute | Price Updates/Day | Timeout |
|------|-----------------|-------------------|---------|
| Starter | 60 | 100 | 60s |
| Professional | 300 | 10,000 | 300s |
| Enterprise | Custom | Unlimited | Custom |

---

## Next Steps

1. **[Use Cases Guide](./USE-CASES.md)** - 5 detailed revenue optimization scenarios
2. **[Architecture Overview](./ARCHITECTURE.md)** - System design and ML models
3. **[API Reference](./docs/api-reference/endpoints.md)** - Complete endpoint documentation

---

## Support

| Channel | Response Time | Availability |
|---------|---------------|--------------|
| **Documentation** | Instant | [docs.adverant.ai/plugins/pricing](https://docs.adverant.ai/plugins/pricing) |
| **Community Forum** | < 4 hours | [community.adverant.ai](https://community.adverant.ai) |
| **Email Support** | < 24 hours | plugins@adverant.ai |
| **Priority Support** | < 1 hour | Enterprise only |

---

*NexusPricing is built and maintained by [Adverant](https://adverant.ai) - Verified Nexus Plugin Developer*