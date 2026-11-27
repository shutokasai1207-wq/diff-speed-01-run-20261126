// solve.js - a faster drop-in for makefun-diff 1.0.0.
//
// The answer for one case is makefun-diff's patch of { old, new }:
// a header line, then hunks of kept / deleted / inserted lines.
// The edit script is Myers's greedy search with one difference from
// jsdiff: when a deletion and an insertion reach the same point, the
// deletion wins. This file implements that search from scratch,
// over lines interned to small integers, with typed arrays throughout,
// so the hot loop compares ints instead of strings and allocates
// nothing per diagonal step.
//
// Only the interface is shared with the baseline: run(input) takes
// { old, new } (both strings) and returns the patch as one string.

// Split a text into lines. A line keeps its trailing "\n" when it has
// one; the last line of a text without a trailing newline has none.
// An empty text has no lines at all.
function splitLines(text) {
  const lines = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf("\n", start);
    if (nl < 0) {
      if (start < text.length) lines.push(text.slice(start));
      break;
    }
    lines.push(text.slice(start, nl + 1));
    start = nl + 1;
  }
  return lines;
}

// Map every distinct line string to a small integer id, and turn both
// texts into Int32Arrays of ids. Equal lines (same code units, same
// newline presence) share one id, so the search compares ints.
function internLines(oldLines, newLines) {
  const ids = new Map();
  let next = 0;
  const a = new Int32Array(oldLines.length);
  for (let i = 0; i < oldLines.length; i++) {
    const s = oldLines[i];
    let id = ids.get(s);
    if (id === undefined) {
      id = next++;
      ids.set(s, id);
    }
    a[i] = id;
  }
  const b = new Int32Array(newLines.length);
  for (let i = 0; i < newLines.length; i++) {
    const s = newLines[i];
    let id = ids.get(s);
    if (id === undefined) {
      id = next++;
      ids.set(s, id);
    }
    b[i] = id;
  }
  return [a, b];
}

// Myers's greedy forward search on the middle slices a[a0 .. a0+N),
// b[b0 .. b0+M). Returns { d, snaps } where d is the shortest edit
// distance and snaps[t] is the V row after t edits: snaps[t][k + t]
// is the furthest x reached on diagonal k with t edits. This is the
// standard greedy rule with no extra guards: a value may step past
// an end on a diagonal the shortest path never reads back, and the
// first path to reach both ends still wins. Ties go to the deletion,
// which is the rule that separates this script from jsdiff's.
function myersForward(a, b, a0, N, b0, M) {
  const max = N + M;
  const off = max;
  const delta = N - M;
  // One row, updated in place. Entry k is last written at depth d-1
  // when read at depth d (k and d share parity), so the in-place row
  // always holds the previous depth's values where it matters.
  const V = new Int32Array(2 * max + 1);
  const snaps = new Array(max + 1);
  let D = -1;
  for (let d = 0; d <= max; d++) {
    // The two edge diagonals take only one kind of step, so they are
    // handled outside the interior loop; the interior then has no
    // per-visit edge test and no per-visit termination test (only
    // diagonal delta can reach both ends, and it is checked once per
    // depth, after the loop).
    let p = off - d;
    {
      const vk2 = V[p + 1];
      let x = vk2;
      let y = x + d; // y = x - k, k = -d
      while (x < N && y < M && a[a0 + x] === b[b0 + y]) {
        x++;
        y++;
      }
      V[p] = x;
    }
    for (let k = -d + 2; k <= d - 2; k += 2) {
      p += 2;
      const vk1 = V[p - 1];
      const vk2 = V[p + 1];
      // Insertion only when it strictly beats the deletion; the tie
      // goes to the deletion, which separates this from jsdiff.
      const x0 = vk1 + 1 < vk2 ? vk2 : vk1 + 1;
      let x = x0;
      let y = x - k;
      while (x < N && y < M && a[a0 + x] === b[b0 + y]) {
        x++;
        y++;
      }
      V[p] = x;
    }
    if (d > 0) {
      p += 2;
      const vk1 = V[p - 1];
      let x = vk1 + 1;
      let y = x - d; // y = x - k, k = d
      while (x < N && y < M && a[a0 + x] === b[b0 + y]) {
        x++;
        y++;
      }
      V[p] = x;
    }
    // Snapshot this depth's row for the backtrack. The whole window
    // is copied in bulk; only the entries with k = d mod 2 are ever
    // read back, the rest are ignored.
    const row = new Int32Array(2 * d + 1);
    row.set(V.subarray(off - d, off + d + 1));
    snaps[d] = row;
    if (V[off + delta] >= N) {
      D = d;
      break;
    }
  }
  return { d: D, snaps };
}

// Walk the snapshots back from (N, M) to (0, 0) and rebuild the exact
// path the forward search took. Returns the middle edit ops in order
// as a Uint8Array: 0 = keep, 1 = delete an old line, 2 = insert a new
// line. The snake length at each depth comes from the snapshots, so
// the walk never has to guess where a run of equal lines ends.
function myersBacktrack(snaps, D, N, M) {
  const rev = [];
  let x = N;
  let y = M;
  for (let d = D; d >= 1; d--) {
    const k = x - y;
    const prev = snaps[d - 1];
    const vm1 = prev[k - 1 + (d - 1)]; // V[d-1][k-1]
    const vp1 = prev[k + 1 + (d - 1)]; // V[d-1][k+1]
    let isDel;
    if (k === -d) {
      isDel = false;
    } else if (k === d) {
      isDel = true;
    } else {
      isDel = vm1 + 1 >= vp1; // same tie rule as the forward pass
    }
    const xEdit = isDel ? vm1 + 1 : vp1;
    while (x > xEdit) {
      rev.push(0);
      x--;
      y--;
    }
    if (isDel) {
      rev.push(1);
      x--;
    } else {
      rev.push(2);
      y--;
    }
  }
  while (x > 0) {
    rev.push(0);
    x--;
    y--;
  }
  rev.reverse();
  return Uint8Array.from(rev);
}

