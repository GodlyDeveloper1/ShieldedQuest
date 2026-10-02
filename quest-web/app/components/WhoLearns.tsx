// "Who learns what": the honest version of the privacy pitch, on the landing page.
// One row per party that could learn something, with what they do and don't get.
// Keep this in step with PRIVACY.md.
const ROWS: { who: string; learns: string[]; never: string[] }[] = [
  {
    who: "Anyone reading the blockchain",
    learns: ["That a pot exists and what it holds, through its public viewing key", "Deposits into it and any memo on them", "That it was emptied"],
    never: ["Who won", "Where the prize went or how it was split", "Who funded it, if it was funded from a shielded balance"],
  },
  {
    who: "This site",
    learns: [
      "Your internet address while you browse, and which hunt pages you open (used for rate limits in memory, never logged)",
      "The pot\u2019s viewing key, when the creator\u2019s browser registers the pot",
      "On a one-click claim: the unlocked seed phrase and the address you paste",
    ],
    never: ["The prize key while a hunt is unsolved: it is made in the creator\u2019s browser", "Your guesses or answers", "How far you\u2019ve got", "A private hunt\u2019s title, first clue or invite key", "Your payout address, if you sweep the pot yourself"],
  },
  {
    who: "A block explorer, only if you click its link",
    learns: ["Your internet address, and which transaction you looked at"],
    never: ["Anything from us: the site never contacts it"],
  },
  {
    who: "An app you share a link through",
    learns: ["The link itself, including a private hunt\u2019s invite key"],
    never: ["Your progress or answers: they aren\u2019t in the link"],
  },
];

export default function WhoLearns() {
  return (
    <div className="who" data-reveal>
      <div className="who-head">
        <h3>Who learns what</h3>
        <p className="muted small">No fine print: every party that could learn something, and what they get.</p>
      </div>
      <div className="who-table" role="table" aria-label="Who learns what">
        <div className="who-row who-cols" role="row">
          <span role="columnheader">Who</span>
          <span role="columnheader">Can learn</span>
          <span role="columnheader">Never learns</span>
        </div>
        {ROWS.map((r) => (
          <div key={r.who} className="who-row" role="row">
            <strong role="cell">{r.who}</strong>
            <ul role="cell" className="who-yes">
              {r.learns.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <ul role="cell" className="who-no">
              {r.never.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
