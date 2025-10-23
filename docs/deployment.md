# Deploiement d'Eos MCP en service systeme

Ce guide explique comment executer Eos MCP en tant que service durable sous Linux (systemd) ou Windows (NSSM). Il suppose que vous disposez d'un binaire autonome genere avec `npm run package` et que votre fichier d'environnement (`.env`) est pret.

## Preparation commune

1. Installez les dependances et compilez le projet :
   ```bash
   npm install
   npm run package
   ```
2. Le binaire autonome est produit dans `dist/bin/eos-mcp`. Copiez-le sur la machine cible avec votre fichier `.env` et le dossier `logs/` si vous souhaitez reutiliser la meme arborescence.

## Linux (systemd)

1. Copiez l'unite fournie vers `/etc/systemd/system/` puis adaptez les chemins :
   ```bash
   sudo cp scripts/deploy/eos-mcp.service /etc/systemd/system/eos-mcp.service
   sudo nano /etc/systemd/system/eos-mcp.service
   ```
   Les directives suivantes doivent pointer vers votre installation :
   - `WorkingDirectory` : dossier racine de l'application (ex. `/opt/eos-mcp`).
   - `ExecStart` : chemin du binaire empaquete (ex. `/opt/eos-mcp/dist/bin/eos-mcp`).
   - `EnvironmentFile` : fichier regroupant vos variables (`/etc/eos-mcp/eos-mcp.env` dans l'exemple).

2. Copiez votre fichier d'environnement dans l'emplacement choisi :
   ```bash
   sudo install -d -m 0750 -o eos-mcp -g eos-mcp /etc/eos-mcp
   sudo cp .env /etc/eos-mcp/eos-mcp.env
   sudo chown eos-mcp:eos-mcp /etc/eos-mcp/eos-mcp.env
   sudo chmod 640 /etc/eos-mcp/eos-mcp.env
   ```

3. Rechargez systemd puis activez et demarrez le service :
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now eos-mcp.service
   ```

4. Surveillez les journaux avec `journalctl` :
   ```bash
   sudo journalctl -u eos-mcp.service -f
   ```
   Les logs apparaissent egalement dans `logs/mcp-server.log` si le niveau `file` est active dans votre configuration.

## Windows (NSSM)

1. Telechargez NSSM depuis <https://nssm.cc/download> et placez l'executable dans un repertoire present dans `%PATH%` (ex. `C:\\Windows\\System32`).

2. Copiez le script `scripts/deploy/eos-mcp.nssm.cmd` sur la machine cible puis adaptez les variables situees en tete de fichier (`SERVICE_NAME`, `EXEC_START`, `WORKING_DIRECTORY`, `ENVIRONMENT_FILE`, `LOG_DIRECTORY`). Assurez-vous que `EXEC_START` pointe vers le binaire empaquete (`eos-mcp.exe` si vous produisez une cible Windows avec `pkg`). Si le fichier reference par `ENVIRONMENT_FILE` existe, le script lit chaque ligne `cle=valeur` (en ignorant les vides/commentaires) et les injecte automatiquement dans l'environnement du service via `AppEnvironmentExtra`.

3. Executez le script dans une invite de commandes avec des droits administrateur :
   ```bat
   eos-mcp.nssm.cmd
   ```
   Le service est installe en demarrage automatique, et les logs sont ecrits dans le fichier `eos-mcp-service.log` du dossier indique.

4. Pour verifier l'etat du service :
   ```bat
   sc query "EosMCP"
   ```

5. Pour consulter les logs, ouvrez le fichier `eos-mcp-service.log` genere par NSSM ou exploitez l'observateur d'evenements (`eventvwr.msc`) si vous redirigez la sortie vers Windows Event Log.

6. Pour desinstaller le service, relancez le script avec l'option `/U` :
   ```bat
   eos-mcp.nssm.cmd /U
   ```

> **Astuce :** ajoutez un planificateur de taches ou une supervision externe pour redemarrer le service si vos conditions d'exploitation l'exigent. NSSM peut gerer la relance automatique et la rotation des fichiers de logs comme illustre dans le script fourni.
