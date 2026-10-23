"""Independent verification of the live P2.1 snapshot (no app code).

Recomputes, for every topic x baseline, from the stored raw counts:
share, Mann-Kendall (S, variance, z, tau, exact/normal p), Sen slope + CI95,
relative change, BH q per family, verdict/confidence, GGT annual/mean/SD/SEM,
Nelis conditions and threshold group. Compares with the stored results.
Definitions: Mann (1945), Kendall (1975), Sen (1968), Benjamini & Hochberg (1995),
Nelis et al. (2022) Eq (i); verdict rules as specified in trend.verdict.ts docs.
"""
import json
import math
import sys
from collections import defaultdict
from statistics import NormalDist, median

d = sys.argv[1]
counts = json.load(open(f"{d}/live_counts.json", encoding="utf-8"))
topics = {t["t"]: t for t in json.load(open(f"{d}/live_topics.json", encoding="utf-8"))}
results = json.load(open(f"{d}/live_results.json", encoding="utf-8"))
YEARS = list(range(2016, 2026))
ALPHA, MIN_YEARS, MIN_PAPERS, HIGH_P, HIGH_YEARS = 0.05, 5, 30, 0.01, 8

n_topic = defaultdict(dict)
level = {"domain": defaultdict(dict), "field": defaultdict(dict), "subfield": defaultdict(dict)}
for c in counts:
    if c["k"] == "unknown":
        continue
    (n_topic if c["l"] == "topic" else level[c["l"]])[c["k"]][c["y"]] = c["c"]
glob = defaultdict(int)
for t, ys in n_topic.items():
    for y, v in ys.items():
        glob[y] += v

# --- exact MK null: distribution of inversions (Mahonian) by polynomial products, own implementation
_mah = {}
def mahonian(n):
    if n not in _mah:
        poly = [1]
        for i in range(1, n + 1):  # multiply by (1 + x + ... + x^(i-1))
            new = [0] * (len(poly) + i - 1)
            for a, v in enumerate(poly):
                for b in range(i):
                    new[a + b] += v
            poly = new
        _mah[n] = poly
    return _mah[n]

def mk(x):
    n = len(x)
    if n < 3:
        return None
    s = sum((x[j] > x[i]) - (x[j] < x[i]) for i in range(n) for j in range(i + 1, n))
    ties = defaultdict(int)
    for v in x:
        ties[v] += 1
    tie = sum(t * (t - 1) * (2 * t + 5) for t in ties.values() if t > 1)
    var = (n * (n - 1) * (2 * n + 5) - tie) / 18
    if not var > 0:
        return None
    z = (s - 1) / math.sqrt(var) if s > 0 else (s + 1) / math.sqrt(var) if s < 0 else 0.0
    if tie == 0 and n <= 10:
        pairs = n * (n - 1) // 2
        dist = mahonian(n)
        p = sum(c for k, c in enumerate(dist) if abs(pairs - 2 * k) >= abs(s)) / sum(dist)
        method = "exact"
    else:
        p = math.erfc(abs(z) / math.sqrt(2))
        method = "normal"
    return {"s": s, "z": z, "tau": s / (n * (n - 1) / 2), "pValue": min(1.0, max(0.0, p)), "pValueMethod": method, "variance": var}

def sen(points):
    slopes = sorted((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]) for i in range(len(points)) for j in range(i + 1, len(points)) if points[j][0] != points[i][0])
    return slopes

def order_stat(sorted_vals, rank):
    low = math.floor(rank)
    frac = rank - low
    below = sorted_vals[low - 1]
    if frac == 0 or low >= len(sorted_vals):
        return below
    return below + frac * (sorted_vals[low] - below)

def bh(ps):
    idx = [(p, i) for i, p in enumerate(ps) if p is not None]
    m = len(idx)
    idx.sort()
    out = [None] * len(ps)
    run = 1.0
    for rank in range(m, 0, -1):
        p, i = idx[rank - 1]
        run = min(run, m * p / rank)
        out[i] = min(1.0, max(0.0, run))
    return out

def nelis(mean):
    if mean < -10: return "consistent_decrease"
    if -5 < mean < 5: return "no_consistent_growth"
    if 5 < mean < 15: return "consistent_growth"
    if 15 < mean < 40: return "consistent_strong_growth"
    if 40 < mean < 80: return "consistent_intense_growth"
    if mean > 80: return "unsustainable_growth"
    return "unclassified"

def close(a, b, tol=1e-9):
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= tol * max(1.0, abs(a), abs(b))

