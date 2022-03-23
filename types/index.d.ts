import type { ServerConfigurationOptions } from './utils/data.js';
declare function createServer({ SERVER_ROOT, PORT, CORS_OPTIONS, COOKIE_SETTING, ALLOW_HTTP_PROXY }: ServerConfigurationOptions): void;
export { createServer };
