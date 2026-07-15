function scoreForEpisodeReview(selectedScore, existingScore) {
  return selectedScore ?? existingScore;
}

module.exports = { scoreForEpisodeReview };
