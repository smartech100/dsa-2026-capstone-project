import { createServer } from 'node:http';
import { realpath, stat, readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError } from '../domain/errors.js';
import { Router } from './router.js';

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
const MAX_JSON_BODY_BYTES = 1_048_576;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, value, method) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function sendError(response, error, method) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';

  if (error instanceof HttpError) {
    ({ status, code, message } = error);
  } else if (error instanceof DomainError) {
    status = error.code === 'NOT_FOUND' ? 404 : 400;
    code = error.code;
    message = error.message;
  } else if (error instanceof URIError) {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Request path contains invalid encoding';
  }

  sendJson(response, status, { error: { code, message } }, method);
}

async function readJsonBody(request) {
  const contentType = request.headers['content-type'] ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return undefined;

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'JSON request body is too large');
    }
    chunks.push(chunk);
  }
  if (size === 0) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Request body must contain valid JSON');
  }
}

function isWithinDirectory(directory, candidate) {
  const pathFromDirectory = relative(directory, candidate);
  return pathFromDirectory === '' ||
    (!pathFromDirectory.startsWith(`..${sep}`) &&
      pathFromDirectory !== '..' &&
      !isAbsolute(pathFromDirectory));
}

async function serveStaticFile(request, response, pathname, publicDir) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Request path contains invalid encoding');
  }
  if (decodedPath.includes('\0')) {
    throw new HttpError(400, 'BAD_REQUEST', 'Request path is invalid');
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(publicDir);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }

  const candidate = resolve(canonicalRoot, relativePath);
  if (!isWithinDirectory(canonicalRoot, candidate)) return false;

  let canonicalFile;
  try {
    canonicalFile = await realpath(candidate);
    if (!isWithinDirectory(canonicalRoot, canonicalFile)) return false;
    const details = await stat(canonicalFile);
    if (!details.isFile()) return false;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'ELOOP') return false;
    throw error;
  }

  const contents = await readFile(canonicalFile);
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(canonicalFile).toLowerCase()] ?? 'application/octet-stream',
    'content-length': contents.length
  });
  response.end(request.method === 'HEAD' ? undefined : contents);
  return true;
}

function createDefaultRouter() {
  return new Router().get('/health', () => ({ body: { status: 'ok' } }));
}

export function createApp({ router = createDefaultRouter(), publicDir = DEFAULT_PUBLIC_DIR } = {}) {
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      const body = await readJsonBody(request);
      const route = router.match(request.method, requestUrl.pathname);

      if (route) {
        const result = await route.handler({ request, params: route.params, body });
        const status = result?.status ?? 200;
        const headers = result?.headers ?? {};
        response.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          ...headers
        });
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(result?.body ?? null));
        return;
      }

      if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
        throw new HttpError(404, 'NOT_FOUND', 'API route not found');
      }

      if ((request.method === 'GET' || request.method === 'HEAD') &&
          await serveStaticFile(request, response, requestUrl.pathname, publicDir)) {
        return;
      }

      throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    } catch (error) {
      if (!response.headersSent) sendError(response, error, request.method);
      else response.destroy();
    }
  });
}
