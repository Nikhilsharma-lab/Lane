// The export's encryption (#410, #333 Q9): gpg, symmetric, AES256. gpg asks Nikhil for the passphrase itself, on his
// terminal, so the kit never sees it; --no-symkey-cache keeps gpg's agent from remembering it, so every decryption
// (the export's own check, each rehearsal) asks again and proves the passphrase he stored is the one that works.
//
// LANE_CUTOVER_PASSPHRASE_FILE names a file that stands in for Nikhil typing it, for the kit's own tests: gpg reads
// the file itself (--passphrase-file), so the passphrase is never on an argument list, an output or the step log.
import type { Readable } from "node:stream";
import { runTool } from "./tools.mts";

function asking(env: NodeJS.ProcessEnv) {
  const standIn = env.LANE_CUTOVER_PASSPHRASE_FILE;
  // gpg's own environment: HOME and GNUPGHOME find its agent, GPG_TTY and the rest let pinentry ask on the terminal.
  const gpgEnv: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("PG") && !key.startsWith("LANE_"))), NODE_ENV: env.NODE_ENV };
  return standIn
    ? { args: ["--batch", "--pinentry-mode", "loopback", "--passphrase-file", standIn], options: { env: gpgEnv, stdin: "ignore" as const } }
    : { args: [], options: { env: gpgEnv, stdin: "inherit" as const } };
}

/** Encrypts `plain` into `encrypted`. gpg asks for the passphrase twice. */
export async function encrypt(plain: string, encrypted: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { args, options } = asking(env);
  await runTool("gpg", [...args, "--no-symkey-cache", "--symmetric", "--cipher-algo", "AES256", "--output", encrypted, plain], options);
}

/**
 * Decrypts `encrypted`, handing the plain bytes to `read` as they come, so no plain copy of the whole archive is
 * written. gpg checks the archive's integrity at its end; a damaged or altered archive, or a wrong passphrase, throws.
 */
export async function decrypt(encrypted: string, read: (plain: Readable) => Promise<void>, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { args, options } = asking(env);
  await runTool("gpg", [...args, "--no-symkey-cache", "--decrypt", encrypted], { ...options, stdout: read });
}
