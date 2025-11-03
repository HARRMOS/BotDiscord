# 📸 Guide d'installation - Capture depuis PC et Téléphone

Ce guide explique comment configurer les captures d'écran et caméra depuis ton PC et ton téléphone.

## 🚀 Utilisation Rapide

### Option 1 : Envoyer directement une image (Le plus simple !)
- **Sur téléphone/PC** : Envoie simplement une photo ou capture d'écran dans le chat Discord
- Le bot l'analysera automatiquement !
- Tu peux aussi poser une question avec l'image : "Qu'est-ce que c'est ?"

### Option 2 : Utiliser les commandes avec script client (PC uniquement)
- Lance le script client sur ton PC
- Utilise `!screen` ou `!cam` dans Discord
- La capture sera automatique si le script tourne

## 🖥️ Pour PC (Script Client)

### Installation

1. **Installer les dépendances** (si pas déjà fait):
```bash
npm install
```

2. **Créer un bot Discord séparé pour le client** (Recommandé):
   - Va sur https://discord.com/developers/applications
   - Crée une nouvelle application (ou utilise celle existante)
   - Va dans "Bot" et crée un bot
   - Active les permissions : "Send Messages", "Attach Files", "Read Message History"
   - Copie le token du bot
   - Invite le bot dans ton serveur Discord
   - Ajoute `DISCORD_CLIENT_TOKEN=ton_token_bot_client` dans ton `.env`

3. **Lancer le script client**:
```bash
node capture-client.js
```

Le script va écouter les demandes de capture depuis le bot Discord principal et faire les captures automatiquement.

### Utilisation

1. Lance `capture-client.js` sur ton PC
2. Dans Discord, tape `!screen` ou `!cam`
3. Le script va automatiquement capturer et envoyer l'image au bot
4. Le bot analysera l'image et répondra

## 📱 Pour Téléphone/Tablette (Interface Web)

### Option 1 : Utiliser un Webhook Discord

1. **Créer un webhook Discord**:
   - Va dans les paramètres de ton canal Discord
   - Clique sur "Intégrations" > "Webhooks"
   - Crée un nouveau webhook
   - Copie l'URL du webhook

2. **Ouvrir l'interface web**:
   - Ouvre `public/capture.html` dans ton navigateur
   - Ajoute `?webhook=TON_URL_WEBHOOK` à l'URL
   - Exemple : `file:///chemin/capture.html?webhook=https://discord.com/api/webhooks/...`

3. **Utiliser**:
   - Clique sur "Capturer l'écran" ou "Capturer la caméra"
   - Autorise les permissions
   - L'image sera envoyée automatiquement au bot Discord

### Option 2 : Héberger l'interface web

1. **Avec un serveur HTTP simple**:
```bash
# Installer un serveur HTTP simple
npm install -g http-server

# Dans le dossier du projet
http-server public -p 8080
```

2. **Ouvrir dans le navigateur**:
   - Sur ton téléphone, va sur `http://TON_IP:8080/capture.html?webhook=TON_URL_WEBHOOK`
   - Tu peux aussi utiliser un service comme ngrok pour exposer le serveur

### Option 3 : Envoyer directement depuis Discord

Tu peux aussi simplement envoyer une photo directement dans le chat Discord et le bot l'analysera automatiquement !

## 🔧 Configuration

### Variables d'environnement (.env)

```env
# Token du bot principal
DISCORD_TOKEN=ton_token_bot_principal

# Token du client de capture (optionnel, peut être le même)
DISCORD_CLIENT_TOKEN=ton_token_client

# ID du bot principal (optionnel)
BOT_USER_ID=123456789
```

## 🚀 Utilisation rapide

### Sur PC :
1. Lance `node capture-client.js` sur ton PC
2. Tape `!screen` ou `!cam` dans Discord
3. La capture est automatique !

### Sur Téléphone :
1. Envoie une photo directement dans le chat Discord
2. Le bot l'analysera automatiquement
3. Ou utilise l'interface web avec un webhook

## ⚠️ Notes importantes

- Le script client doit tourner sur ton PC pour que les captures automatiques fonctionnent
- Pour le téléphone, tu peux simplement envoyer des photos directement dans Discord
- L'interface web nécessite un webhook Discord pour fonctionner
- Les captures sont temporaires et sont supprimées après analyse

## 🐛 Dépannage

### Le script client ne répond pas
- Vérifie que le token est correct dans `.env`
- Vérifie que le script tourne sur le même serveur Discord
- Vérifie les permissions du bot dans Discord

### L'interface web ne fonctionne pas
- Vérifie que l'URL du webhook est correcte
- Vérifie que les permissions du navigateur sont accordées
- Essaie d'envoyer directement une photo dans Discord à la place

