import Room from "../models/Room.js";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const activeRooms = {};

export function setupRoomHandlers(io, socket) {
  // Création d'une room
  socket.on("create-room", async ({ roomName, token, pname }) => {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (!user) {
        return socket.emit("room-error", "Utilisateur non authentifié");
      }

      const playerName = pname;

      // Générer un code unique pour la room
      const code = uuidv4().substring(0, 6).toUpperCase();

      const name = roomName;

      // Création de l'objet room
      const newRoom = new Room({
        name,
        code,
        players: [{ name: playerName, isHost: true, isAvailable: true }],
      });

      // Sauvegarde la room dans MongoDB
      await newRoom.save();

      // Ajouter la room en mémoire
      activeRooms[code] = { players: [{ name: playerName, isHost: true }] };

      socket.join(code);
      io.to(code).emit("room-updated", activeRooms[code]);
      socket.emit("room-created", code);
    } catch (error) {
      socket.emit("room-error", "Erreur serveur");
    }
  });

  // Rejoindre une room existante
  socket.on("join-room", async ({ roomCode, token, name }) => {
    console.log("Step 1: Received join-room event"); // Step 1

    let user;
    try {
        user = jwt.verify(token, process.env.JWT_SECRET);
        console.log("user is: ");
        console.log(user)
    } catch (error) {
        console.log("Step 2: Failed to verify token"); // Step 2
        return socket.emit("room-error", "Utilisateur non authentifié");
    }

    if (!user) {
        console.log("Step 3: Token verification returned no user"); // Step 3
        return socket.emit("room-error", "Utilisateur non authentifié");
    }

    const playerName = name;

    try {
        roomCode = roomCode.toString(); // Convert roomCode to string

        const room = await Room.findOne({ code: roomCode });
        if (!room) {
            return socket.emit("room-error", "Room introuvable");
        }

        console.log("Step 7: Room found, checking player existence"); // Step 7
        if (room.players.some((player) => player.name === playerName)) {
            console.log("Step 8: Player already in room: ", playerName); // Step 8
            return socket.emit("room-error", "Vous êtes déjà dans cette room");
        }

        if (room.players.length >= 4) {
            console.log("Step 9: Room is full with players: ", room.players.length); // Step 9
            return socket.emit("room-error", "La room est pleine");
        }

        console.log("Step 10: Adding player to room"); // Step 10
        room.players.push({ name: playerName, isHost: false });
        await room.save();

        socket.join(roomCode);
        console.log("Step 11: Player joined socket room: ", roomCode); // Step 11

        if (!activeRooms[roomCode]) {
            console.log("Step 12: Initializing active room for code: ", roomCode); // Step 12
            activeRooms[roomCode] = { players: [] };
        }
        activeRooms[roomCode].players.push({ name: playerName, isHost: false });

        console.log("Step 13: Player added to activeRooms"); // Step 13
        socket.emit("room-joined", roomCode);
        console.log("Step 14: Emitting room-joined event for roomCode: ", roomCode); // Step 14

        io.to(roomCode).emit("room-updated", activeRooms[roomCode]);
        console.log("Step 15: Emitting room-updated event for roomCode: ", roomCode); // Step 15
    } catch (error) {
        console.error("Step 16: Server error: ", error); // Step 16
        socket.emit("room-error", "Erreur serveur");
    }
  });


  // Fonction qui vérifie si un joueur est l'hôte d'une room dans la base de donnée
  async function isHost(roomCode, playerName) {
    const room = await Room.findOne({ code: roomCode });
    if (!room) return false;
    return room.players.some(
      (player) => player.name === playerName && player.isHost
    );
  }

  // Expulser un joueur
  socket.on(
    "kick-player",
    async ({ roomCode, playerNameKicked, hostToken }) => {
      try {
        // Vérifier si l'hôte est authentifié
        const user = jwt.verify(hostToken, process.env.JWT_SECRET);
        if (!user) {
          return socket.emit("room-error", "Utilisateur non authentifié");
        }

        const playerName = user.userId;

        if (isHost(roomCode, playerName)) {
          // Trouver la room dans la base de données
          const room = await Room.findOne({ code: roomCode });
          if (!room)
            return socket.emit("room-error", { message: "Room introuvable" });

          // Supprimer le joueur de la room (base de données)
          room.players = room.players.filter(
            (player) => player.name.toString() !== playerNameKicked
          );
          await room.save();

          // Supprimer le joueur de activeRooms (mémoire)
          if (activeRooms[roomCode]) {
            activeRooms[roomCode].players = activeRooms[
              roomCode
            ].players.filter((p) => p.name !== playerNameKicked);

            // Si la room est vide, la supprimer
            if (activeRooms[roomCode].players.length === 0) {
              delete activeRooms[roomCode];
              await Room.deleteOne({ code: roomCode });
            }
          }

          // Informer les joueurs de la room
          io.to(roomCode).emit("room-updated", activeRooms[roomCode]);
        } else {
          socket.emit("room-error", "Vous n'êtes pas l'hôte de cette room");
        }
      } catch (error) {
        socket.emit("room-error", "Erreur serveur");
      }
    }
  );

  // Quitter une room
  socket.on("leave-room", async ({ roomCode, token, pname }) => {
    try {
      // Vérifier si l'hôte est authentifié
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (!user) {
        return socket.emit("room-error", "Utilisateur non authentifié");
      }

      const playerName = pname;

      const test = await isHost(roomCode, playerName);

      // Trouver la room dans la base de données
      const room = await Room.findOne({ code: roomCode });
      if (!room)
        return socket.emit("room-error", { message: "Room introuvable" });

      // Supprimer le joueur de la room (base de données)
      room.players = room.players.filter(
        (player) => player.name.toString() !== playerName
      );

      // Si le joueur est l'hôte, attribuer le rôle à un autre joueur
      if (test && room.players.length > 0) {
        room.players[0].isHost = true;
      }
      await room.save();

      // Supprimer le joueur de activeRooms (mémoire)
      if (activeRooms[roomCode]) {
        activeRooms[roomCode].players = activeRooms[roomCode].players.filter(
          (p) => p.name !== playerName
        );
        if (test && activeRooms[roomCode].players.length > 0) {
          activeRooms[roomCode].players[0].isHost = true; // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Marche seulement si l'ordre des players est la meme dans le back et dans la base de donées
        }

        // Si la room est vide, la supprimer
        if (activeRooms[roomCode].players.length === 0) {
          delete activeRooms[roomCode];
          await Room.deleteOne({ code: roomCode });
        }
      }

      // Informer les joueurs de la room
      io.to(roomCode).emit("game-left", activeRooms[roomCode]);
    } catch (error) {
      socket.emit("room-error", "Erreur serveur");
    }
  });

  // Déconnexion du joueur
  socket.on("disconnect", () => {
    for (const [roomCode, room] of Object.entries(activeRooms)) {
      activeRooms[roomCode].players = room.players.filter(
        (p) => p.id !== socket.id
      );
      io.to(roomCode).emit("room-updated", activeRooms[roomCode]);

      // Supprimer la room si elle est vide
      if (activeRooms[roomCode].players.length === 0) {
        delete activeRooms[roomCode];
        Room.deleteOne({ code: roomCode }).catch(console.error);
      }
    }
  });

  // Vérifier l'appartenance à une room
  socket.on("check-room-membership", async ({ roomCode, token }) => {
    try {
      // Vérifier si l'hôte est authentifié
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (!user) {
        return socket.emit("room-error", "Utilisateur non authentifié");
      }

      const userId = user.userId;

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit("room-membership-status", false);
      }

      const isMember = room.players.some((player) => player.id === userId);
      socket.emit("room-membership-status", isMember);
    } catch (error) {
      console.error(
        "❌ Erreur lors de la vérification de l'appartenance à la room :",
        error
      );
      socket.emit("room-membership-status", false);
    }
  });

  // Quitte la room si le joueur est expulsé
  socket.on("leave-on-kick", (roomCode) => {
    socket.leave(roomCode);
  });
}