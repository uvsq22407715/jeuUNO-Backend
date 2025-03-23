import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import userRoutes from "./routes/signup.js";
import loginRoutes from "./routes/login.js";
import { setupRoomHandlers } from "./routes/roomHandlers.js";
import { setupJeuHandlers } from "./routes/jeuHandlers.js";

dotenv.config();

// ✅ Initialisation d'Express
const app = express();
app.use(
  cors({
    origin: "http://localhost:8080",
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());

// ✅ Connexion MongoDB (Atlas)
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
  console.error("❌ MongoDB URI non défini dans `.env`");
  process.exit(1);
}

mongoose
  .connect(mongoURI)
  .then(() => console.log("✅ Connecté à MongoDB Atlas"))
  .catch((err) => console.error("❌ Erreur MongoDB:", err));

// ✅ Définition des routes API
app.use("/api/signup", userRoutes);
app.use("/api/login", loginRoutes);

// ✅ Création du serveur HTTP et WebSocket
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:8080",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// 🎧 **Gestion des connexions Socket.io**
io.on("connection", (socket) => {
  setupRoomHandlers(io, socket); // 🚧 Gestion des rooms
  setupJeuHandlers(io, socket); // 🚧 Gestion des parties
});

// 🎯 **Démarrer le serveur**
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});