stored = {(r["b"], r["t"]): r for r in results}
mismatch = defaultdict(list)
computed = {}
for b in ["global", "domain", "field", "subfield"]:
    rows = []
    for t in sorted(n_topic):
        if not any(n_topic[t].get(y, 0) > 0 for y in YEARS):
            continue
        tax = topics[t]
        unit = "all" if b == "global" else tax[{"domain": "d", "field": "f", "subfield": "s"}[b]]
        N = glob if b == "global" else level[b].get(unit, {})
        share = []
        for y in YEARS:
            if N.get(y, 0) > 0:
                n = n_topic[t].get(y, 0)
                tot = max(N[y], n)
                share.append({"year": y, "count": n, "total": tot, "sharePct": n / tot * 100})
        shares = [r["sharePct"] for r in share]
        m = mk(shares)
        sl = sen([(r["year"], r["sharePct"]) for r in share])
        slope = median(sl) if sl else None
        ci = None
        if m and sl:
            c = NormalDist().inv_cdf(1 - ALPHA / 2) * math.sqrt(m["variance"])
            lo, hi = (len(sl) - c) / 2, (len(sl) + c) / 2 + 1
            if lo >= 1 and hi <= len(sl):
                ci = [order_stat(sl, lo), order_stat(sl, hi)]
        typical = median(shares) if shares else None
        rel = slope / typical * 100 if slope is not None and typical else None
        # GGT
        ann = {}
        for i, r in enumerate(share):
            prev = share[i - 1] if i > 0 and share[i - 1]["year"] == r["year"] - 1 else None
            if prev is None or prev["count"] == 0 or prev["total"] == 0 or r["total"] == 0:
                ann[r["year"]] = None
            else:
                ann[r["year"]] = ((r["count"] - prev["count"]) / prev["count"] - (r["total"] - prev["total"]) / prev["total"]) * 100
        g = [v for v in ann.values() if v is not None]
        gm = sum(g) / len(g) if g else None
        gsd = math.sqrt(sum((v - gm) ** 2 for v in g) / (len(g) - 1)) if len(g) >= 2 else None
        gsem = gsd / math.sqrt(len(g)) if gsd is not None else None
        below100 = all(v < 100 for v in g) if g else None
        ge50 = min(r["count"] for r in share) >= 50 if share else None
        group = nelis(gm) if gm is not None and below100 is True and ge50 is True else None
        rows.append(dict(t=t, unit=unit, share=share, mk=m, slope=slope, ci=ci, rel=rel, ann=ann, gm=gm, gsem=gsem, gn=len(g), below100=below100, ge50=ge50, group=group, total=sum(r["count"] for r in share)))
    fam = defaultdict(list)
    for i, r in enumerate(rows):
        fam[r["unit"]].append(i)
    for members in fam.values():
        q = bh([rows[i]["mk"]["pValue"] if rows[i]["mk"] else None for i in members])
        size = sum(1 for i in members if rows[i]["mk"])
        for i, qq in zip(members, q):
            rows[i]["q"], rows[i]["fs"] = qq, size
    for r in rows:
        if len(r["share"]) < MIN_YEARS or r["total"] < MIN_PAPERS:
            v, cf = "insufficient", None
        elif r["mk"] and r["q"] is not None and r["q"] < ALPHA and r["mk"]["s"] != 0:
            v = "rising" if r["mk"]["s"] > 0 else "declining"
            cf = "high" if r["q"] < HIGH_P and len(r["share"]) >= HIGH_YEARS else "medium"
        else:
            v, cf = "stable", None
        r["v"], r["cf"] = v, cf
        computed[(b, r["t"])] = r
        s = stored.get((b, r["t"]))
        if s is None:
            mismatch["missing_row"].append((b, r["t"]))
            continue
        chk = lambda name, ok: ok or mismatch[name].append((b, r["t"]))
        chk("unit", s["u"] == r["unit"])
        chk("share_series", len(s["ss"]) == len(r["share"]) and all(a["year"] == e["year"] and a["count"] == e["count"] and a["total"] == e["total"] and close(a["sharePct"], e["sharePct"]) for a, e in zip(s["ss"], r["share"])))
        chk("mk_s", (s["mk"] is None and r["mk"] is None) or (s["mk"] and r["mk"] and s["mk"]["s"] == r["mk"]["s"]))
        chk("mk_p", (s["mk"] is None and r["mk"] is None) or (s["mk"] and r["mk"] and close(s["mk"]["pValue"], r["mk"]["pValue"], 1e-9) and s["mk"]["pValueMethod"] == r["mk"]["pValueMethod"]))
        chk("mk_z_tau", (s["mk"] is None) or (close(s["mk"]["z"], r["mk"]["z"]) and close(s["mk"]["tau"], r["mk"]["tau"])))
        chk("sen", close(s["sen"], r["slope"]))
        chk("sen_ci95", (s["ci"] is None and r["ci"] is None) or (s["ci"] and r["ci"] and close(s["ci"][0], r["ci"][0]) and close(s["ci"][1], r["ci"][1])))
        chk("relative_change", close(s["rc"], r["rel"]))
        chk("q", close(s["q"], r["q"], 1e-9))
        chk("family_size", s["fs"] == r["fs"])
        chk("verdict", s["v"] == r["v"] and s["cf"] == r["cf"])
        chk("ggt_annual", all(close(a["ggtPct"], r["ann"].get(a["year"])) for a in s["ggt"]["annual"]))
        chk("ggt_mean_sem", close(s["gm"], r["gm"]) and close(s["gs"], r["gsem"]) and s["gy"] == r["gn"])
        chk("ggt_conditions", s["gc"] == (r["below100"] is True and r["ge50"] is True))
        chk("nelis_group", s["ng"] == r["group"])
        chk("stability_not_checked", s["sc"] is False and s["ggt"]["stabilityChecked"] is False)

