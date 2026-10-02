// Claim: "The prize key is made in your browser. The server only receives the
// pot's viewing key."
import { expect, test } from "@playwright/test";
import { describe } from "../lib/recorder";
import { createHunt, signerLog, storedFiles, storedHuntFile, visitor } from "../lib/site";

test("creating a hunt never sends the pot's seed phrase", async ({ browser }) => {
  const creator = await visitor(browser);
  const hunt = await createHunt(creator.page, {
    title: "Prize key test",
    firstClue: "What is engraved under the brass sundial?",
    stages: [{ answer: "tempus fugit 4471 heron" }],
  });
  await creator.page.goto(hunt.link, { waitUntil: "networkidle" }); // carry on to the hunt page, as a creator would

  // The page says which side made the pot; the fallback would be "server".
  expect(hunt.madeBy).toBe("browser");

  // Exactly one request registers the pot, and its body is the viewing key and
  // the seed's fingerprint. Nothing else.
  const potRequests = creator.rec.seen.filter((r) => r.path === "/api/pots");
  expect(potRequests).toHaveLength(1);
  const body = JSON.parse(potRequests[0].body!.toString("utf8"));
  expect(Object.keys(body).sort()).toEqual(["seed_fingerprint", "viewing_key"]);
  expect(body.viewing_key).toMatch(/^uviewtest1[0-9a-z]{50,1000}$/);
  expect(body.seed_fingerprint).toMatch(/^[0-9a-f]{64}$/);

  // No request from the creator's browser carries the 24 words.
  expect(describe(creator.rec.carryingPhrase(hunt.seedPhrase)), "a request carried the seed phrase").toEqual([]);

  // The signer was asked to register a viewing key. It was never asked to make
  // a pot itself, and nothing it received contains the phrase.
  const log = await signerLog();
  const imports = log.filter((e) => e.path === "/pots/import" && e.body.includes(body.viewing_key));
  expect(imports).toHaveLength(1);
  expect(Object.keys(JSON.parse(imports[0].body)).sort()).toEqual(["seed_fingerprint", "viewing_key"]);
  expect(log.filter((e) => e.method === "POST" && e.path === "/pots")).toEqual([]);
  const firstWords = hunt.seedPhrase.split(" ").slice(0, 4).join(" ");
  expect(JSON.stringify(log)).not.toContain(firstWords);

  // Nothing the web app stored contains the phrase, and the stored hunt names
  // the same viewing key the browser made.
  for (const [name, bytes] of storedFiles()) {
    expect(bytes.toString("latin1"), `${name} contains the seed phrase`).not.toContain(firstWords);
  }
  expect(JSON.parse(storedHuntFile(hunt.id)).hunt.pot.viewing_key).toBe(body.viewing_key);

  expect(creator.errors).toEqual([]);
  await creator.context.close();
});

test("two pots never share a key", async ({ browser }) => {
  const a = await visitor(browser);
  const b = await visitor(browser);
  const spec = { title: "Fresh key test", firstClue: "Name the ferry at the north pier.", stages: [{ answer: "juniper ferry 6620 north" }] };
  const first = await createHunt(a.page, spec);
  const second = await createHunt(b.page, spec);
  expect(first.seedPhrase).not.toBe(second.seedPhrase);
  expect(JSON.parse(storedHuntFile(first.id)).hunt.pot.viewing_key).not.toBe(JSON.parse(storedHuntFile(second.id)).hunt.pot.viewing_key);
  await a.context.close();
  await b.context.close();
});

// The module the browser runs is WebAssembly; the signer runs native code. Both
// must derive the same viewing key from the same words, or a claim would fail.
// The expected values come from the native build: `cargo run --example show`
// in pot-keys, for the standard BIP 39 test phrase (never funded).
const TEST_PHRASE = Array(23).fill("abandon").join(" ") + " art";
const NATIVE_VIEWING_KEY =
  "uviewtest1qer8663z3lrss4qmrcvn6cx6l34z082epgafkehcwm8sqa6vf9unyttjsh6teun97jtttm3umyrvvlar5vym6xtw35qms73g6trtkwecw28ye28z5avf0t20d2uflgf4j0t7mdzh39wws8vcwr8zxt4p92t70ffymup7hyx8syqzaxvslj924p6z8m4j9ayvp059afhjm4ltj54y3zpphtwddxptecvytt2dyqwy668lrukduasu7c2vh8w6du8rtu54tq73qdncc4npaqc4xpg444z34ze5grray2yanhker4vaydl95defnr06ux6tn6pq33uvgpj4jxuva5d8k5hmkylwv0zwpjcdc33r9lh4yru052dy8jl3g7ha7vje5j9kp0gajsrhu";
const NATIVE_SEED_FINGERPRINT = "e62855dc1419972e2d8fd349b740de6a67d8cf6feaafe90cf2f37a2344566ccc";

test("the browser's key module derives the same key as the native build", async ({ browser }) => {
  const v = await visitor(browser);
  const made = await createHunt(v.page, { title: "Derivation test", firstClue: "Name the mill by the weir.", stages: [{ answer: "foxglove mill 5180 weir" }] });
  expect(made.madeBy).toBe("browser"); // so the module is loaded on this page

  const derive = (phrase: string) =>
    v.page.evaluate((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keys = (window as any).__potKeys.pot_from_phrase(p);
      const out = { viewingKey: keys.viewing_key as string, fingerprint: keys.seed_fingerprint as string };
      keys.free();
      return out;
    }, phrase);

  expect(await derive(TEST_PHRASE)).toEqual({ viewingKey: NATIVE_VIEWING_KEY, fingerprint: NATIVE_SEED_FINGERPRINT });

  // And the words shown to this creator derive the viewing key the hunt was published with.
  const fromShown = await derive(made.seedPhrase);
  expect(fromShown.viewingKey).toBe(JSON.parse(storedHuntFile(made.id)).hunt.pot.viewing_key);
  await v.context.close();
});
