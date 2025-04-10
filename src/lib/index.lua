-- Live Streaming Platform Core Logic
local json = require('json')

-- Initialize state tables
Channels = Channels or {}
Subscriptions = Subscriptions or {}
Streams = Streams or {}
Chat = Chat or {}
Followers = Followers or {}
Clips = Clips or {}
Donations = Donations or {}
Emotes = Emotes or {}
Polls = Polls or {}

-- Initialize SQLite database
if not db then
  db = SqliteDatabase:new('streaming.db')
  
  -- Create necessary tables
  db:exec([[CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    created_at INTEGER
  )]])

  db:exec([[CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    viewer_count INTEGER DEFAULT 0,
    started_at INTEGER,
    ended_at INTEGER,
    FOREIGN KEY(channel_id) REFERENCES channels(id)
  )]])

  db:exec([[CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    subscriber TEXT NOT NULL,
    tier INTEGER DEFAULT 1,
    subscribed_at INTEGER,
    FOREIGN KEY(channel_id) REFERENCES channels(id)
  )]])

  db:exec([[CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    stream_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    sent_at INTEGER,
    FOREIGN KEY(stream_id) REFERENCES streams(id)
  )]])
end

-- Handler for creating a new channel
Handlers.add(
  "create-channel",
  { Action = "CreateChannel" },
  function(msg)
    assert(type(msg.Data) == "string", "Channel data required")
    local data = json.decode(msg.Data)
    
    local channel = {
      id = ao.id,
      owner = msg.From,
      name = data.name,
      description = data.description,
      category = data.category,
      created_at = os.time()
    }
    
    db:exec(
      "INSERT INTO channels (id, owner, name, description, category, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      channel.id, channel.owner, channel.name, channel.description, channel.category, channel.created_at
    )
    
    msg.reply({ Data = json.encode(channel) })
  end
)

-- Handler for starting a stream
Handlers.add(
  "start-stream",
  { Action = "StartStream" },
  function(msg)
    local data = json.decode(msg.Data)
    local channel = db:exec("SELECT * FROM channels WHERE owner = ?", msg.From)[1]
    assert(channel, "Channel not found")
    
    local stream = {
      id = ao.id,
      channel_id = channel.id,
      title = data.title,
      category = data.category,
      viewer_count = 0,
      started_at = os.time()
    }
    
    db:exec(
      "INSERT INTO streams (id, channel_id, title, category, viewer_count, started_at) VALUES (?, ?, ?, ?, ?, ?)",
      stream.id, stream.channel_id, stream.title, stream.category, stream.viewer_count, stream.started_at
    )
    
    msg.reply({ Data = json.encode(stream) })
  end
)

-- Handler for chat messages
Handlers.add(
  "chat-message",
  { Action = "ChatMessage" },
  function(msg)
    local data = json.decode(msg.Data)
    
    local message = {
      id = ao.id,
      stream_id = data.stream_id,
      sender = msg.From,
      message = data.message,
      sent_at = os.time()
    }
    
    db:exec(
      "INSERT INTO chat_messages (id, stream_id, sender, message, sent_at) VALUES (?, ?, ?, ?, ?)",
      message.id, message.stream_id, message.sender, message.message, message.sent_at
    )
    
    -- Broadcast message to all viewers
    msg.reply({ 
      Action = "NewChatMessage",
      Data = json.encode(message)
    })
  end
)

-- Handler for subscribing to a channel
Handlers.add(
  "subscribe",
  { Action = "Subscribe" },
  function(msg)
    local data = json.decode(msg.Data)
    
    local subscription = {
      id = ao.id,
      channel_id = data.channel_id,
      subscriber = msg.From,
      tier = data.tier or 1,
      subscribed_at = os.time()
    }
    
    db:exec(
      "INSERT INTO subscriptions (id, channel_id, subscriber, tier, subscribed_at) VALUES (?, ?, ?, ?, ?)",
      subscription.id, subscription.channel_id, subscription.subscriber, subscription.tier, subscription.subscribed_at
    )
    
    msg.reply({ Data = json.encode(subscription) })
  end
)

-- Handler for getting channel info
Handlers.add(
  "get-channel",
  { Action = "GetChannel" },
  function(msg)
    local data = json.decode(msg.Data)
    local channel = db:exec("SELECT * FROM channels WHERE id = ?", data.channel_id)[1]
    
    if channel then
      -- Get additional channel stats
      local stats = {
        subscriber_count = db:exec("SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = ?", channel.id)[1].count,
        active_stream = db:exec("SELECT * FROM streams WHERE channel_id = ? AND ended_at IS NULL", channel.id)[1]
      }
      
      channel.stats = stats
      msg.reply({ Data = json.encode(channel) })
    else
      msg.reply({ Error = "Channel not found" })
    end
  end
)

-- Handler for getting live streams
Handlers.add(
  "get-live-streams",
  { Action = "GetLiveStreams" },
  function(msg)
    local streams = db:exec([[SELECT s.*, c.name as channel_name, c.owner as channel_owner 
                            FROM streams s 
                            JOIN channels c ON s.channel_id = c.id 
                            WHERE s.ended_at IS NULL]])
    
    msg.reply({ Data = json.encode(streams) })
  end
)

-- Handler for donations
Handlers.add(
  "donate",
  { Action = "Donate" },
  function(msg)
    local data = json.decode(msg.Data)
    
    local donation = {
      id = ao.id,
      channel_id = data.channel_id,
      donor = msg.From,
      amount = data.amount,
      message = data.message,
      donated_at = os.time()
    }
    
    Donations[donation.id] = donation
    
    -- Notify channel owner
    msg.reply({
      Target = db:exec("SELECT owner FROM channels WHERE id = ?", data.channel_id)[1].owner,
      Action = "NewDonation",
      Data = json.encode(donation)
    })
  end
)

-- Handler for creating clips
Handlers.add(
  "create-clip",
  { Action = "CreateClip" },
  function(msg)
    local data = json.decode(msg.Data)
    
    local clip = {
      id = ao.id,
      stream_id = data.stream_id,
      creator = msg.From,
      title = data.title,
      start_time = data.start_time,
      duration = data.duration,
      created_at = os.time()
    }
    
    Clips[clip.id] = clip
    msg.reply({ Data = json.encode(clip) })
  end
)

-- Handler for creating polls
Handlers.add(
  "create-poll",
  { Action = "CreatePoll" },
  function(msg)
    local data = json.decode(msg.Data)
    
    local poll = {
      id = ao.id,
      channel_id = data.channel_id,
      question = data.question,
      options = data.options,
      duration = data.duration,
      created_at = os.time(),
      votes = {}
    }
    
    Polls[poll.id] = poll
    msg.reply({ Data = json.encode(poll) })
  end
)

-- Handler for voting in polls
Handlers.add(
  "vote",
  { Action = "Vote" },
  function(msg)
    local data = json.decode(msg.Data)
    local poll = Polls[data.poll_id]
    
    if poll and poll.created_at + poll.duration > os.time() then
      poll.votes[msg.From] = data.option
      msg.reply({ Data = json.encode(poll) })
    else
      msg.reply({ Error = "Poll not found or expired" })
    end
  end
)