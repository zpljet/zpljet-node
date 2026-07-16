/**
 * Host the rendered PDF and get a public URL back (paid plans).
 *
 * Run: ZPLJET_API_KEY=zpl_… npx tsx examples/03-hosted-url.ts
 */
import { PermissionDeniedError, ZplJet } from "../src/index"; // in your project: from "zpljet"

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
