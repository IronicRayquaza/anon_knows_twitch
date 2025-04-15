import { useEffect, useState, useRef } from 'react';
import { message, dryrun } from '@permaweb/aoconnect';
import { motion, AnimatePresence } from 'framer-motion';
import "./App.css";
// import "./index.css";
import flvjs from 'flv.js';

// Extend the HTMLVideoElement interface
interface ExtendedHTMLVideoElement extends HTMLVideoElement {
  srcObject: MediaStream | null;
}

// Extend the Window interface
declare global {
  interface Window {
    arweaveWallet: {
      connect: (permissions: string[]) => Promise<void>;
      getActiveAddress: () => Promise<string>;
      signTransaction: (tx: any) => Promise<any>;
    };
  }
}

interface Channel {
  id: string;
  name: string;
  description: string;
  category: string;
  stats: {
    subscriber_count: number;
    active_stream: Stream | null;
  };
}

interface Stream {
  id: string;
  channel_id: string;
  title: string;
  category: string;
  viewer_count: number;
  started_at: number;
}

interface ChatMessage {
  id: string;
  stream_id: string;
  sender: string;
  message: string;
  sent_at: number;
}

interface StreamSetup {
  title: string;
  category: string;
  rtmpKey?: string;
}

interface ArweaveWallet {
  connect: (permissions: string[]) => Promise<void>;
  getActiveAddress: () => Promise<string>;
  signTransaction: (tx: any) => Promise<any>;
}

