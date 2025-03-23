// Path: routes/signup.js

import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/user.js";
import { body, validationResult } from "express-validator";

const router = express.Router();

//l'inscription
router.post(
  "/",
  [
    body("email").isEmail().withMessage("Email invalide"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Mot de passe trop court, minimum 6 caractères"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { prenom, nom, email, password } = req.body;

    try {
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: "Email déjà utilisé" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new User({
        prenom,
        nom,
        email,
        password: hashedPassword,
      });

      await newUser.save();

      res.status(201).json({ message: "Utilisateur créé avec succès" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
);

export default router;
