const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const arenaRoutes = require('./routes/arenas');
const userRoutes = require('./routes/users');
const matchmakingRoutes = require('./routes/matchmaking');
const leaderboardRoutes = require('./routes/leaderboard');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/arenas', arenaRoutes);
app.use('/users', userRoutes);
app.use('/matchmaking', matchmakingRoutes);
app.use('/leaderboard', leaderboardRoutes);

// Simple matchmaking queue
let waitingPlayer = null;
const activeMatches = new Map();

// Socket.io connection handling
io.of('/arena').on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_queue', async (data) => {
    console.log(`User ${data.userId} wants to join queue`);
    
    if (!waitingPlayer) {
      // First player - wait for opponent
      waitingPlayer = { socket, userId: data.userId };
      console.log(`User ${data.userId} is waiting for opponent`);
    } else if (waitingPlayer.userId !== data.userId) {
      // Second player - create match
      const player1 = waitingPlayer;
      const player2 = { socket, userId: data.userId };
      
      console.log(`Creating match between ${player1.userId} and ${player2.userId}`);
      
      try {
        const matchmakingService = require('./services/matchmakingService');
        const arena = await matchmakingService.generateRandomArena();
        
        // Add both players
        const mongoose = require('mongoose');
        arena.participants.push(
          { userId: new mongoose.Types.ObjectId(player1.userId) },
          { userId: new mongoose.Types.ObjectId(player2.userId) }
        );
        arena.status = 'active';
        arena.startTime = new Date();
        await arena.save();
        
        // Track match
        activeMatches.set(arena._id.toString(), {
          players: [player1.userId, player2.userId]
        });
        
        // Notify both players
        player1.socket.emit('match_found', { arenaId: arena._id });
        player2.socket.emit('match_found', { arenaId: arena._id });
        
        // Clear waiting player
        waitingPlayer = null;
        
        console.log(`Match created: ${arena._id}`);
      } catch (error) {
        console.error('Failed to create match:', error);
        // Reset on error
        waitingPlayer = null;
      }
    }
  });

  socket.on('leave_queue', (data) => {
    if (waitingPlayer && waitingPlayer.userId === data.userId) {
      waitingPlayer = null;
      console.log(`User ${data.userId} left queue`);
    }
  });

  socket.on('join_match', async (data) => {
    socket.join(data.arenaId);
    
    try {
      const Arena = require('./models/Arena');
      const arena = await Arena.findById(data.arenaId);
      
      if (arena) {
        // Check how many users are in this room
        const room = io.of('/arena').adapter.rooms.get(data.arenaId);
        const userCount = room ? room.size : 0;
        
        console.log(`Users in arena ${data.arenaId}: ${userCount}`);
        
        if (userCount === 2 && arena.status === 'upcoming') {
          // 2 players joined - start match immediately
          const matchStartTime = new Date();
          await Arena.findByIdAndUpdate(data.arenaId, {
            status: 'active',
            startTime: matchStartTime
          });
          
          io.of('/arena').to(data.arenaId).emit('match_start', {
            message: 'Both players joined! Match starting...',
            startTime: matchStartTime
          });
          console.log(`Match started immediately for arena ${data.arenaId}`);
        } else if (arena.status === 'active') {
          // Match already active, start for this user
          socket.emit('match_start', {
            message: 'Joining active match!',
            startTime: arena.startTime
          });
        }
      }
    } catch (error) {
      console.error('Error checking arena status:', error);
    }
    
    socket.to(data.arenaId).emit('user_joined', {
      userId: data.userId,
      matchId: data.matchId
    });
  });

  socket.on('code_update', (data) => {
    socket.to(data.arenaId).emit('code_update', {
      userId: data.userId,
      code: data.code
    });
  });

  socket.on('match_start', (data) => {
    io.of('/arena').to(data.arenaId).emit('match_start', {
      animation: 'start',
      matchId: data.matchId
    });
  });

  socket.on('player_finished', async (data) => {
    const { arenaId, userId, completionTime, passed, code } = data;
    console.log(`🏁 Player finished: ${userId}, passed: ${passed}`);
    console.log(`💻 Winner's code length:`, code ? code.length : 0);
    console.log(`💻 Winner's code preview:`, code ? code.substring(0, 100) + '...' : 'No code');
    
    if (!passed) {
      console.log('Player did not pass, not processing as winner');
      return;
    }
    
    try {
      const Arena = require('./models/Arena');
      const User = require('./models/User');
      
      console.log(`🔍 Looking for arena ${arenaId} without winner...`);
      
      const arena = await Arena.findOneAndUpdate(
        { _id: arenaId, winnerId: null },
        { 
          winnerId: userId, 
          status: 'completed', 
          endTime: new Date(),
          winnerSolution: code || '// Solution code not available'
        },
        { new: true }
      );
      
      if (!arena) {
        console.log(`⚠️ Arena ${arenaId} not found or already has winner`);
        return;
      }
      
      console.log(`💾 Arena updated:`, {
        winnerId: arena.winnerId,
        winnerSolution: arena.winnerSolution ? 'Present' : 'Missing',
        status: arena.status
      });
      
      if (arena) {
        console.log(`🏆 ${userId} is the WINNER!`);
        
        // Award tokens and get winner data
        const user = await User.findById(userId);
        if (user) {
          user.tokens = (user.tokens || 0) + arena.tokenPrize;
          await user.save();
          console.log(`🪙 Awarded ${arena.tokenPrize} tokens to ${userId}. New total: ${user.tokens}`);
          
          // Update arena with winner info
          arena.winnerName = user.username;
          arena.winnerTokens = user.tokens;
          await arena.save();
          
          console.log(`💾 Stored winner info: ${user.username}, ${user.tokens} tokens`);
        }
        
        // Send events
        socket.emit('you_won', { tokensAwarded: arena.tokenPrize });
        socket.to(arenaId).emit('you_lost', { message: 'Opponent won!' });
        io.of('/arena').to(arenaId).emit('match_ended', { winnerId: userId });
        
        console.log(`✅ Winner events sent: ${arena.tokenPrize} tokens awarded`);
        
        console.log(`✅ Events sent for arena ${arenaId}`);
      }
    } catch (error) {
      console.error('Error processing winner:', error);
    }
  });

  socket.on('send_message', (data) => {
    // Broadcast message to all users in the arena
    io.of('/arena').to(data.arenaId).emit('chat_message', {
      userId: data.userId,
      username: data.username,
      message: data.message,
      timestamp: data.timestamp
    });
  });

  socket.on('typing_start', (data) => {
    socket.to(data.arenaId).emit('user_typing', {
      userId: data.userId,
      username: data.username,
      isTyping: true
    });
  });

  socket.on('typing_stop', (data) => {
    socket.to(data.arenaId).emit('user_typing', {
      userId: data.userId,
      username: data.username,
      isTyping: false
    });
  });

  socket.on('disconnect', () => {
    if (waitingPlayer && waitingPlayer.socket === socket) {
      waitingPlayer = null;
      console.log(`Waiting player disconnected: ${socket.id}`);
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    // Initialize matchmaking service
    const matchmakingService = require('./services/matchmakingService');
    matchmakingService.ensureAvailableArenas();
    
    // Check expired arenas and generate new ones every 2 minutes
    setInterval(() => {
      matchmakingService.checkExpiredArenas();
    }, 2 * 60 * 1000);
  })
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export io for use in other modules
module.exports = { io };