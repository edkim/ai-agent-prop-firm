/**
 * PM2 Ecosystem Configuration
 *
 * Manages the AI Backtest Platform backend process with:
 * - Auto-restart on crashes
 * - Log management
 * - Environment variables
 * - Resource monitoring
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop ai-backtest
 *   pm2 restart ai-backtest
 *   pm2 logs ai-backtest
 *   pm2 monit
 */

module.exports = {
  apps: [{
    // Application name
    name: 'ai-backtest-backend',

    // Script to start
    script: 'npm',
    args: 'start',

    // Working directory
    cwd: '/var/www/ai-backtest/backend',

    // Interpreter
    interpreter: 'none',  // Use npm directly

    // Instances (0 = auto-scale to CPU cores, 1 = single instance)
    instances: 1,

    // Execution mode
    exec_mode: 'fork',  // 'cluster' for load balancing, 'fork' for single process

    // Auto-restart configuration
    autorestart: true,
    watch: false,  // Set to true for development to auto-restart on file changes
    max_memory_restart: '1G',  // Restart if memory exceeds 1GB

    // Error handling
    min_uptime: '10s',  // Min uptime before considered unstable
    max_restarts: 10,  // Max restarts within 1 minute
    restart_delay: 4000,  // Delay between restarts (ms)

    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_PATH: '/var/www/ai-backtest/backend/backtesting.db',
      LOG_LEVEL: 'info'
    },

    // Log configuration
    error_file: '/var/log/ai-backtest/error.log',
    out_file: '/var/log/ai-backtest/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    combine_logs: true,
    merge_logs: true,

    // Advanced options
    listen_timeout: 10000,  // Timeout for app to listen (ms)
    kill_timeout: 5000,  // Time to wait before force killing (ms)

    // Source map support
    source_map_support: true,

    // Instance configuration
    instance_var: 'INSTANCE_ID',

    // Monitoring
    pmx: true,

    // Post-deployment hooks
    post_update: ['npm install', 'npm run build'],

    // Cron restart (restart daily at 3am)
    cron_restart: '0 3 * * *',

    // Graceful shutdown
    wait_ready: false,
    shutdown_with_message: false
  }],

  // Deployment configuration (optional - for PM2 deploy feature)
  deploy: {
    production: {
      user: 'appuser',
      host: 'YOUR_SERVER_IP',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/ai-backtest.git',
      path: '/var/www/ai-backtest',
      'post-deploy': 'cd backend && npm install && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
