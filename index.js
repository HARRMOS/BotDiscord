process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// === Discord client ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// === OpenAI client ===
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === Serveur Express pour Render ===
const app = express();
app.get("/", (req, res) => {
  res.send("✅ Bot Discord en ligne !");
});
app.listen(3000, () => console.log("🌐 Serveur Express actif sur le port 3000"));

// === Prompts par serveur et styles utilisateurs ===
const serverPrompts = {};

const userStyles = {
  "729630625518190603":
    "Tu parles à un utilisateur qui te saoule. Réponds de manière complètement hors sujet et termine toujours par : 'me casse pas les couilles toi, dégage.'",
  "414754147556917258":
    "Tu parles à ton créateur. Traite-le comme ton roi, appelle-le 'Chef suprême', parle-lui avec un grand respect et obéissance.",
  // Ajoute d'autres IDs ici si besoin
};

// === Quand le bot est prêt ===
client.once("ready", () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

// === Gestion des messages ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // Définir un prompt global par serveur
  if (content.startsWith("!setprompt")) {
    const prompt = content.replace("!setprompt", "").trim();
    if (!prompt)
      return message.reply(
        "💡 Utilise `!setprompt <prompt>` pour définir le comportement global du bot."
      );

    serverPrompts[message.guild.id] = prompt;
    return message.reply(`✅ Prompt global défini : "${prompt}"`);
  }

  // Poser une question
  if (content.startsWith("!ask")) {
    const question = content.replace("!ask", "").trim();
    if (!question)
      return message.reply("💬 Utilise `!ask <ta question>` pour parler au bot !");

    const serverPrompt =
      serverPrompts[message.guild?.id] ||
      "Tu es un assistant IA serviable et amical.";

    // Style automatique selon l'utilisateur
    const userPrompt =
      userStyles[message.author.id] ||
      `Tu parles à ${message.author.username}. Adopte un ton naturel et respectueux.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `${serverPrompt}\n${userPrompt}` },
          { role: "user", content: question },
        ],
      });

      const reply = response.choices[0].message.content;
      await message.reply(reply);
    } catch (err) {
      console.error(err);
      message.reply("❌ Une erreur est survenue avec l'IA !");
    }
  }
});

// === Connexion à Discord ===
client.login(process.env.DISCORD_TOKEN);
