# 🔍 Guide de débogage - Capture PC

## Problème : Le script client ne répond pas

### Vérifications à faire

1. **Vérifier que le script client tourne**
   ```bash
   # Dans un terminal, lance le script client
   node capture-client.js
   ```
   
   Tu devrais voir :
   ```
   ✅ Client de capture connecté en tant que [Nom du bot client]
   📡 En attente de demandes de capture depuis le bot...
   ```

2. **Vérifier les logs quand tu utilises `!cam`**
   
   **Dans le terminal du script client**, tu devrais voir :
   ```
   📨 Message reçu de [Nom du bot principal] (bot): CAPTURE_REQUEST:CAMERA...
   📷 ✅ Demande de capture caméra détectée !
   📝 Message complet: "CAPTURE_REQUEST:CAMERA"
   👤 Auteur: [Nom du bot] (bot: true)
   ✅ Capture caméra réussie
   ✅ Capture caméra envoyée avec succès !
   📤 Message envoyé dans le canal: [nom du canal]
   ```
   
   **Dans le terminal du bot principal**, tu devrais voir :
   ```
   📤 Message CAPTURE_REQUEST:CAMERA envoyé dans le canal [nom du canal]
   🔍 Message avec attachment détecté de [Nom du bot client] (bot: true): "📷 **Capture caméra depuis ton PC :**"
   🔍 Image bot détectée - hasImage: true, isFromClient: true
   ✅ Image du script client acceptée
   📥 Image collectée de [Nom du bot client]
   ```

3. **Si le script client ne reçoit pas le message**
   
   - Vérifie que le script client utilise un **token Discord différent** du bot principal
   - Vérifie que le script client est dans le **même serveur Discord**
   - Vérifie que le script client a les permissions **"Read Message History"** et **"View Channels"**

4. **Si le script client reçoit mais ne capture pas**
   
   - Vérifie que la caméra est disponible sur ton PC
   - Sur macOS, installe `imagesnap` : `brew install imagesnap`
   - Vérifie les erreurs dans les logs

5. **Si le script client envoie mais le bot ne détecte pas**
   
   - Vérifie que le message envoyé contient bien "Capture caméra depuis ton PC"
   - Vérifie que l'image est bien attachée (pas juste un lien)
   - Vérifie les logs du bot principal

## Configuration requise dans .env

```env
# Token du bot principal
DISCORD_TOKEN=token_bot_principal

# Token du script client (DIFFÉRENT du bot principal !)
DISCORD_CLIENT_TOKEN=token_bot_client_separé
```

## Créer un bot Discord séparé pour le script client

1. Va sur https://discord.com/developers/applications
2. Clique sur "New Application"
3. Donne un nom (ex: "Capture Client")
4. Va dans "Bot" > "Add Bot"
5. Copie le token
6. Va dans "OAuth2" > "URL Generator"
7. Sélectionne les permissions :
   - Send Messages
   - Attach Files
   - Read Message History
   - View Channels
8. Copie l'URL et ouvre-la dans ton navigateur
9. Invite le bot dans ton serveur Discord
10. Ajoute le token dans `.env` comme `DISCORD_CLIENT_TOKEN`

## Test rapide

1. Lance le bot principal : `node index.js`
2. Lance le script client dans un autre terminal : `node capture-client.js`
3. Dans Discord, tape `!cam`
4. Regarde les logs dans les deux terminaux

Si tu vois des erreurs, envoie-les moi et je t'aiderai à les résoudre !

