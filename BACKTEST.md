what is a backtest:
take alerts and their entry price resolve if market according to markets.json has a winner.
dont resolve if not dont account it to pnl

strategies:
- you could have different entries min max  or between  based on the alerts
- profit is resolved markets plus win
- money spent includes all money spent

  4. Potential Duplicate Processing - Running backtest multiple times without reset could double-count alerts.
  3. Race Condition in Filters - Rapid filter changes can cause interleaved async operations leading to incons
     ent PnL state.

  8. Memory leak potential in interval-based effects

BACKTEST ONLY 
5. Misleading Bet Sizing Label - UI says "$10/Trade" but TARGET_PAYOUT mode actually varies cost based on en
     price (from $0.10 to $10).
  6. Missing Price Validation - No guard against minPrice > maxPrice in some code paths.

The winner inference bug (#2) is the most serious - it means any backtest on markets that haven't fully reso
  lved (price between 0.05-0.98) will incorrectly count those as losses instead of excluding them or marking a
  s pending.


HOW TO NOT BREAK REACT USE CONTEXT STATE FOR GLOBAL SETTINGS AND ALL ALERTS