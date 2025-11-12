# Code References: Where Intra-Bar Cheating Happens

## Problem Areas by File

### 1. Main Backtest Engine
**File:** `/Users/edwardkim/Code/ai-backtest/backend/src/services/backtest.service.ts`

#### A. Bar Iteration Loop (Lines 114-146)
**Issue:** Single iteration processes all entry/exit on same bar

```typescript
114   for (let i = 0; i < bars.length; i++) {
115     state.currentBar = bars[i];
116     state.currentIndex = i;
117
118     // Update position values
119     this.updatePositions(state);
120
121     // Build evaluation context with dependencies and earnings
122     const context = this.buildContext(
123       state,
124       bars,
125       indicatorValues,
126       i,
127       dependencyData,
128       earningsEvents
129     );
130
131     // Update trailing stops if custom strategy supports it
132     if (customStrategy && customStrategy.updateTrailingStop) {
133       this.updateTrailingStops(state, customStrategy, context);
134     }
135
136     // Check exit conditions for existing positions
137     this.checkExitConditions(state, strategy, context, config, customStrategy);
138                            ↑ Uses current bar
139
140     // Check entry conditions if we have capacity
141     if (this.canEnterPosition(state, strategy)) {
142       this.checkEntryConditions(state, strategy, context, config, customStrategy);
143                                ↑ Uses same current bar
144     }
145
146     // Record equity point
147     this.recordEquityPoint(state);
148   }
```

**Problem:** Both exits (line 137) and entries (line 142) happen in same loop iteration using same `currentBar`

---

#### B. Exit Condition Checks (Lines 403-458)
**Issue:** Multiple methods use intra-bar data

```typescript
403   private checkExitConditions(
404     state: BacktestState,
405     strategy: Strategy,
406     context: EvaluationContext,
407     config: BacktestConfig,
408     customStrategy?: BaseStrategy | null
409   ): void {
410     const positionsToClose: number[] = [];
411
412     for (let i = 0; i < state.positions.length; i++) {
413       const position = state.positions[i];
414       let shouldExit = false;
415       let exitReason: Trade['exitReason'] = 'SIGNAL';
416
417       // Check strategy exit rules (custom or rule-based)
418       if (customStrategy) {
419         if (customStrategy.checkExit(context)) {
420           shouldExit = true;
421           exitReason = 'SIGNAL';
422         }
423       } else {
424         if (ExpressionService.evaluateRules(strategy.exitRules, context)) {
425           shouldExit = true;
426           exitReason = 'SIGNAL';
427         }
428       }
429
430       // Check trailing stop - USES bar.low (INTRA-BAR DATA)
431       if (position.trailingStop && state.currentBar.low <= position.trailingStop) {
432                                     ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
432                                     Uses INTRA-BAR low price
433         shouldExit = true;
434         exitReason = 'TRAILING_STOP';
435       }
436
437       // Check stop loss - USES bar.close (reasonable)
438       if (position.stopLoss && state.currentBar.close <= position.stopLoss) {
439                                ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
438                                Uses close price (acceptable)
439         shouldExit = true;
440         exitReason = 'STOP_LOSS';
441       }
442
443       // Check take profit - USES bar.close (reasonable)
444       if (position.takeProfit && state.currentBar.close >= position.takeProfit) {
445                                  ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
444                                  Uses close price (acceptable)
445         shouldExit = true;
446         exitReason = 'TAKE_PROFIT';
447       }
448
449       if (shouldExit) {
450         this.closePosition(state, i, state.currentBar, exitReason, config);
451         positionsToClose.push(i);
452       }
453     }
454
455     // Remove closed positions (in reverse to maintain indices)
456     for (let i = positionsToClose.length - 1; i >= 0; i--) {
457       state.positions.splice(positionsToClose[i], 1);
458     }
459   }
```

**Key Issues:**
- Line 431: Trailing stop uses `state.currentBar.low` (intra-bar data)
- Line 438: Stop loss uses `state.currentBar.close` (acceptable)
- Line 444: Take profit uses `state.currentBar.close` (acceptable)

---

#### C. Close Position (Lines 554-590)
**Issue:** Always uses bar.close, even when triggered by bar.low

