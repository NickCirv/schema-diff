# Command reference

Use `node index.js` from the pinned source checkout described in the [README](../README.md). The entries below describe the inspected implementation.

| Command or argument | Behavior |
| --- | --- |
| `OLD NEW` | Compare two local schema JSON files. |
| `-b, --breaking` | Show only changes classified as breaking. |
| `-f, --format FORMAT` | Select table, json or patch output. |
| `-i, --ignore PATH` | Exclude a property path; repeat for multiple paths. |
| `--ai` | Request an Anthropic summary; requires ANTHROPIC_API_KEY and sends schema-change context. |

For prerequisites, file writes, external services and known limitations, see [Behavior and limits](../README.md#behavior-and-limits).

Implementation: [index.js](https://github.com/NickCirv/schema-diff/blob/569c4f4126be07018db10c7c7e1a4791a53850c2/index.js); [review evidence](RESEARCH.md).
