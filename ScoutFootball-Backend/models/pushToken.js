const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
  token:        { type: String, required: true, unique: true },
  prefs:        { daily: Boolean, favTeam: Boolean, featured: Boolean },
  watchedTeams: [String],
  updatedAt:    { type: Date, default: Date.now },
});

module.exports = mongoose.models.PushToken || mongoose.model('PushToken', pushTokenSchema);
