export class Router {
  #routes = [];

  add(method, path, handler) {
    if (typeof method !== 'string' || method.trim() === '') {
      throw new TypeError('Route method must be a non-empty string');
    }
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new TypeError('Route path must start with /');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('Route handler must be a function');
    }

    const segments = path.split('/').filter(Boolean);
    const params = new Set();
    for (const segment of segments) {
      if (segment.startsWith(':')) {
        const name = segment.slice(1);
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || params.has(name)) {
          throw new TypeError(`Invalid route parameter: ${segment}`);
        }
        params.add(name);
      }
    }

    const normalizedMethod = method.toUpperCase();
    if (this.#routes.some((route) =>
      route.method === normalizedMethod && route.path === path)) {
      throw new TypeError(`Route already registered: ${normalizedMethod} ${path}`);
    }

    this.#routes.push({ method: normalizedMethod, path, segments, handler });
    return this;
  }

  get(path, handler) {
    return this.add('GET', path, handler);
  }

  post(path, handler) {
    return this.add('POST', path, handler);
  }

  match(method, pathname) {
    if (typeof method !== 'string' || typeof pathname !== 'string') return null;
    const requestSegments = pathname.split('/').filter(Boolean);
    const normalizedMethod = method.toUpperCase();

    for (const route of this.#routes) {
      if (route.method !== normalizedMethod || route.segments.length !== requestSegments.length) continue;

      const params = {};
      let matches = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        let segment;
        try {
          segment = decodeURIComponent(requestSegments[index]);
        } catch {
          throw new URIError('Request path contains invalid percent-encoding');
        }

        const routeSegment = route.segments[index];
        if (routeSegment.startsWith(':')) {
          params[routeSegment.slice(1)] = segment;
        } else if (routeSegment !== segment) {
          matches = false;
          break;
        }
      }

      if (matches) return { handler: route.handler, params };
    }

    return null;
  }
}
