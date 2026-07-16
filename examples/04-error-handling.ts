/**
 * Handle every error the API can return, with typed context fields.
 *
 * Run: ZPLJET_API_KEY=zpl_… npx tsx examples/04-error-handling.ts
 */
import {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  ConversionFailedError,
  QuotaExceededError,
  RateLimitError,
  ZplJet,
} from "../src/index"; // in your project: from "zpljet"

const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });

// Deliberately invalid — there is no ^XA…^XZ block.
const badZpl = "this is not zpl";

try {
  await zpljet.convert({ zpl: badZpl });
} catch (err) {
  if (err instanceof BadRequestError) {
    console.log(`Invalid request — field "${err.param}": ${err.message}`);
    console.log(`Docs: ${err.docUrl}`);
  } else if (err instanceof AuthenticationError) {
    console.log("Bad API key — create one at https://zpljet.com/dashboard");
  } else if (err instanceof QuotaExceededError) {
    console.log(`Quota: ${err.used}/${err.quota} used, resets ${err.resetsAt}`);
  } else if (err instanceof RateLimitError) {
    // The SDK already retried with backoff before throwing this.
    console.log(`Still rate-limited — retry after ${err.retryAfter}s (${err.retryAt})`);
  } else if (err instanceof ConversionFailedError) {
    console.log(`Engine rejected the ZPL — support id: ${err.conversionId}`);
  } else if (err instanceof APIConnectionError) {
    console.log(`Network/timeout problem after retries: ${err.message}`);
  } else {
    throw err; // programming error — let it crash
  }
}
