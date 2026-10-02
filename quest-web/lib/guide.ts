// Quest Guide: a scripted helper that runs entirely in the browser.
//
// It is not an AI and doesn't know any answers (nobody does: they're locked in
// the hunt's encryption). It has prepared answers to common questions, matched
// by keywords, a few classic puzzle tools (Caesar shifts, Base64, reversing,
// first letters, counting) and a clue reader that points out patterns in the
// clue on screen. Nothing typed into it is sent anywhere.

import { normalizeAnswer } from "quest-crypto";

// ---------------------------------------------------------------------------
// Page context (set by the hunt page while it's open)
// ---------------------------------------------------------------------------

export interface GuideContext {
  page: "hunt" | "create" | "other";
  title?: string;
  stage?: number; // the stage being solved, 1-based
  stageCount?: number;
  clue?: string; // the clue currently being solved
  clueHasMedia?: boolean;
  solved?: boolean;
  demo?: boolean;
  claimed?: boolean;
}

let ctx: GuideContext = { page: "other" };
const ctxListeners = new Set<() => void>();

export function setGuideContext(c: GuideContext | null) {
  ctx = c ?? { page: "other" };
  ctxListeners.forEach((l) => l());
}
export function getGuideContext() {
  return ctx;
}
export function subscribeGuideContext(l: () => void) {
  ctxListeners.add(l);
  return () => {
    ctxListeners.delete(l);
  };
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

export interface Reply {
  text: string;
  /** Monospace block shown under the text (tool output). */
  block?: string;
  /** Suggested next questions (intent ids). */
  next?: string[];
  /** Buttons that do something on the page. */
  actions?: { label: string; event: string }[];
  /** The next free-text message is input for this tool. */
  awaiting?: ToolId;
}

type ToolId = "caesar" | "base64" | "reverse" | "acrostic" | "count";

interface Intent {
  id: string;
  q: string; // shown as a suggested question
  keys: string[]; // keyword phrases (normalized); multi-word phrases score higher
  where?: GuideContext["page"][]; // pages where it's suggested first
  reply: (c: GuideContext) => Reply;
}

const XRAY = { label: "Open the Privacy X-ray", event: "sq-open-xray" };

const INTENTS: Intent[] = [
  {
    id: "analyse",
    q: "Look at this clue with me",
    keys: ["this clue", "analyse", "analyze", "look at", "read the clue", "help with clue", "help me with this", "riddle", "clue mean", "what does it mean", "understand"],
    where: ["hunt"],
    reply: (c) => analyseClue(c),
  },
  {
    id: "hint",
    q: "Can you tell me the answer?",
    keys: ["answer", "tell me", "solution", "cheat", "hint", "give me", "what is the answer", "reveal"],
    where: ["hunt"],
    reply: () => ({
      text:
        "I can't. The answers aren't stored anywhere, not here and not on the server: each one is the key that decrypts the next clue, so the only way in is to find it.\n\nWhat I can do is read the clue with you, point out patterns, and run the classic puzzle tools.",
      next: ["analyse", "stuck", "tools"],
    }),
  },
  {
    id: "stuck",
    q: "I'm stuck. Any tips?",
    keys: ["stuck", "tips", "tip", "hard", "difficult", "no idea", "help", "approach", "strategy", "how to think"],
    where: ["hunt"],
    reply: () => ({
      text:
        "Some things that crack most riddles:\n• Read it literally first. Many clues mean exactly what they say.\n• Count. \"Two-word name\", a number of blanks or a date often tells you the shape of the answer.\n• Look for wordplay: double meanings, hidden words, first letters of each line.\n• Odd capital letters, numbers or strange spellings are rarely accidents.\n• Open every link and look closely at images. Creators hide things in them.\n• Try close variants: singular or plural, with or without \"the\".",
      next: ["analyse", "spelling", "tools"],
    }),
  },
  {
    id: "spelling",
    q: "Do spelling and capitals matter?",
    keys: ["spelling", "capital", "capitals", "uppercase", "lowercase", "case", "accent", "punctuation", "spaces", "typo", "exact"],
    where: ["hunt"],
    reply: () => ({
      text:
        "Capitals, accents, punctuation and extra spaces don't matter: \"Café, Paris!\" and \"cafe paris\" are the same answer. Spelling does matter, and so does word order.",
      next: ["stuck", "private"],
    }),
  },
  {
    id: "private",
    q: "Are my guesses sent anywhere?",
    keys: ["sent", "send", "private", "privacy", "server", "track", "tracking", "see my guesses", "logged", "who sees", "safe"],
    reply: () => ({
      text:
        "No. Your browser checks each guess itself: it stretches the guess with Argon2id and tries to decrypt the next stage. If that fails, nothing happens and nothing is sent. The site never learns what you tried or how far you got.\n\nYou can watch this live in the Privacy X-ray: \"guesses sent\" stays at 0.",
      actions: [XRAY],
      next: ["slow", "winner"],
    }),
  },
  {
    id: "slow",
    q: "Why does checking take a moment?",
    keys: ["slow", "takes long", "second", "loading", "why wait", "spinner", "argon", "argon2"],
    reply: () => ({
      text:
        "That pause is on purpose. Each guess goes through Argon2id with 64 MiB of memory, which takes your device about half a second. For you that's nothing, but anyone trying millions of guesses with a bot pays the same cost for every one.",
      next: ["private"],
    }),
  },
  {
    id: "claim",
    q: "How do I claim the prize?",
    keys: ["claim", "prize", "get paid", "payout", "withdraw", "receive", "money", "collect"],
    where: ["hunt"],
    reply: (c) => ({
      text:
        (c.demo
          ? "Solve the last stage and the claim form appears. On the practice hunt you can send the prize back to the practice pool, so you don't need a wallet.\n\n"
          : "Solve the last stage and the claim form appears. Paste a shielded testnet address from your wallet and click Claim; the whole pot is sent in one shielded transaction.\n\n") +
        "If you'd rather not involve this site at all, use \"Sweep it yourself\": restore the unlocked seed phrase in any Zcash testnet wallet.",
      next: ["wallet", "race"],
    }),
  },
  {
    id: "wallet",
    q: "I don't have a Zcash wallet",
    keys: ["wallet", "address", "no wallet", "dont have", "zashi", "utest", "unified address"],
    reply: (c) => ({
      text: c.demo
        ? "No problem on the practice hunt: after you solve it, choose \"Send it back to the practice pool\". It's the same real shielded transaction.\n\nFor real hunts you need a Zcash wallet that supports testnet and shielded (unified) addresses, starting with utest1."
        : "You need a Zcash wallet that supports testnet and gives you a shielded (unified) address, starting with utest1. Testnet coins are free from a faucet, so you can practise safely.\n\nOr play the one-minute hunt first: it doesn't need a wallet.",
      next: ["testnet", "claim"],
    }),
  },
  {
    id: "race",
    q: "What if someone solves it first?",
    keys: ["someone else", "first", "race", "before me", "too late", "already claimed", "beat me"],
    reply: () => ({
      text:
        "Whoever claims first wins: the pot can only be emptied once. Solving doesn't reserve the prize, so claim as soon as you've solved it. If the prize is already gone, the hunt page shows \"Claimed\" and your answers are still right.",
      next: ["claim"],
    }),
  },
  {
    id: "winner",
    q: "Can anyone see who won?",
    keys: ["who won", "winner", "anonymous", "see who", "identity", "trace"],
    reply: () => ({
      text:
        "Not from the blockchain. The prize leaves the pot in a shielded transaction built so that even the pot's public viewing key can't see where it went. Anyone can check that the pot was emptied, but not who received it.\n\nOne thing to know: with the one-click claim, this site sees the address you paste so it can send the prize (it isn't kept). Sweep the pot yourself with the unlocked seed phrase and the site never learns it.",
      next: ["verify", "private"],
    }),
  },
  {
    id: "verify",
    q: "How do I know the prize is real?",
    keys: ["real", "verify", "proof", "trust", "scam", "fake", "balance", "viewing key", "check prize"],
    reply: () => ({
      text:
        "Every pot publishes a viewing key. Import it into any Zcash tool that accepts one and you'll see the balance yourself, without trusting this site. The hunt page has ready-to-run commands under \"Verify it yourself\", and the hunt file's fingerprint proves it wasn't changed after publishing.",
      next: ["winner"],
    }),
  },
  {
    id: "testnet",
    q: "Is this real money?",
    keys: ["real money", "testnet", "taz", "worth", "value", "mainnet", "zec"],
    reply: () => ({
      text:
        "Not yet. Shielded Quest runs on the Zcash testnet, where coins (TAZ) are free from a faucet and have no value. The transactions are real Zcash transactions though, with the same privacy.",
      next: ["wallet"],
    }),
  },
  {
    id: "tools",
    q: "What puzzle tools do you have?",
    keys: ["tools", "tool", "decode", "decoder", "cipher", "what can you do"],
    reply: () => ({
      text: "These run right here in your browser. Pick one, then paste the text:",
      next: ["t-caesar", "t-base64", "t-reverse", "t-acrostic", "t-count"],
    }),
  },
  {
    id: "t-caesar",
    q: "Try all Caesar shifts (ROT13)",
    keys: ["caesar", "rot13", "rot", "shift", "shifted letters"],
    reply: () => ({ text: "Paste the scrambled text and I'll try all 25 shifts. Likely English shows first.", awaiting: "caesar" }),
  },
  {
    id: "t-base64",
    q: "Decode Base64 or hex",
    keys: ["base64", "base 64", "hex", "hexadecimal", "encoded"],
    reply: () => ({ text: "Paste the Base64 or hex text.", awaiting: "base64" }),
  },
  {
    id: "t-reverse",
    q: "Reverse some text",
    keys: ["reverse", "backwards", "mirror"],
    reply: () => ({ text: "Paste the text to reverse.", awaiting: "reverse" }),
  },
  {
    id: "t-acrostic",
    q: "Read the first letters",
    keys: ["acrostic", "first letters", "first letter", "initials", "hidden word"],
    reply: () => ({ text: "Paste the lines or sentence; I'll read the first letter of each line and each word.", awaiting: "acrostic" }),
  },
  {
    id: "t-count",
    q: "Count letters and words",
    keys: ["count", "how many letters", "length", "letters", "number of words"],
    reply: () => ({ text: "Paste the text to count.", awaiting: "count" }),
  },
  {
    id: "create",
    q: "How do I make my own hunt?",
    keys: ["create", "make a hunt", "my own", "host", "build", "new hunt", "start a hunt"],
    reply: () => ({
      text:
        "Open \"Create a hunt\", pick a template or start blank, and write a clue and an answer for each stage. The site makes a prize pot, you save the backup, and your browser locks the hunt before anything is uploaded. Then send testnet ZEC to the pot address and share the link.",
      next: ["good-riddle", "media", "reclaim"],
    }),
  },
  {
    id: "good-riddle",
    q: "How do I write a good riddle?",
    keys: ["good riddle", "write", "writing", "strong answer", "weak", "guessable", "crack", "meter"],
    where: ["create"],
    reply: () => ({
      text:
        "• The final answer protects the prize, so make it something you can't guess without solving: a phrase, or a word plus a code from the clue.\n• Earlier stages can be easy; they're the fun part.\n• Say the shape of the answer (\"two words\", \"a year\") so solvers know when they're close.\n• Never put the answer in the clue text. The page checks this.\n• Watch the crack-time meter: it shows how long a fast computer needs to guess each answer.",
      next: ["media", "create"],
    }),
  },
  {
    id: "media",
    q: "Can clues have images or video?",
    keys: ["image", "images", "video", "audio", "photo", "picture", "media", "upload", "link"],
    reply: () => ({
      text:
        "Yes, up to 3 per clue: images up to 5 MB, video or audio up to 25 MB. They're encrypted in your browser before upload, so the server only stores ciphertext. A file attached to a later clue stays locked until the stage before it is solved. You can also paste links into clues.",
      next: ["create"],
    }),
  },
  {
    id: "private-hunt",
    q: "What is a private hunt?",
    keys: ["private hunt", "invite", "invite only", "invite link", "unlisted", "hidden hunt", "secret hunt"],
    where: ["create"],
    reply: () => ({
      text:
        "A hunt only people with the invite link can open. It isn't listed anywhere, and its title and first clue are encrypted with a key that lives in the link after the # sign. Browsers never send that part to a server, so even this site can't read the hunt. Tick \"Private hunt\" when you create one, and keep the link safe: it can't be recovered.",
      next: ["create", "private"],
    }),
  },
  {
    id: "reclaim",
    q: "Can I get my prize back if nobody wins?",
    keys: ["get back", "reclaim", "refund", "nobody", "unsolved", "take back"],
    reply: () => ({
      text:
        "Yes. On your hunt's page, open \"Made this hunt? Take the prize back\" and load the backup file you saved when creating it. That backup holds the pot's seed phrase, and the site never kept a copy, so keep it safe.",
      next: ["create"],
    }),
  },
  {
    id: "fund",
    q: "How do I add to a prize?",
    keys: ["add", "top up", "fund", "donate", "contribute", "bigger"],
    reply: () => ({
      text:
        "Anyone can grow a prize: scan the QR code under \"Add to the prize\" or copy the pot address, and send from a shielded balance. Leave the memo empty, because the pot's viewing key is public and can read memos.",
      next: ["verify"],
    }),
  },
  {
    id: "xray",
    q: "What is the Privacy X-ray?",
    keys: ["x ray", "xray", "network", "requests"],
    reply: () => ({
      text:
        "The eye button in the corner. It lists every request this page makes, what was in it in plain words, and what happened in your browser instead. It's a convenience: your browser's own network tools show the same thing.",
      actions: [XRAY],
    }),
  },
  {
    id: "what",
    q: "What is Shielded Quest?",
    keys: ["what is this", "shielded quest", "about", "how does it work", "explain", "what is"],
    where: ["other"],
    reply: () => ({
      text:
        "A treasure hunt where the treasure is shielded Zcash. Each answer unlocks the next clue in your browser, and the last one unlocks the prize. Your guesses never leave your device, anyone can verify the prize, and nobody can see who won.",
      next: ["demo", "create", "private"],
    }),
  },
  {
    id: "demo",
    q: "Where do I start?",
    keys: ["start", "demo", "try", "first time", "begin", "new here"],
    where: ["other"],
    reply: () => ({
      text:
        "Play the one-minute hunt: a short hunt with the answers in the hints, so you see the whole flow, including a real prize payout, in about a minute. Then explore the live hunts.",
      next: ["what", "wallet"],
    }),
  },
  {
    id: "bot",
    q: "Are you an AI?",
    keys: ["ai", "bot", "robot", "human", "chatgpt", "llm", "are you", "who are you"],
    reply: () => ({
      text:
        "No. I'm a scripted guide with prepared answers and a few puzzle tools, running in your browser. That way nothing you type here is sent anywhere, including your guesses and ideas.",
      next: ["tools", "private"],
    }),
  },
];

const BY_ID = new Map(INTENTS.map((i) => [i.id, i]));

export function suggestions(c: GuideContext, n = 4): { id: string; q: string }[] {
  const order: string[] =
    c.page === "hunt"
      ? c.solved
        ? ["claim", "race", "winner", "wallet"]
        : ["analyse", "stuck", "spelling", "tools", "private", "hint"]
      : c.page === "create"
        ? ["good-riddle", "private-hunt", "media", "reclaim"]
        : ["what", "demo", "private", "create"];
  return order.slice(0, n).map((id) => ({ id, q: BY_ID.get(id)!.q }));
}

export function questionText(id: string) {
  return BY_ID.get(id)?.q ?? id;
}

export function replyFor(id: string, c: GuideContext): Reply {
  const it = BY_ID.get(id);
  return it ? it.reply(c) : fallback(c);
}

export function greeting(c: GuideContext): Reply {
  if (c.page === "hunt" && !c.solved && c.stage)
    return {
      text: `Hi! I'm the Quest Guide. You're on clue ${c.stage} of ${c.stageCount}. I can't see the answers (they aren't stored anywhere), but I can read the clue with you and run puzzle tools. Everything here stays in your browser.`,
    };
  if (c.page === "create") return { text: "Hi! I'm the Quest Guide. Ask me anything about making a hunt." };
  return { text: "Hi! I'm the Quest Guide. Ask me about Shielded Quest, or pick a question below." };
}

function fallback(c: GuideContext): Reply {
  return {
    text: "I don't have an answer for that one. I'm a scripted guide, so I know a set list of topics. Try one of these:",
    next: suggestions(c, 4).map((s) => s.id),
  };
}

/** Common words that only count a little on their own. */
const WEAK = new Set(["answer", "help", "prize", "first", "start", "add", "real", "send", "sent", "case", "link", "write", "address", "what is", "about", "explain", "decode", "tool"]);

/** Match a free-text message to the best intent. */
export function match(message: string, c: GuideContext): Reply {
  const text = ` ${normalizeAnswer(message)} `;
  if (!text.trim()) return fallback(c);
  let best: Intent | null = null;
  let bestScore = 0;
  for (const it of INTENTS) {
    let score = 0;
    for (const k of it.keys) {
      if (text.includes(` ${k} `)) score += k.includes(" ") ? 3 : WEAK.has(k) ? 1 : 2;
      else if (!k.includes(" ") && k.length >= 5 && text.includes(k)) score += 1;
    }
    if (score && it.where?.includes(c.page)) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best && bestScore >= 2 ? best.reply(c) : fallback(c);
}

// ---------------------------------------------------------------------------
// Clue reader
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

function analyseClue(c: GuideContext): Reply {
  if (c.page !== "hunt" || !c.clue) return { text: "Open a hunt and I'll read its current clue with you.", next: ["stuck", "tools"] };
  if (c.solved) return { text: "You've solved every clue already. Next step: claim the prize.", next: ["claim"] };
  const clue = c.clue;
  const notes: string[] = [];

  const shape = clue.match(/\b(one|two|three|four|five|six|seven|eight|\d+)[- ](word|letter|digit)s?\b/i);
  if (shape) {
    const n = NUMBER_WORDS[shape[1].toLowerCase()] ?? Number(shape[1]);
    notes.push(`It tells you the shape: the answer is probably ${n} ${shape[2].toLowerCase()}${n === 1 ? "" : "s"}.`);
  }
  if (/https?:\/\//.test(clue)) notes.push("There's a link. The answer, or the next step, may be on that page.");
  if (c.clueHasMedia) notes.push("This clue has an image, video or audio. Look closely: details, text in the picture, sounds.");
  const quoted = clue.match(/["“']([^"”']{2,40})["”']/g);
  if (quoted) notes.push(`Quoted words often matter: ${quoted.slice(0, 3).join(", ")}.`);
  const caps = clue.match(/\b[A-Z]{3,}\b/g)?.filter((w) => !["ZEC", "TAZ", "URL"].includes(w));
  if (caps?.length) notes.push(`Some words are in capitals (${caps.slice(0, 4).join(", ")}). That can be emphasis or a cipher.`);
  if (/\b[A-Za-z0-9+/]{16,}={0,2}(?=\s|$)/.test(clue)) notes.push("A long run of letters and digits could be Base64. Try the decoder.");
  const nums = clue.match(/\b\d+\b/g);
  if (nums && nums.length >= 2) notes.push(`Numbers (${nums.slice(0, 5).join(", ")}) can be positions in the alphabet, dates, coordinates or page numbers.`);
  const lines = clue.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3) notes.push(`First letters of each line spell "${lines.map((l) => l[0]).join("")}". Sometimes that's the hidden word.`);
  if (/\?\s*$/.test(clue.trim())) notes.push("It ends with a question, so the answer is usually a short name or term, not a sentence.");
  if (/\b(not|isn't|never|without)\b/i.test(clue)) notes.push("Watch the negatives (not, never, without). They often rule out the obvious answer.");
  if (/\b(hidden|inside|within|between|among)\b/i.test(clue)) notes.push("Words like hidden, inside or between can mean the answer is literally hidden inside the clue's words.");

  if (!notes.length) notes.push("Nothing jumps out as a pattern, so it's probably a straight riddle. Read it slowly, list everything it could describe, and test the shortest candidates first.");

  return {
    text: `Here's what I notice in clue ${c.stage}:\n${notes.map((n) => `• ${n}`).join("\n")}\n\nI can't check guesses for you, but the answer box does it instantly and privately.`,
    next: ["stuck", "tools", "spelling"],
  };
}

// ---------------------------------------------------------------------------
// Puzzle tools
// ---------------------------------------------------------------------------

const COMMON = new Set(
  "the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were has had secret word answer key zcash coin shielded find next clue code".split(" "),
);

function shift(s: string, k: number) {
  return s.replace(/[a-z]/gi, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + k) % 26) + base);
  });
}

