const mongoose = require('mongoose');

const cacheSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true },
  data:      mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true },
});

module.exports = mongoose.models.Cache || mongoose.model('Cache', cacheSchema);
