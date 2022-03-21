import { BrowserOptions, ChromeArgOptions, LaunchOptions, Product } from 'puppeteer';
/**
 * https://expressjs.com/en/resources/middleware/cors.html
 */
/**
 * https://expressjs.com/en/api.html#res.cookie
 */
export declare type ServerConfigurationOptions = {
    SERVER_ROOT: string;
    PORT: number | string;
    CORS_OPTIONS?: {
        origin?: boolean | string | string[] | (() => void);
        methods?: string | string[];
        allowedHeaders?: string | string[];
        credentials?: boolean;
        maxAge?: number;
        preflightContinue?: boolean;
        optionsSuccessStatus?: number;
    };
    COOKIE_SETTING?: {
        domain?: string;
        encode?: () => void;
        expires?: Date;
        httpOnly?: boolean;
        maxAge?: number;
        path?: string;
        secure?: boolean;
        signed?: boolean;
        sameSite?: boolean | string;
    };
};
export declare type PuppeteerOptions = LaunchOptions & ChromeArgOptions & BrowserOptions & {
    product?: Product;
    extraPrefsFirefox?: Record<string, unknown>;
};
declare function createServer({ SERVER_ROOT, PORT, CORS_OPTIONS, COOKIE_SETTING }: ServerConfigurationOptions): void;
export { createServer };
