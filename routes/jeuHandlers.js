import Game from "../models/Game.js";
import Room from "../models/Room.js";

function createDeck() {
  const colors = ["red", "blue", "green", "yellow"];
  const deck = [];

  // Cartes numérotées et d'action pour chaque couleur
  const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const actions = ["skip", "reverse", "+2"];

  colors.forEach((color) => {
    // 1 carte "0"
    deck.push({ couleur: color, valeur: "0" });
    deck.push({ couleur: color, valeur: "+4" });

    // 2 cartes pour chaque numéro de 1 à 9
    numbers.forEach((number) => {
      deck.push({ couleur: color, valeur: number });
      deck.push({ couleur: color, valeur: number });
    });

    // 2 cartes pour chaque action ("skip", "reverse", "+2")
    actions.forEach((action) => {
      deck.push({ couleur: color, valeur: action });
      deck.push({ couleur: color, valeur: action });
    });
  });

  // Cartes sauvages (Wild) et cartes "+4"
  for (let i = 0; i < 4; i++) {
    deck.push({ couleur: "black", valeur: "wild" });
  }

  // Mélanger le deck avec l'algorithme de Fisher–Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// fonction utilitaire pour mélanger un tableau (Fisher-Yates)
function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// fonction utilitaire pour tirer une carte aléatoirement du deck
function drawRandomCard(deck) {
  if (deck.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * deck.length);
  return deck.splice(randomIndex, 1)[0];
}

export function setupJeuHandlers(io, socket) {
  /// Démarrer la partie
  socket.on("start-game", async (data) => {
    const { roomCode } = data;

    if (!roomCode) {
      return socket.emit("room-error", "RoomCode est invalide.");
    }

    try {
      // 1) Trouver la room
      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit("room-error", "Room introuvable");
      }

      // Vérifier le nombre de joueurs
      if (room.players.length < 2 || room.players.length > 4) {
        return socket.emit(
          "room-error",
          "Il faut entre 2 et 4 joueurs pour démarrer la partie"
        );
      }

      const deck = createDeck();

      // Distribuer 7 cartes à chaque joueur
      const playersWithHands = room.players.map((player) => {
        return {
          ...(player.toObject?.() || player), // Au cas où player soit un doc Mongoose
          hand: deck.splice(0, 7), // On retire 7 cartes du deck pour ce joueur
        };
      });

      // Filtrer le deck pour ne conserver que les cartes numériques (valeurs de 0 à 9)
      const numericCards = deck.filter((card) => /^\d$/.test(card.valeur));
      if (numericCards.length === 0) {
        console.error("❌ Aucune carte numérique dans le deck !");
        return socket.emit(
          "room-error",
          "Il n'y a pas assez de cartes numériques pour démarrer la partie."
        );
      }

      // Sélectionner une carte aléatoire parmi les cartes numériques pour la première carte
      const randomNumericIndex = Math.floor(
        Math.random() * numericCards.length
      );
      const chosenCard = numericCards[randomNumericIndex];
      // Retirer cette carte du deck en trouvant son index dans le deck original
      const removeIndex = deck.findIndex(
        (c) =>
          c.couleur === chosenCard.couleur && c.valeur === chosenCard.valeur
      );
      if (removeIndex > -1) {
        deck.splice(removeIndex, 1);
      }
      const firstCard = chosenCard;
      // Créer le Game en base, avec ces joueurs enrichis
      const newGame = new Game({
        roomCode,
        players: playersWithHands,
        deck: deck,
        currentCard: firstCard,
      });
      await newGame.save();

      // Émettre l'événement "game-started"
      io.to(roomCode).emit("game-started", {
        roomCode,
        players: playersWithHands,
      });
    } catch (error) {
      socket.emit("room-error", "Erreur serveur");
    }
  });

  socket.on("get-game", async ({ roomCode }) => {
    try {
      if (!roomCode) {
        return socket.emit("game-error", "RoomCode manquant ou invalide.");
      }

      // On récupère la partie depuis la base
      const game = await Game.findOne({ roomCode });

      if (!game) {
        return socket.emit("game-error", "Game introuvable pour cette room.");
      }

      // On renvoie l'état de la partie
      socket.emit("game-state", game);
    } catch (error) {
      socket.emit("game-error", "Erreur serveur lors de get-game.");
    }
  });

  // Piocher une carte
  socket.on("draw-card", async ({ roomCode, playerName }) => {
    try {
      // Récupérer le jeu correspondant
      const game = await Game.findOne({ roomCode });
      if (!game) {
        return socket.emit("game-error", "Jeu introuvable pour cette room.");
      }

      // Vérifier si le joueur existe dans la liste des joueurs
      const player = game.players.find((p) => p.name === playerName);
      if (!player) {
        return socket.emit("game-error", "Joueur non trouvé.");
      }

      // Récupérer la carte actuellement sur la table
      const current = game.currentCard;

      // Vérifier si le joueur a une carte jouable dans sa main.
      const playableCardExists = player.hand.some((card) => {
        return (
          current &&
          (card.couleur === current.couleur ||
            card.valeur === current.valeur ||
            card.valeur.toLowerCase() === "wild")
        );
      });

      if (playableCardExists) {
        return socket.emit(
          "game-error",
          "Vous avez une carte jouable. Vous ne pouvez pas piocher une carte !"
        );
      }

      // Pioche une carte du deck
      const drawnCard = drawRandomCard(game.deck);
      if (!drawnCard) {
        return socket.emit(
          "game-error",
          "Le deck est vide, impossible de piocher."
        );
      }

      // Ajouter la carte piochée à la main du joueur
      player.hand.push(drawnCard);

      // Sauvegarder et émettre l'état mis à jour du jeu
      await game.save();
      io.to(roomCode).emit("game-state", game);
    } catch (error) {
      socket.emit("game-error", "Erreur serveur lors de la pioche.");
    }
  });

  socket.on("play-card", async ({ roomCode, playerName, card }) => {
    try {
      // Récupérer le jeu correspondant
      const game = await Game.findOne({ roomCode });
      if (!game) {
        return socket.emit("game-error", "Jeu introuvable pour cette room.");
      }

      // Trouver l'index du joueur qui joue
      const playerIndex = game.players.findIndex((p) => p.name === playerName);
      if (playerIndex === -1) {
        return socket.emit("game-error", "Joueur non trouvé.");
      }

      // Vérifier que c'est bien le tour du joueur
      if (playerIndex !== game.currentPlayerIndex) {
        return socket.emit("game-error", "Ce n'est pas votre tour !");
      }

      // Validation de la carte jouée
      const specialCards50 = ["wild","+4", "Joker"];
      const specialCards20 = ["+2", "skip", "reverse"];
      if (!specialCards50.includes(card.valeur)) {
        if (
          game.currentCard &&
          card.couleur !== game.currentCard.couleur &&
          card.valeur !== game.currentCard.valeur
        ) {
          return socket.emit(
            "game-error",
            "Carte non jouable. Veuillez jouer une carte de la même couleur ou avec la même valeur !"
          );
        }
      }

      // Récupérer le joueur qui joue et trouver la carte dans sa main
      const player = game.players[playerIndex];
      const cardIndex = player.hand.findIndex(
        (c) => c.couleur === card.couleur && c.valeur === card.valeur
      );
      if (cardIndex === -1) {
        return socket.emit("game-error", "Carte non trouvée dans la main.");
      }

      // Retirer la carte jouée de la main du joueur####################################""
      player.hand.splice(cardIndex, 1);

      // Calculer et ajouter le score pour la carte jouée
      let points = 0;
      if (specialCards50.includes(card.valeur)) {
        points = 50;
      } else if (specialCards20.includes(card.valeur)) {
        points = 20;
      } else {
        const numericValue = parseInt(card.valeur, 10);
        points = isNaN(numericValue) ? 0 : numericValue;
      }
      player.score = (player.score || 0) + points;

      // Ajouter la carte actuellement sur la table au deck, si elle existe, puis mélanger le deck
      if (game.currentCard) {
        // Si la carte actuelle est une carte 'wild', définir sa couleur sur 'black'
        if (game.currentCard.valeur === "wild") {
          game.currentCard.couleur = "black";
        }

        // Ajouter la carte au deck
        game.deck.push(game.currentCard);

        // Mélanger le deck
        shuffleDeck(game.deck);
      }

      // Définir la carte jouée comme nouvelle carte courante
      game.currentCard = card;

      // Déterminer l'index du joueur suivant
      let nextPlayerIndex =
        (playerIndex + game.direction + game.players.length) %
        game.players.length;

      // Gestion de la carte "reverse"
      if (card.valeur === "reverse") {
        game.direction *= -1; // Inverse le sens de jeu
        // Jouer immédiatement le joueur précédent selon la nouvelle direction
        nextPlayerIndex =
          (playerIndex + game.direction + game.players.length) %
          game.players.length;
      }

      // Gestion de la carte "skip"
      if (card.valeur === "skip") {
        nextPlayerIndex = (nextPlayerIndex + game.direction + game.players.length) % game.players.length;
      }

      // Gestion de la carte "wild"
      if (card.valeur === "wild") {
        // Informer le client que le joueur doit choisir une couleur
        io.to(roomCode).emit("choose-color", { playerName });
        return;
      }

      // Traitement spécial pour les cartes +2 et +4
      if (card.valeur === "+2") {
        // Le prochain joueur doit piocher 2 cartes
        for (let i = 0; i < 2; i++) {
          const extraCard = drawRandomCard(game.deck);
          if (extraCard) {
            game.players[nextPlayerIndex].hand.push(extraCard);
          }
        }
      } else if (card.valeur === "+4") {
        // Le prochain joueur doit piocher 4 cartes
        for (let i = 0; i < 4; i++) {
          const extraCard = drawRandomCard(game.deck);
          if (extraCard) {
            game.players[nextPlayerIndex].hand.push(extraCard);
          }
        }
        io.to(roomCode).emit("+4-color-chosen", { playerName });
      }

      // Vérifier si la partie est terminée (score ≥ 300 ou plus de cartes en main)
      const gameOverPlayer = game.players.find(
        (player) => player.score >= 300 || player.hand.length === 0
      );

      if (gameOverPlayer) {
        // Trier les joueurs par score décroissant
        const sortedPlayers = game.players
          .map(({ name, score }) => ({ name, score }))
          .sort((a, b) => b.score - a.score);

        // Identifier le gagnant (le joueur qui a terminé ses cartes ou a atteint le score)
        const winner = gameOverPlayer; // Ce joueur a gagné (a terminé ses cartes ou a un score >= 300)

        // Envoyer l'alerte de fin de partie à tous les joueurs avec le nom du gagnant
        io.to(roomCode).emit("game-over", {
          message: `La partie est terminée ! Le gagnant est ${winner.name} avec ${winner.score} points.`,
          winner: winner, // Ajout du gagnant
          players: sortedPlayers, // envoyer les joueurs triés avec leurs scores
        });

        return;
      }

      // Passer au joueur suivant
      game.currentPlayerIndex = nextPlayerIndex;
      io.to(roomCode).emit("votre-tour", game);

      // Sauvegarder les modifications dans la base de données
      await game.save();

      // Envoyer l'état mis à jour du jeu à tous les joueurs dans la room
      io.to(roomCode).emit("game-state", game);
    } catch (error) {
      socket.emit("game-error", "Erreur serveur lors du jeu de carte.");
    }
  });

  socket.on("color-chosen", async ({ roomCode, playerName, chosenColor }) => {
    try {
      const game = await Game.findOne({ roomCode });
      if (!game) return socket.emit("game-error", "Jeu introuvable.");

      // Vérifier que c'est bien le tour du joueur
      const playerIndex = game.players.findIndex((p) => p.name === playerName);
      if (playerIndex !== game.currentPlayerIndex) return;

      // Trouver la carte 'wild' dans la main du joueur
      const player = game.players[playerIndex];
      const wildCardIndex = player.hand.findIndex(
        (card) => card.valeur === "wild"
      );

      if (wildCardIndex === -1)
        return socket.emit(
          "game-error",
          "Carte 'wild' introuvable dans votre main."
        );

      // Appliquer la nouvelle couleur au jeu
      game.currentCard = { valeur: "wild", couleur: chosenColor };

      // Retirer la carte 'wild' de la main du joueur
      player.hand.splice(wildCardIndex, 1); // Retirer la carte 'wild' de la main du joueur

      // Ajouter la carte 'wild' au deck avec la couleur black
      game.deck.push({ valeur: "wild", couleur: "black" }); // La carte 'wild' est remise dans le deck avec la couleur black

      // Sauvegarder l'état du jeu
      await game.save();

      // Informer tous les clients de la mise à jour de l'état du jeu
      io.to(roomCode).emit("game-state", game);
    } catch (error) {
      console.error("Erreur lors du choix de couleur :", error);
    }
  });

  socket.on("skip-turn", async ({ roomCode, playerName }) => {
    try {
      // Récupérer le jeu correspondant
      const game = await Game.findOne({ roomCode });
      if (!game) {
        return socket.emit("game-error", "Jeu introuvable pour cette room.");
      }

      // Vérifier si le joueur existe dans la partie
      const player = game.players.find((p) => p.name === playerName);
      if (!player) {
        return socket.emit("game-error", "Joueur non trouvé.");
      }

      // Récupérer la carte actuellement sur la table
      const current = game.currentCard;

      // Vérifier si le joueur a une carte jouable dans sa main :
      // Une carte est jouable si elle a la même couleur ou la même valeur que la carte actuelle,
      // ou si c'est une carte wild.
      const playableCardExists = player.hand.some((card) => {
        return (
          current &&
          (card.couleur === current.couleur ||
            card.valeur === current.valeur ||
            card.valeur.toLowerCase() === "wild")
        );
      });

      if (playableCardExists) {
        return socket.emit(
          "game-error",
          "Vous avez une carte jouable. Vous ne pouvez pas passer votre tour !"
        );
      }

      // Si aucune carte jouable, passer au joueur suivant
      game.currentPlayerIndex =
        (game.currentPlayerIndex + 1) % game.players.length;

      // Sauvegarder et émettre l'état mis à jour du jeu
      await game.save();
      io.to(roomCode).emit("game-state", game);
    } catch (error) {
      socket.emit("game-error", "Erreur serveur lors du passage du tour.");
    }
  });

  socket.on("leave-game", async ({ roomCode, playerName }) => {
    try {
      // Récupérer le jeu correspondant
      const game = await Game.findOne({ roomCode });
      if (!game) {
        return socket.emit("game-error", "Jeu introuvable pour cette room.");
      }

      // Trouver l'index du joueur qui quitte
      const playerIndex = game.players.findIndex((p) => p.name === playerName);
      if (playerIndex === -1) {
        return socket.emit("game-error", "Joueur non trouvé dans la partie.");
      }

      // Ajouter toutes les cartes de la main du joueur dans le deck
      const leavingPlayer = game.players[playerIndex];
      if (leavingPlayer.hand && leavingPlayer.hand.length > 0) {
        game.deck.push(...leavingPlayer.hand);
      }

      // Retirer le joueur de la liste
      game.players.splice(playerIndex, 1);

      // Vérifier s'il ne reste qu'un joueur, c'est lui le gagnant
      if (game.players.length === 1) {
        const winner = game.players[0];

        // Optionnel : vous pouvez ajouter une propriété game.winner pour enregistrer le gagnant
        game.winner = winner.name;
        await game.save();
        io.to(roomCode).emit("game-won", { winner: winner.name });
        return; // Arrêter l'exécution ici
      }

      // Ajuster l'indice du joueur courant si nécessaire
      if (game.players.length > 0) {
        if (playerIndex < game.currentPlayerIndex) {
          game.currentPlayerIndex =
            (game.currentPlayerIndex - 1) % game.players.length;
        } else if (playerIndex === game.currentPlayerIndex) {
          game.currentPlayerIndex =
            game.currentPlayerIndex % game.players.length;
        }
      } else {
        game.currentPlayerIndex = 0;
      }

      // Sauvegarder le jeu mis à jour
      await game.save();

      // Émettre l'état mis à jour à tous les clients
      io.to(roomCode).emit("game-state", game);
      socket.emit("game-message", "Vous avez quitté la partie avec succès.");
    } catch (error) {
      socket.emit("game-error", "Erreur serveur lors du quitter du jeu.");
    }
  });
}
