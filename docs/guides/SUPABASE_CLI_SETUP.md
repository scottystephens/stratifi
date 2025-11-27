# Supabase CLI Setup Guide

This guide explains how to configure Supabase CLI so that Cursor can run commands directly on your Supabase account.

## Prerequisites

- Supabase account with access to the Stratiri project
- Project Reference: `vnuithaqtpgbwmdvtxik`

## Quick Setup

### Step 1: Install Supabase CLI

The CLI has been installed to `~/.local/bin/supabase`. Make sure it's in your PATH:

```bash
# Add to PATH (if not already there)
export PATH="$HOME/.local/bin:$PATH"

# Verify installation
supabase --version
```

To make this permanent, add to your `~/.zshrc`:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Step 2: Authenticate with Supabase

You have two options:

#### Option A: Interactive Login (Recommended)

```bash
supabase login
```

This will open your browser to authenticate. Follow the prompts.

#### Option B: Use Access Token

1. Get your access token from: https://supabase.com/dashboard/account/tokens
2. Set it as an environment variable:

```bash
export SUPABASE_ACCESS_TOKEN='your-token-here'
```

### Step 3: Link the Project

Link your local project to the remote Supabase project:

```bash
cd /Users/scottstephens/stratiri
supabase link --project-ref vnuithaqtpgbwmdvtxik
```

You'll be prompted for your database password. This is stored locally and encrypted.

### Step 4: Verify Setup

```bash
# List your projects
supabase projects list

# Check project status
supabase status
```

## Automated Setup Script

You can also use the provided setup script:

```bash
# With interactive login
./scripts/utilities/setup-supabase-cli.sh

# Or with access token
SUPABASE_ACCESS_TOKEN='your-token' ./scripts/utilities/setup-supabase-cli.sh
```

## Common Commands

Once set up, you can use these commands from Cursor:

### Database Operations

```bash
# Pull remote schema to local
supabase db pull

# Push local migrations to remote
supabase db push

# Compare local vs remote schema
supabase db diff

# Execute a SQL file on remote database
supabase db execute --file scripts/migrations/11-enhance-accounts-and-connections-fixed.sql

# Generate TypeScript types from database
supabase gen types typescript --project-id vnuithaqtpgbwmdvtxik > lib/database.types.ts
```

### Project Management

```bash
# List all your projects
supabase projects list

# Get project details
supabase projects get vnuithaqtpgbwmdvtxik

# View project API keys
supabase projects api-keys --project-ref vnuithaqtpgbwmdvtxik
```

### Migration Management

```bash
# Create a new migration
supabase migration new migration_name

# List migrations
supabase migration list

# Apply migrations
supabase db push
```

## Configuration Files

After linking, Supabase CLI creates:

- `.supabase/config.toml` - Project link configuration (contains project reference and encrypted password)
- `supabase/config.toml` - Local development configuration (already exists)

**Note:** The `.supabase` directory contains sensitive information and should be in `.gitignore`.

## Troubleshooting

### "Cannot use automatic login flow inside non-TTY environments"

This happens when running in non-interactive environments (like Cursor's terminal). Solutions:

1. **Use access token:**
   ```bash
   export SUPABASE_ACCESS_TOKEN='your-token'
   supabase link --project-ref vnuithaqtpgbwmdvtxik
   ```

2. **Run login in your regular terminal first:**
   ```bash
   # In your regular terminal
   supabase login
   # Then link
   supabase link --project-ref vnuithaqtpgbwmdvtxik
   ```

### "Project not found" or "Access denied"

- Verify you have access to the project in Supabase dashboard
- Check that the project reference is correct: `vnuithaqtpgbwmdvtxik`
- Ensure you're authenticated: `supabase projects list`

### "Command not found: supabase"

- Ensure `~/.local/bin` is in your PATH
- Check installation: `~/.local/bin/supabase --version`
- Add to PATH: `export PATH="$HOME/.local/bin:$PATH"`

### Database Password Issues

If you need to update the stored database password:

```bash
supabase link --project-ref vnuithaqtpgbwmdvtxik
# Enter new password when prompted
```

## Using in Cursor

Once configured, Cursor can run Supabase CLI commands directly. For example:

```bash
# In Cursor terminal
cd /Users/scottstephens/stratiri
supabase db execute --file scripts/migrations/11-enhance-accounts-and-connections-fixed.sql
```

The CLI will use the stored credentials from `.supabase/config.toml`.

## Security Notes

- Never commit `.supabase/config.toml` to git (it contains encrypted credentials)
- Access tokens should be kept secure
- Database passwords are encrypted locally but still sensitive
- Use environment variables for CI/CD environments

## Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Supabase CLI GitHub](https://github.com/supabase/cli)
- [Project Dashboard](https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik)

