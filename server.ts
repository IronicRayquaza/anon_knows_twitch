import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import NodeMediaServer from 'node-media-server';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'https://ao-testnet.xyz',
  'https://cu.ao-testnet.xyz',
  'https://cu51.ao-testnet.xyz'
];

const corsOptions = {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: true
};

app.use(cors(corsOptions));
app.use(express.json());

// RTMP server config
const config = {
  rtmp: {
    port: parseInt(process.env.RTMP_PORT || '1935'),
    chunk_size: parseInt(process.env.STREAM_CHUNK_SIZE || '60000'),
    gop_cache: true,
    ping: parseInt(process.env.STREAM_PING_INTERVAL || '30'),
    ping_timeout: parseInt(process.env.STREAM_PING_TIMEOUT || '60'),
    allow_origin: '*',
    auth: {
      play: false,
      publish: false
    }
  },
  http: {
    port: parseInt(process.env.HTTP_PORT || '8000'),
    allow_origin: '*',
    mediaroot: process.env.MEDIA_ROOT || './media',
    webroot: process.env.WEB_ROOT || './www',
  },
  trans: {
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: `[hls_time=${process.env.HLS_TIME || '2'}:hls_list_size=${process.env.HLS_LIST_SIZE || '3'}:hls_flags=delete_segments]`,
        dash: true,
        dashFlags: `[f=dash:window_size=${process.env.DASH_WINDOW_SIZE || '3'}:extra_window_size=${process.env.DASH_EXTRA_WINDOW_SIZE || '5'}]`
      }
    ]
  }
};

const nms = new NodeMediaServer(config);

// NodeMediaServer events
nms.on('prePublish', (id, streamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} streamPath=${streamPath}`, args);
});
nms.on('postPublish', (id, streamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} streamPath=${streamPath}`, args);
});
nms.on('donePublish', (id, streamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} streamPath=${streamPath}`, args);
});
nms.on('donePlay', (id, streamPath, args) => {
  console.log('[NodeEvent on donePlay]', `id=${id} streamPath=${streamPath}`, args);
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ✅ FIXED: Get info about a specific stream
app.get('/api/streams/:streamKey', (req: Request, res: Response) => {
  try {
    const { streamKey } = req.params;
    console.log(`Checking stream status for key: ${streamKey}`);

    const sessions = nms.sessions || {};
    const stream = Object.values(sessions).find((session: any) =>
      session.streamPath === `/live/${streamKey}`
    );

    if (stream) {
      console.log(`Stream found: ${streamKey}`);
      res.json({
        isLive: true,
        streamKey,
        startTime: stream.startTime,
        clientId: stream.id,
        ip: stream.ip,
        connectTime: stream.connectTime,
        status: 'active'
      });
    } else {
      console.log(`Stream not found: ${streamKey}`);
      res.json({
        isLive: false,
        streamKey,
        status: 'offline'
      });
    }
  } catch (error: any) {
    console.error('Error checking stream status:', error);
    res.status(500).json({
      error: 'Failed to check stream status',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ FIXED: Get all active streams
app.get('/api/streams', (_req: Request, res: Response) => {
  try {
    console.log('Fetching all active streams...');
    const sessions = nms.sessions || {};

    if (Object.keys(sessions).length === 0) {
      console.log('No active streams');
      return res.json({
        streams: [],
        total: 0,
        message: 'No active streams',
        status: 'ok'
      });
    }

    const streams = Object.values(sessions).map((session: any) => {
      const streamKey = session.streamPath.split('/').pop();
      return {
        streamKey,
        isLive: true,
        startTime: session.startTime,
        clientId: session.id,
        ip: session.ip,
        connectTime: session.connectTime,
        status: 'active'
      };
    });

    res.json({
      streams,
      total: streams.length,
      message: 'Streams retrieved successfully',
      status: 'ok'
    });
  } catch (error: any) {
    console.error('Error getting streams:', error);
    res.status(500).json({
      error: 'Failed to get streams',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// RTMP config info
app.get('/api/rtmp-config', (_req: Request, res: Response) => {
  try {
    res.json({
      rtmp: {
        port: config.rtmp.port,
        status: 'running',
        url: `rtmp://localhost:${config.rtmp.port}/live`
      },
      http: {
        port: config.http.port,
        status: 'running'
      },
      transcoding: {
        hls: config.trans.tasks[0].hls,
        dash: config.trans.tasks[0].dash,
        status: 'configured'
      }
    });
  } catch (error: any) {
    console.error('Error getting RTMP config:', error);
    res.status(500).json({ error: 'Failed to get RTMP configuration' });
  }
});

// Error handler
app.use(((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Internal Server Error:', err.stack);
  res.status(500).json({ error: 'Something broke!' });
}) as express.ErrorRequestHandler);

// Run servers
nms.run();

app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
  console.log(`RTMP server running on port ${config.rtmp.port}`);
  console.log(`HTTP server running on port ${config.http.port}`);
  console.log(`RTMP URL: rtmp://localhost:${config.rtmp.port}/live`);
  console.log(`HLS URL: http://localhost:${config.http.port}/live/{streamKey}/index.m3u8`);
});
