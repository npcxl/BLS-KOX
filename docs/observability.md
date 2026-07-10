# 可观测性

## Prometheus Metrics

访问 `GET /api/metrics` 获取 Prometheus 格式指标。

## 指标清单

### HTTP
| 指标 | 类型 | 标签 |
|------|------|------|
| `bls_kox_http_requests_total` | Counter | route, method, status |
| `bls_kox_http_request_duration_seconds` | Histogram | route, method |
| `bls_kox_http_request_errors_total` | Counter | route, method |

### 数据库
| 指标 | 类型 | 标签 |
|------|------|------|
| `bls_kox_db_query_duration_seconds` | Histogram | operation |
| `bls_kox_db_query_errors_total` | Counter | operation |

### Redis
| 指标 | 类型 | 标签 |
|------|------|------|
| `bls_kox_redis_operation_duration_seconds` | Histogram | operation |
| `bls_kox_redis_operation_errors_total` | Counter | operation |

### 安全
| 指标 | 类型 | 标签 |
|------|------|------|
| `bls_kox_security_events_total` | Counter | event_type, risk_level |
| `bls_kox_rate_limit_rejected_total` | Counter | route, dimension |
| `bls_kox_replay_rejected_total` | Counter | reason |
| `bls_kox_idempotency_conflict_total` | Counter | type |
| `bls_kox_refresh_reuse_detected_total` | Counter | |
| `bls_kox_cross_tenant_access_total` | Counter | |
| `bls_kox_login_failed_total` | Counter | |

### 状态
| 指标 | 类型 |
|------|------|
| `bls_kox_active_sessions` | Gauge |
| `bls_kox_websocket_connections` | Gauge |

## Prometheus 配置

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'bls-kox'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['bls-server:6001']
```

## 告警规则

见 `deploy/prometheus/rules/bls-kox-alerts.yml`，包含：
- 5xx 错误率 > 5%
- P95 延迟 > 2s
- 数据库错误 > 10/min
- Redis 错误 > 5/min
- Refresh Token 复用检测
- 跨租户访问检测
- 频率限制触发 > 50/min
