module.exports = {
  apps: [
    {
      name: 'api-server',
      script: 'bun',
      args: '--watch src/services/server.ts',
      cwd: __dirname,
      env: {
        PORT: 4000,
        NODE_ENV: 'development',
      },
    },
    {
      name: 'markets',
      script: 'bun',
      args: '--watch src/services/markets.ts',
      cwd: __dirname,
      env: {
        FETCH_INTERVAL_MS: 3600000,
        NODE_ENV: 'development',
      },
    },
    {
      name: 'pipeline',
      script: 'bun',
      args: '--watch src/main.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'frontend',
      script: 'bun',
      args: 'run dev',
      cwd: __dirname + '/frontend',
      env: {
        PORT: 3001,
        NODE_ENV: 'development',
      },
    },
  ],
};