```typescript
554   private closePosition(
555     state: BacktestState,
556     positionIndex: number,
557     bar: OHLCVBar,
558     reason: Trade['exitReason'],
559     config: BacktestConfig
560   ): void {
561     const position = state.positions[positionIndex];
562     const exitPrice = bar.close;  // ← ALWAYS uses bar.close
                ↑
           Inconsistency: If triggered by bar.low (line 431),
           but exit at bar.close - optimistic pricing
562
563     const commission = config.commission || 0;
564
565     const pnl = position.side === 'LONG'
566       ? (exitPrice - position.entryPrice) * position.quantity - commission
567       : (position.entryPrice - exitPrice) * position.quantity - commission;
568
569     const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;
570
571     const trade: Trade = {
572       ticker: position.ticker,
573       side: position.side,
574       entryTimestamp: position.entryTimestamp,
575       entryPrice: position.entryPrice,
576       exitTimestamp: bar.timestamp,
577       exitPrice,
578       quantity: position.quantity,
579       commission,
580       pnl,
581       pnlPercent,
582       exitReason: reason,
583       bars: Math.floor((bar.timestamp - position.entryTimestamp) / (1000 * 60)),
584     };
585
586     state.closedTrades.push(trade);
587     state.cash += exitPrice * position.quantity - commission;
588
589     console.log(`Closed position: ${reason}, PnL: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
590   }
```

**Problem:** 
- If trailing stop triggered by `bar.low` (line 431), but exit at `bar.close` (line 562)
- Creates disconnect between trigger and execution price

---

### 2. Custom Execution Script
**File:** `/Users/edwardkim/Code/ai-backtest/backend/generated-scripts/success/2025-11-11/84f6a55f-9216-4a13-a2f8-e81cd8c439ec-custom-execution.ts`

#### A. Entry Delay (Lines 51-75)
**Issue:** Entry uses bar.open but with quality filters

```typescript
51    function shouldEnterTrade(signal: Signal, bars: any[], signalBarIndex: number): 
      { enter: boolean; entryBarIndex: number } {
52      // Wait 10 minutes (2 bars) after signal for entry delay to avoid initial volatility
53      const delayBars = 2;
54      const potentialEntryIndex = signalBarIndex + delayBars;
55
56      if (potentialEntryIndex >= bars.length) {
57        return { enter: false, entryBarIndex: -1 };
58      }
59
60      // Quality filters: minimum $8 price and 1.5x volume ratio
61      if (signal.metrics.entry_price < 8 || signal.metrics.volume_ratio < 1.5) {
62        return { enter: false, entryBarIndex: -1 };
63      }
64
65      // Look for pullback confirmation in the delay period
66      const signalBar = bars[signalBarIndex];
67      const entryBar = bars[potentialEntryIndex];
68
69      // For gap-fade shorts: ensure price is still below VWAP and showing weakness
70      if (entryBar.close < signal.metrics.vwap && entryBar.close <= entryBar.open) {
71        return { enter: true, entryBarIndex: potentialEntryIndex };
72      }
73
73      return { enter: false, entryBarIndex: -1 };
74    }
```

**Analysis:** Entry happens at bar.open (line 70 checks close then line 119 uses open) - REASONABLE

---

#### B. Exit Detection Loop (Lines 145-236)
**Issue:** Uses bar.high and bar.low to detect exits, but exits at target prices

```typescript
145    for (let i = entryBarIndex + 1; i < bars.length; i++) {
146      const bar = bars[i];
147      highestPrice = Math.max(highestPrice, bar.high);
148      lowestPrice = Math.min(lowestPrice, bar.low);
149
150      const barsHeld = i - entryBarIndex;
151
152      // Check stop loss - USES bar.high (INTRA-BAR DATA)
153      if (bar.high >= stopLoss) {
              ↑↑↑↑↑↑↑↑↑↑ Intra-bar high
154        exitPrice = stopLoss;  // ← But exits at stopLoss target price, not bar.high
155        exitTime = bar.timeOfDay;
156        exitReason = 'stop_loss';
157        break;
158      }
159
160      // Check first target (exit 50%) - USES bar.low (INTRA-BAR DATA)
161      if (position === 1.0 && bar.low <= target1) {
                              ↑↑↑↑↑↑↑↑↑ Intra-bar low
162        partialExits.push({
163          time: bar.timeOfDay,
164          price: target1,     // ← Exits at target1, not bar.low
165          percent: 50,
166          reason: 'target1_2xATR'
167        });
168        position = 0.5;
169
170        // Move stop to breakeven after first target
171        trailingStop = entryPrice;
172
173        // Update trailing stop from peak for remaining position
174        const currentProfit = entryPrice - bar.low;
175        if (currentProfit > highestProfit) {
176          highestProfit = currentProfit;
177          trailingStop = bar.low + (atr * multipliers.trail);
                          ↑↑↑↑↑ Uses intra-bar low for stop calculation
178        }
179      }
180
181      // For remaining 50% position, check second target
182      if (position === 0.5 && bar.low <= target2) {
                              ↑↑↑↑↑↑↑↑↑ Intra-bar low
183        exitPrice = target2;
184        exitTime = bar.timeOfDay;
185        exitReason = 'target2_3.5xATR';
186        partialExits.push({
187          time: bar.timeOfDay,
188          price: target2,
189          percent: 50,
190          reason: 'target2_3.5xATR'
191        });
192        position = 0;
193        break;
194      }
195
196      // Update trailing stop for remaining position
197      if (position === 0.5) {
198        const currentProfit = entryPrice - bar.low;
199                              ↑↑↑↑↑ Uses intra-bar low
200        if (currentProfit > highestProfit) {
201          highestProfit = currentProfit;
202          trailingStop = bar.low + (atr * multipliers.trail);
                          ↑↑↑↑↑ Uses intra-bar low
203        }
204
205        // Check trailing stop
206        if (bar.high >= trailingStop) {
              ↑↑↑↑↑↑↑ Intra-bar high
207          exitPrice = trailingStop;
208          exitTime = bar.timeOfDay;
209          exitReason = 'trailing_stop';
210          break;
211        }
212      }
213
214      // Check momentum fade for holds beyond 2 hours
215      if (position > 0 && checkMomentumFade(bars, i, entryBarIndex)) {
216        exitPrice = bar.close;  // ← Uses close (reasonable)
217        exitTime = bar.timeOfDay;
218        exitReason = 'momentum_fade';
219        break;
220      }
221
222      // Maximum hold time (4 hours)
223      if (barsHeld >= maxHoldBars) {
224        exitPrice = bar.close;  // ← Uses close (reasonable)
225        exitTime = bar.timeOfDay;
226        exitReason = 'max_hold_time';
227        break;
228      }
229
230      // End of day exit
231      if (i === bars.length - 1) {
232        exitPrice = bar.close;  // ← Uses close (reasonable)
233        exitTime = bar.timeOfDay;
234        exitReason = 'end_of_day';
235        break;
236      }
237    }
```

**Key Issues:**
- Line 153: Detects stop loss using `bar.high` (intra-bar data)
- Line 161: Detects target using `bar.low` (intra-bar data)
- Line 164: Exits at target price (not actual bar.low - acceptable)
- Line 174-177: Uses `bar.low` to calculate trailing stop
- Line 182: Detects second target using `bar.low`
- Line 198-202: Uses `bar.low` for profit calculations
- Line 206: Checks trailing stop using `bar.high`

---

### 3. Entry Bar Handling (Line 123)
**File:** Same custom script

```typescript
118    const entryBar = bars[entryBarIndex];
119    const entryPrice = entryBar.open;  // ← Entry at bar.open (reasonable)
       ↑
    Entry uses open price of entry bar
    This is the bar AFTER signal bar (line 54: signalBarIndex + delayBars)
    So it's not same-bar entry
