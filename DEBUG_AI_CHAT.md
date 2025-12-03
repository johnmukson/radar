# Debug AI Chat Function

## How to Get Error Output

### Method 1: Browser Console (Easiest)

1. **Open Browser Developer Tools:**
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Or `Cmd+Option+I` (Mac)
   - Or Right-click → "Inspect" → "Console" tab

2. **Clear the Console:**
   - Click the clear icon (🚫) or press `Ctrl+L`

3. **Try the AI Chat:**
   - Go to Dashboard → AI Insights → AI Chat Assistant tab
   - Type a message and send it

4. **Look for these logs:**
   - `Calling ai-chat function with:` - Shows request details
   - `Function response:` - Shows response from function
   - `Error details:` - Shows detailed error information
   - Any red error messages

5. **Copy the Error:**
   - Right-click on the error message
   - Select "Copy" or "Copy object"
   - Paste it here

### Method 2: Network Tab

1. **Open Network Tab:**
   - Press `F12` → "Network" tab

2. **Filter by "functions":**
   - Type "functions" in the filter box

3. **Try the AI Chat:**
   - Send a message

4. **Click on the "ai-chat" request:**
   - Look at the "Response" tab to see the error
   - Look at the "Headers" tab to see request details

### Method 3: Supabase Dashboard Logs

1. **Go to Supabase Dashboard:**
   - https://supabase.com/dashboard/project/pvtrcbemeesaebrwhenw/functions

2. **Click on "ai-chat" function**

3. **View Logs:**
   - Click "Logs" tab
   - Look for recent error messages

### Method 4: Check Function Logs via CLI

Run this command in your terminal:
```bash
supabase functions logs ai-chat --project-ref pvtrcbemeesaebrwhenw
```

## What to Look For

Common errors you might see:

1. **"Missing authorization header"** - Auth token not being sent
2. **"OpenAI API key not configured"** - API key missing
3. **"Unauthorized"** - User not authenticated
4. **"Invalid request body"** - Request format issue
5. **"Failed to get AI response"** - OpenAI API issue
6. **"Internal server error"** - Function crashed

## Quick Test

Try this simple message first: **"Hello"**

This will help isolate if it's a message content issue or a general function problem.

