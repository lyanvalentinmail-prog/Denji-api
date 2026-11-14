/** Cache TTL en memoria. En serverless vive por instancia: es solo una optimizacion. */
export class TtlCache {
  constructor({ ttl = 60_000, max = 500 } = {}) {
    this.ttl = ttl;
    this.max = max;
    this.store = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttl = this.ttl) {
    if (this.store.size >= this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttl });
    return value;
  }

  /** Devuelve el valor cacheado o ejecuta `loader` y guarda el resultado. */
  async wrap(key, loader, ttl = this.ttl) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    if (value !== undefined && value !== null) this.set(key, value, ttl);
    return value;
  }

  clear() {
    this.store.clear();
  }
}

export const sharedCache = new TtlCache({ ttl: 5 * 60_000, max: 1000 });
