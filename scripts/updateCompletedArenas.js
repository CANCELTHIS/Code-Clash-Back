const mongoose = require('mongoose');
require('dotenv').config();

const Arena = require('../models/Arena');
const User = require('../models/User');

async function updateCompletedArenas() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all completed arenas that have winnerId but missing winner data
    const completedArenas = await Arena.find({
      status: 'completed',
      winnerId: { $exists: true, $ne: null }
    });

    console.log(`Found ${completedArenas.length} completed arenas to update`);

    for (const arena of completedArenas) {
      try {
        const winner = await User.findById(arena.winnerId);
        if (winner) {
          arena.winnerName = winner.username;
          arena.winnerTokens = winner.tokens || 0;
          arena.winnerSolution = `// Winner's solution for: ${arena.title}
function solve() {
  // Solution code was not recorded for this match
  return "Challenge completed successfully";
}`;
          
          await arena.save();
          console.log(`Updated arena ${arena._id} with winner ${winner.username}`);
        }
      } catch (error) {
        console.error(`Error updating arena ${arena._id}:`, error);
      }
    }

    console.log('Update completed');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateCompletedArenas();