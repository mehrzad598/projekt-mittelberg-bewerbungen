const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "11011968";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "projekt-mittelberg-session-secret";

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "applications.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

const ROLES = ["Modder", "Skinner", "Supporter", "Admin"];

app.set("trust proxy", 1);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

function defaultSettings() {
  return {
    applications: {
      Modder: true,
      Skinner: true,
      Supporter: true,
      Admin: true,
    },
    updatedAt: null,
  };
}

function readSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));

    // Neue Struktur
    if (parsed.applications && typeof parsed.applications === "object") {
      const settings = defaultSettings();

      for (const role of ROLES) {
        if (typeof parsed.applications[role] === "boolean") {
          settings.applications[role] = parsed.applications[role];
        }
      }

      settings.updatedAt = parsed.updatedAt || null;
      return settings;
    }

    // Alte Struktur automatisch übernehmen
    if (typeof parsed.applicationsOpen === "boolean") {
      const settings = defaultSettings();

      for (const role of ROLES) {
        settings.applications[role] = parsed.applicationsOpen;
      }

      settings.updatedAt = parsed.updatedAt || null;
      return settings;
    }

    return defaultSettings();
  } catch {
    const settings = defaultSettings();

    try {
      saveSettings(settings);
    } catch {}

    return settings;
  }
}

function saveSettings(settings) {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const temp = `${SETTINGS_FILE}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify(settings, null, 2),
    "utf8"
  );

  fs.renameSync(temp, SETTINGS_FILE);
}

function readApplications() {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return Array.isArray(parsed.applications)
      ? parsed.applications
      : [];
  } catch {
    return [];
  }
}

function saveApplications(applications) {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const temp = `${DATA_FILE}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify({ applications }, null, 2),
    "utf8"
  );

  fs.renameSync(temp, DATA_FILE);
}

function clean(value, max = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(401).json({
      error: "Nicht angemeldet.",
    });
  }

  next();
}


/* =========================
   BEWERBUNG ABSENDEN
========================= */

app.post("/api/apply", (req, res) => {
  try {
    const role = clean(req.body.role, 30);

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        error: "Ungültige Bewerbungsart.",
      });
    }

    const settings = readSettings();

    if (settings.applications[role] !== true) {
      return res.status(403).json({
        error: `Die ${role}-Bewerbung ist aktuell geschlossen.`,
      });
    }

    const name = clean(req.body.name, 100);
    const discord = clean(req.body.discord, 100);
    const email = clean(req.body.email, 254).toLowerCase();
    const age = clean(req.body.age, 30);
    const experience = clean(req.body.experience, 1500);
    const motivation = clean(req.body.motivation, 1800);
    const availability = clean(req.body.availability, 1000);
    const extra = clean(req.body.extra, 1000);
    const programs = clean(req.body.programs, 1000);
    const portfolio = clean(req.body.portfolio, 1500);

    const consent = req.body.consent === true;

    if (name.length < 2) {
      return res.status(400).json({
        error: "Bitte gib deinen Namen ein.",
      });
    }

    if (discord.length < 2) {
      return res.status(400).json({
        error: "Bitte gib deinen Discord-Namen ein.",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: "Bitte gib eine gültige E-Mail-Adresse ein.",
      });
    }

    if (
      !["Unter 16", "16–17", "18 oder älter"].includes(age)
    ) {
      return res.status(400).json({
        error: "Bitte wähle deine Altersgruppe.",
      });
    }

    if (experience.length < 20) {
      return res.status(400).json({
        error: "Bitte beschreibe deine Erfahrung genauer.",
      });
    }

    if (motivation.length < 30) {
      return res.status(400).json({
        error: "Bitte erkläre deine Motivation genauer.",
      });
    }

    if (availability.length < 5) {
      return res.status(400).json({
        error: "Bitte gib deine Verfügbarkeit an.",
      });
    }

    if (!consent) {
      return res.status(400).json({
        error: "Du musst der Speicherung zustimmen.",
      });
    }

    const applications = readApplications();

    applications.unshift({
      id: crypto.randomBytes(12).toString("hex"),

      role,
      name,
      discord,
      email,
      age,

      experience,
      motivation,
      availability,

      extra,
      programs,
      portfolio,

      status: "Neu",

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    saveApplications(applications);

    res.status(201).json({
      ok: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Die Bewerbung konnte nicht gespeichert werden.",
    });
  }
});


/* =========================
   ÖFFENTLICHER STATUS
========================= */

app.get("/api/application-status", (req, res) => {
  res.json(readSettings());
});


/* =========================
   ADMIN LOGIN
========================= */

app.post("/api/admin/login", (req, res) => {
  const password = clean(req.body.password, 200);

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: "Falsches Passwort.",
    });
  }

  req.session.isAdmin = true;

  req.session.save(() => {
    res.json({
      ok: true,
    });
  });
});


app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true,
    });
  });
});


app.get("/api/admin/me", (req, res) => {
  res.json({
    loggedIn: Boolean(req.session.isAdmin),
  });
});


/* =========================
   ADMIN EINSTELLUNGEN
========================= */

app.get(
  "/api/admin/settings",
  requireAdmin,
  (req, res) => {
    res.json(readSettings());
  }
);


app.patch(
  "/api/admin/settings",
  requireAdmin,
  (req, res) => {
    const role = clean(req.body.role, 30);
    const open = req.body.open;

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        error: "Ungültige Bewerbungsart.",
      });
    }

    if (typeof open !== "boolean") {
      return res.status(400).json({
        error: "Ungültiger Bewerbungsstatus.",
      });
    }

    const settings = readSettings();

    settings.applications[role] = open;
    settings.updatedAt = new Date().toISOString();

    saveSettings(settings);

    res.json(settings);
  }
);


/* =========================
   ADMIN BEWERBUNGEN
========================= */

app.get(
  "/api/admin/applications",
  requireAdmin,
  (req, res) => {
    const role = clean(req.query.role, 30);

    let applications = readApplications();

    if (role && ROLES.includes(role)) {
      applications = applications.filter(
        (application) => application.role === role
      );
    }

    res.json({
      applications,
    });
  }
);


/* =========================
   STATUS ÄNDERN
========================= */

app.patch(
  "/api/admin/applications/:id",
  requireAdmin,
  (req, res) => {
    const allowed = [
      "Neu",
      "In Prüfung",
      "Angenommen",
      "Abgelehnt",
    ];

    const status = clean(req.body.status, 30);

    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: "Ungültiger Status.",
      });
    }

    const applications = readApplications();

    const application = applications.find(
      (item) => item.id === req.params.id
    );

    if (!application) {
      return res.status(404).json({
        error: "Bewerbung nicht gefunden.",
      });
    }

    application.status = status;
    application.updatedAt = new Date().toISOString();

    saveApplications(applications);

    res.json(application);
  }
);


/* =========================
   BEWERBUNG LÖSCHEN
========================= */

app.delete(
  "/api/admin/applications/:id",
  requireAdmin,
  (req, res) => {
    const applications = readApplications();

    const filtered = applications.filter(
      (item) => item.id !== req.params.id
    );

    if (filtered.length === applications.length) {
      return res.status(404).json({
        error: "Bewerbung nicht gefunden.",
      });
    }

    saveApplications(filtered);

    res.json({
      ok: true,
    });
  }
);


/* =========================
   WEBSITE
========================= */

app.use(express.static(PUBLIC_DIR));

app.get("/", (req, res) => {
  res.sendFile(INDEX_FILE);
});

app.get(
  ["/modder", "/skinner", "/supporter", "/admin"],
  (req, res) => {
    res.sendFile(INDEX_FILE);
  }
);


app.listen(PORT, () => {
  console.log(
    `Projekt Mittelberg Bewerbungsportal läuft auf Port ${PORT}`
  );
});
