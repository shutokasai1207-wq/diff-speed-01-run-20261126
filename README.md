# diff-speed-01-run-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/shutokasai1207-wq/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/shutokasai1207-wq/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for make.fun's own makefun-diff 1.0.0: it answers exactly as the baseline does on every case, with less CPU time. Myers's greedy search over lines interned to small integers, with typed arrays throughout, common prefix/suffix trimming, and a snapshot backtrack that rebuilds the exact path the search took.

## Run it

```sh
node main.ts
```

`main.ts` reads `/input/cases.json`, answers every case with `run` from `solve.js`, and writes `/output/answers.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tbtbaqb8&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
