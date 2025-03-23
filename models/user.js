//Path: models/user.js

import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  prenom: {
    type: String,
    required: true,
  },
  nom: {
    type: String,
    required: true,
  },
});

const User = mongoose.model("User", userSchema);

export default User;
