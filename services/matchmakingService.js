const aiService = require("./aiService");
const Arena = require("../models/Arena");

class MatchmakingService {
  constructor() {
    this.categories = ['Arrays', 'Strings', 'Math', 'Logic', 'Algorithms'];
    this.difficulties = ['Easy', 'Medium', 'Hard'];
    this.challengeTemplates = {
      Arrays: {
        Easy: 'Find the maximum number in an array',
        Medium: 'Remove duplicates from an array',
        Hard: 'Find the longest increasing subsequence'
      },
      Strings: {
        Easy: 'Reverse a string',
        Medium: 'Check if a string is a palindrome',
        Hard: 'Find the longest common substring'
      },
      Math: {
        Easy: 'Check if a number is prime',
        Medium: 'Calculate factorial of a number',
        Hard: 'Find the nth Fibonacci number efficiently'
      },
      Logic: {
        Easy: 'Check if a number is even or odd',
        Medium: 'Implement FizzBuzz logic',
        Hard: 'Solve the Tower of Hanoi problem'
      },
      Algorithms: {
        Easy: 'Implement binary search',
        Medium: 'Sort an array using merge sort',
        Hard: 'Find shortest path in a graph'
      }
    };
  }

  async generateRandomArena() {
    try {
      const category = this.categories[Math.floor(Math.random() * this.categories.length)];
      const difficulty = this.difficulties[Math.floor(Math.random() * this.difficulties.length)];
      const description = this.challengeTemplates[category][difficulty];
      
      const entryFees = { Easy: 10, Medium: 25, Hard: 50 };
      const prizes = { Easy: 100, Medium: 250, Hard: 500 };
      
      const startTime = new Date(Date.now() + Math.random() * 30 * 60 * 1000);

      const arena = new Arena({
        title: `${difficulty} ${category} Challenge`,
        description,
        category,
        difficulty,
        entryFee: entryFees[difficulty],
        startTime,
        tokenPrize: prizes[difficulty],
        hostId: null,
        status: "upcoming",
      });

      await arena.save();

      arena.testCases = [{
        input: "code",
        expectedOutput: "pass",
        description: "Complete the task",
      }];
      await arena.save();

      return arena;
    } catch (error) {
      console.error("Failed to generate arena:", error);
      throw error;
    }
  }

  async ensureAvailableArenas() {
    try {
      const upcomingArenas = await Arena.find({ status: "upcoming" });

      if (upcomingArenas.length < 10) {
        for (let i = upcomingArenas.length; i < 10; i++) {
          await this.generateRandomArena();
        }
      }
    } catch (error) {
      console.error("Failed to ensure available arenas:", error);
    }
  }
  
  async checkExpiredArenas() {
    try {
      const now = new Date();
      
      // Find arenas that should become active
      const arenasToActivate = await Arena.find({
        startTime: { $lte: now },
        status: 'upcoming'
      });
      
      // Start matches that have reached their start time
      await Arena.updateMany(
        { startTime: { $lte: now }, status: 'upcoming' },
        { status: 'active' }
      );
      
      // Notify users about activated arenas
      const io = require('../server').io;
      if (io) {
        arenasToActivate.forEach(arena => {
          io.of('/arena').to(arena._id.toString()).emit('arena_activated', {
            arenaId: arena._id.toString(),
            startTime: arena.startTime
          });
          console.log(`Arena ${arena._id} activated and users notified`);
        });
      }
      
      // Complete matches that have been active for 30 minutes
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      await Arena.updateMany(
        { startTime: { $lt: thirtyMinutesAgo }, status: 'active' },
        { status: 'completed' }
      );
      
      await this.ensureAvailableArenas();
    } catch (error) {
      console.error('Failed to check expired arenas:', error);
    }
  }
}

module.exports = new MatchmakingService();
