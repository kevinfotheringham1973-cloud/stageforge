// Generates a random AUTH_SECRET the first time this install runs, and
// reuses it after that -- Next.js/Auth.js otherwise falls back to
// reading AUTH_SECRET from the shared app/.env, which either means
// shipping Kevin's real production secret inside the installer (an
// actual production credential in something anyone can copy/redistribute)
// or every installed copy sharing one hardcoded value (letting one
// install forge a valid session for a completely different install).
// Persisted under this OS's per-user app-data directory, same as the
// bundled database and evidence folder -- never written into the
// installed app's own files.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function getOrCreateAuthSecret(userDataDir) {
  const secretPath = path.join(userDataDir, "auth-secret.txt");
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf8").trim();
  }
  const secret = crypto.randomBytes(32).toString("base64");
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

module.exports = { getOrCreateAuthSecret };
