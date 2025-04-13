import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// import { NodeMediaServer } from 'node-media-server';
import NodeMediaServer from 'node-media-server';


dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// RTMP server configuration
const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  }
};

const nms = new NodeMediaServer(config);

app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Test endpoint to get stream info
app.get('/api/streams', (req, res) => {
  const sessions = nms.getSessions();
  const streams = sessions.map(session => ({
    id: session.id,
    streamPath: session.streamPath,
    startTime: session.startTime,
    isPublishing: session.isPublishing
  }));
  res.json({ streams });
});

// Start the RTMP server
nms.run();

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`RTMP server is running on port ${config.rtmp.port}`);
  console.log(`HTTP server is running on port ${config.http.port}`);
}); 