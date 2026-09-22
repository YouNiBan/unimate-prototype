const { expo } = require('./app.json');

module.exports = () => ({
  ...expo,
  experiments: {
    ...(expo.experiments || {}),
    ...(process.env.GITHUB_PAGES === 'true' ? { baseUrl: '/unimate-prototype' } : {}),
  },
});
