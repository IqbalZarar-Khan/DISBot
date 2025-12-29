-- Create custom_messages table for storing customizable message templates
CREATE TABLE IF NOT EXISTS custom_messages (
  type TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE custom_messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since this is a self-hosted bot)
CREATE POLICY "Allow all operations on custom_messages"
  ON custom_messages
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_messages_type ON custom_messages(type);

-- Insert default messages
INSERT INTO custom_messages (type, content) VALUES
  ('welcome', 'Welcome {user}! Thank you for pledging to the {tier} tier! 🎉'),
  ('post_new', '📢 New {tier} post: **{title}**\n{url}'),
  ('post_waterfall', '🌊 This post is now available to {tier}! **{title}**\n{url}')
ON CONFLICT (type) DO NOTHING;
