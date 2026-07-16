/**
 * Convert ZPL to a PDF and save it locally.
 *
 * Run: ZPLJET_API_KEY=zpl_… npx tsx examples/01-convert-to-pdf.ts
 */
import { writeFile } from "node:fs/promises";
import { ZplJet } from "../src/index"; // in your project: from "zpljet"

const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });

const label = await zpljet.convert({
  zpl: "^XA^FO50,50^A0N,50,50^FDHello from ZPLJet^FS^XZ",
});

await writeFile("label.pdf", label.data);
console.log(`Saved label.pdf (${label.data.byteLength} bytes, conversion ${label.id})`);
