const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // Dev-friendly schema sync. For a production deployment, replace this
    // with proper migrations (e.g. sequelize-cli or umzug).
    await sequelize.sync({ alter: true });
    console.log('Database schema synced.');

    app.listen(PORT, () => {
      console.log(`Max Dental backend listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
