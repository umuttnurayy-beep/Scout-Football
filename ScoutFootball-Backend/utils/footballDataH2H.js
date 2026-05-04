function teamId(team) {
  const id = Number(team?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeTeamName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function teamMatchesTarget(team, target) {
  const id = teamId(team);
  const targetId = teamId(target);
  if (id && targetId) return id === targetId;

  const names = [team?.name, team?.shortName, team?.tla]
    .map(normalizeTeamName)
    .filter(Boolean);
  const targetNames = [target?.name, target?.shortName, target?.tla]
    .map(normalizeTeamName)
    .filter(Boolean);

  return names.some(name => targetNames.includes(name));
}

function hasTeamPair(match, homeTeam, awayTeam) {
  const matchHome = match?.homeTeam || {};
  const matchAway = match?.awayTeam || {};
  return (
    teamMatchesTarget(matchHome, homeTeam) && teamMatchesTarget(matchAway, awayTeam)
  ) || (
    teamMatchesTarget(matchHome, awayTeam) && teamMatchesTarget(matchAway, homeTeam)
  );
}

function isFinishedMatch(match) {
  return String(match?.status || '').toUpperCase() === 'FINISHED';
}

function deriveH2HFromTeamMatches({ homeForm = [], awayForm = [], homeTeam, awayTeam, currentMatchId, limit = 10 }) {
  const seen = new Set();
  const combined = [];

  for (const match of [...homeForm, ...awayForm]) {
    const id = Number(match?.id) || String(match?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    combined.push(match);
  }

  return combined
    .filter(match => String(match?.id) !== String(currentMatchId || ''))
    .filter(isFinishedMatch)
    .filter(match => hasTeamPair(match, homeTeam, awayTeam))
    .sort((a, b) => new Date(b.utcDate || 0) - new Date(a.utcDate || 0))
    .slice(0, limit);
}

module.exports = {
  deriveH2HFromTeamMatches,
  hasTeamPair,
};
