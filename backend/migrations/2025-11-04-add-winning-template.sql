-- Add winning template tracking to agent iterations
-- This allows us to know which execution template performed best during learning

-- Add winning_template column to track which template won
ALTER TABLE agent_iterations ADD COLUMN winning_template TEXT;

-- Add exit_strategy_config to trading_agents for paper trading
ALTER TABLE trading_agents ADD COLUMN exit_strategy_config TEXT; -- JSON

-- Comments for future reference:
-- winning_template values: 'conservative', 'aggressive', 'intraday_time', 'atr_adaptive', 'price_action'
-- exit_strategy_config JSON format:
-- {
--   "template": "price_action",
--   "stopLossPercent": null,      -- Fixed stop loss % (null = use template default)
--   "takeProfitPercent": null,    -- Fixed take profit % (null = use template default)
--   "trailingStopPercent": 2.0,   -- For price_action template
--   "exitTime": "15:55",          -- For intraday_time template
--   "atrMultiplier": 2.0          -- For atr_adaptive template
-- }
