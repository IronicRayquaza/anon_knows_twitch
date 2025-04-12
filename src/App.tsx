import { useEffect, useState, useRef } from 'react';
import { message, dryrun } from '@permaweb/aoconnect';
import { motion, AnimatePresence } from 'framer-motion';
import "./App.css";
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
  source: 'screen' | 'camera';
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
    source: 'camera'
  });
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const processId = 'uKz_4QN_kKDOJBjv8W1D_4EWZezv-g1pNzRJj6aITI0';
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<NodeJS.Timeout>();

  const connectWallet = async () => {
    try {
      if (window.arweaveWallet) {
        await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION']);
        const address = await window.arweaveWallet.getActiveAddress();
        setWalletAddress(address);
      } else {
        alert('Please install Arweave Wallet extension');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Failed to connect wallet');
    }
  };

  const handleGoLive = async () => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    setShowStreamSetup(true);
  };

  const startStreaming = async () => {
    try {
      let stream: MediaStream;
      
      if (streamSetup.source === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }

      setMediaStream(stream);
      setIsStreaming(true);
      setShowStreamSetup(false);

      // Create transaction for starting stream
      const tx = {
        data: JSON.stringify({
          action: 'StartStream',
          title: streamSetup.title,
          category: streamSetup.category,
          source: streamSetup.source
        })
      };

      // Sign and send transaction
      const signedTx = await window.arweaveWallet.signTransaction(tx);
      await message({
        process: processId,
        tags: [{ name: 'Action', value: 'StartStream' }],
        data: signedTx
      });

    } catch (error) {
      console.error('Error starting stream:', error);
      alert('Failed to start stream');
    }
  };

  const stopStreaming = async () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
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
    } catch (error) {
      console.error('Error stopping stream:', error);
    }
  };

  useEffect(() => {
    fetchLiveStreams();
  }, []);

  const fetchLiveStreams = async () => {
    try {
      const result = await dryrun({
        process: processId,
        tags: [{ name: 'Action', value: 'GetLiveStreams' }]
      });

      if (result.Messages?.[0]?.Data) {
        const streams = JSON.parse(result.Messages[0].Data);
        setChannels(streams.map((stream: any) => ({
          id: stream.channel_id,
          name: stream.channel_name,
          description: '',
          category: stream.category,
          stats: {
            subscriber_count: 0,
            active_stream: {
              id: stream.id,
              channel_id: stream.channel_id,
              title: stream.title,
              category: stream.category,
              viewer_count: stream.viewer_count,
              started_at: stream.started_at
            }
          }
        })));
      }
    } catch (error) {
      console.error('Error fetching live streams:', error);
    }
  };

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

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="bg-gray-900 border-b border-gray-800 p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">LiveStream Platform</h1>
          <div className="flex space-x-4 items-center">
            {walletAddress ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm bg-gray-800 text-white px-3 py-1 rounded border border-gray-700">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
            ) : (
              <button 
                onClick={connectWallet}
                className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded font-medium transition-colors"
              >
                Connect Wallet
              </button>
            )}
            {isStreaming ? (
              <button 
                onClick={stopStreaming}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-medium transition-colors"
              >
                Stop Streaming
              </button>
            ) : (
              <button 
                onClick={handleGoLive}
                className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded font-medium transition-colors"
              >
                Go Live
              </button>
            )}
            <button className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded font-medium transition-colors border border-gray-700">
              Browse
            </button>
          </div>
        </div>
      </nav>

      {showStreamSetup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
          <div className="bg-gray-900 p-6 rounded-lg w-96 border border-gray-800">
            <h2 className="text-xl font-bold mb-4 text-white">Stream Setup</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">Title</label>
                <input
                  type="text"
                  value={streamSetup.title}
                  onChange={(e) => setStreamSetup({...streamSetup, title: e.target.value})}
                  className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700 focus:border-white focus:ring-1 focus:ring-white"
                  placeholder="Enter stream title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">Category</label>
                <input
                  type="text"
                  value={streamSetup.category}
                  onChange={(e) => setStreamSetup({...streamSetup, category: e.target.value})}
                  className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700 focus:border-white focus:ring-1 focus:ring-white"
                  placeholder="Enter category"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">Source</label>
                <select
                  value={streamSetup.source}
                  onChange={(e) => setStreamSetup({...streamSetup, source: e.target.value as 'screen' | 'camera'})}
                  className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-700 focus:border-white focus:ring-1 focus:ring-white"
                >
                  <option value="camera">Camera</option>
                  <option value="screen">Screen Share</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowStreamSetup(false)}
                  className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded font-medium transition-colors border border-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={startStreaming}
                  className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded font-medium transition-colors"
                >
                  Start Streaming
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isStreaming && mediaStream && (
        <div className="container mx-auto p-4">
          <div 
            className="relative bg-black rounded-lg overflow-hidden border border-gray-800"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setShowControls(false)}
          >
            <video
              ref={videoRef}
              srcObject={mediaStream}
              autoPlay
              muted={isMuted}
              className="w-full"
            />
            
            {/* Video Controls */}
            <div 
              className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity duration-300 ${
                showControls ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Volume Controls */}
                  <button 
                    onClick={toggleMute}
                    className="text-white hover:text-gray-300 transition-colors"
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
                    className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />
                </div>
                
                {/* Fullscreen Button */}
                <button 
                  onClick={toggleFullscreen}
                  className="text-white hover:text-gray-300 transition-colors"
                >
                  {isFullscreen ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h12M4 6v12m16 0V6m0 12H6" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
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
