# Verify it yourself

Two things on every hunt page can be checked without trusting this site.

## The prize

Each hunt publishes its pot's **viewing key** (`uviewtest1…`) and **birthday height** (the block
the pot was created at). A viewing key can see the pot's balance but can't spend from it.

With [zcash-devtool](https://github.com/zcash/zcash-devtool) (build it with
`cargo build --release`):

```
zcash-devtool wallet -w ./pot-check init-fvk \
  --name pot --fvk <viewing key> --birthday <birthday height> \
  -s testnet.zec.rocks:443
zcash-devtool wallet -w ./pot-check sync -s testnet.zec.rocks:443
zcash-devtool wallet -w ./pot-check balance
```

The hunt page shows these commands with the values filled in. The balance should match the
prize the site shows. Any wallet that can import a unified viewing key works too.

After a claim, the same wallet shows the pot emptied, but it **can't** see where the funds
went: the sweep is built without an outgoing viewing key.

## The hunt file

Everything a solver's browser needs is in one public file: the first clue and the locked
stages. Download it from the hunt page and keep it.

```
# macOS / Linux
shasum -a 256 shielded-quest-<id>.json
# Windows PowerShell
Get-FileHash shielded-quest-<id>.json -Algorithm SHA256
```

If the result ever differs from the fingerprint on the hunt page, the hunt was changed after
you saved it. The site stores hunts write-once, so this should never happen.

## The code

All of it is open source: the signer, the browser cryptography (with tests), and this site.
The privacy claims are listed, with their limits, on the [Privacy](/docs/privacy) page.
