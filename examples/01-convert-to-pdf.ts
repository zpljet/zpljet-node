/** Convert ZPL to PDF. Run with ZPLJET_API_KEY. */
import { writeFile } from "node:fs/promises";
import { ZplJet } from "../src/index"; // Package: "@zpljet/node"

const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });

const label = await zpljet.convert({
  zpl: "^XA^FO50,50^A0N,50,50^FDHello from ZPLJet^FS^XZ",
});

await writeFile("label.pdf", label.data);
console.log(`Saved label.pdf (${label.data.byteLength} bytes, conversion ${label.id})`);
