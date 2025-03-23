import mongoose from "mongoose";

const gameSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
  },
  players: [
    {
      name: { type: String, required: true },
      isHost: { type: Boolean, default: false },
      isAvailable: { type: Boolean, default: true },
      hand: [
        {
          valeur: { type: String },
          couleur: { type: String },
          _id: false,
        },
      ],
      score: { type: Number, default: 0 },
    },
  ],
  deck: [
    {
      valeur: { type: String },
      couleur: { type: String },
      _id: false,
    },
  ],
  currentCard: {
    valeur: { type: String },
    couleur: { type: String },
    _id: false,
  },

  currentPlayerIndex: {
    type: Number,
    default: 0,
  },

  direction: { type: Number, default: 1 },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  // vous pouvez ajouter d'autres champs : state, deck, etc.
});

export default mongoose.model("Game", gameSchema);