function englishScore(s: string) {
  const words = s.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.length ? words.filter((w) => COMMON.has(w)).length / words.length : 0;
}

export function runTool(tool: ToolId, input: string): Reply {
  const text = input.trim();
  if (!text) return { text: "That was empty. Paste some text and I'll run it." , awaiting: tool };
  switch (tool) {
    case "caesar": {
      const all = Array.from({ length: 25 }, (_, i) => ({ k: i + 1, out: shift(text, i + 1), score: englishScore(shift(text, i + 1)) }));
      const ranked = [...all].sort((a, b) => b.score - a.score);
      const top = ranked[0];
      const block = all.map((r) => `${String(r.k).padStart(2)}${r.k === 13 ? "*" : " "} ${r.out}`).join("\n");
      return {
        text:
          top.score > 0.25
            ? `Shift ${top.k} looks like English: "${top.out}". All 25 shifts are below (* is ROT13).`
            : "None of the shifts reads clearly as English, so it may not be a Caesar cipher. All 25 are below (* is ROT13).",
        block,
        next: ["t-base64", "t-reverse", "t-acrostic"],
      };
    }
    case "base64": {
      const out: string[] = [];
      const compact = text.replace(/\s+/g, "");
      if (/^[0-9a-f]+$/i.test(compact) && compact.length % 2 === 0) {
        const bytes = compact.match(/../g)!.map((h) => parseInt(h, 16));
        out.push(`As hex: ${new TextDecoder().decode(new Uint8Array(bytes))}`);
      }
      try {
        const b = atob(compact.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(b, (ch) => ch.charCodeAt(0));
        const s = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        out.push(`As Base64: ${s}`);
      } catch {
        // not valid base64 text
      }
      return out.length
        ? { text: "Decoded:", block: out.join("\n"), next: ["t-caesar", "t-reverse"] }
        : { text: "That doesn't decode as Base64 or hex text. It might be a different cipher; try the Caesar shifts.", next: ["t-caesar", "t-reverse"] };
    }
    case "reverse":
      return { text: "Reversed:", block: [...text].reverse().join(""), next: ["t-caesar", "t-acrostic"] };
    case "acrostic": {
      const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
      const rows = [];
      if (lines.length > 1) rows.push(`Lines:  ${lines.map((l) => l[0]).join("")}`, `Last letters of lines: ${lines.map((l) => l[l.length - 1]).join("")}`);
      rows.push(`Words:  ${words.map((w) => w[0]).join("")}`);
      return { text: "First letters:", block: rows.join("\n"), next: ["t-reverse", "t-count"] };
    }
    case "count": {
      const letters = (text.match(/\p{L}/gu) ?? []).length;
      const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
      return {
        text: "Counted:",
        block: `Words: ${words.length}\nLetters: ${letters}\nCharacters: ${[...text].length}\nWord lengths: ${words.map((w) => w.length).join(" ")}`,
        next: ["t-acrostic", "stuck"],
      };
    }
  }
}
