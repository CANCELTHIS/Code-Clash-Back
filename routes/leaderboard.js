const express = require('express');
const User = require('../models/User');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const leaderboard = await User.find({})
      .select('username tokens matches')
      .sort({ tokens: -1 })
      .limit(10);

    const formattedLeaderboard = leaderboard.map((user, index) => ({
      rank: index + 1,
      username: user.username,
      tokens: user.tokens || 0,
      wins: user.matches.filter(m => m.result === 'won').length,
      totalMatches: user.matches.length
    }));

    res.json(formattedLeaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;