/** Create a hosted PDF. Run with a paid-plan ZPLJET_API_KEY. */
import { PermissionDeniedError, ZplJet } from "../src/index"; // Package: "@zpljet/node"

const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });

try {
  const hosted = await zpljet.convert({
    zpl: "^XA^FO50,50^A0N,50,50^FDHosted label^FS^XZ",
    output: "url",
  });

  console.log(`URL:      ${hosted.url}`);
  console.log(`Pages:    ${hosted.pages}`);
  console.log(`Retained: ${hosted.retentionDays} days (deleted ${hosted.expiresAt})`);
} catch (err) {
  if (err instanceof PermissionDeniedError) {
    console.error(`Hosting not available on this plan: ${err.message}`);
  } else {
    throw err;
  }
}