extra = [k for k in stored if k not in computed]
by_b = defaultdict(lambda: defaultdict(int))
for (b, t), r in computed.items():
    by_b[b][r["v"]] += 1
tiny = [r for (b, t), r in computed.items() if b == "global" and r["gm"] is not None and r["gm"] > 100]
out = {
    "rowsStored": len(results), "rowsComputed": len(computed), "extraStoredRows": len(extra),
    "topicsWithWorks": len({t for (_, t) in computed}), "topicsInCounts": len(n_topic), "catalogue": len(topics),
    "mismatches": {k: len(v) for k, v in mismatch.items()}, "mismatchExamples": {k: v[:5] for k, v in mismatch.items()},
    "verdictsByBaseline": {b: dict(v) for b, v in by_b.items()},
    "missingStats": {"mkNull": sum(1 for r in computed.values() if r["mk"] is None), "qNull": sum(1 for r in computed.values() if r["q"] is None), "ggtMeanNull": sum(1 for r in computed.values() if r["gm"] is None)},
    "familySizes": {b: sorted({r["fs"] for (bb, _), r in computed.items() if bb == b})[:3] + ["..."] for b in ["global", "domain", "field", "subfield"]},
    "extremeGgtGlobal": {"count_mean_gt_100pct": len(tiny), "any_with_nelis_group": sum(1 for r in tiny if r["group"] is not None), "examples": [{"t": r["t"], "meanGgt": round(r["gm"], 1), "minYearCount": min(x["count"] for x in r["share"]), "group": r["group"]} for r in sorted(tiny, key=lambda r: -r["gm"])[:5]]},
    "pMethods": dict(defaultdict(int, {m: sum(1 for r in computed.values() if r["mk"] and r["mk"]["pValueMethod"] == m) for m in ["exact", "normal"]})),
}
json.dump(out, open(f"{d}/verify_live_out.json", "w", encoding="utf-8"), indent=1)
print(json.dumps(out, indent=1))

# --- size of the flagged differences
def rel(a, b):
    return abs(a - b) / max(1e-300, abs(b))
ci_d, p_d, q_d, meth, vflip = [], [], [], defaultdict(int), 0
for (b, t), r in computed.items():
    s = stored[(b, t)]
    if s["ci"] and r["ci"]:
        ci_d.append(max(rel(s["ci"][0], r["ci"][0]), rel(s["ci"][1], r["ci"][1])))
    elif bool(s["ci"]) != bool(r["ci"]):
        ci_d.append(float("inf"))
    if s["mk"] and r["mk"] and not close(s["mk"]["pValue"], r["mk"]["pValue"], 1e-9):
        p_d.append(abs(s["mk"]["pValue"] - r["mk"]["pValue"])); meth[r["mk"]["pValueMethod"]] += 1
    if s["q"] is not None and r["q"] is not None and not close(s["q"], r["q"], 1e-9):
        q_d.append(abs(s["q"] - r["q"]))
print("CI95: compared", len(ci_d), "max rel diff", max(ci_d), "presence mismatch", sum(1 for x in ci_d if x == float("inf")))
print("p: mismatches", len(p_d), "by method", dict(meth), "max abs diff", max(p_d) if p_d else 0)
print("q: mismatches", len(q_d), "max abs diff", max(q_d) if q_d else 0)
print("verdict mismatches (already checked):", len(mismatch.get("verdict", [])))
