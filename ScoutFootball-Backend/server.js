const app = require('./app');

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`ScoutFootball Backend calisiyor: port ${PORT}`));
}

module.exports = app;
