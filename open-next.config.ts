import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Incremental cache (ISR) on R2 comes in once the Cloudflare account exists:
// import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
export default defineCloudflareConfig({});
