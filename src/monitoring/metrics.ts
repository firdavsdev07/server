/**
 * Application Metrics Collection
 *
 * Tracks key metrics for monitoring and alerting
 */

interface Metrics {
  contractEdits: {
    total: number;
    successful: number;
    failed: number;
    lastEdit: Date | null;
  };
  payments: {
    created: number;
    confirmed: number;
    rejected: number;
  };
  errors: {
    count: number;
    lastError: Date | null;
    errorTypes: Map<string, number>;
  };
  performance: {
    avgResponseTime: number;
    slowQueries: number;
  };
}

class MetricsCollector {
  private metrics: Metrics;
  private responseTimes: number[] = [];
  private readonly MAX_RESPONSE_TIMES = 100;

  constructor() {
    this.metrics = {
      contractEdits: {
        total: 0,
        successful: 0,
        failed: 0,
        lastEdit: null,
      },
      payments: {
        created: 0,
        confirmed: 0,
        rejected: 0,
      },
      errors: {
        count: 0,
        lastError: null,
        errorTypes: new Map(),
      },
      performance: {
        avgResponseTime: 0,
        slowQueries: 0,
      },
    };
  }

  /**
   * Record a contract edit
   */
  recordContractEdit(success: boolean): void {
    this.metrics.contractEdits.total++;
    if (success) {
      this.metrics.contractEdits.successful++;
    } else {
      this.metrics.contractEdits.failed++;
    }
    this.metrics.contractEdits.lastEdit = new Date();
  }

  /**
   * Record a payment creation
   */
  recordPaymentCreated(): void {
    this.metrics.payments.created++;
  }

  /**
   * Record a payment confirmation
   */
  recordPaymentConfirmed(): void {
    this.metrics.payments.confirmed++;
  }

  /**
   * Record a payment rejection
   */
  recordPaymentRejected(): void {
    this.metrics.payments.rejected++;
  }

  /**
   * Record an error
   */
  recordError(errorType: string): void {
    this.metrics.errors.count++;
    this.metrics.errors.lastError = new Date();

    const currentCount = this.metrics.errors.errorTypes.get(errorType) || 0;
    this.metrics.errors.errorTypes.set(errorType, currentCount + 1);
  }

  /**
   * Record response time
   */
  recordResponseTime(timeMs: number): void {
    this.responseTimes.push(timeMs);

    // Keep only last N response times
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes.shift();
    }

    // Calculate average
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    this.metrics.performance.avgResponseTime = sum / this.responseTimes.length;

    // Track slow queries (>1000ms)
    if (timeMs > 1000) {
      this.metrics.performance.slowQueries++;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): Metrics & { errorTypes: Record<string, number> } {
    return {
      ...this.metrics,
      errorTypes: Object.fromEntries(this.metrics.errors.errorTypes),
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      contractEdits: {
        total: 0,
        successful: 0,
        failed: 0,
        lastEdit: null,
      },
      payments: {
        created: 0,
        confirmed: 0,
        rejected: 0,
      },
      errors: {
        count: 0,
        lastError: null,
        errorTypes: new Map(),
      },
      performance: {
        avgResponseTime: 0,
        slowQueries: 0,
      },
    };
    this.responseTimes = [];
  }

  /**
   * Get metrics summary for logging
   */
  getSummary(): string {
    const m = this.metrics;
    return `
Metrics Summary:
  Contract Edits: ${m.contractEdits.total} (${
      m.contractEdits.successful
    } successful, ${m.contractEdits.failed} failed)
  Payments: ${m.payments.created} created, ${m.payments.confirmed} confirmed, ${
      m.payments.rejected
    } rejected
  Errors: ${m.errors.count} total
  Performance: ${m.performance.avgResponseTime.toFixed(2)}ms avg, ${
      m.performance.slowQueries
    } slow queries
    `.trim();
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();

/**
 * Middleware to track response times
 */
export function metricsMiddleware(req: any, res: any, next: any): void {
  const startTime = Date.now();

  res.on("finish", () => {
    const responseTime = Date.now() - startTime;
    metricsCollector.recordResponseTime(responseTime);
  });

  next();
}

/**
 * Get metrics endpoint handler
 */
export function getMetrics(req: any, res: any): void {
  const metrics = metricsCollector.getMetrics();
  res.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    metrics,
  });
}
