const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Get User Profile
router.get('/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user._id,
      username: user.username,
      badges: user.badges,
      tokens: user.tokens,
      matches: user.matches
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;