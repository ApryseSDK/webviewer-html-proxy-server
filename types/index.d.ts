import type { ServerConfigurationOptions } from './data.js';
declare function createServer({ SERVER_ROOT, PORT, CORS_OPTIONS, COOKIE_SETTING }: ServerConfigurationOptions): void;
export { createServer };
