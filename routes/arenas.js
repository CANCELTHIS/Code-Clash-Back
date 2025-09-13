const express = require('express');
const Arena = require('../models/Arena');
const User = require('../models/User');
const auth = require('../middleware/auth');
const aiService = require('../services/aiService');
const codeEvaluationService = require('../services/codeEvaluationService');

const router = express.Router();

// Create Arena
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, startTime, tokenPrize } = req.body;

    const arena = new Arena({
      title,
      description,
      startTime: new Date(startTime),
      tokenPrize,
      hostId: req.user._id
    });

    await arena.save();

    res.status(201).json({
      arenaId: arena._id,
      title: arena.title,
      description: arena.description,
      startTime: arena.startTime,
      tokenPrize: arena.tokenPrize,
      hostId: arena.hostId
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get Arenas
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    
    if (status) {
      filter.status = status;
    }

    const arenas = await Arena.find(filter)
      .populate('hostId', 'username')
      .sort({ startTime: 1 });

    const arenasWithParticipants = arenas.map(arena => ({
      arenaId: arena._id,
      _id: arena._id,
      title: arena.title,
      description: arena.description,
      category: arena.category,
      difficulty: arena.difficulty,
      startTime: arena.startTime,
      tokenPrize: arena.tokenPrize,
      hostId: arena.hostId,
      participants: arena.participants.length,
      status: arena.status,
      winnerName: arena.winnerName,
      winnerTokens: arena.winnerTokens,
      winnerSolution: arena.winnerSolution
    }));

    res.json(arenasWithParticipants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Single Arena
router.get('/:arenaId', async (req, res) => {
  try {
    const arena = await Arena.findById(req.params.arenaId)
      .populate('hostId', 'username');
    
    if (!arena) {
      return res.status(404).json({ error: 'Arena not found' });
    }

    res.json({
      arenaId: arena._id,
      _id: arena._id,
      title: arena.title,
      description: arena.description,
      category: arena.category,
      difficulty: arena.difficulty,
      startTime: arena.startTime,
      tokenPrize: arena.tokenPrize,
      hostId: arena.hostId,
      participants: arena.participants.length,
      testCases: arena.testCases,
      status: arena.status,
      winnerName: arena.winnerName,
      winnerTokens: arena.winnerTokens,
      winnerSolution: arena.winnerSolution
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join Arena
router.post('/:arenaId/join', auth, async (req, res) => {
  try {
    const arenaId = req.params.arenaId;
    const userId = req.user._id;
    
    console.log('Join arena request:', arenaId, 'by user:', userId);
    
    // Validate ObjectId format
    if (!arenaId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid arena ID format' });
    }
    
    const arena = await Arena.findById(arenaId);
    
    if (!arena) {
      console.log('Arena not found:', arenaId);
      return res.status(404).json({ error: 'Arena not found' });
    }
    
    console.log('Arena found:', arena.title, 'status:', arena.status, 'participants:', arena.participants.length);

    // Check if already joined
    const alreadyJoined = arena.participants.some(p => p.userId.toString() === userId.toString());
    if (alreadyJoined) {
      console.log('User already joined');
      return res.json({ message: 'Already joined', status: 'joined' });
    }

    // Add user to arena
    arena.participants.push({ userId });
    arena.participantCount = arena.participants.length;
    await arena.save();
    
    console.log('User joined successfully');

    res.json({
      message: 'Joined successfully',
      status: 'joined',
      participants: arena.participants.length
    });
  } catch (error) {
    console.error('Join arena error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Generate Test Cases
router.post('/:arenaId/test-cases', auth, async (req, res) => {
  try {
    const { description } = req.body;
    const arena = await Arena.findById(req.params.arenaId);

    if (!arena) {
      return res.status(404).json({ error: 'Arena not found' });
    }

    if (arena.hostId.toString() !== req.user._id.toString()) {
      return res.status(401).json({ error: 'Only arena host can generate test cases' });
    }

    // Generate test cases using AI service
    const testCases = await aiService.generateTestCases(description);

    arena.testCases = testCases;
    await arena.save();

    res.json({
      testCases,
      arenaId: arena._id
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Submit Code
router.post('/:arenaId/submit', auth, async (req, res) => {
  try {
    const { code, language } = req.body;
    console.log('=== SUBMIT CODE ===');
    console.log('Arena ID:', req.params.arenaId);
    console.log('Code:', code);
    console.log('Language:', language);
    
    const arena = await Arena.findById(req.params.arenaId);

    if (!arena) {
      return res.status(404).json({ error: 'Arena not found' });
    }
    
    console.log('Arena test cases:', arena.testCases);

    // Use AI-powered code evaluation
    const evaluation = await codeEvaluationService.evaluateCode(code, arena.testCases, language, arena.description);
    console.log('Evaluation result:', evaluation);

    const allPassed = evaluation.results.every(r => r.passed);
    console.log('All tests passed:', allPassed, 'Score:', evaluation.score);
    
    res.json({
      results: evaluation.results,
      score: evaluation.score,
      totalTests: evaluation.results.length,
      allPassed: allPassed
    });
  } catch (error) {
    console.error('Submit code error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Award Rewards
router.post('/:arenaId/rewards', auth, async (req, res) => {
  try {
    const { userId, score, rank } = req.body;
    const arena = await Arena.findById(req.params.arenaId);

    if (!arena || arena.hostId.toString() !== req.user._id.toString()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Award badges and tokens based on rank
    const badges = [];
    let tokens = 0;

    if (rank === 1) {
      badges.push('Gold Medal');
      tokens = arena.tokenPrize;
    } else if (rank === 2) {
      badges.push('Silver Medal');
      tokens = Math.floor(arena.tokenPrize * 0.5);
    } else if (rank === 3) {
      badges.push('Bronze Medal');
      tokens = Math.floor(arena.tokenPrize * 0.25);
    }

    user.badges.push(...badges);
    user.tokens += tokens;
    user.matches.push({
      arenaId: arena._id,
      score,
      rank
    });

    await user.save();

    res.json({
      userId: user._id,
      badges,
      tokens
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;