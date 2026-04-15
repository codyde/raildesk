import Redis from 'ioredis'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (!_redis) {
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required')
    }
    _redis = new Redis(redisUrl)
  }
  return _redis
}

/** @deprecated Use getRedis() instead */
export const redis = new Proxy({} as Redis, {
  get(_, prop) {
    return (getRedis() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
