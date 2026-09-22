![schema-diff — Nicholas Ashkar editorial artwork](assets/nicholas-ashkar/banner.png)

# schema-diff

Compare two JSON Schema or SQL schema files and flag changes classified as breaking.

Flattens supported JSON Schema properties or parses supported SQL table declarations, then renders a table, JSON or patch-style report.


<a id="install"></a>

## Quickstart

Package runtime requirement: Node.js `>=20`. Git is needed to obtain this pinned source checkout.

```bash
git clone https://github.com/NickCirv/schema-diff.git
cd schema-diff
git checkout 569c4f4126be07018db10c7c7e1a4791a53850c2
node index.js --help
```

This source-derived example has not been executed in this review. Help lists formats. Supply two local schema files for a comparison.



<a id="what-counts-as-breaking"></a>

<a id="ref-resolution"></a>

## Usage

```bash
node index.js before.json after.json --format json
node index.js before.sql after.sql --breaking
node index.js before.json after.json --ignore properties.internal
```

Exit 1 means a breaking change was detected; invalid input or processing errors use exit 2. `--breaking` filters presentation, while the breaking-change exit policy applies generally.

[Command reference](docs/REFERENCE.md) covers arguments, modes and output controls.


<a id="what-it-is-not"></a>

## Behavior and limits

Both parsers implement subsets and the breaking-change classification is a policy heuristic, not proof about every consumer. Local references are handled within limits; complex SQL dialects need independent review. `--ai` sends report context to Anthropic with `ANTHROPIC_API_KEY`. Patch-format output is a report, not an automatically applied migration.


<a id="ci-usage"></a>

## Development

Declared package scripts:

| Script | Command |
| --- | --- |
| `test` | `node --test` |

The smoke test syntax-checks the entrypoint; it does not exercise CLI behavior or integrations.

## Research

[Source review and claim ledger](docs/RESEARCH.md) records revision `569c4f4126be`, inspected files and verification gaps.

## License and attribution

Protected license and attribution files remain unchanged: [LICENSE](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/LICENSE).

[Artwork credits](assets/nicholas-ashkar/CREDITS.md) · [Nicholas Ashkar — consulting](https://nicholashkar.com/#oxblood-contact)
