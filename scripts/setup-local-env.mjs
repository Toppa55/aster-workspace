import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL("../.env.local", import.meta.url);

if (!existsSync(target)) {
  const example = readFileSync(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  const encryptionKey = randomBytes(48).toString("hex");
  const configured = example.replace(
    /^APP_ENCRYPTION_KEY=.*$/m,
    `APP_ENCRYPTION_KEY=${encryptionKey}`,
  );
  writeFileSync(target, configured, { encoding: "utf8", mode: 0o600 });
  console.log(`Created ${root}.env.local with a private encryption key.`);
} else {
  console.log("Using the existing .env.local configuration.");
}
