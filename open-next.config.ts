import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Cache incremental (ISR) em R2 entra quando a conta Cloudflare existir:
// import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
export default defineCloudflareConfig({});
