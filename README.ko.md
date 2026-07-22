# Turbopack 프로덕션 빌드가 공유 모듈을 여러 청크에 복제함 (webpack은 중복 제거)

*[English](./README.md) · 한국어*

최소한의, 완전히 독립적인 재현 저장소입니다. Next/React 외 **외부 의존성 없음** — 여러 개의 작은
모듈로 이루어진 로컬 "라이브러리"를 여러 지연 로딩(`next/dynamic`) 클라이언트 피처가 import하되,
**각 피처가 서로 겹치지만 동일하지 않은 부분집합**을 사용합니다(실제 피처 화면들이 공유 에디터/vendor
의존성 트리의 서로 다른, 부분적으로 겹치는 조각을 각자 가져오는 방식 그대로).

**Turbopack** 프로덕션 빌드에서는 *일부(전부는 아님)* 피처가 공유하는 모듈이 **여러 청크에 복사**됩니다.
**webpack**(`next build --webpack`)에서는 *동일한 소스*가 각 모듈을 **정확히 한 번만** 내보냅니다.

---

## 한 줄 요약 (TL;DR)

| 번들러 | `next build` 명령 | 모듈당 평균 복사본 | 공유 라이브러리에 쓴 바이트 |
| ------ | ----------------- | ------------------ | --------------------------- |
| **Turbopack** (기본값) | `npm run build`         | **2.08** (최대 3배) ❌ | **466 KB** |
| **webpack**            | `npm run build:webpack` | **1.00** (모듈당 1벌) ✅ | **223 KB** |

소스도 Next.js 버전도 같으며 **번들러만** 다릅니다. Turbopack은 webpack이 공유하는 모듈을 복제하기
때문에 동일한 공유 코드에 약 2배의 바이트를 씁니다. **total 번들 크기는 올바른 지표가 아닙니다**(§7 참고) —
핵심 지표는 *모듈당 복사본 수*입니다.

---

## 1. 무엇을 리포트하는가

Turbopack의 프로덕션 청킹은 모듈을 **자신을 참조하는 청크 그룹 집합이 완전히 같은지**로 묶습니다.
`{A,B}`가 참조하는 모듈, `{B,C}`가 참조하는 모듈, `{A}`만 참조하는 모듈은 서로 다른 버킷에 들어갑니다.
집합이 정확히 같지 않아도 "여러 그룹이 쓰는 모듈"을 공유/vendor 청크로 추출하는 패스는 없습니다 —
그래서 피처들이 공유 의존성의 **겹치지만 다른 부분집합**을 쓰면 공유 모듈이 **여러 청크에 복제**됩니다.
webpack의 `splitChunks`는 동일한 그래프에서 각 모듈을 한 번만(공유 청크로) 내보냅니다. 런타임 크래시가
아니라 번들 크기/산출물 문제입니다.

실제 앱에서 공유 의존성이 작은 모듈 다수로 이루어진 큰 트리(예: KaTeX를 포함한 리치텍스트/수식 에디터)이고
이를 ~15–20개의 지연 피처가 각자 다른 조각을 건드리며 import하면, 많은 모듈이 ~15–20배로 복제되어
클라이언트 JS에 **수십 MB**가 더해질 수 있습니다.

관련 기존 이슈(동일한 "Turbopack이 공유 모듈을 청크 그룹마다 복사" 동작이지만 서버에서 `instanceof`
파손으로 관찰된 사례): https://github.com/vercel/next.js/issues/89192

---

## 2. 이 저장소가 재현하는 것 (목표)

**단 하나의 변수** — 겹치는 부분집합의 청크 그룹이 공유하는 모듈을 프로덕션 번들러가 어떻게 배치하는가 —
만 격리합니다. 동일 소스를 Turbopack과 webpack으로 각각 빌드하고, 각 공유 모듈이 몇 개 청크 파일에
들어가는지 셉니다. 나머지는 최소로 유지(CSS/데이터페칭/외부 라이브러리/커스텀 splitChunks 설정 없음)해
차이의 원인이 오직 번들러임이 드러나게 합니다.

---

