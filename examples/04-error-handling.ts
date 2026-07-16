/** Handle typed API errors. Run with ZPLJET_API_KEY. */
import {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  ConversionFailedError,
  QuotaExceededError,
  RateLimitError,
  ZplJet,
} from "../src/index"; // Package: "@zpljet/node"

const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });

// Invalid ZPL.
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
    console.log(`Still rate-limited — retry after ${err.retryAfter}s (${err.retryAt})`);
  } else if (err instanceof ConversionFailedError) {
    console.log(`Engine rejected the ZPL — support id: ${err.conversionId}`);
  } else if (err instanceof APIConnectionError) {
    console.log(`Network/timeout problem after retries: ${err.message}`);
  } else {
    throw err; // programming error — let it crash
  }
}
