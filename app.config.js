module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments || {}),
    ...(process.env.GITHUB_PAGES === 'true' ? { baseUrl: '/unimate-prototype' } : {}),
  },
});