declare global {
  interface Window {
    arweaveWallet: ArweaveWallet;
  }
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showStreamSetup, setShowStreamSetup] = useState(false);
  const [streamSetup, setStreamSetup] = useState<StreamSetup>({
    title: '',
    category: '',
    rtmpKey: ''
  });
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const processId = 'uKz_4QN_kKDOJBjv8W1D_4EWZezv-g1pNzRJj6aITI0';
  const videoRef = useRef<ExtendedHTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<NodeJS.Timeout>();
  const flvPlayerRef = useRef<flvjs.Player | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');

  // Add useEffect for wallet persistence
  useEffect(() => {
    const savedWalletAddress = localStorage.getItem('walletAddress');
    if (savedWalletAddress) {
      setWalletAddress(savedWalletAddress);
    }
  }, []);

  const connectWallet = async () => {
    try {
      if (window.arweaveWallet) {
        await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION']);
        const address = await window.arweaveWallet.getActiveAddress();
        setWalletAddress(address);
        // Save wallet address to localStorage
        localStorage.setItem('walletAddress', address);
      } else {
        alert('Please install Arweave Wallet extension');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Failed to connect wallet');
    }
  };

  const disconnectWallet = async () => {
    try {
      // Clear wallet address from state and localStorage
      setWalletAddress(null);
      localStorage.removeItem('walletAddress');
      // Reset streaming state
      setIsStreaming(false);
      setShowStreamSetup(false);
      if (flvPlayerRef.current) {
        flvPlayerRef.current.destroy();
        flvPlayerRef.current = null;
      }
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

  const generateRTMPKey = () => {
    const key = Math.random().toString(36).substring(2, 15);
    setStreamSetup({...streamSetup, rtmpKey: key});
    return key;
  };

  const getRTMPUrl = (key: string) => {
    // Update this to your server's IP or domain
    return `rtmp://localhost:1935/live/${key}`;
  };

  const getHLSUrl = (key: string) => {
    // HLS URL for playback
    return `http://localhost:8000/live/${key}/index.m3u8`;
  };

  const handleGoLive = async () => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    const key = generateRTMPKey();
    setShowStreamSetup(true);
  };

  const startStreaming = async () => {
    try {
      if (!streamSetup.rtmpKey) {
        setError('Please enter a stream key');
        return;
      }

      // Start local stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Start RTMP stream
      const rtmpUrl = `rtmp://localhost:1935/live/${streamSetup.rtmpKey}`;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=h264'
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          // Send data to RTMP server
          const socket = new WebSocket('ws://localhost:8000/live');
          socket.onopen = () => {
            socket.send(e.data);
          };
        }
      };

      mediaRecorder.start(1000);
      setIsStreaming(true);
      setError('');
    } catch (err) {
      console.error('Error starting stream:', err);
      setError('Failed to start stream. Please check your camera and microphone permissions.');
    }
  };

  useEffect(() => {
    if (isStreaming && streamSetup.rtmpKey) {
      if (flvjs.isSupported()) {
        const videoElement = videoRef.current;
        if (videoElement) {
          const flvPlayer = flvjs.createPlayer({
            type: 'flv',
            url: getHLSUrl(streamSetup.rtmpKey),
            isLive: true,
            hasAudio: true,
            hasVideo: true,
            cors: true
          });
          
          flvPlayer.on(flvjs.Events.ERROR, (errType: string, errDetail: any) => {
            console.error('FLV Player Error:', errType, errDetail);
            // Try to reconnect after error
            setTimeout(() => {
              if (flvPlayer) {
                flvPlayer.unload();
                flvPlayer.load();
              }
            }, 5000);
          });

          flvPlayer.on(flvjs.Events.LOADING_COMPLETE, () => {
            console.log('FLV Player Loading Complete');
          });

          flvPlayer.attachMediaElement(videoElement);
          flvPlayer.load();
          
          const playPromise = flvPlayer.play();
          if (playPromise !== undefined) {
            playPromise.catch((error: Error) => {
              console.error('Error playing stream:', error);
            });
          }

          flvPlayerRef.current = flvPlayer;
        }
      } else {
        console.error('FLV.js is not supported in this browser');
      }
    }

    return () => {
      if (flvPlayerRef.current) {
        flvPlayerRef.current.destroy();
        flvPlayerRef.current = null;
      }
    };
  }, [isStreaming, streamSetup.rtmpKey]);

  const fetchLiveStreams = async () => {
    try {
      const result = await dryrun({
        process: processId,
        tags: [{ name: 'Action', value: 'GetLiveStreams' }],
        // Add CORS mode
        mode: 'cors',
        credentials: 'include'
      });

      if (result.Messages?.[0]?.Data) {
        const streams = JSON.parse(result.Messages[0].Data);
        const updatedChannels = streams.map((stream: any) => ({
          id: stream.channel_id,
          name: stream.channel_name,
          description: '',
          category: stream.category,
          stats: {
            subscriber_count: 0,
            active_stream: stream.is_active ? {
              id: stream.id,
              channel_id: stream.channel_id,
              title: stream.title,
              category: stream.category,
              viewer_count: stream.viewer_count,
              started_at: stream.started_at
            } : null
          }
        }));
        setChannels(updatedChannels);
      }
    } catch (error) {
      console.error('Error fetching live streams:', error);
      // Don't throw error, just log it
    }
  };

  // Add periodic stream check
  useEffect(() => {
    const interval = setInterval(fetchLiveStreams, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const sendChatMessage = async () => {
    if (!activeStream || !newMessage.trim()) return;

    try {
      await message({
        process: processId,
        tags: [{ name: 'Action', value: 'ChatMessage' }],
        data: JSON.stringify({
          stream_id: activeStream.id,
          message: newMessage.trim()
        })
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending chat message:', error);
    }
  };

  const toggleTheaterMode = () => setIsTheaterMode(!isTheaterMode);

  const toggleFullscreen = () => {
    if (!videoRef.current) return;

    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newVolume = parseFloat(e.target.value);
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    controlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const stopStreaming = async () => {
    if (flvPlayerRef.current) {
      flvPlayerRef.current.destroy();
      flvPlayerRef.current = null;
    }
    setIsStreaming(false);

    // Create transaction for stopping stream
    const tx = {
      data: JSON.stringify({
        action: 'StopStream'
      })
    };

    try {
      const signedTx = await window.arweaveWallet.signTransaction(tx);
      await message({
        process: processId,
        tags: [{ name: 'Action', value: 'StopStream' }],
        data: signedTx
      });
      
      // Refresh the streams list after stopping
      await fetchLiveStreams();
    } catch (error) {
      console.error('Error stopping stream:', error);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      <nav className="bg-black border-b border-white/10 p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">LiveStream Platform</h1>
          <div className="flex space-x-4 items-center">
            {walletAddress ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm bg-black text-white px-3 py-1 rounded border border-white/20">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
                <button 
                  onClick={disconnectWallet}
                  className="bg-black text-white px-3 py-1 rounded font-mono transition-colors border border-white/20 hover:border-white/40"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button 
                onClick={connectWallet}
                className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded font-mono transition-colors"
              >
                Connect Wallet
              </button>
            )}
            {isStreaming ? (
              <button 
                onClick={stopStreaming}
                className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded font-mono transition-colors"
              >
                Stop Streaming
              </button>
            ) : (
              <button 
                onClick={handleGoLive}
                className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded font-mono transition-colors"
              >
                Go Live
              </button>
            )}
            <button className="bg-black text-white px-4 py-2 rounded font-mono transition-colors border border-white/20 hover:border-white/40">
              Browse
            </button>
          </div>
        </div>
      </nav>

      {showStreamSetup && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center">
          <div className="bg-black p-6 rounded-lg w-96 border border-white/20">
            <h2 className="text-xl font-bold mb-4 text-white font-mono">Stream Setup</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70 font-mono">Title</label>
                <input
                  type="text"
                  value={streamSetup.title}
                  onChange={(e) => setStreamSetup({...streamSetup, title: e.target.value})}
                  className="w-full bg-black text-white rounded px-3 py-2 border border-white/20 focus:border-white focus:ring-1 focus:ring-white font-mono"
                  placeholder="Enter stream title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70 font-mono">Category</label>
                <input
                  type="text"
                  value={streamSetup.category}
                  onChange={(e) => setStreamSetup({...streamSetup, category: e.target.value})}
                  className="w-full bg-black text-white rounded px-3 py-2 border border-white/20 focus:border-white focus:ring-1 focus:ring-white font-mono"
                  placeholder="Enter category"
                />
              </div>
              {streamSetup.rtmpKey && (
                <div className="bg-black/50 p-4 rounded border border-white/20">
                  <h3 className="text-sm font-mono mb-2">Streaming Software Setup</h3>
                  <p className="text-xs text-white/70 font-mono mb-2">Server: {getRTMPUrl(streamSetup.rtmpKey)}</p>
                  <p className="text-xs text-white/70 font-mono">Stream Key: {streamSetup.rtmpKey}</p>
                  <div className="mt-2 text-xs text-white/50 font-mono">
                    <p>1. Open your streaming software (OBS, Streamlabs, etc.)</p>
                    <p>2. Go to Settings &gt; Stream</p>
                    <p>3. Set Service to 'Custom'</p>
                    <p>4. Enter the Server and Stream Key above</p>
                    <p>5. Click OK and Start Streaming</p>
                  </div>
                </div>
              )}
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowStreamSetup(false)}
                  className="bg-black text-white px-4 py-2 rounded font-mono transition-colors border border-white/20 hover:border-white/40"
                >
                  Cancel
                </button>
                <button
                  onClick={startStreaming}
                  className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded font-mono transition-colors"
                >
                  Start Streaming
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="container mx-auto p-4">
          <div 
            className="relative bg-black rounded-lg overflow-hidden border border-white/20"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setShowControls(false)}
          >
            {streamSetup.rtmpKey ? (
              <video
                ref={videoRef}
                autoPlay
                muted={isMuted}
                className="w-full"
                controls={false}
                playsInline
              />
            ) : (
              <div className="w-full aspect-video bg-black/50 flex items-center justify-center">
                <p className="text-white/50">Waiting for stream to start...</p>
              </div>
            )}
            
            <div 
              className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity duration-300 ${
                showControls ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={toggleMute}
                    className="text-white hover:text-white/70 transition-colors"
                  >
                    {isMuted ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />
                </div>
                
                <button 
                  onClick={toggleFullscreen}
                  className="text-white hover:text-white/70 transition-colors"
                >
                  {isFullscreen ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h12M4 6v12m16 0V6m0 12H6" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto p-4">
        <div className={`grid ${isTheaterMode ? '' : 'grid-cols-4'} gap-4`}>
          <div className={`${isTheaterMode ? 'col-span-4' : 'col-span-3'}`}>
            {activeStream ? (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="relative pt-[56.25%] bg-black">
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                    <p className="text-gray-500">Stream Preview</p>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">{activeStream.title}</h2>
                    <button
                      onClick={toggleTheaterMode}
                      className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
                    >
                      {isTheaterMode ? 'Exit Theater' : 'Theater Mode'}
                    </button>
                  </div>
                  <p className="text-gray-400 mt-2">{activeStream.category}</p>
                  <div className="flex items-center mt-2">
                    <span className="text-red-500 mr-2">● LIVE</span>
                    <span>{activeStream.viewer_count} viewers</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <h2 className="text-xl">Select a stream to watch</h2>
              </div>
            )}
          </div>

          <div className={`${isTheaterMode ? 'hidden' : ''} bg-gray-800 rounded-lg p-4`}>
            <h2 className="text-lg font-bold mb-4">Live Channels</h2>
            <AnimatePresence>
              {channels.map((channel) => (
                <motion.div
                  key={channel.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-gray-700 rounded-lg p-3 mb-3 cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => setActiveStream(channel.stats.active_stream)}
                >
                  <h3 className="font-bold">{channel.name}</h3>
                  <p className="text-sm text-gray-400">{channel.category}</p>
                  <div className="flex items-center mt-2 text-sm">
                    <span className="text-red-500 mr-2">● LIVE</span>
                    <span>{channel.stats.active_stream?.viewer_count || 0} viewers</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {activeStream && (
          <div className="mt-4 bg-gray-800 rounded-lg p-4">
            <div className="flex flex-col h-[400px]">
              <div className="flex-1 overflow-y-auto mb-4">
                <AnimatePresence>
                  {chatMessages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="mb-2"
                    >
                      <span className="font-bold text-purple-400">{msg.sender}: </span>
                      <span>{msg.message}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  className="flex-1 bg-gray-700 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Send a message..."
                />
                <button
                  onClick={sendChatMessage}
                  className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
