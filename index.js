import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} from "@discordjs/voice";
import OpenAI from "openai";
import dotenv from "dotenv";
import { pipeline } from "stream";
import prism from "prism-media";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import screenshot from "screenshot-desktop";
import webcam from "node-webcam";
import { execSync } from "child_process";
import http from "http";

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

// Initialiser OpenAI pour toutes les fonctionnalités
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY non défini. Le bot ne pourra pas fonctionner correctement.");
}

// Configuration de la voix TTS
// Options disponibles : "alloy" (neutre), "echo" (masculine), "fable" (masculine), 
//                       "onyx" (masculine profonde), "nova" (féminine), "shimmer" (féminine douce)
const TTS_VOICE = process.env.JARVIS_TTS_VOICE || "echo";  // Voix masculine par défaut (comme Jarvis)
const TTS_SPEED = parseFloat(process.env.JARVIS_TTS_SPEED || "0.95");  // Vitesse de la voix

// Styles selon l'utilisateur
const userStyles = {
  "729630625518190603": "Répond de façon sarcastique.",
  "414754147556917258": "Répond avec respect comme un roi.",
};

client.once("clientReady", () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

// Garder la compatibilité avec l'ancien événement
client.once("ready", () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

// Fonction pour transcrire l'audio avec OpenAI Whisper
async function transcribeAudioWithOpenAI(audioBuffer) {
  try {
    // Sauvegarder temporairement pour conversion si nécessaire
    const tempPath = path.join(__dirname, `temp_transcribe_${Date.now()}.pcm`);
    fs.writeFileSync(tempPath, audioBuffer);
    
    // Convertir en format MP3 pour OpenAI Whisper (format recommandé)
    const mp3Path = tempPath.replace(".pcm", ".mp3");
    
    return new Promise((resolve, reject) => {
      ffmpeg(tempPath)
        .toFormat("mp3")
        .audioFrequency(16000)
        .audioChannels(1)
        .audioCodec("libmp3lame")
        .audioBitrate(64)
        .save(mp3Path)
        .on("end", async () => {
          try {
            // Lire le fichier MP3
            const audioFile = fs.createReadStream(mp3Path);
            
            // Utiliser OpenAI Whisper pour la transcription audio
            const transcription = await openai.audio.transcriptions.create({
              file: audioFile,
              model: "whisper-1",
              language: "fr",
              response_format: "text"
            });
            
            const transcribedText = typeof transcription === 'string' ? transcription.trim() : transcription.text?.trim() || "";
            
            // Nettoyer les fichiers temporaires
            if (fs.existsSync(tempPath)) fs.removeSync(tempPath);
            if (fs.existsSync(mp3Path)) fs.removeSync(mp3Path);
            
            resolve(transcribedText);
          } catch (err) {
            // Nettoyer même en cas d'erreur
            if (fs.existsSync(tempPath)) fs.removeSync(tempPath);
            if (fs.existsSync(mp3Path)) fs.removeSync(mp3Path);
            reject(err);
          }
        })
        .on("error", async (err) => {
          // Si la conversion échoue, essayer directement avec le fichier PCM
          // Convertir en WAV simple pour Whisper
          const wavPath = tempPath.replace(".pcm", ".wav");
          try {
            await new Promise((resolveWav, rejectWav) => {
              ffmpeg(tempPath)
                .toFormat("wav")
                .audioFrequency(16000)
                .audioChannels(1)
                .audioCodec("pcm_s16le")
                .save(wavPath)
                .on("end", resolveWav)
                .on("error", rejectWav);
            });
            
            const audioFile = fs.createReadStream(wavPath);
            const transcription = await openai.audio.transcriptions.create({
              file: audioFile,
              model: "whisper-1",
              language: "fr",
              response_format: "text"
            });
            
            const text = typeof transcription === 'string' ? transcription.trim() : transcription.text?.trim() || "";
            
            // Nettoyer
            if (fs.existsSync(tempPath)) fs.removeSync(tempPath);
            if (fs.existsSync(wavPath)) fs.removeSync(wavPath);
            
            resolve(text);
          } catch (error) {
            // Nettoyer en cas d'erreur
            if (fs.existsSync(tempPath)) fs.removeSync(tempPath);
            if (fs.existsSync(wavPath)) fs.removeSync(wavPath);
            reject(error);
          }
        });
    });
  } catch (error) {
    console.error("Erreur transcription OpenAI:", error);
    throw new Error("Impossible de transcrire l'audio: " + error.message);
  }
}

// Fonction pour générer du texte avec OpenAI (avec retry pour erreur 429)
async function generateTextWithOpenAI(text, userId, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const userPrompt =
        userStyles[userId] || "Tu es Jarvis, un assistant intelligent. Répond de manière naturelle et respectueuse, avec un ton masculin et un peu drôle.";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Utilise gpt-4o-mini pour un meilleur rapport qualité/prix
        messages: [
          {
            role: "system",
            content: userPrompt
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const response = completion.choices[0]?.message?.content || "";
      return response.trim();
    } catch (error) {
      // Si erreur 429 (trop de requêtes), attendre et réessayer
      if (error.status === 429 && attempt < retries) {
        // Extraire le délai suggéré par l'API si disponible
        let waitTime = Math.pow(2, attempt) * 1000; // Backoff exponentiel: 2s, 4s, 8s
        
        // OpenAI renvoie parfois un header Retry-After
        if (error.headers && error.headers['retry-after']) {
          const suggestedDelay = parseInt(error.headers['retry-after']) * 1000;
          if (suggestedDelay > waitTime) {
            waitTime = suggestedDelay;
          }
        }
        
        console.warn(`⚠️ Erreur 429 (quota dépassé) pour génération texte. Attente de ${waitTime/1000}s avant réessai (tentative ${attempt}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Si c'est la dernière tentative ou une autre erreur, lancer l'erreur
      if (attempt === retries) {
        console.error("❌ Erreur génération texte OpenAI après", retries, "tentatives:", error);
        throw new Error("Impossible de générer une réponse");
      }
    }
  }
}

// Fonction pour créer un fichier audio TTS avec OpenAI TTS
async function createTTSAudio(text, lang = "fr") {
  // Utiliser OpenAI TTS avec voix masculine
  if (openai && process.env.OPENAI_API_KEY) {
    try {
      console.log(`🎤 Génération audio avec OpenAI TTS (voix: ${TTS_VOICE})...`);
      
      // Générer l'audio avec OpenAI TTS
      const response = await openai.audio.speech.create({
        model: "tts-1",  // Modèle TTS rapide
        voice: TTS_VOICE,  // Voix configurée (echo, onyx, fable pour masculin)
        input: text,
        speed: TTS_SPEED,  // Vitesse configurée (0.25 à 4.0)
      });

      // Sauvegarder dans un fichier temporaire
      const mp3Path = path.join(__dirname, `temp_${Date.now()}.mp3`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(mp3Path, buffer);

      console.log("✅ Audio généré avec OpenAI TTS");
      
      // Convertir MP3 en WAV 48kHz mono pour Discord
      const wavPath = mp3Path.replace(".mp3", ".wav");
      
      return new Promise((resolve, reject) => {
        ffmpeg(mp3Path)
          .toFormat("wav")
          .audioFrequency(48000)  // 48kHz pour Discord
          .audioChannels(1)  // Mono
          .audioCodec("pcm_s16le")
          
          .on("end", () => {
            // Nettoyer le fichier MP3
            if (fs.existsSync(mp3Path)) {
              fs.removeSync(mp3Path);
            }
            resolve(wavPath);
          })
          .on("error", (err) => {
            console.warn("⚠️ Erreur conversion WAV, utilisation du MP3:", err);
            // Utiliser le MP3 directement si la conversion échoue
            resolve(mp3Path);
          })
          .save(wavPath);
      });
    } catch (error) {
      console.error("❌ Erreur OpenAI TTS:", error);
      console.log("🔄 Fallback vers gTTS avec effets...");
      // Fallback vers gTTS avec effets
    }
  }

  // Fallback : utiliser gTTS avec effets audio pour rendre la voix masculine
  const { default: gTTS } = await import("gtts");
  return new Promise((resolve, reject) => {
    const outputPath = path.join(__dirname, `temp_${Date.now()}.mp3`);
    
    try {
      const gtts = new gTTS(text, lang);

      gtts.save(outputPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Convertir MP3 en WAV 48kHz mono avec effets pour voix masculine
        const wavPath = outputPath.replace(".mp3", ".wav");
        
        console.log("🔄 Conversion audio avec effets voix masculine (gTTS fallback)...");
        
        ffmpeg(outputPath)
          .toFormat("wav")
          .audioFrequency(48000)
          .audioChannels(1)
          .audioCodec("pcm_s16le")
          .audioFilters([
            'asetrate=48000*0.6',  // Voix beaucoup plus grave
            'aresample=48000',
            'atempo=0.9',  // Ralentir de 10%
            'aecho=0.8:0.88:60:0.4'  // Écho léger
          ])
          .on("end", () => {
            if (fs.existsSync(outputPath)) fs.removeSync(outputPath);
            resolve(wavPath);
          })
          .on("error", (err) => {
            console.error("❌ Erreur conversion:", err);
            if (fs.existsSync(outputPath)) fs.removeSync(outputPath);
            reject(err);
          })
          .save(wavPath);
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
    // L'erreur d'encryption est souvent non-bloquante, on continue
    if (error.message && error.message.includes("encryption")) {
      console.warn("⚠️ Erreur d'encryption (peut être ignorée si la connexion fonctionne)");
    }
  });

  // Gestion de l'état de la connexion pour déboguer
  connection.on("stateChange", (oldState, newState) => {
    if (oldState.status !== newState.status) {
      console.log(`🔄 État connexion: ${oldState.status} → ${newState.status}`);
    }
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
      
      // Vérifier que la connexion est prête
      if (connection.state.status !== "ready") {
        console.warn(`⚠️ Connexion pas prête (état: ${connection.state.status}), attente...`);
        await new Promise((resolve) => {
          const checkReady = () => {
            if (connection.state.status === "ready") {
              connection.off("stateChange", checkReady);
              resolve();
            }
          };
          connection.on("stateChange", checkReady);
          setTimeout(() => {
            connection.off("stateChange", checkReady);
            resolve();
          }, 5000);
        });
      }

      const resource = createAudioResource(greetingAudioPath, {
        inputType: "file",
      });

      // S'assurer que le player est abonné
      connection.subscribe(player);
      console.log("✅ Player abonné pour le message de salutation");

      // Écouter les événements
      const greetingPlayingHandler = () => {
        console.log("▶️ Message de salutation en cours de lecture !");
      };
      const greetingIdleHandler = () => {
        console.log("⏹️ Message de salutation terminé");
        setTimeout(() => {
          if (fs.existsSync(greetingAudioPath)) {
            fs.removeSync(greetingAudioPath);
          }
        }, 1000);
        player.off(AudioPlayerStatus.Playing, greetingPlayingHandler);
        player.off(AudioPlayerStatus.Idle, greetingIdleHandler);
      };
      
      player.once(AudioPlayerStatus.Playing, greetingPlayingHandler);
      player.once(AudioPlayerStatus.Idle, greetingIdleHandler);

      console.log("🎵 Démarrage du message de salutation...");
      player.play(resource);
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

        // Transcription avec OpenAI Whisper
        console.log("🔄 Transcription en cours...");
        const text = await transcribeAudioWithOpenAI(audioBuffer);
        console.log("👤 Utilisateur dit:", text);

        if (!text || text.trim().length === 0) {
          console.log("⚠️ Transcription vide, ignoré");
          return;
        }

        // Génération réponse avec OpenAI
        const answer = await generateTextWithOpenAI(text, userIdSpeaking);
        console.log("Réponse IA:", answer);

        // Créer fichier audio TTS
        console.log("🎤 Génération audio TTS...");
        const audioPath = await createTTSAudio(answer, "fr");
        console.log("✅ Audio généré:", audioPath);

        // Jouer l'audio dans le salon vocal
        console.log("🔊 Préparation de la lecture audio...");
        console.log(`📁 Fichier audio: ${audioPath}`);
        console.log(`📊 Taille fichier: ${fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0} bytes`);
        
        // Vérifier que la connexion est prête
        if (connection.state.status !== "ready") {
          console.warn(`⚠️ Connexion pas prête (état: ${connection.state.status}), attente...`);
          await new Promise((resolve) => {
            const checkReady = () => {
              if (connection.state.status === "ready") {
                connection.off("stateChange", checkReady);
                resolve();
              }
            };
            connection.on("stateChange", checkReady);
            // Timeout après 5 secondes
            setTimeout(() => {
              connection.off("stateChange", checkReady);
              resolve();
            }, 5000);
          });
        }

        // Créer la ressource audio
        // Discord.js peut décoder automatiquement WAV, MP3, etc.
        let resource;
        try {
          resource = createAudioResource(audioPath, {
            inputType: "file",
          });
          console.log(`✅ Ressource audio créée (format: ${audioPath.split('.').pop()})`);
        } catch (error) {
          console.error("❌ Erreur création ressource:", error);
          throw error;
        }

        // S'assurer que le player est toujours abonné
        connection.subscribe(player);
        console.log("✅ Player abonné à la connexion");

        // Écouter les événements du player pour débugger
        const playingHandler = () => {
          console.log("▶️ Audio en cours de lecture !");
        };
        const idleHandler = () => {
          console.log("⏹️ Audio terminé");
          // Nettoyer les fichiers temporaires
          setTimeout(() => {
            if (fs.existsSync(audioPath)) {
              fs.removeSync(audioPath);
              console.log("🗑️ Fichier audio nettoyé");
            }
          }, 1000);
          // Retirer les handlers
          player.off(AudioPlayerStatus.Playing, playingHandler);
          player.off(AudioPlayerStatus.Idle, idleHandler);
        };
        const errorHandler = (error) => {
          console.error("❌ Erreur lecture audio:", error);
          player.off("error", errorHandler);
        };

        player.once(AudioPlayerStatus.Playing, playingHandler);
        player.once(AudioPlayerStatus.Idle, idleHandler);
        player.once("error", errorHandler);

        // Lire l'audio
        console.log("🎵 Démarrage de la lecture...");
        player.play(resource);
      } catch (error) {
        console.error("Erreur traitement vocal:", error);
      }
    });
  });
}

// Fonction pour capturer l'écran
async function captureScreen() {
  try {
    console.log("📸 Capture de l'écran en cours...");
    const imgPath = path.join(__dirname, `temp_screen_${Date.now()}.png`);
    await screenshot({ filename: imgPath });
    
    // Vérifier que le fichier existe
    if (!fs.existsSync(imgPath)) {
      console.error("❌ Fichier de capture non créé");
      return null;
    }
    
    // Vérifier la taille du fichier
    const stats = fs.statSync(imgPath);
    console.log(`✅ Capture réussie: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    return imgPath;
  } catch (error) {
    console.error("❌ Erreur capture écran:", error);
    return null;
  }
}

// Fonction pour capturer la caméra
async function captureWebcam() {
  // Vérifier si on est sur un serveur cloud (pas de caméra disponible)
  if (process.env.RENDER || process.env.NODE_ENV === "production") {
    console.warn("⚠️ Capture caméra non disponible sur serveur cloud");
    return Promise.reject(new Error("Capture caméra non disponible sur serveur cloud"));
  }
  
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

      if (!hasImagesnap) {
        // Essayer d'utiliser node-webcam avec une configuration différente
        console.log("⚠️ imagesnap non disponible, tentative avec node-webcam...");
      }

      // Configuration de la webcam
      const opts = {
        width: 1280,
        height: 720,
        quality: 90,
        delay: 0,
        saveShots: true,
        output: "jpeg",
        device: false, // Utiliser la caméra par défaut
        callbackReturn: "location",
        verbose: false
      };

      webcam.capture(imgPath, opts, (err, data) => {
        if (err) {
          console.error("❌ Erreur capture caméra:", err.message || err);
          
          // Si imagesnap n'est pas trouvé, donner des instructions
          if (err.message && err.message.includes("imagesnap")) {
            const errorMsg = "❌ imagesnap n'est pas installé. Pour installer sur macOS: `brew install imagesnap`\n" +
                           "💡 Alternative: Vous pouvez utiliser la capture d'écran avec `!screen`";
            reject(new Error(errorMsg));
          } else {
            reject(err);
          }
          return;
        }
        
        // Vérifier que le fichier existe
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

// Fonction pour convertir une image en base64
async function imageToBase64(imagePath) {
  try {
    // Lire directement le fichier et convertir en base64
    const buffer = fs.readFileSync(imagePath);
    return buffer.toString("base64");
  } catch (error) {
    console.error("❌ Erreur conversion image:", error);
    throw error;
  }
}

// Fonction helper pour analyser et répondre avec une image
async function analyzeAndRespond(channel, imageAttachment, question, type) {
  try {
    const imageUrl = imageAttachment.url;
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const ext = imageAttachment.name?.split('.').pop()?.toLowerCase() || 'png';
    const imagePath = path.join(__dirname, `temp_${type}_${Date.now()}.${ext}`);
    fs.writeFileSync(imagePath, buffer);
    
    await channel.send(`🖼️ Analyse de la capture ${type}...`);
    const description = await analyzeImageWithOpenAI(imagePath, question || null);
    
    const emoji = type === "caméra" ? "📷" : "🔍";
    await channel.send({
      content: `${emoji} **Ce que je vois dans cette capture ${type} :**\n${description}`,
    });
    
    setTimeout(() => {
      if (fs.existsSync(imagePath)) fs.removeSync(imagePath);
    }, 60000);
  } catch (error) {
    console.error(`Erreur analyse ${type}:`, error);
    channel.send(`❌ Erreur lors de l'analyse de la capture ${type}.`);
  }
}

// Fonction pour analyser une image avec OpenAI Vision (avec retry pour erreur 429)
async function analyzeImageWithOpenAI(imagePath, question = null, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔍 Analyse de l'image avec OpenAI Vision... (tentative ${attempt}/${retries})`);
      
      // Convertir l'image en base64
      const imageBase64 = await imageToBase64(imagePath);
      
      // Déterminer le type MIME selon l'extension du fichier
      const ext = path.extname(imagePath).toLowerCase();
      let mimeType = "image/png";
      if (ext === ".jpg" || ext === ".jpeg") {
        mimeType = "image/jpeg";
      } else if (ext === ".png") {
        mimeType = "image/png";
      } else if (ext === ".webp") {
        mimeType = "image/webp";
      } else if (ext === ".gif") {
        mimeType = "image/gif";
      }
      
      // Construire le prompt selon la question
      let prompt;
      if (question) {
        prompt = `Tu es Jarvis, un assistant intelligent. L'utilisateur te demande : "${question}". 

Regarde attentivement cette image et réponds-lui directement en utilisant "tu" ou "ton", comme si tu lui parlais en face. 

Réponds de manière précise, naturelle et conversationnelle. Décris ce que tu vois et réponds à sa question. Utilise des phrases complètes et fluides, JAMAIS de listes ou formatage markdown.`;
      } else {
        prompt = `Tu es Jarvis, un assistant intelligent. Tu regardes une image et tu veux décrire ce que tu vois.

Parle directement à l'utilisateur en utilisant "tu" ou "ton", comme si tu lui parlais en face. Décris ce que tu vois sur l'image de manière naturelle et conversationnelle.

Commence par décrire exactement ce qui est visible, puis si tu détectes des problèmes ou opportunités, parle-lui en de manière naturelle.

Utilise des phrases fluides, comme si tu racontais ce que tu vois à un ami. JAMAIS de listes numérotées ou formatage markdown.

Sois spontané et naturel dans ta description.`;
      }

      // Utiliser OpenAI Vision pour analyser l'image
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // gpt-4o-mini supporte la vision
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      });

      const description = completion.choices[0]?.message?.content?.trim() || "";
      
      console.log("✅ Analyse terminée");
      return description;
    } catch (error) {
      // Si erreur 429 (trop de requêtes), attendre et réessayer
      if (error.status === 429 && attempt < retries) {
        let waitTime = Math.pow(2, attempt) * 1000; // Backoff exponentiel: 2s, 4s, 8s
        
        // OpenAI renvoie parfois un header Retry-After
        if (error.headers && error.headers['retry-after']) {
          const suggestedDelay = parseInt(error.headers['retry-after']) * 1000;
          if (suggestedDelay > waitTime) {
            waitTime = suggestedDelay;
          }
        }
        
        console.warn(`⚠️ Erreur 429 (trop de requêtes). Attente de ${waitTime/1000}s avant réessai...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Si c'est la dernière tentative ou une autre erreur, lancer l'erreur
      if (attempt === retries) {
        console.error("❌ Erreur analyse image après", retries, "tentatives:", error);
        throw error;
      }
    }
  }
}

// Fonction pour envoyer un message vocal dans un chat texte
async function sendVoiceMessage(channel, text, userId) {
  try {
    // Générer la réponse avec OpenAI
    const answer = await generateTextWithOpenAI(text, userId);

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

  // Commande pour voir la caméra
  if (message.content.startsWith("!camera") || message.content.startsWith("!cam") || message.content.startsWith("!visio")) {
    // Extraire la question si présente
    const question = message.content.slice(message.content.indexOf(" ") + 1).trim() || null;
    
    // Envoyer une demande de capture au script client local (si disponible)
    await message.reply("📷 **Capture caméra demandée...**\n\n💡 Si tu as le script client tournant sur ton PC, la capture sera automatique.\n\n📱 **Pour téléphone/tablette :** Envoie-moi une photo directement dans le chat et je l'analyserai !");
    
    // Envoyer un message spécial que le script client peut détecter
    await message.channel.send("CAPTURE_REQUEST:CAMERA");
    
    // Attendre 10 secondes pour voir si une image arrive
    const collector = message.channel.createMessageCollector({
      filter: (msg) => msg.author.id === message.author.id && msg.attachments.size > 0,
      time: 10000,
      max: 1
    });
    
    collector.on("collect", async (collectedMessage) => {
      const imageAttachment = collectedMessage.attachments.first();
      if (imageAttachment && imageAttachment.contentType?.startsWith("image/")) {
        await analyzeAndRespond(message.channel, imageAttachment, question, "caméra");
      }
    });
    
    // Aussi détecter les images envoyées par le script client (qui pourrait être un autre bot)
    const clientCollector = message.channel.createMessageCollector({
      filter: (msg) => {
        // Détecter les messages avec images contenant "Capture caméra depuis ton PC"
        return msg.attachments.size > 0 && 
               (msg.content.includes("Capture caméra") || msg.content.includes("Capture caméra depuis"));
      },
      time: 15000,
      max: 1
    });
    
    clientCollector.on("collect", async (collectedMessage) => {
      const imageAttachment = collectedMessage.attachments.first();
      if (imageAttachment && imageAttachment.contentType?.startsWith("image/")) {
        await analyzeAndRespond(message.channel, imageAttachment, question, "caméra");
      }
    });
    
    collector.on("end", (collected) => {
      if (collected.size === 0) {
        // Si aucune image n'a été reçue, le script client n'est peut-être pas actif
        // On laisse l'utilisateur envoyer une image manuellement
      }
    });
    
    return;
  }

  // Commande pour voir l'écran
  if (message.content.startsWith("!screen") || message.content.startsWith("!ecran") || message.content.startsWith("!analyse")) {
    // Extraire la question si présente
    const question = message.content.slice(message.content.indexOf(" ") + 1).trim() || null;
    
    // Envoyer une demande de capture au script client local (si disponible)
    await message.reply("🔍 **Capture d'écran demandée...**\n\n💡 Si tu as le script client tournant sur ton PC, la capture sera automatique.\n\n📱 **Pour téléphone/tablette :** Envoie-moi une capture d'écran directement dans le chat et je l'analyserai !");
    
    // Envoyer un message spécial que le script client peut détecter
    await message.channel.send("CAPTURE_REQUEST:SCREEN");
    
    // Attendre 10 secondes pour voir si une image arrive
    const collector = message.channel.createMessageCollector({
      filter: (msg) => msg.author.id === message.author.id && msg.attachments.size > 0,
      time: 10000,
      max: 1
    });
    
    collector.on("collect", async (collectedMessage) => {
      const imageAttachment = collectedMessage.attachments.first();
      if (imageAttachment && imageAttachment.contentType?.startsWith("image/")) {
        await analyzeAndRespond(message.channel, imageAttachment, question, "écran");
      }
    });
    
    // Aussi détecter les images envoyées par le script client (qui pourrait être un autre bot)
    const clientCollector = message.channel.createMessageCollector({
      filter: (msg) => {
        // Détecter les messages avec images contenant "Capture d'écran depuis ton PC"
        return msg.attachments.size > 0 && 
               (msg.content.includes("Capture d'écran") || msg.content.includes("Capture d'écran depuis"));
      },
      time: 15000,
      max: 1
    });
    
    clientCollector.on("collect", async (collectedMessage) => {
      const imageAttachment = collectedMessage.attachments.first();
      if (imageAttachment && imageAttachment.contentType?.startsWith("image/")) {
        await analyzeAndRespond(message.channel, imageAttachment, question, "écran");
      }
    });
    
    return;
  }

  // Analyser les images envoyées dans Discord (depuis n'importe quel appareil)
  // Ignorer si c'est une réponse à une demande de capture (déjà géré par les collectors)
  if (message.attachments.size > 0 && !message.reference) {
    const imageAttachments = message.attachments.filter(attachment => {
      // Vérifier le type MIME
      if (attachment.contentType && attachment.contentType.startsWith("image/")) {
        return true;
      }
      // Vérifier aussi l'extension du nom de fichier (pour compatibilité)
      const ext = attachment.name?.split('.').pop()?.toLowerCase();
      return ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
    });

    if (imageAttachments.size > 0) {
      // Extraire la question du message si présente
      const question = message.content.replace(`<@${client.user.id}>`, "").trim() || null;
      
      await message.reply("🖼️ Analyse de l'image en cours... (depuis ton appareil)");

      try {
        // Prendre la première image
        const imageAttachment = imageAttachments.first();
        const imageUrl = imageAttachment.url;

        console.log(`📥 Image reçue depuis ${message.author.username} (${message.author.id}): ${imageAttachment.name} (${(imageAttachment.size / 1024).toFixed(2)} KB)`);

        // Télécharger l'image
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Erreur téléchargement: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Déterminer l'extension
        const ext = imageAttachment.name?.split('.').pop()?.toLowerCase() || 
                   imageAttachment.contentType?.split('/')[1]?.split(';')[0] || 
                   'png';

        // Sauvegarder temporairement
        const imagePath = path.join(__dirname, `temp_discord_${Date.now()}.${ext}`);
        fs.writeFileSync(imagePath, buffer);

        console.log(`✅ Image sauvegardée: ${imagePath} (${(buffer.length / 1024).toFixed(2)} KB)`);

        // Analyser l'image avec OpenAI Vision
        const description = await analyzeImageWithOpenAI(imagePath, question || null);

        await message.channel.send({
          content: `🖼️ **Ce que je vois dans cette image :**\n${description}`,
        });

        // Nettoyer le fichier temporaire
        setTimeout(() => {
          if (fs.existsSync(imagePath)) {
            fs.removeSync(imagePath);
            console.log(`🗑️ Fichier temporaire supprimé: ${imagePath}`);
          }
        }, 60000);
      } catch (error) {
        console.error("❌ Erreur analyse image Discord:", error);
        let errorMsg = "❌ Erreur lors de l'analyse de l'image.";
        
        if (error.status === 429) {
          errorMsg = "❌ Trop de requêtes vers OpenAI API (quota dépassé). Attends quelques secondes et réessaye. Le bot va automatiquement réessayer avec un délai.";
        } else if (error.message && error.message.includes("téléchargement")) {
          errorMsg = "❌ Erreur lors du téléchargement de l'image. Vérifie que l'image est valide et réessaye.";
        }
        
        await message.reply(errorMsg);
      }
      return;
    }
  }

  // Répondre aux messages mentionnant le bot ou commençant par "!"
  const mentioned = message.mentions.has(client.user);
  const isCommand = message.content.startsWith("!");
  
  if (mentioned || (isCommand && !message.content.startsWith("!join") && !message.content.startsWith("!leave") && !message.content.startsWith("!voice") && !message.content.startsWith("!vocal") && !message.content.startsWith("!camera") && !message.content.startsWith("!cam") && !message.content.startsWith("!visio") && !message.content.startsWith("!screen") && !message.content.startsWith("!ecran") && !message.content.startsWith("!analyse"))) {
    try {
      const userMessage = message.content.replace(`<@${client.user.id}>`, "").trim();
      const answer = await generateTextWithOpenAI(userMessage, message.author.id);
      await message.reply(answer);
    } catch (error) {
      console.error("Erreur réponse texte:", error);
      let errorMsg = "❌ Désolé, une erreur s'est produite.";
      
      if (error.message && error.message.includes("quota")) {
        errorMsg = "❌ Quota API dépassé. Attends quelques secondes et réessaye. Le bot va automatiquement réessayer avec un délai.";
      }
      
      message.reply(errorMsg);
    }
  }
});

// Démarrer un serveur HTTP simple pour Render (détection de port)
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot Discord en ligne !");
});

server.listen(PORT, () => {
  console.log(`🌐 Serveur HTTP démarré sur le port ${PORT} (pour Render)`);
});

// Connexion du bot Discord
client.login(process.env.DISCORD_TOKEN);