120
121    // Gap-fade short pattern: price gaps up, we short the fade back down
122    const side: 'LONG' | 'SHORT' = 'SHORT';
```

**Analysis:** Entry at bar.open is REASONABLE, but then exits can happen on next bar (line 145: `i = entryBarIndex + 1`)

---

## Summary of Problem Locations

### Direct Intra-Bar Usage (HIGH RISK)

1. **backtest.service.ts, Line 431:**
   ```
   if (position.trailingStop && state.currentBar.low <= position.trailingStop)
                                 ↑ Intra-bar low
   ```

2. **custom-execution.ts, Line 153:**
   ```
   if (bar.high >= stopLoss)
      ↑ Intra-bar high
   ```

3. **custom-execution.ts, Lines 161, 182:**
   ```
   if (bar.low <= target1)
      ↑ Intra-bar low
   ```

### Same-Bar Entry/Exit (MODERATE RISK)

1. **backtest.service.ts, Lines 137-142:**
   - Exit check happens before entry check
   - Both on same bar iteration
   - Both could use same `currentBar`

2. **custom-execution.ts, Line 145:**
   - Loop starts at `entryBarIndex + 1`
   - So exits happen AFTER entry bar
   - But on subsequent bars (not same-bar)

---

## Data Flow Example

### How The Iteration 3 Trade Could Work

```
Signal Time: 10:25

Bar 1 (10:25-10:30):
  - Signal detected at bar open
  - No entry yet (delayBars = 2)

Bar 2 (10:30-10:35): [ENTRY BAR]
  - Open: 1.070
  - High: 1.11 (unknown at entry time 10:30:00)
  - Low: 1.065 (unknown at entry time 10:30:00)
  - Close: 1.101
  
Entry Logic:
  - Check entry at line 70: "entry.close < vwap && entry.close <= entry.open"
  - Check: 1.101 < 1.10? → NO (assuming vwap ~1.10)
  - But code uses bar.open for entryPrice (line 119)
  - Wait, line 70 checks close, line 119 uses open
  - So if close is too high, might not enter

Exit Logic (on same Bar 2):
  - Line 153: "bar.high >= stopLoss" → 1.11 >= stopLoss? → Depends on stop level
  - Line 161: "bar.low <= target1" → 1.065 <= target1? → Depends on target
  - But exit price set to target (line 164), not actual low
  
Result if it exits:
  - Entry: 1.070 (bar.open)
  - Exit: ~1.101 (bar.close or calculated target)
  - Same bar: YES (Bar 2)
  - Intra-bar data used: YES (high=1.11, low=1.065)
```

---

**Date:** 2025-11-11
**Investigation Complete**