## 3. 실행 환경

- **next**: `16.2.10` (Next 16에서 Turbopack이 기본 번들러)
- **react / react-dom**: `19.1.1`
- **node**: 20+ (Node 24, macOS arm64에서 개발 — OS 종속 아님)
- `next.config.js`에 청킹/`splitChunks`/turbopack 커스텀 **없음**(비어 있음)

---

## 4. 재현을 어떻게 구현했는가

```
lib/shared-lib/p00.ts … p39.ts   ← 공유 "라이브러리": 작은 모듈 40개 (각 ~6 KB)
components/FeatureA..D.tsx        ← 4개 'use client' 피처; 각자 40개 중 25개의
                                    "겹치지만 다른 윈도우"를 import
app/{a,b,c,d}/page.tsx            ← 4개 라우트; 각자 next/dynamic()으로 피처 로드
app/page.tsx, app/layout.tsx      ← 최소한의 껍데기
scripts/measure.mjs               ← 공유 모듈별로 몇 개 청크 파일에 들어갔는지 계산
```

설계 의도:

- **`lib/shared-lib/p00..p39.ts`** — 작은 모듈 40개. 실제 의존성 트리가 하나의 큰 파일이 아니라 작은
  파일 다수로 이루어진 것을 모사합니다. 각 모듈은 고유 마커(`SHARED_LIB_PART_NN`)를 갖고, 이를
  **문자열로 반환·렌더**하므로 minify/상수폴딩에도 살아남아 청크에서 grep됩니다. 각 모듈은 실제로
  합산되는 테이블도 가지므로 tree-shaking되지 않습니다.

  > 왜 "작은 모듈 다수"이고 하나의 큰 모듈이 아닌가: Turbopack은 **큰** 단일 모듈에는 전용 공유 청크를
  > 부여합니다(따라서 큰 단일 파일 repro는 dedup되어 문제를 가림). 실제 라이브러리는 작은 모듈 다수이고,
  > 복제는 바로 거기서 나타납니다. 이 저장소는 그걸 모델링합니다.

- **`components/FeatureA..D.tsx`** — 4개의 `'use client'` 피처. 각자 **서로 다른 겹치는 윈도우**
  25개 파트를 import합니다(A: 0–24, B: 8–32, C: 15–39, D: 22–46 mod 40). 따라서 각 공유 모듈은
  네 피처 중 *서로 다른 부분집합*이 사용 — Turbopack이 복제하는 조건입니다.

- **`app/{a,b,c,d}/page.tsx`** — 4개 라우트. 각자
  `next/dynamic(() => import('@/components/FeatureX'))`로 피처를 로드해 각 피처를 별도 청크 그룹에 둡니다.

  > 참고: 중요한 건 각 피처가 **별도 청크 그룹**이 된다는 점입니다. `next/dynamic`은 그 경계를 만드는
  > 흔한 방법 중 하나이며(라우트 경계도 또 다른 방법), 이 저장소는 가장 흔한 실제 패턴이라 dynamic을
  > 썼습니다. dynamic import가 이 동작의 *필수 조건*임을 따로 증명하진 않습니다.

효과를 키우려면 피처를 늘리거나 겹침을 넓히면 됩니다. 복제는 한 모듈을 공유하는 청크 그룹 수에 따라 커집니다.

---

## 5. 설치

```bash
npm install
```

> **이것은 프로덕션 빌드 이슈입니다.** `next dev`는 Turbopack의 프로덕션 청킹 알고리즘을 돌리지
> 않으므로(dev는 요청 단위 지연 번들링), **dev 모드에서는 복제가 나타나지 않습니다.** 반드시
> `next build`로 재현하세요.

## 6. 검증 방법

```bash
# --- Turbopack (기본값) ---
rm -rf .next
npm run build            # = next build
npm run measure          # → 모듈당 평균 복사본 ~2.08, 공유 라이브러리가 여러 청크에 복제됨

# --- webpack (비교용) ---
rm -rf .next
npm run build:webpack    # = next build --webpack
npm run measure          # → 모듈당 평균 복사본 1.00, 각 모듈 1벌만
```

