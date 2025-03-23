// Path: models/Room.js

import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, required: true },
  players: [
    {
      id: String,
      name: String,
      isHost: Boolean,
      isAvailable: Boolean,
    },
  ],
});

export default mongoose.model("Room", roomSchema);
