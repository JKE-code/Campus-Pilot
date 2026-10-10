const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'CampusPilot Backend', timestamp: new Date().toISOString() });
});

// Voice Webhook Callback Proxy / Ingestion
app.post('/api/voice-callback', (req, res) => {
  console.log('Received Voice Callback payload:', req.body);
  // Forward or log payload to n8n webhook
  res.json({ success: true, message: 'Voice callback received successfully' });
});

app.listen(PORT, () => {
  console.log(`CampusPilot backend running on port ${PORT}`);
});
