# NexusPricing Architecture

Technical architecture and system design for the AI-powered dynamic pricing platform.

---

## System Overview

```mermaid
flowchart TB
    subgraph Client Layer
        A[Nexus Dashboard] --> B[API Gateway]
        C[SDK Clients] --> B
        D[Webhooks] --> B
    end

    subgraph NexusPricing Service
        B --> E[REST API Layer]
        E --> F[Optimization Engine]
        E --> G[Forecasting Engine]
        E --> H[Competitor Monitor]
        E --> I[Rules Engine]
        E --> J[Analytics Engine]
    end

    subgraph AI Services
        F --> K[MageAgent]
        G --> K
        F --> L[ML Models]
        G --> L
    end

    subgraph Data Layer
        F --> M[(PostgreSQL)]
        G --> M
        H --> M
        I --> M
        J --> M
        H --> N[(Time Series DB)]
        F --> O[(Redis Cache)]
    end
```

---

## Core Components

### 1. REST API Layer

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/optimize` | POST | Get optimal price recommendation |
| `/api/v1/products/:id/analysis` | GET | Get product pricing analysis |
| `/api/v1/forecast` | POST | Generate demand forecast |
| `/api/v1/competitors` | GET | List competitor prices |
| `/api/v1/rules` | POST | Create pricing rule |
| `/api/v1/ab-tests` | POST | Start A/B test |
| `/api/v1/analytics/revenue` | GET | Get revenue analytics |

### 2. Optimization Engine

AI-powered price optimization using multiple models.

**Optimization Strategies:**
- Revenue maximization
- Occupancy optimization
- Profit margin optimization
- Competitive positioning

**Model Stack:**
```mermaid
flowchart LR
    A[Input Features] --> B[Demand Model]
    A --> C[Elasticity Model]
    A --> D[Competitor Model]
    B --> E[Ensemble Optimizer]
    C --> E
    D --> E
    E --> F[Price Recommendation]
    F --> G[Constraint Validation]
    G --> H[Final Price]
