const express = require('express');
const matchmakingService = require('../services/matchmakingService');
const auth = require('../middleware/auth');

const router = express.Router();

// Quick Match - Find or create a match
router.post('/quick-match', auth, async (req, res) => {
  try {
    await matchmakingService.ensureAvailableArenas();
    
    const Arena = require('../models/Arena');
    const availableArena = await Arena.findOne({
      status: 'upcoming',
      'participants.1': { $exists: false }
    });

    if (availableArena) {
      // Join the available arena
      const alreadyJoined = availableArena.participants.some(p => 
        p.userId.toString() === req.user._id.toString()
      );

      if (!alreadyJoined) {
        availableArena.participants.push({ userId: req.user._id });
        await availableArena.save();
      }

      res.json({
        arenaId: availableArena._id,
        message: 'Matched successfully',
        arena: {
          title: availableArena.title,
          description: availableArena.description,
          startTime: availableArena.startTime,
          tokenPrize: availableArena.tokenPrize
        }
      });
    } else {
      res.status(404).json({ error: 'No available matches' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;