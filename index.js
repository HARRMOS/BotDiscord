import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} from "@discordjs/voice";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { pipeline } from "stream";
import prism from "prism-media";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import gTTS from "gtts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Initialiser Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// Styles selon l'utilisateur
const userStyles = {
  "729630625518190603": "Répond de façon sarcastique.",
  "414754147556917258": "Répond avec respect comme un roi.",
};

client.once("ready", () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

// Fonction pour transcrire l'audio avec Gemini
async function transcribeAudioWithGemini(audioBuffer) {
  try {
    // Convertir l'audio en base64
    const base64Audio = audioBuffer.toString("base64");
    
    // Sauvegarder temporairement pour conversion si nécessaire
    const tempPath = path.join(__dirname, `temp_transcribe_${Date.now()}.pcm`);
    fs.writeFileSync(tempPath, audioBuffer);
    
    // Convertir en format WAV pour meilleure compatibilité
    const wavPath = tempPath.replace(".pcm", ".wav");
    
    return new Promise((resolve, reject) => {
      ffmpeg(tempPath)
        .toFormat("wav")
        .audioFrequency(16000)
        .audioChannels(1)
        .audioCodec("pcm_s16le")
        .save(wavPath)
        .on("end", async () => {
          try {
            // Lire le fichier WAV et convertir en base64
            const wavBuffer = fs.readFileSync(wavPath);
            const base64Wav = wavBuffer.toString("base64");
            
            // Utiliser Gemini pour la transcription audio
            const result = await model.generateContent([
              {
                inlineData: {
                  mimeType: "audio/wav",
                  data: base64Wav,
                },
              },
              {
                text: "Transcris cet audio en texte français. Retourne uniquement le texte transcrit, sans commentaires supplémentaires.",
              },
            ]);

            const response = await result.response;
            const transcribedText = response.text().trim();
            
            // Nettoyer les fichiers temporaires
            fs.removeSync(tempPath);
            fs.removeSync(wavPath);
            
            resolve(transcribedText);
          } catch (err) {
            // Nettoyer même en cas d'erreur
            if (fs.existsSync(tempPath)) fs.removeSync(tempPath);
            if (fs.existsSync(wavPath)) fs.removeSync(wavPath);
            reject(err);
          }
        })
        .on("error", (err) => {
          // Si la conversion échoue, essayer directement avec le buffer original
          fs.removeSync(tempPath);
          
          const base64Audio = audioBuffer.toString("base64");
          model.generateContent([
            {
              inlineData: {
                mimeType: "audio/pcm",
                data: base64Audio,
              },
            },
            {
              text: "Transcris cet audio en texte français. Retourne uniquement le texte transcrit.",
            },
          ])
          .then((result) => result.response.text())
          .then(resolve)
          .catch(reject);
        });
    });
  } catch (error) {
    console.error("Erreur transcription Gemini:", error);
    throw new Error("Impossible de transcrire l'audio: " + error.message);
  }
}

// Fonction pour générer du texte avec Gemini
async function generateTextWithGemini(text, userId) {
  try {
    const userPrompt =
      userStyles[userId] || "Répond de manière naturelle et respectueuse.";

    const prompt = `${userPrompt}\n\nUtilisateur: ${text}\nAssistant:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Erreur génération texte Gemini:", error);
    throw new Error("Impossible de générer une réponse");
  }
}

// Fonction pour créer un fichier audio TTS compatible Discord
async function createTTSAudio(text, lang = "fr") {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(__dirname, `temp_${Date.now()}.mp3`);
    
    try {
      const gtts = new gTTS(text, lang);

      gtts.save(outputPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Convertir MP3 en Opus pour Discord (format optimal)
        const opusPath = outputPath.replace(".mp3", ".opus");
        
        console.log("🔄 Conversion audio MP3 → Opus 48kHz...");
        
        ffmpeg(outputPath)
          .toFormat("opus")
          .audioCodec("libopus")
          .audioBitrate(128)
          .audioFrequency(48000)  // 48kHz (fréquence Discord)
          .audioChannels(1)  // Mono
          .on("start", (cmd) => {
            console.log("📢 Conversion démarrée");
          })
          .on("end", () => {
            console.log("✅ Conversion audio terminée");
            // Nettoyer le fichier MP3
            if (fs.existsSync(outputPath)) {
              fs.removeSync(outputPath);
            }
            resolve(opusPath);
          })
          .on("error", (err) => {
            console.error("❌ Erreur conversion Opus:", err);
            // Fallback : convertir en WAV 48kHz mono
            const wavPath = outputPath.replace(".mp3", ".wav");
            console.log("🔄 Tentative de conversion en WAV...");
            ffmpeg(outputPath)
              .toFormat("wav")
              .audioFrequency(48000)
              .audioChannels(1)
              .audioCodec("pcm_s16le")
              .save(wavPath)
              .on("end", () => {
                if (fs.existsSync(outputPath)) fs.removeSync(outputPath);
                resolve(wavPath);
              })
              .on("error", (err2) => {
                console.error("❌ Erreur conversion WAV:", err2);
                // Dernier recours : utiliser le MP3
                console.warn("⚠️ Utilisation du MP3 (peut ne pas fonctionner)");
                resolve(outputPath);
              });
          })
          .save(opusPath);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Fonction Live : écoute + TTS dans le salon vocal
async function handleVoiceChannel(voiceChannel, guildId, userId) {
  console.log(`🔊 Connexion au salon vocal: ${voiceChannel.name}`);
  
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,  // Ne pas se mettre en sourdine
    selfMute: false,  // Ne pas se mettre en muet
  });

  const receiver = connection.receiver;
  const player = createAudioPlayer();

  // S'abonner au player avant de commencer
  connection.subscribe(player);
  console.log("✅ Player abonné à la connexion vocale");

  // Gestion des erreurs de connexion
  connection.on("error", (error) => {
    console.error("❌ Erreur connexion vocale:", error);
  });

  // Gestion des erreurs du player
  player.on("error", (error) => {
    console.error("❌ Erreur player audio:", error);
  });

  // Message de salutation quand le bot rejoint
  // Attendre un peu que la connexion soit complètement établie
  setTimeout(async () => {
    try {
      console.log("✅ Connexion vocale établie, envoi du message de salutation...");
      
      const greetingMessage = "Salut ! Je suis prêt à discuter avec vous. Parlez-moi et je vous répondrai !";
      const greetingAudioPath = await createTTSAudio(greetingMessage, "fr");
      
      const resource = createAudioResource(greetingAudioPath, {
        inputType: "file",
      });

      // S'assurer que le player est abonné
      if (!connection.subscribers.has(player)) {
        connection.subscribe(player);
      }

      player.play(resource);

      // Nettoyer après lecture
      const greetingIdleHandler = () => {
        setTimeout(() => {
          if (fs.existsSync(greetingAudioPath)) {
            fs.removeSync(greetingAudioPath);
          }
        }, 1000);
        player.off(AudioPlayerStatus.Idle, greetingIdleHandler);
      };
      
      player.once(AudioPlayerStatus.Idle, greetingIdleHandler);
    } catch (error) {
      console.error("❌ Erreur message de salutation:", error);
    }
  }, 1500); // Attendre 1.5 secondes pour que la connexion soit stable

  receiver.speaking.on("start", async (userIdSpeaking) => {
    if (userIdSpeaking === client.user.id) {
      console.log("🔇 Ignoré: audio du bot lui-même");
      return; // Ignorer notre propre audio
    }

    const user = await client.users.fetch(userIdSpeaking).catch(() => null);
    console.log(`🎤 ${user?.username || userIdSpeaking} commence à parler...`);

    const audioStream = receiver.subscribe(userIdSpeaking, {
      end: { behavior: "silence", duration: 1000 },
    });

    const convert = new prism.opus.Decoder({
      frameSize: 960,
      channels: 1,
      rate: 48000,
    });

    pipeline(audioStream, convert, async (err) => {
      if (err) console.error("Pipeline error:", err);
    });

    let buffer = [];
    convert.on("data", (chunk) => buffer.push(chunk));
    convert.on("end", async () => {
      try {
        const audioBuffer = Buffer.concat(buffer);
        console.log(`📊 Audio reçu: ${audioBuffer.length} bytes`);

        if (audioBuffer.length === 0) {
          console.log("⚠️ Buffer audio vide, ignoré");
          return;
        }

        // Transcription avec Gemini
        console.log("🔄 Transcription en cours...");
        const text = await transcribeAudioWithGemini(audioBuffer);
        console.log("👤 Utilisateur dit:", text);

        if (!text || text.trim().length === 0) {
          console.log("⚠️ Transcription vide, ignoré");
          return;
        }

        // Génération réponse avec Gemini
        const answer = await generateTextWithGemini(text, userIdSpeaking);
        console.log("Réponse IA:", answer);

        // Créer fichier audio TTS
        console.log("🎤 Génération audio TTS...");
        const audioPath = await createTTSAudio(answer, "fr");
        console.log("✅ Audio généré:", audioPath);

        // Jouer l'audio dans le salon vocal
        // Créer la ressource audio selon le format
        let resource;
        if (audioPath.endsWith(".opus")) {
          // Format Opus - compatible Discord
          resource = createAudioResource(audioPath, {
            inputType: "file",
          });
        } else {
          // WAV, MP3 ou autre - Discord.js le décodera automatiquement
          resource = createAudioResource(audioPath, {
            inputType: "file",
          });
        }

        console.log("🔊 Lecture audio dans le salon vocal...");
        
        // S'assurer que le player est toujours abonné
        if (!connection.subscribers.has(player)) {
          connection.subscribe(player);
          console.log("🔗 Player réabonné à la connexion");
        }

        // Lire l'audio
        player.play(resource);

        // Écouter l'événement Idle une seule fois pour ce fichier
        const idleHandler = () => {
          console.log("⏹️ Audio terminé");
          // Nettoyer les fichiers temporaires
          setTimeout(() => {
            if (fs.existsSync(audioPath)) {
              fs.removeSync(audioPath);
              console.log("🗑️ Fichier audio nettoyé");
            }
          }, 1000);
          // Retirer le handler après utilisation
          player.off(AudioPlayerStatus.Idle, idleHandler);
        };
        
        player.once(AudioPlayerStatus.Idle, idleHandler);
      } catch (error) {
        console.error("Erreur traitement vocal:", error);
      }
    });
  });
}

// Fonction pour envoyer un message vocal dans un chat texte
async function sendVoiceMessage(channel, text, userId) {
  try {
    // Générer la réponse avec Gemini
    const answer = await generateTextWithGemini(text, userId);

    // Créer le fichier audio
    const audioPath = await createTTSAudio(answer, "fr");

    // Envoyer le fichier audio comme pièce jointe
    const attachment = new AttachmentBuilder(audioPath, {
      name: "message_vocal.opus",
      description: answer,
    });

    await channel.send({
      files: [attachment],
      content: `🎤 **Réponse vocale:**\n${answer}`,
    });

    // Nettoyer le fichier temporaire
    setTimeout(() => {
      if (fs.existsSync(audioPath)) {
        fs.removeSync(audioPath);
      }
    }, 5000);
  } catch (error) {
    console.error("Erreur envoi message vocal:", error);
    channel.send("❌ Erreur lors de la génération du message vocal.");
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Commande pour rejoindre un salon vocal
  if (message.content.startsWith("!join")) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel)
      return message.reply("🔊 Rejoins d'abord un salon vocal !");
    
    await handleVoiceChannel(voiceChannel, message.guild.id, message.author.id);
    message.reply("✅ Bot prêt à écouter et parler !");
    return;
  }

  // Commande pour quitter le salon vocal
  if (message.content.startsWith("!leave")) {
    const connection = getVoiceConnection(message.guild.id);
    if (connection) {
      connection.destroy();
      message.reply("👋 J'ai quitté le salon vocal.");
    } else {
      message.reply("❌ Je ne suis dans aucun salon vocal.");
    }
    return;
  }

  // Commande pour envoyer un message vocal dans le chat
  if (message.content.startsWith("!voice") || message.content.startsWith("!vocal")) {
    const text = message.content.slice(message.content.indexOf(" ") + 1).trim();
    if (!text) {
      return message.reply("❌ Utilise: `!voice [votre message]` ou `!vocal [votre message]`");
    }
    
    await sendVoiceMessage(message.channel, text, message.author.id);
    return;
  }

  // Répondre aux messages mentionnant le bot ou commençant par "!"
  const mentioned = message.mentions.has(client.user);
  const isCommand = message.content.startsWith("!");
  
  if (mentioned || (isCommand && !message.content.startsWith("!join") && !message.content.startsWith("!leave") && !message.content.startsWith("!voice") && !message.content.startsWith("!vocal"))) {
    try {
      const userMessage = message.content.replace(`<@${client.user.id}>`, "").trim();
      const answer = await generateTextWithGemini(userMessage, message.author.id);
      await message.reply(answer);
    } catch (error) {
      console.error("Erreur réponse texte:", error);
      message.reply("❌ Désolé, une erreur s'est produite.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
