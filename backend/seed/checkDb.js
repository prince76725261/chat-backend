/**
 * Connection doctor: validates MONGO_URI and turns the driver's terse errors
 * into an actionable diagnosis.
 *
 *   npm run db:check
 *   npm run db:check -- "mongodb+srv://user:pass@host/db"
 */
const mongoose = require("mongoose");

const raw = process.argv[2] || (require("../config/env").mongoUri);

/** Redact the password so the URI can be printed and pasted into a bug report. */
const redact = (uri) => uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@)/, "$1••••••$2");

const parse = (uri) => {
  const m = uri.match(/^mongodb(\+srv)?:\/\/(?:([^:@/]*)(?::([^@]*))?@)?([^/?]+)(?:\/([^?]*))?/);
  if (!m) return null;
  return { srv: !!m[1], user: m[2] || "", pass: m[3] || "", host: m[4], db: m[5] || "" };
};

const DIAGNOSIS = {
  MongoServerError: {
    "bad auth": [
      "The URI is well-formed and the cluster was reached — only the credentials were rejected.",
      "",
      "In Atlas → Database Access, confirm a DATABASE USER exists with this exact",
      "username. A database user is NOT your Atlas login account — it is created",
      "separately, and its name is usually something like 'appuser', not your",
      "display name.",
      "",
      "If you are unsure, delete the user and add a new one with a simple",
      "alphanumeric username and password. That sidesteps every encoding problem.",
    ],
  },
  MongooseServerSelectionError: [
    "Could not reach the cluster at all.",
    "",
    "Most often Atlas → Network Access: add your current IP, or 0.0.0.0/0 for a demo.",
    "Also check the hostname is correct and that you are not behind a firewall",
    "that blocks outbound 27017 / SRV lookups.",
  ],
  // An unencoded '@' in the password makes the driver read the host as
  // "<passwordTail>@<realhost>", which then fails the SRV lookup.
  Error: {
    EBADNAME: [
      "The hostname the driver tried to resolve is not a real host.",
      "",
      "This is the classic symptom of an unencoded '@' in the PASSWORD: the",
      "driver splits the URI at the FIRST '@', so part of your password ends up",
      "being read as the hostname.",
      "",
      "Percent-encode the password: @ becomes %40, + becomes %2B, a space %20.",
      "Or simplest — set an Atlas password with only letters and digits.",
    ],
    ENOTFOUND: [
      "DNS could not resolve the cluster hostname.",
      "",
      "Check for a typo in the host, and that the cluster still exists in Atlas.",
    ],
  },
  MongoParseError: [
    "The URI itself is malformed — the driver never got as far as connecting.",
    "",
    "Almost always an unencoded character in the username or password.",
    "Percent-encode them: @ becomes %40, + becomes %2B, a space becomes %20,",
    "/ becomes %2F, : becomes %3A, # becomes %23.",
  ],
};

(async () => {
  if (!raw) {
    console.error("No MONGO_URI. Set it in .env or pass it as an argument.");
    process.exit(1);
  }

  const parts = parse(raw);
  console.log("\nChecking connection\n");
  console.log(`  uri      ${redact(raw)}`);
  if (parts) {
    console.log(`  scheme   mongodb${parts.srv ? "+srv" : ""}`);
    console.log(`  host     ${parts.host}`);
    console.log(`  user     ${parts.user ? decodeURIComponent(parts.user) : "(none)"}`);
    console.log(`  database ${parts.db || "(none — will default to 'test')"}`);

    // Catch the encoding mistakes before the driver does.
    const warn = [];
    if (/[ @+/:#?]/.test(decodeURIComponent(parts.user || "")) && parts.user === decodeURIComponent(parts.user)) {
      warn.push("username contains a character that must be percent-encoded");
    }
    if (!parts.db) {
      warn.push("no database name — add it before the '?', e.g. /whatsapp_clone?retryWrites=true");
    }
    if (warn.length) {
      console.log("");
      warn.forEach((w) => console.log(`  ⚠  ${w}`));
    }
  }

  console.log("\nConnecting…\n");
  try {
    const conn = await mongoose.connect(raw, { serverSelectionTimeoutMS: 15000 });
    const info = await conn.connection.db.admin().command({ hello: 1 });
    const collections = await conn.connection.db.listCollections().toArray();

    console.log(`  ✅ connected to ${conn.connection.host}`);
    console.log(`     database    ${conn.connection.name}`);
    console.log(`     replica set ${info.setName || "(none — standalone, transactions unavailable)"}`);
    console.log(`     collections ${collections.length ? collections.map((c) => c.name).join(", ") : "(empty — run npm run seed)"}`);
    console.log("");
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.log(`  ❌ ${err.name}: ${err.message.split("\n")[0]}\n`);

    let help = DIAGNOSIS[err.name];
    if (help && !Array.isArray(help)) {
      help = Object.entries(help).find(([k]) => err.message.includes(k))?.[1];
    }
    (help || ["No specific diagnosis for this error."]).forEach((l) => console.log(`  ${l}`));
    console.log("");
    process.exit(1);
  }
})();
