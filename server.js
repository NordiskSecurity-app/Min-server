require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

// === Anslut till MongoDB ===
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Ansluten till MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB anslutningsfel:', err);
    process.exit(1); // Stäng av servern om anslutningen misslyckas
  });

// === MongoDB-scheman ===
// Schema för användardata med rapportinformation
const userSchema = new mongoose.Schema({
  username: { type: String, required: true }, // Gör användarnamn obligatoriskt
  loginTime: { type: Date, default: Date.now },
  report: {
    area: String,
    store: String,
    guards: [String],
    type: String, // Grip, PL13§, etc.
    description: String,
    handcuffsUsed: Boolean,
    policeCalled: Boolean,
    patrolNumber: String,
    position: {
      lat: Number,
      lng: Number
    }
  }
});

const reportSchema = new mongoose.Schema({
  area: String,
  store: String,
  guards: [String],
  type: String, // Grip, PL13§, etc.
  description: String,
  handcuffsUsed: Boolean,
  policeCalled: Boolean,
  patrolNumber: String,
  timestamp: { type: Date, default: Date.now },
  position: {
    lat: Number,
    lng: Number
  }
});

const User = mongoose.model('User', userSchema);
const Report = mongoose.model('Report', reportSchema);

// === E-postkonfiguration via One.com ===
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: true, // Använd SSL/TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Testa e-postanslutningen vid serverstart
transporter.verify((error) => {
  if (error) {
    console.error('❌ Fel vid verifiering av e-postanslutning:', error);
  } else {
    console.log('📧 E-postanslutning verifierad');
  }
});

// === Routes ===

// 1. Logga in användare
app.post('/api/login', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Användarnamn krävs' });
    }

    const newUser = new User({ username });
    await newUser.save();
    res.status(201).json({ message: '✅ Inloggning registrerad', user: newUser });
  } catch (error) {
    console.error('❌ Fel vid inloggning:', error);
    res.status(500).json({ error: 'Serverfel vid registrering av användare' });
  }
});

// 2. Skicka rapport
app.post('/api/report', async (req, res) => {
  try {
    const {
      area, store, guards, type, description,
      handcuffsUsed, policeCalled, patrolNumber, position
    } = req.body;

    // Validera att nödvändiga fält finns
    if (!area || !store || !guards || !type || !description) {
      return res.status(400).json({ error: 'Alla fält måste fyllas i' });
    }

    const report = new Report({
      area,
      store,
      guards,
      type,
      description,
      handcuffsUsed,
      policeCalled,
      patrolNumber,
      position
    });

    await report.save();

    // Skicka rapport till admin via e-post
    const mailOptions = {
      from: `"Väktarrapport" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `📝 Ny rapport från ${guards?.[0] || 'okänd väktare'}`,
      text: `
Rapport från: ${guards.join(', ')}
Butik: ${store}
Område: ${area}
Typ: ${type}
Handfängsel använt: ${handcuffsUsed ? 'Ja' : 'Nej'}
Polis tillkallad: ${policeCalled ? 'Ja' : 'Nej'}
Patrullnummer: ${patrolNumber || 'Ej angivet'}
Position: ${position?.lat || 'Okänd'}, ${position?.lng || 'Okänd'}
Tidpunkt: ${new Date().toLocaleString()}

Beskrivning:
${description}
      `
    };

    await transporter.sendMail(mailOptions);
    res.status(201).json({ message: '✅ Rapport sparad och skickad via e-post' });
  } catch (error) {
    console.error('❌ Fel vid skapande eller skickande av rapport:', error);
    res.status(500).json({ error: 'Rapport sparad, men kunde inte skicka e-post' });
  }
});

// 3. Hämta alla rapporter
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await Report.find().sort({ timestamp: -1 }); // Sortera efter senaste rapporterna
    res.json(reports);
  } catch (error) {
    console.error('❌ Fel vid hämtning av rapporter:', error);
    res.status(500).json({ error: 'Kunde inte hämta rapporter' });
  }
});

// === Starta servern ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servern körs på port ${PORT}`);
});