```

### 3. Forecasting Engine

Time-series demand prediction with external factors.

**Features:**
- Multi-horizon forecasting (1-365 days)
- Seasonality decomposition
- Event impact modeling
- Weather correlation
- Market trend analysis

**Model Architecture:**
- Base: Prophet with custom seasonality
- Enhancement: XGBoost for external factors
- Ensemble: Weighted average with confidence

### 4. Competitor Monitor

Real-time competitive intelligence.

**Capabilities:**
- Hourly price scraping
- Rate parity detection
- Trend analysis
- Alert generation

### 5. Rules Engine

Business logic for automated pricing.

**Rule Types:**
- Time-based (day of week, season)
- Demand-based (occupancy triggers)
- Competitive (price matching)
- Event-based (local events)
- Custom (user-defined logic)

### 6. Analytics Engine

Comprehensive revenue analytics.

**Metrics:**
- RevPAR, ADR, Occupancy
- Price acceptance rate
- Rule effectiveness
- Forecast accuracy

---

## Data Model

```mermaid
erDiagram
    PRODUCTS ||--o{ PRICE_HISTORY : has
    PRODUCTS ||--o{ FORECASTS : generates
    PRODUCTS ||--o{ RULES : configured_with
    PRODUCTS ||--o{ COMPETITORS : monitored_against
    PRODUCTS ||--o{ AB_TESTS : tested_with

    PRODUCTS {
        string product_id PK
        string name
        decimal base_price
        decimal floor_price
        decimal ceiling_price
        jsonb metadata
    }

    PRICE_HISTORY {
        uuid history_id PK
        string product_id FK
        decimal price
        string source
        timestamp effective_at
        timestamp expires_at
    }

    FORECASTS {
        uuid forecast_id PK
        string product_id FK
        date forecast_date
        decimal predicted_demand
        decimal optimal_price
        decimal confidence
        jsonb factors
        timestamp generated_at
    }

    RULES {
        uuid rule_id PK
        string product_id FK
        string name
        jsonb conditions
        jsonb action
        integer priority
        boolean active
    }

    COMPETITORS {
        uuid competitor_id PK
        string product_id FK
        string competitor_name
        decimal current_price
        jsonb price_history
        timestamp last_updated
    }

    AB_TESTS {
        uuid test_id PK
        string product_id FK
        string name
        jsonb variants
        jsonb results
        string status
        timestamp started_at
        timestamp ended_at
    }
```

---

## ML Model Architecture

### Demand Forecasting Model

```mermaid
flowchart TB
    subgraph Feature Engineering
        A[Historical Bookings] --> E[Feature Store]
        B[Calendar Events] --> E
        C[Weather Data] --> E
        D[Competitor Prices] --> E
    end

    subgraph Model Training
        E --> F[Train/Test Split]
        F --> G[Prophet Model]
        F --> H[XGBoost Model]
        F --> I[LSTM Model]
    end

    subgraph Ensemble
        G --> J[Model Weights]
        H --> J
        I --> J
        J --> K[Final Prediction]
    end

    subgraph Evaluation
        K --> L[Backtest]
        L --> M[Accuracy Metrics]
        M --> N[Model Registry]
    end
```

### Price Elasticity Model

**Input Features:**
- Historical price-demand pairs
- Competitor price differentials
- Booking window
- Season/event flags
- Guest segment

**Output:**
- Elasticity coefficient
- Optimal price point
- Revenue curve

---

## Security Model

### Authentication
- Bearer token via Nexus API Gateway
- API key rotation support
- Webhook signature verification

### Authorization
- Role-based: Viewer, Analyst, Manager, Admin
- Product-level permissions
- Rate limit enforcement

### Data Protection
- Competitor data encryption
- Pricing strategy confidentiality
- Audit logging

```mermaid
flowchart LR
    A[Request] --> B{Valid Token?}
    B -->|No| C[401 Unauthorized]
    B -->|Yes| D{Rate Limit?}
    D -->|Exceeded| E[429 Too Many Requests]
    D -->|OK| F{Permission Check}
    F -->|Denied| G[403 Forbidden]
    F -->|Allowed| H[Process Request]
```

---

## Deployment Architecture

### Kubernetes Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nexus-pricing
  namespace: nexus-plugins
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nexus-pricing
  template:
    spec:
      containers:
      - name: pricing-api
        image: adverant/nexus-pricing:1.0.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        env:
        - name: ML_MODEL_PATH
          value: "/models"
        livenessProbe:
          httpGet:
            path: /live
            port: 8080
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
      - name: model-server
        image: adverant/nexus-pricing-ml:1.0.0
        ports:
        - containerPort: 8501
        resources:
          requests:
            memory: "4Gi"
            cpu: "2000m"
          limits:
            memory: "8Gi"
            cpu: "4000m"
```

### Resource Allocation

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| API Server | 1000m | 2000m | 2Gi | 4Gi |
| ML Server | 2000m | 4000m | 4Gi | 8Gi |
| Worker | 500m | 1000m | 1Gi | 2Gi |

---

## Integration Points

### External Data Sources

```mermaid
flowchart LR
    subgraph Data Sources
        A[Competitor APIs]
        B[Event Calendars]
        C[Weather APIs]
        D[PMS Systems]
    end

    subgraph NexusPricing
        E[Data Ingestion]
        F[Feature Store]
        G[ML Pipeline]
    end

    A --> E
    B --> E
    C --> E
    D --> E
    E --> F
    F --> G
```

### Event Bus

| Event | Payload | Subscribers |
|-------|---------|-------------|
| `pricing.optimized` | Price recommendation | PMS, Analytics |
| `pricing.rule.triggered` | Rule details | Logging, Alerts |
| `pricing.competitor.changed` | Competitor update | Rules Engine |
| `pricing.forecast.generated` | Forecast data | Dashboard |

---

## Performance

### Rate Limits

| Tier | Requests/min | Price Updates/day | Forecast Requests |
|------|--------------|-------------------|-------------------|
| Starter | 60 | 100 | 50 |
| Professional | 300 | 10,000 | 500 |
| Enterprise | Custom | Unlimited | Unlimited |

### Latency Targets

| Operation | Target | P99 |
|-----------|--------|-----|
| Price Optimization | 100ms | 300ms |
| Demand Forecast | 500ms | 1500ms |
| Competitor Lookup | 50ms | 150ms |
| Rule Evaluation | 20ms | 50ms |

### Caching Strategy

- **Price cache**: 5 minute TTL
- **Competitor data**: 1 hour TTL
- **Forecasts**: 6 hour TTL (invalidated on new data)

---

## Monitoring

### Metrics (Prometheus)

```
# Optimization metrics
pricing_optimizations_total{product, strategy}
pricing_optimization_latency_seconds
pricing_recommendation_confidence

# Forecast metrics
pricing_forecast_accuracy{horizon}
pricing_forecast_latency_seconds

# Business metrics
pricing_revenue_impact{product}
pricing_rule_triggers_total{rule}
pricing_ab_test_conversions{test, variant}
```

### Alerting

| Alert | Condition | Severity |
|-------|-----------|----------|
| Model Degradation | Accuracy < 85% | Warning |
| Competitor Data Stale | No update > 4 hours | Warning |
| Price Outside Bounds | Price > ceiling or < floor | Critical |
| High Latency | P99 > 500ms | Warning |

---

## Disaster Recovery

- **RPO**: 1 hour (prices), 24 hours (models)
- **RTO**: 15 minutes (API), 1 hour (ML)
- **Model Rollback**: Previous version always available
- **Data Backup**: Hourly incremental, daily full

---

## Next Steps

- [Quick Start Guide](./QUICKSTART.md) - Get started quickly
- [Use Cases](./USE-CASES.md) - Implementation scenarios
- [API Reference](./docs/api-reference/endpoints.md) - Complete docs