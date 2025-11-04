#!/usr/bin/env node
/**
 * Script client pour capturer l'écran et la caméra depuis le PC local
 * Ce script doit tourner sur ton PC et écouter les demandes du bot Discord
 */

import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import screenshot from "screenshot-desktop";
import webcam from "node-webcam";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token Discord - peut être un token utilisateur ou un bot séparé
// Pour utiliser un token utilisateur (recommandé pour usage personnel):
// 1. Va sur https://discord.com/developers/applications
// 2. Crée une application ou utilise celle existante
// 3. Va dans "OAuth2" > "URL Generator"
// 4. Sélectionne "bot" et les permissions nécessaires
// 5. Autorise le bot dans ton serveur
// 6. OU utilise un token utilisateur (attention: moins sécurisé)
const DISCORD_TOKEN = process.env.DISCORD_CLIENT_TOKEN || process.env.DISCORD_TOKEN;
const BOT_USER_ID = process.env.BOT_USER_ID; // ID du bot principal (optionnel)

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_CLIENT_TOKEN ou DISCORD_TOKEN non défini dans .env");
  console.error("💡 Pour utiliser ce script, tu dois créer un bot Discord séparé ou utiliser un token utilisateur.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Fonction pour capturer l'écran
async function captureScreen() {
  try {
    console.log("📸 Capture de l'écran en cours...");
    const imgPath = path.join(__dirname, `temp_screen_${Date.now()}.png`);
    await screenshot({ filename: imgPath });
    
    if (!fs.existsSync(imgPath)) {
      throw new Error("Fichier de capture non créé");
    }
    
    const stats = fs.statSync(imgPath);
    console.log(`✅ Capture réussie: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    return imgPath;
  } catch (error) {
    console.error("❌ Erreur capture écran:", error);
    throw error;
  }
}

// Fonction pour capturer la caméra
async function captureWebcam() {
  return new Promise((resolve, reject) => {
    try {
      const imgPath = path.join(__dirname, `temp_webcam_${Date.now()}.jpg`);
      
      // Vérifier si imagesnap est disponible (macOS)
      let hasImagesnap = false;
      try {
        execSync("which imagesnap", { stdio: "ignore" });
        hasImagesnap = true;
      } catch (e) {
        hasImagesnap = false;
      }

      const opts = {
        width: 1280,
        height: 720,
        quality: 90,
        delay: 0,
        saveShots: true,
        output: "jpeg",
        device: false,
        callbackReturn: "location",
        verbose: false
      };

      webcam.capture(imgPath, opts, (err, data) => {
        if (err) {
          console.error("❌ Erreur capture caméra:", err.message || err);
          reject(err);
          return;
        }
        
        if (fs.existsSync(imgPath)) {
          console.log("✅ Capture caméra réussie");
          resolve(imgPath);
        } else {
          reject(new Error("Fichier caméra non créé"));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

client.once("ready", () => {
  console.log(`✅ Client de capture connecté en tant que ${client.user.tag}`);
  console.log("📡 En attente de demandes de capture depuis le bot...");
});

// Détecter les demandes de capture depuis n'importe quel message
client.on("messageCreate", async (message) => {
  // Ignorer les messages du bot lui-même
  if (message.author.id === client.user.id) return;
  
  // Log pour déboguer
  console.log(`📨 Message reçu de ${message.author.tag} (${message.author.bot ? 'bot' : 'utilisateur'}): ${message.content.substring(0, 50)}...`);
  
  // Détecter les demandes spéciales du bot principal ou les messages contenant la commande
  const content = message.content;
  
  // Détecter les demandes de capture d'écran
  if (content.includes("CAPTURE_REQUEST:SCREEN") || 
      content.includes("CAPTURE_REQUEST:ECRAN") ||
      (content.includes("!screen") && message.author.bot)) {
    
    try {
      console.log("📸 Demande de capture d'écran détectée");
      const imgPath = await captureScreen();
      
      const attachment = new AttachmentBuilder(imgPath, {
        name: `screen_${Date.now()}.png`,
        description: "Capture d'écran depuis PC local"
      });
      
      await message.channel.send({
        content: "📸 **Capture d'écran depuis ton PC :**",
        files: [attachment]
      });
      
      console.log("✅ Capture d'écran envoyée");
      
      // Nettoyer après 30 secondes
      setTimeout(() => {
        if (fs.existsSync(imgPath)) {
          fs.removeSync(imgPath);
        }
      }, 30000);
      
    } catch (error) {
      console.error("❌ Erreur capture écran:", error);
      try {
        await message.channel.send("❌ Erreur lors de la capture d'écran. Vérifie que le script client tourne sur ton PC.");
      } catch (e) {
        // Ignorer si on ne peut pas envoyer
      }
    }
    return;
  }
  
  // Détecter les demandes de capture caméra
  if (content.includes("CAPTURE_REQUEST:CAMERA") || 
      content.includes("CAPTURE_REQUEST:CAM") ||
      (content.includes("!cam") && message.author.bot) ||
      (content.includes("!camera") && message.author.bot)) {
    
    try {
      console.log("📷 ✅ Demande de capture caméra détectée !");
      console.log(`📝 Message complet: "${content}"`);
      console.log(`👤 Auteur: ${message.author.tag} (bot: ${message.author.bot})`);
      const imgPath = await captureWebcam();
      
      const attachment = new AttachmentBuilder(imgPath, {
        name: `webcam_${Date.now()}.jpg`,
        description: "Capture caméra depuis PC local"
      });
      
      const sentMessage = await message.channel.send({
        content: "📷 **Capture caméra depuis ton PC :**",
        files: [attachment]
      });
      
      console.log("✅ Capture caméra envoyée avec succès !");
      console.log(`📤 Message envoyé dans le canal: ${message.channel.name}`);
      
      // Nettoyer après 30 secondes
      setTimeout(() => {
        if (fs.existsSync(imgPath)) {
          fs.removeSync(imgPath);
        }
      }, 30000);
      
    } catch (error) {
      console.error("❌ Erreur capture caméra:", error);
      try {
        await message.channel.send("❌ Erreur lors de la capture caméra. Vérifie que le script client tourne sur ton PC et que ta caméra est disponible.");
      } catch (e) {
        // Ignorer si on ne peut pas envoyer
      }
    }
    return;
  }
});

client.login(DISCORD_TOKEN).catch(console.error);

// Gestion propre de l'arrêt
process.on("SIGINT", () => {
  console.log("\n👋 Arrêt du client de capture...");
  client.destroy();
  process.exit(0);
});