// Format the patch for one case. ops covers the whole texts (prefix
// keeps, middle ops, suffix keeps); oldLines / newLines are the split
// texts. Hunks take up to 3 kept lines of context on each side, and
// two change runs at most 6 kept lines apart share one hunk. Inside
// a run, deletions come before insertions. A patch line that is the
// last line of its text and lacks a trailing newline is written with
// one added, followed by a "%" line.
function formatPatch(ops, oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const oldEndsNL = n === 0 || oldLines[n - 1].endsWith("\n");
  const newEndsNL = m === 0 || newLines[m - 1].endsWith("\n");

  // Find the change runs: maximal stretches of non-keep ops.
  const runs = [];
  for (let i = 0; i < ops.length; ) {
    if (ops[i] === 0) {
      i++;
      continue;
    }
    const s = i;
    let dels = 0;
    let inss = 0;
    while (i < ops.length && ops[i] !== 0) {
      if (ops[i] === 1) dels++;
      else inss++;
      i++;
    }
    runs.push({ s, e: i, dels, inss });
  }

  // Group runs into hunks (context 3, merge gap at most 6 kept lines).
  const hunks = [];
  for (const r of runs) {
    // kept lines immediately before / after this run
    let before = 0;
    for (let j = r.s - 1; j >= 0 && ops[j] === 0 && before < 3; j--) before++;
    let after = 0;
    for (let j = r.e; j < ops.length && ops[j] === 0 && after < 3; j++) after++;
    const hs = r.s - before;
    const he = r.e + after;
    const last = hunks[hunks.length - 1];
    if (last && hs <= last.he) {
      last.he = he;
    } else {
      hunks.push({ hs, he });
    }
  }

  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    deleted += r.dels;
    inserted += r.inss;
  }

  const out = [];
  out.push(
    `makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`,
  );
  if (hunks.length === 0) return out.join("");

  // One pass over the ops: advance cursors to each hunk, count the
  // lines it covers, then emit it from the saved starting cursors.
  let oi = 0;
  let ni = 0;
  let i = 0;
  for (const h of hunks) {
    while (i < h.hs) {
      const t = ops[i++];
      if (t !== 2) oi++;
      if (t !== 1) ni++;
    }
    const oStart = oi + 1;
    const nStart = ni + 1;
    const oiStart = oi;
    const niStart = ni;
    let oCount = 0;
    let nCount = 0;
    for (let j = h.hs; j < h.he; j++) {
      const t = ops[j];
      if (t !== 2) oCount++;
      if (t !== 1) nCount++;
    }
    out.push(`@ ${oStart} ${oCount} ${nStart} ${nCount}\n`);
    oi = oiStart;
    ni = niStart;
    i = h.hs;
    // Emit the hunk's lines, deletions before insertions within a run.
    while (i < h.he) {
      const t = ops[i];
      if (t === 0) {
        // The prefix joins the line directly; there is no separator.
        out.push("=" + oldLines[oi]);
        if (oi === n - 1 && !oldEndsNL) {
          out.push("\n");
          out.push("%\n");
        } else if (!oldLines[oi].endsWith("\n")) out.push("\n");
        oi++;
        ni++;
        i++;
      } else {
        // One run: collect its deletions and insertions, emit dels first.
        const dels = [];
        const inss = [];
        while (i < h.he && ops[i] !== 0) {
          if (ops[i] === 1) dels.push(oi++);
          else inss.push(ni++);
          i++;
        }
        for (const d of dels) {
          out.push("-" + oldLines[d]);
          if (d === n - 1 && !oldEndsNL) {
            out.push("\n");
            out.push("%\n");
          } else if (!oldLines[d].endsWith("\n")) out.push("\n");
        }
        for (const s of inss) {
          out.push("+" + newLines[s]);
          if (s === m - 1 && !newEndsNL) {
            out.push("\n");
            out.push("%\n");
          } else if (!newLines[s].endsWith("\n")) out.push("\n");
        }
      }
    }
  }
  return out.join("");
}

// Answer one case: { old, new } -> the patch as one string.
function run(input) {
  const oldLines = splitLines(input.old);
  const newLines = splitLines(input.new);
  const n = oldLines.length;
  const m = newLines.length;
  const [a, b] = internLines(oldLines, newLines);

  // Keep the common prefix, then the common suffix of what is left.
  let a0 = 0;
  let b0 = 0;
  while (a0 < n && b0 < m && a[a0] === b[b0]) {
    a0++;
    b0++;
  }
  let a1 = n;
  let b1 = m;
  while (a1 > a0 && b1 > b0 && a[a1 - 1] === b[b1 - 1]) {
    a1--;
    b1--;
  }
  const N = a1 - a0;
  const M = b1 - b0;

  let mid;
  if (N === 0 && M === 0) {
    mid = new Uint8Array(0);
  } else if (N === 0) {
    mid = new Uint8Array(M).fill(2);
  } else if (M === 0) {
    mid = new Uint8Array(N).fill(1);
  } else {
    const { d, snaps } = myersForward(a, b, a0, N, b0, M);
    mid = myersBacktrack(snaps, d, N, M);
  }

  // Total ops = prefix keeps + middle ops + suffix keeps.
  const total = a0 + mid.length + (n - a1);
  const full = new Uint8Array(total);
  full.fill(0, 0, a0);
  full.set(mid, a0);
  full.fill(0, a0 + mid.length, total);
  return formatPatch(full, oldLines, newLines);
}

export { run };
