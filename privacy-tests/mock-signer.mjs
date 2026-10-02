// A stand-in for the Rust signer, so the privacy tests run anywhere: no wallet,
// no chain, no testnet coins. It answers the same routes the web app calls and
// keeps a log of everything it was sent, which the tests read back to check
// what reached "the server side".
//
// It is not a model of the signer's checks. In particular it accepts any
// 24-word phrase on a claim; the real signer derives the pot's viewing key
// from the phrase and refuses a mismatch.
import http from "node:http";

const PORT = Number(process.env.MOCK_SIGNER_PORT ?? 18081);
const pots = new Map(); // pot_id -> { viewing_key, address, claimed }
const log = []; // { method, path, body }

const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

http
  .createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    const text = (status, value) => {
      res.writeHead(status, { "content-type": "text/plain" });
      res.end(value);
    };
    const { method, url: path } = req;

    // Test-only: what this stand-in has been sent so far.
    if (method === "GET" && path === "/__log") return json(200, log);
    if (method === "GET" && path === "/health") return json(200, { ok: true });

    const body = method === "POST" ? await readBody(req) : "";
    log.push({ method, path, body });

    if (method === "GET" && path === "/payments")
      return json(200, { chain_tip: 4424312, scanned_height: 4424312, payments: [], sent: [] });
    if (method === "POST" && path === "/address") return json(200, { address: "utest1standin" + newId(), diversifier_index: 1 });

    // A pot made in the creator's browser: only its viewing key and the seed's fingerprint arrive.
    if (method === "POST" && path === "/pots/import") {
      const b = JSON.parse(body);
      if ([...pots.values()].some((p) => p.viewing_key === b.viewing_key)) return text(400, "a pot with this viewing key already exists");
      const pot_id = newId();
      pots.set(pot_id, { viewing_key: b.viewing_key, address: "utest1standinpot" + pot_id, claimed: false });
      return json(200, { pot_id, viewing_key: b.viewing_key, address: pots.get(pot_id).address, birthday_height: 4421800 });
    }

    // The server-made fallback. The tests assert this route is never called.
    if (method === "POST" && path === "/pots") {
      const pot_id = newId();
      const viewing_key = "uviewtest1standin" + pot_id.repeat(4);
      pots.set(pot_id, { viewing_key, address: "utest1standinpot" + pot_id, claimed: false });
      return json(200, { pot_id, viewing_key, address: pots.get(pot_id).address, birthday_height: 4421800, seed_phrase: Array(24).fill("fallback").join(" ") });
    }

    const claim = path.match(/^\/pots\/([0-9a-f]+)\/claim$/);
    if (method === "POST" && claim) {
      const pot = pots.get(claim[1]);
      if (!pot) return text(400, "unknown pot");
      if (pot.claimed) return text(400, "this pot has already been claimed");
      pot.claimed = true;
      return json(200, { txid: "ab".repeat(32) });
    }

    const status = path.match(/^\/pots\/([0-9a-f]+)$/);
    if (method === "GET" && status) {
      const pot = pots.get(status[1]);
      if (!pot) return text(404, "unknown pot");
      const balance = pot.claimed ? 0 : 3_000_000; // every pot counts as funded
      return json(200, {
        pot_id: status[1],
        viewing_key: pot.viewing_key,
        address: pot.address,
        balance_total_zatoshis: balance,
        balance_spendable_zatoshis: balance,
        scanned_height: 4424312,
        birthday_height: 4421800,
        claimed: pot.claimed,
      });
    }

    text(404, "not found");
  })
  .listen(PORT, "127.0.0.1", () => console.log(`stand-in signer on 127.0.0.1:${PORT}`));
