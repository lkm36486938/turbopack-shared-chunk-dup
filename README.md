# Turbopack production build duplicates shared modules across chunks (webpack deduplicates them)

*English · [한국어](./README.ko.md)*

A minimal, fully self-contained reproduction. **No external dependencies** beyond Next/React —
a local "library" of many small modules is imported by several lazily‑loaded (`next/dynamic`)
client features, where **each feature uses an overlapping‑but‑distinct subset** of the library
(exactly how real feature screens each pull in different, partly‑overlapping slices of a shared
editor/vendor dependency tree).

Under the **Turbopack** production build, modules that are shared by *some but not all* features
are **copied into multiple chunks**. Under **webpack** (`next build --webpack`) the *exact same
source* emits each module **exactly once**.

---

## TL;DR

| Bundler | `next build` command | Copies per shared module (avg) | Bytes spent on the shared library |
| ------- | -------------------- | ------------------------------ | --------------------------------- |
| **Turbopack** (default) | `npm run build`         | **2.08** (up to 3×) ❌ | **466 KB** |
| **webpack**             | `npm run build:webpack` | **1.00** (each module once) ✅ | **223 KB** |

Same source, same Next.js version — only the bundler differs. Turbopack spends ~2× the bytes on
the identical shared code because it duplicates modules that webpack shares. **Total bundle size
is *not* the right lens** (see §7) — the load‑bearing metric is *copies per module*.

---

## 1. What is being reported

Turbopack's production chunking groups modules by the **exact set of chunk groups** that
reference them. A module reached by chunk groups `{A,B}` and a module reached by `{B,C}` are put
in different buckets, and a module reached by only `{A}` in yet another. There is no pass that
extracts a module used by *many* groups into a shared/vendor chunk regardless of the exact set —
so when features use **overlapping‑but‑different** subsets of a shared dependency, the shared
modules get **duplicated across chunks**. webpack's `splitChunks` handles the same graph by
emitting each module once (into shared chunks). This is a bundle‑size / output concern, not a
runtime crash.

In a real app where the shared dependency is a large tree of small modules (e.g. a rich‑text /
math editor bundling KaTeX) imported by ~15–20 lazily‑loaded feature entries that each touch a
different slice, this duplicates many modules ~15–20× and can add **tens of MB** of client JS.

Related existing issue (same "Turbopack copies a shared module per chunk group" behavior, but
observed on the server as broken `instanceof`):
https://github.com/vercel/next.js/issues/89192

---

## 2. What this repo reproduces (the goal)

Isolate **one variable**: how the production bundler places modules that are shared by an
overlapping subset of chunk groups. Build the identical source with Turbopack and with webpack,
and count how many chunk files each shared module ends up in.

Everything else is kept minimal (no CSS, no data fetching, no external libraries, no custom
bundler/splitChunks config) so the only difference is the bundler.

---

## 3. Environment

- **next**: `16.2.10` (Turbopack is the default bundler in Next 16)
- **react / react-dom**: `19.1.1`
- **node**: 20+ (developed on Node 24, macOS arm64 — not OS‑specific)
- `next.config.js` has **no** chunking/`splitChunks`/turbopack customization (it is empty).

---

## 4. How the reproduction is implemented

```
lib/shared-lib/p00.ts … p39.ts   ← the shared "library": 40 small modules (~6 KB each)
components/FeatureA..D.tsx        ← 4 'use client' features; each imports an OVERLAPPING
                                    but distinct window of 25 of those 40 modules
app/{a,b,c,d}/page.tsx            ← 4 routes; each loads its feature via next/dynamic()
app/page.tsx, app/layout.tsx      ← trivial shell
scripts/measure.mjs               ← counts, per shared module, how many chunk files contain it
```

Design rationale:

- **`lib/shared-lib/p00..p39.ts`** — 40 small modules, mirroring how a real dependency tree is
  made of many small files (not one big file). Each module has a unique marker
  (`SHARED_LIB_PART_NN`) that is **returned as a string and rendered**, so it survives
  minification / constant‑folding and can be grepped in the emitted chunks. Each module also
  holds a table that is actually summed, so it cannot be tree‑shaken.

  > Why "many small modules" and not one big module: Turbopack *does* give a single **large**
  > module its own shared chunk (so a one‑big‑file repro would dedupe and hide the problem). Real
  > libraries are many small modules, and that is where the duplication shows up. This repo
  > models that.

- **`components/FeatureA..D.tsx`** — four `'use client'` features. Each imports a **different,
  overlapping window** of 25 consecutive parts (feature A: parts 0–24, B: 8–32, C: 15–39,
  D: 22–46 mod 40). So each shared module is used by a *different subset* of the four features —
  the condition under which Turbopack duplicates.

