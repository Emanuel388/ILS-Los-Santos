require("dotenv").config();
const express    = require("express");
const session    = require("express-session");
const cors       = require("cors");
const http       = require("http");
const path       = require("path");
const mongoose   = require("mongoose");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);

// 1) Grund-Konfiguration
const PORT      = process.env.PORT || 3000;
const isProd    = process.env.NODE_ENV === "production";
const CLIENTURL = isProd
  ? "https://flashing-light-leitstelle.onrender.com"
  : `http://localhost:${PORT}`;
const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error("❌ Bitte MONGO_URL in der .env setzen!");
  process.exit(1);
}

// 2) Express-Middleware
app.use(cors({ origin: CLIENTURL, credentials: true }));
app.use(express.json());
app.set("trust proxy", 1);
app.use(session({
  secret:            process.env.SESSION_SECRET || "bitte_ändern!",
  resave:            false,
  saveUninitialized: false,
  proxy:             isProd,
  cookie: {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge:   24 * 60 * 60 * 1000
  }
}));

// 3) Schemas & Models
const userSchema = new mongoose.Schema({
  username: { type:String, unique:true },
  password: String,
  role:     String
});
const vehicleSchema = new mongoose.Schema({
  name:          { type:String, unique:true },
  role:           String,
  forLeitstelle: Boolean
});
const logSchema = new mongoose.Schema({
  vehicle: String,
  status:  Number,
  user:    String,
  role:    String,
  time:    Date
});
const missionSchema = new mongoose.Schema({
  vehicles:    [String],
  title:       String,
  description: String,
  createdBy:   String,
  createdAt:   Date,
  notes:       [{ by:String, at:Date, text:String }],
  alarms:      [{ at:Date, note:String }],
  completed:   { type:Boolean, default:false },
  completedAt: Date
});
missionSchema.index({ completedAt: 1 }, { expireAfterSeconds: 3*24*60*60 });

const User    = mongoose.model("User",    userSchema);
const Vehicle = mongoose.model("Vehicle", vehicleSchema);
const Log     = mongoose.model("Log",     logSchema);
const Mission = mongoose.model("Mission", missionSchema);

// 4) MongoDB verbinden & Seeding
mongoose.connect(MONGO_URL, { useNewUrlParser:true, useUnifiedTopology:true })
.then(async () => {
  console.log("✅ MongoDB connected");
  if (await User.countDocuments() === 0) {
    console.log("🌱 Seeding default users");
    await User.create([
      {username:"admin",password:"adminpw",role:"admin"},
      {username:"leit", password:"leitpw", role:"leitstelle"},
      {username:"fw1",  password:"fwpw",  role:"feuerwehr"},
      {username:"pol1", password:"polpw", role:"polizei"},
      {username:"rd1",  password:"rdpw",  role:"rettung"}
    ]);
  }
  if (await Vehicle.countDocuments() === 0) {
    console.log("🌱 Seeding default vehicles");
    await Vehicle.create([
      {name:"RTW 1",           role:"rettung",   forLeitstelle:true},
      {name:"LF 1",            role:"feuerwehr", forLeitstelle:true},
      {name:"Streifenwagen 1", role:"polizei",   forLeitstelle:true}
    ]);
  }
  if (await Mission.countDocuments() === 0) {
    console.log("🌱 Seeding demo mission");
    await Mission.create({
      vehicles:   ["RTW 1"],
      title:      "Demo‐Einsatz",
      description:"Automatisch angelegt",
      createdBy:  "leit",
      createdAt:  new Date(),
      notes:      [],
      alarms:     [],
      completed:  false,
      completedAt:null
    });
  }
})
.catch(err => {
  console.error("❌ Mongo-Fehler:", err);
  process.exit(1);
});

// 5) Socket.IO
const io = new Server(server, {
  cors:{ origin:CLIENTURL, methods:["GET","POST","PUT","DELETE"], credentials:true }
});
io.on("connection", socket => {
  console.log("🔌 Socket.IO verbunden:", socket.id);
});