`scripts/measure.mjs`는 `.next/static/chunks/**/*.js`를 훑어, 40개 공유 모듈(`SHARED_LIB_PART_NN`)
각각이 몇 개 청크 파일에 들어갔는지 셉니다. 복사본 분포, 공유 코드가 든 청크들의 합산 크기, 그리고
(*참고용으로만*) total 번들 크기를 출력합니다.

스크립트 없이 특정 공유 모듈 하나가 몇 개 청크에 있는지 수동 확인:

```bash
grep -rl 'SHARED_LIB_PART_00' .next/static/chunks | wc -l
#   Turbopack 빌드 → >1  (복제됨)
#   webpack 빌드   → 1   (dedup됨)
```

---

## 7. 기대 vs 실제 (next@16.2.10 실측)

**기대:** 각 공유 모듈이 그것을 쓰는 피처들이 함께 참조하는 **하나**의 청크에 들어가(각 모듈 1벌).

**실제 — Turbopack (`npm run build`):**

```
Copies per shared-lib module (how many chunk files each module lands in):
    8 module(s) copied into 1 chunk file(s)
   21 module(s) copied into 2 chunk file(s)
   11 module(s) copied into 3 chunk file(s)
  average copies per module : 2.08
Chunk files carrying shared-lib code : 7
  combined size of those chunks      : 466.3 KB   <-- 복제 비용
RESULT: shared-lib modules are DUPLICATED (avg 2.08 copies each)
```

**실제 — webpack (`npm run build:webpack`), 동일 소스:**

```
Copies per shared-lib module (how many chunk files each module lands in):
   40 module(s) copied into 1 chunk file(s)
  average copies per module : 1.00
Chunk files carrying shared-lib code : 7
  combined size of those chunks      : 222.8 KB
RESULT: every shared-lib module lives in a SINGLE chunk (deduplicated)
```

webpack도 **동일하게 7개 공유 청크**를 만들지만 **복제는 0** — 각 모듈이 정확히 한 번(223 KB)인 반면,
Turbopack은 그 청크들에 모듈을 복제(466 KB)합니다. 즉 요청 수 트레이드오프가 아니라, Turbopack이
webpack에는 없는 중복 복사본을 내보내는 것입니다.

> 정확한 청크 개수와 해시 파일명은 Next.js 패치/Node 버전에 따라 달라집니다. 핵심 수치는
> **모듈당 복사본 수: ~2.08(Turbopack) vs 1.00(webpack)** 이지 절대 총량이 아닙니다. total *번들*
> 크기는 의도적으로 헤드라인으로 쓰지 않습니다 — 번들러 베이스라인 차이(framework/react/runtime/
> polyfills)에 좌우되며, 여기서는 Turbopack이 복제함에도 두 total이 거의 같습니다(~1.11 MB vs ~1.10 MB).

---

## 8. 근본 원인 (참고용 — 인용 전 직접 검증 요망)

`v16.2.10` 태그 고정:
[`turbopack/crates/turbopack-core/src/chunk/chunking/production.rs`](https://github.com/vercel/next.js/blob/v16.2.10/turbopack/crates/turbopack-core/src/chunk/chunking/production.rs).
청크 아이템은 **자신을 참조하는 청크 그룹 집합**(그룹핑 맵 키로 쓰이는 `RoaringBitmap` — `grouped_chunk_items`
삽입부, ~L98–110)을 기준으로 묶입니다. 집합이 *완전히 같은* 모듈끼리만 co-locate됩니다. 이후 병합 단계
(~L167–557)는 요청 수 휴리스틱으로 청크를 병합하며 큰 청크는 제외합니다(`max_merge_chunk_size`, ~L174–178).
여러 그룹이 쓰는 모듈을 하나의 공유/vendor 청크로 추출하는 패스는 없습니다 — 즉 webpack `splitChunks`의
사용 횟수 기반 추출에 해당하는 것이 없습니다. 프로덕션 최적화 JS 청킹이 아직 완전히 구현되지 않았다는
Turbopack 문서 내용과 일치합니다.
