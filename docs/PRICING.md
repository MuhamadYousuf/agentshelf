# Pricing model

AgentShelf maps its negotiation engine to *Bayesian, Utility-Maximizing Tit-for-Tat Repeated-Game Pricing* by Shakeel, Dadabhoy, Siddiqui, and Soomar (2026). The amount is deterministic for the same inputs. Language models classify buyer messages and write replies; they do not choose or adjust prices.

## Buyer model (Algorithm 2)

Let `r = p / list` and `b` be the current belief that the buyer is price-sensitive. The engine mixes two logistic acceptance curves:

```text
P_acc_S(p) = 1 / (1 + exp(12 × (r − 0.92)))
P_acc_T(p) = 1 / (1 + exp( 8 × (r − 1.05)))
P_acc(p)   = b × P_acc_S(p) + (1 − b) × P_acc_T(p)
```

Buyer-move observations update `b` with Bayes' rule and clamp the posterior to `[0.02, 0.98]`. The implementation evaluates acceptance/non-purchase likelihoods at the last seller offer; a counter that clears the current selected offer is treated as acceptance evidence. An `open` move keeps the prior. The default anonymous-buyer prior is `0.5`; the engine also exposes `priorFromSegment` for trusted `price_sensitive` (`0.75`) and `tolerant` (`0.25`) segments. The active MCP and hosted Shopper flows start at `0.5`. The paper's Algorithm 1 behavioral classification tree is not implemented.

The seller candidate grid is `{0.97, 1.05} × list` while cooperating and `{0.85, 0.90} × list` in recovery. Each candidate is clamped to the effective private floor and list price, rounded to cents, then ranked by expected utility:

```text
EU(p) = P_acc(p) × (p − cost)
```

Cost is the merchant's private per-unit cost when set; otherwise it defaults to `round(0.55 × list)`. The merchant policy first applies the maximum-discount setting: `effectiveFloor = max(productFloor, ceil(list × (1 − maxDiscountPct / 100)))`.

## Tit-for-Tat state (Algorithm 3)

The stored states are `cooperate` and `recovery` (the UI labels these `COOPERATE` and `DEFECT_RECOVERY`). A buyer counter is a tolerance breach when it is below the last seller offer and that offer is more than 1.05 times the counter. A walk-away is also a breach. A breach enters recovery; two consecutive breaches produce a final offer. A non-breach resets the streak, and agreement returns to cooperation. The negotiation is capped at six rounds.

Marketplace safeguards around the paper implementation clamp all output prices to `[effectiveFloor, list]`, keep the seller's offer from increasing during a negotiation, and accept a counter at or above the engine's selected next offer at the buyer's counter. If merchant auto-accept is disabled, an otherwise accepted counter returns the engine's offer for merchant review instead.

## Worked example

For the demo mug, list price is `$28.00`, effective floor is `$23.80`, and default cost is `$15.40`. With a `0.5` prior and no prior offer, Algorithm 2 selects `$27.16` from the cooperate candidates. A `$22.00` counter is below the previous offer by more than the 1.05 tolerance, so the next decision enters recovery and clamps to `$23.80`. That result is an `offer` on the first breach; it is not yet a terminal `final` action. A second consecutive breach or the sixth round makes the action final.

## Traces and privacy

The saved trace contains posterior belief, state, candidate prices, acceptance probabilities, expected utilities, the selected candidate, and a machine-readable reason. It does not include explicit floor or cost fields. Floor and cost can still affect candidate clamping and expected utility, so traces are merchant-facing only. They are not included in storefront HTML, public APIs, MCP output, or LLM prompts. Negotiation quotes contain the approved unit/total prices but no floor or cost.