// 6) Auth‑Helper
function ensureLogin(req,res,next){
  if (!req.session.user) return res.status(401).send("Unauthorized");
  next();
}
function ensureRole(roles){
  return (req,res,next) => {
    if (!req.session.user || !roles.includes(req.session.user.role))
      return res.status(403).send("Forbidden");
    next();
  };
}

// 7) Debug & Login
app.get("/debug-session", (req,res) =>
  res.json({ sessionUser:req.session.user||null })
);
app.get("/", (req,res) =>
  res.sendFile(path.join(__dirname,"webapp","login.html"))
);
app.post("/login", async (req,res) => {
  const { username, password } = req.body;
  const u = await User.findOne({ username, password }).lean();
  if (!u) return res.json({ success:false });
  req.session.user = { username:u.username, role:u.role };
  res.json({ success:true, role:u.role });
});
app.post("/logout", ensureLogin, (req,res) =>
  req.session.destroy(err => err ? res.sendStatus(500) : res.json({success:true}))
);

// 8) Admin‑Routen
app.get("/admin.html",
  ensureLogin, ensureRole(["admin"]),
  (req,res) => res.sendFile(path.join(__dirname,"webapp","admin.html"))
);

// Users
app.get("/admin/users",
  ensureLogin, ensureRole(["admin"]),
  async (req,res) => res.json(await User.find().lean())
);
app.post("/admin/users",
  ensureLogin, ensureRole(["admin"]),
  async (req,res) => {
    const { username, password, role } = req.body;
    if (!username||!password||!role)
      return res.status(400).json({ success:false, message:"Fehlende Felder" });
    if (await User.exists({ username }))
      return res.status(409).json({ success:false, message:"User existiert" });
    await User.create({ username, password, role });
    res.json({ success:true });
  }
);
app.put("/admin/users/:id",
  ensureLogin, ensureRole(["admin"]),
  async (req,res) => {
    const { password, role } = req.body;
    const u = await User.findById(req.params.id);
    if (!u) return res.sendStatus(404);
    if (typeof password === "string") u.password = password;
    if (typeof role === "string")     u.role     = role;
    await u.save();
    res.json({ success:true });
  }
);
app.delete("/admin/users/:id",
  ensureLogin, ensureRole(["admin"]),
  async (req,res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success:true });
  }
);

// Vehicles
app.get("/admin/vehicles",
  ensureLogin, ensureRole(["admin"]),
  async (req,res) => res.json(await Vehicle.find().lean())
);
app.post("/admin/vehicles",
  ensureLogin, ensureRole(["admin"]),
  async (req,res) => {
    const { name, role, forLeitstelle } = req.body;
    if (!name||!role)
      return res.status(400).json({ success:false, message:"Fehlende Felder" });
    if (await Vehicle.exists({ name }))
      return res.status(409).json({ success:false, message:"Fahrzeug existiert" });
    await Vehicle.create({ name, role, forLeitstelle:!!forLeitstelle });
    res.json({ success:true });
  }
);
app.put("/admin/vehicles/:id",
  ensureLogin, ensureRole(["admin"]),
  async (req,res) => {
    const { role, forLeitstelle } = req.body;
    const v = await Vehicle.findById(req.params.id);
    if (!v) return res.sendStatus(404);
    if (typeof role === "string")    v.role           = role;
    if (typeof forLeitstelle === "boolean")
                                      v.forLeitstelle = forLeitstelle;
    await v.save();
    res.json({ success:true });
  }
);
app.delete("/admin/vehicles/:id",
  ensureLogin, ensureRole(["admin"]),
  async (req,res) => {
    await Vehicle.findByIdAndDelete(req.params.id);
    res.json({ success:true });
  }
);

// 9) Leitstelle & Fahrer
app.get("/leitstelle.html",
  ensureLogin, ensureRole(["admin","leitstelle"]),
  (req,res) => res.sendFile(path.join(__dirname,"webapp","leitstelle.html"))
);
app.get("/fahrer.html", ensureLogin,
  (req,res) => res.sendFile(path.join(__dirname,"webapp","fahrer.html"))
);
app.get("/vehicles", ensureLogin, async (req,res) => {
  const role = req.session.user.role.toLowerCase();
  if (["admin","leitstelle"].includes(role)) {
    return res.json(await Vehicle.find({ forLeitstelle:true }).lean());
  }
  res.json(await Vehicle.find({ role }).lean());
});