- **`app/{a,b,c,d}/page.tsx`** — four routes. Each loads its feature with
  `next/dynamic(() => import('@/components/FeatureX'))`, putting each feature in its own chunk
  group.

  > Note: what matters is that each feature ends up in a **separate chunk group**. `next/dynamic`
  > is one common way to create that boundary (a route boundary is another). This repo uses
  > `next/dynamic` because it is the most common real‑world pattern; it does not separately prove
  > that dynamic import is *required* for the behavior.

To scale the effect, add features / widen the overlap; the duplication grows with the number of
chunk groups that share a module.

---

## 5. Setup

```bash
npm install
```

> **This is a production‑build issue.** `next dev` does **not** run Turbopack's production
> chunking algorithm (dev uses lazy, per‑request bundling), so **dev mode will not show the
> duplication**. Always reproduce with `next build`.

## 6. How to verify

```bash
# --- Turbopack (default) ---
rm -rf .next
npm run build            # = next build
npm run measure          # → avg copies per module ~2.08, shared lib duplicated across chunks

# --- webpack (comparison) ---
rm -rf .next
npm run build:webpack    # = next build --webpack
npm run measure          # → avg copies per module 1.00, each module emitted once
```

`scripts/measure.mjs` scans `.next/static/chunks/**/*.js` and, for each of the 40 shared modules
(`SHARED_LIB_PART_NN`), counts how many chunk files contain it. It prints the copies‑per‑module
distribution, the combined size of the chunks carrying shared‑lib code, and (as *context only*)
the total bundle size.

Manual spot check without the script — how many chunks contain one specific shared module:

```bash
grep -rl 'SHARED_LIB_PART_00' .next/static/chunks | wc -l
#   Turbopack build → >1  (duplicated)
#   webpack build   → 1   (deduplicated)
```

---

## 7. Expected vs. Actual (measured on next@16.2.10)

**Expected:** each shared module ends up in a **single** chunk shared by the features that use it
(as webpack does), so every module is emitted once.

**Actual — Turbopack (`npm run build`):**

```
Copies per shared-lib module (how many chunk files each module lands in):
    8 module(s) copied into 1 chunk file(s)
   21 module(s) copied into 2 chunk file(s)
   11 module(s) copied into 3 chunk file(s)
  average copies per module : 2.08
Chunk files carrying shared-lib code : 7
  combined size of those chunks      : 466.3 KB   <-- duplication cost
RESULT: shared-lib modules are DUPLICATED (avg 2.08 copies each)
```

**Actual — webpack (`npm run build:webpack`), same source:**

```
Copies per shared-lib module (how many chunk files each module lands in):
   40 module(s) copied into 1 chunk file(s)
  average copies per module : 1.00
Chunk files carrying shared-lib code : 7
  combined size of those chunks      : 222.8 KB
RESULT: every shared-lib module lives in a SINGLE chunk (deduplicated)
```

Note webpack produces the **same number of shared chunks (7)** but with **zero duplication** —
each module appears exactly once (223 KB), whereas Turbopack replicates modules across those
chunks (466 KB). So this is not a request‑count trade‑off; Turbopack emits redundant copies that
webpack does not.

> The exact chunk counts and hashed filenames vary by Next.js patch/Node version. The
> load‑bearing number is **copies per module: ~2.08 (Turbopack) vs 1.00 (webpack)**, not the
> absolute totals. Total *bundle* size is deliberately not used as the headline: it is dominated
> by unrelated bundler‑baseline differences (framework/react/runtime/polyfills), and here the two
> totals are nearly equal (~1.11 MB vs ~1.10 MB) even though Turbopack duplicates.

---

## 8. Root cause (optional context — verify before quoting)

Pinned to the `v16.2.10` tag:
[`turbopack/crates/turbopack-core/src/chunk/chunking/production.rs`](https://github.com/vercel/next.js/blob/v16.2.10/turbopack/crates/turbopack-core/src/chunk/chunking/production.rs).
Chunk items are grouped by the **exact set of chunk groups** that reference them (a
`RoaringBitmap` used as the grouping map key — see the `grouped_chunk_items` insertion, ~L98–110).
Only modules whose chunk‑group set is *identical* are co‑located. The subsequent merge pass
(~L167–557) merges chunks by a request‑count heuristic and excludes large chunks
(`max_merge_chunk_size`, ~L174–178). There is no pass that extracts a module used by many groups
into a single shared/vendor chunk — i.e. no equivalent of webpack's `splitChunks`
usage‑count‑based extraction. Consistent with Turbopack docs noting production‑optimized JS
chunking is not yet fully implemented.
