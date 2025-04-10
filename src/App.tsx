import { useEffect, useState } from 'react';
import { message, dryrun } from '@permaweb/aoconnect';
import { motion, AnimatePresence } from 'framer-motion';

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

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const processId = 'uKz_4QN_kKDOJBjv8W1D_4EWZezv-g1pNzRJj6aITI0';

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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <nav className="bg-gray-800 p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">LiveStream Platform</h1>
          <div className="flex space-x-4">
            <button className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded">
              Go Live
            </button>
            <button className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">
              Browse
            </button>
          </div>
        </div>
      </nav>

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
