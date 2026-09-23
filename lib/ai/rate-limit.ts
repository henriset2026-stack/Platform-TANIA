/**
 * Per-user request budget for the AI gateway.
 *
 * AI_LIMITS bounds a SINGLE request — its deadline, its prompt size, its tool
 * calls. Nothing bounded how many requests one person could make, so an
 * authenticated user, a runaway client retry loop or a stuck component could
 * issue unlimited model calls. Each one costs money and occupies a provider
 * connection, which makes this both a spend problem and an availability one.
 *
 * A token bucket rather than a fixed window: a fixed window lets someone spend
 * the whole allowance in the last second of one window and again in the first
 * second of the next, which is the burst it was meant to prevent. The bucket
 * refills continuously, so a burst is bounded by its capacity.
 *
 * LIMIT OF THIS IMPLEMENTATION, STATED PLAINLY: the state is in memory, so the
 * budget is per process. Behind several instances a user gets roughly one
 * budget per instance. That is a real weakening, and it is still far better
 * than no bound at all — but nobody should read this file and believe spend is
 * capped cluster-wide. Doing that properly needs shared state (the database or
 * a cache) and is recorded as a follow-up rather than faked here.
 */

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Whole tokens left after this call. */
  readonly remaining: number;
  /** Seconds until one more request becomes possible. 0 when allowed. */
  readonly retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Maximum burst. */
  readonly capacity: number;
  /** Tokens added per second. capacity / refillPerSecond = full-refill time. */
  readonly refillPerSecond: number;
  /** Bounds memory: the least recently added entry is dropped past this. */
  readonly maxTrackedSubjects: number;
}

/**
 * Twelve requests of burst, refilling one every ten seconds — six a minute
 * sustained.
 *
 * Chosen to sit far above deliberate use (a person asking questions) and far
 * below a loop. These are DESIGNED, not specified: the PRD sets no request
 * budget, so they are declared here in one place, to be tuned once there is
 * real usage to tune against.
 */
export const AI_RATE_LIMIT: RateLimitOptions = {
  capacity: 12,
  refillPerSecond: 0.1,
  maxTrackedSubjects: 5_000,
};

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: RateLimitOptions) {}

  /**
   * Consumes one token for `subject`.
   *
   * `now` is a parameter so the behaviour is testable without waiting in real
   * time — a rate limiter tested only by sleeping is a rate limiter that is
   * barely tested.
   */
  consume(subject: string, now: number = Date.now()): RateLimitDecision {
    const { capacity, refillPerSecond } = this.options;
    const existing = this.buckets.get(subject);

    const bucket: Bucket = existing
      ? {
          tokens: Math.min(
            capacity,
            existing.tokens + ((now - existing.updatedAt) / 1000) * refillPerSecond,
          ),
          updatedAt: now,
        }
      : { tokens: capacity, updatedAt: now };

    if (bucket.tokens < 1) {
      this.store(subject, bucket);
      const deficit = 1 - bucket.tokens;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(deficit / refillPerSecond)),
      };
    }

    bucket.tokens -= 1;
    this.store(subject, bucket);
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      retryAfterSeconds: 0,
    };
  }

  private store(subject: string, bucket: Bucket): void {
    // Evict rather than grow without bound: an endpoint that leaks memory
    // under load has traded one availability problem for another.
    if (
      !this.buckets.has(subject) &&
      this.buckets.size >= this.options.maxTrackedSubjects
    ) {
      const oldest = this.buckets.keys().next();
      if (!oldest.done) this.buckets.delete(oldest.value);
    }
    this.buckets.set(subject, bucket);
  }

  get size(): number {
    return this.buckets.size;
  }
}

/** The process-wide limiter used by the gateway. */
export const aiRateLimiter = new TokenBucketLimiter(AI_RATE_LIMIT);
