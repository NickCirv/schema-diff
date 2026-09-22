# Source review — schema-diff

## Revision and method

Inspected public commit: [`569c4f4126be07018db10c7c7e1a4791a53850c2`](https://github.com/NickCirv/schema-diff/commit/569c4f4126be07018db10c7c7e1a4791a53850c2). Source tree: `82eb537b9390eb29aa36e5569cf282918d310a15`. Capture scope: all eligible text files; 6 of 6 eligible files.

This review read captured implementation and documentation. It did not install dependencies, execute project commands, call project APIs, check package publication or establish live CI status. Examples are source-derived, not captured execution transcripts.

## Claim ledger

| Claim | Evidence | Status |
| --- | --- | --- |
| Parsers, classification, output and exit codes | [index.js](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/index.js) | Verified in inspected source; execution unverified |

## Findings and verification gaps

Both parsers implement subsets and the breaking-change classification is a policy heuristic, not proof about every consumer. Local references are handled within limits; complex SQL dialects need independent review. `--ai` sends report context to Anthropic with `ANTHROPIC_API_KEY`. Patch-format output is a report, not an automatically applied migration.

The captured smoke test only asks Node to syntax-check the entrypoint. It does not exercise behavior, integrations or failure paths. Neither that test nor installation was run in this review.

| Dimension | Result |
| --- | --- |
| Purpose and documented commands | Partially verified: static source inspection |
| Clean installation and examples | Unverified |
| Test suite and live CI | Unverified |
| Performance and security guarantees | Unverified |
| Publication | Local documentation only |

## Documentation inventory

- [README.md](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/README.md) — Rewritten; historic section anchors retained where practical.
- [LICENSE](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/LICENSE) — protected document preserved unchanged.

## Captured source inventory

- [LICENSE](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/LICENSE) — Git blob `481c289c06c96c07330f8c7dedd847c5c07ca384`.
- [README.md](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/README.md) — Git blob `f7a1adc82f5c935c37f64dd60fc8b72114a8770b`.
- [package.json](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/package.json) — Git blob `8c583cf22787245c0cdcd97872546da23eae27c2`.
- [.github/workflows/ci.yml](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/.github/workflows/ci.yml) — Git blob `44515034a394670de44454a7a1bd2c7ef0c9836e`.
- [index.js](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/index.js) — Git blob `5b63b6ab09ccfa9a92130d1ff5eaabca7bc591cd`.
- [test/smoke.test.js](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/test/smoke.test.js) — Git blob `ebbccaaf2583b4850575f835313e4b0afd21bff7`.

## Scope boundary

Capture excludes lockfiles, binary artwork, generated output, vendored dependencies and files above the acquisition size limit. The tree records their existence; no verification claim is made for omitted content. Protected documents and historical records are not replaced.

## Reference coverage

Added [command reference](REFERENCE.md) from the argument parser, command handlers and source-defined help at the pinned revision. README examples remain unexecuted.
