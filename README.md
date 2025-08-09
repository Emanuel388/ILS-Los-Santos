
# Flashing Lights Statussystem v2 (Render-fertig)

🚒 Unterstützte Funktionen:
- Login-System für Feuerwehr, RD, Polizei, Leitstelle & Admin
- Statusvergabe (1–8 + 0)
- Adminpanel: Benutzer/Fahrzeuge/Fraktionen verwalten
- Alarm bei Einsatz mit Ton
- Protokoll: Statusänderungen und Fahrzeugmeldungen
- Krankenhausübersicht für Status 8

## Deployment (für https://render.com)
1. Repo auf GitHub hochladen
2. Neues Web Service erstellen bei Render
3. Konfiguration:
   - Root Directory: ./ oder leer lassen
   - Build Command: npm install
   - Start Command: node server.js
4. URL z. B. https://fl-status.onrender.com

## Logins:
- admin / adminpw
- leit / leitpw
- fw1 / fwpw
- rd1 / rdpw
- pol1 / polpw
