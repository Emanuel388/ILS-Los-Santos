// client.js

// Socket.IO initialisieren
const socket = io();

// DOM-Referenzen
const missionsBody = document.getElementById("missionsBody");
const selVehicles  = document.getElementById("missionVehicles");
const inpTitle     = document.getElementById("missionTitle");
const inpDesc      = document.getElementById("missionDesc");
const btnCreate    = document.getElementById("btnCreate");
const fb           = document.getElementById("missionFeedback");

// Hilfsfunktionen
const fmt = iso => new Date(iso).toLocaleString();

// 1) Missions-Tabelle einmalig füllen
async function loadMissions() {
  missionsBody.innerHTML = "";           // Tabelle leeren
  const res = await fetch("/missions", {
    credentials: "include"
  });
  if (!res.ok) return;
  const arr = await res.json();
  arr.forEach(m => {
    const tr = document.createElement("tr");
    tr.id = "mission-" + m.id;
    tr.innerHTML = `
      <td>${m.id}</td>
      <td>${m.vehicles.join(", ")}</td>
      <td>${m.title}</td>
      <td>${m.description}</td>
      <td>${m.createdBy}</td>
      <td>${fmt(m.createdAt)}</td>
      <td><button onclick="openEdit('${m.id}')">Bearbeiten</button></td>
    `;
    missionsBody.appendChild(tr);
  });
}

// 2) Socket-Events binden
socket.on("newMission",      loadMissions);
socket.on("missionUpdated",  loadMissions);

// 3) Initial laden
loadMissions();

// 4) Einsatz anlegen-Handler (ohne erneutes loadMissions hier)
btnCreate.addEventListener("click", async () => {
  const vehicles    = Array.from(selVehicles.selectedOptions).map(o => o.value);
  const title       = inpTitle.value.trim();
  const description = inpDesc.value.trim();

  if (!vehicles.length || !title) {
    fb.style.color = "red";
    fb.textContent = "❗ Bitte mindestens 1 Fahrzeug und einen Titel angeben";
    return;
  }

  const res = await fetch("/missions", {
    method:      "POST",
    credentials: "include",
    headers:     { "Content-Type": "application/json" },
    body:        JSON.stringify({ vehicles, title, description })
  });
  const j = await res.json();

  if (j.success) {
    fb.style.color = "green";
    fb.textContent = "✅ Einsatz angelegt";
    // **Kein** loadMissions() hier! Die Tabelle wird übers Socket-Event aktualisiert.
  } else {
    fb.style.color = "red";
    fb.textContent = "❌ " + (j.message || "Fehler beim Anlegen");
  }
});
// Globale Variable, um zu wissen welche Mission wir gerade bearbeiten
let curEditId = null;

// openEdit(id) wird durch den onclick im loadMissions-Template aufgerufen:
window.openEdit = function(id) {
  curEditId = id;
  console.log("Edit gestartet für Mission:", id);

  // 1) Missionen abrufen und passende Mission finden
  fetch("/missions", { credentials: "include" })
    .then(r => {
      if (!r.ok) throw new Error("missions fetch failed: " + r.status);
      return r.json();
    })
    .then(arr => {
      const m = arr.find(x => x.id === id);
      if (!m) throw new Error("Mission nicht gefunden: " + id);

      // Felder mit Daten befüllen
      document.getElementById("editTitle").value       = m.title;
      document.getElementById("editDesc").value        = m.description;

      // Fahrzeuge-Select füllen
      const sel = document.getElementById("editVehicles");
      sel.innerHTML = "";
      return fetch("/vehicles", { credentials: "include" })
        .then(r2 => {
          if (!r2.ok) throw new Error("vehicles fetch failed: " + r2.status);
          return r2.json();
        })
        .then(vehiclesList => {
          vehiclesList.forEach(v => {
            const opt = new Option(v.name, v.name);
            if (m.vehicles.includes(v.name)) opt.selected = true;
            sel.appendChild(opt);
          });

          // Modal einblenden
          document.getElementById("editModal").style.display = "block";
        });
    })
    .catch(err => {
      console.error("openEdit-Fehler:", err);
      alert("Fehler beim Laden der Mission: " + err.message);
    });
};

// Event-Listener für Speichern im Edit-Dialog
document.getElementById("btnSaveEdit").addEventListener("click", async () => {
  if (!curEditId) {
    console.warn("Kein curEditId gesetzt!");
    return;
  }

  // Werte aus dem Formular auslesen
  const vehicles    = Array.from(document.getElementById("editVehicles").selectedOptions)
                             .map(o => o.value);
  const title       = document.getElementById("editTitle").value.trim();
  const description = document.getElementById("editDesc").value.trim();

  console.log("Sende PUT /missions/" + curEditId, { vehicles, title, description });

  // PUT-Anfrage
  const res = await fetch(`/missions/${curEditId}`, {
    method:      "PUT",
    credentials: "include",
    headers:     { "Content-Type": "application/json" },
    body:        JSON.stringify({ vehicles, title, description })
  });
  console.log("Antwort PUT /missions/:id:", res.status);

  if (res.ok) {
    // Formular schließen
    document.getElementById("editModal").style.display = "none";
    curEditId = null;
    // Tabelle aktualisiert sich automatisch durch socket.on("missionUpdated", loadMissions)
  }
  else {
    const errText = await res.text().catch(() => res.status);
    alert("Speichern fehlgeschlagen: " + errText);
  }
});