// 10) Status, Log, Missionen, Notes, Alarms
app.post("/status", ensureLogin, async (req,res) => {
  const { vehicle, status } = req.body;
  const entry = {
    vehicle, status,
    user: req.session.user.username,
    role: req.session.user.role,
    time: new Date()
  };
  await Log.create(entry);
  io.emit("statusUpdate", entry);
  if (status === 5) io.emit("highPriority", entry);
  res.json({ success:true });
});
app.get("/log", ensureLogin, ensureRole(["admin","leitstelle"]),
  async (req,res) => res.json(await Log.find().lean())
);
app.post("/missions", ensureLogin, ensureRole(["admin","leitstelle"]),
  async (req,res) => {
    const { vehicles, title, description } = req.body;
    if (!Array.isArray(vehicles)||!vehicles.length||!title)
      return res.status(400).json({ success:false });
    const m = new Mission({
      vehicles, title, description:description||"",
      createdBy:req.session.user.username,
      createdAt:new Date(), notes:[], alarms:[],
      completed:false, completedAt:null
    });
    await m.save();
    io.emit("newMission", m);
    res.json({ success:true, mission:m });
  }
);
app.get("/missions", ensureLogin, async (req,res) => {
  const role = req.session.user.role.toLowerCase();
  const filter = ["admin","leitstelle"].includes(role)
    ? {} : { vehicles:req.session.user.vehicle };
  res.json(await Mission.find(filter).lean());
});
app.put("/missions/:id", ensureLogin, ensureRole(["admin","leitstelle"]),
  async (req,res) => {
    const { vehicles, title, description, completed } = req.body;
    const m = await Mission.findById(req.params.id);
    if (!m) return res.sendStatus(404);

    const changes = [];
    if (Array.isArray(vehicles)
      && JSON.stringify(vehicles)!==JSON.stringify(m.vehicles)
    ) {
      changes.push(
        `Fahrzeuge: [${m.vehicles.join(", ")}]→[${vehicles.join(", ")}]`
      );
      m.vehicles = vehicles;
    }
    if (typeof title==="string" && title!==m.title) {
      changes.push(`Titel: "${m.title}"→"${title}"`);
      m.title = title;
    }
    if (typeof description==="string" && description!==m.description) {
      changes.push(`Beschreibung geändert`);
      m.description = description;
    }
    if (typeof completed==="boolean" && completed!==m.completed) {
      changes.push(
        `Status: ${m.completed?"offen":"abgeschlossen"}→${completed?"abgeschlossen":"offen"}`
      );
      m.completed   = completed;
      m.completedAt = completed? new Date() : null;
    }
    if (changes.length) {
      m.notes.push({
        by:   req.session.user.username,
        at:   new Date(),
        text: changes.join("; ")
      });
    }

    await m.save();
    io.emit("missionUpdated", m);
    res.json({ success:true, mission:m });
  }
);
app.post("/missions/:id/notes", ensureLogin, async (req,res) => {
  const m = await Mission.findById(req.params.id);
  if (!m) return res.sendStatus(404);
  m.notes.push({
    by:   req.session.user.username,
    at:   new Date(),
    text: req.body.text||""
  });
  await m.save();
  res.json({ success:true, notes:m.notes });
});
app.post("/missions/:id/alarms", ensureLogin, async (req,res) => {
  const m = await Mission.findById(req.params.id);
  if (!m) return res.sendStatus(404);
  m.alarms.push({
    at:   new Date(req.body.at||Date.now()),
    note: `Alarm von ${req.session.user.username}`
  });
  await m.save();
  res.json({ success:true, alarms:m.alarms });
});

// 11) Static Files
app.use(express.static(path.join(__dirname,"webapp")));

// 12) Server starten
server.listen(PORT, () =>
  console.log(`✅ Server läuft auf Port ${PORT}  (Prod=${isProd})`)
);
