# Google Cloud CLI Setup for Stratiri

This guide outlines how to configure and use the Google Cloud SDK (`gcloud`) for Stratiri development, specifically for managing Google Search Console, Analytics, and Gemini AI integration.

## Prerequisites

The Google Cloud SDK is installed via Homebrew on development machines.

```bash
# Verify installation
gcloud --version
```

## Authentication

To interact with Google Cloud services, you must authenticate the CLI:

```bash
# Login to Google Cloud
gcloud auth login
```

This will open a browser window where you should sign in with your Stratiri Google account.

### Setting the Project

Once authenticated, set the active project:

```bash
# List available projects
gcloud projects list

# Set the active project (replace PROJECT_ID)
gcloud config set project [PROJECT_ID]
```

## Common Operations for AI Agents

When working with Google Cloud resources, AI agents should use the following patterns:

### 1. Google Search Console Verification

To verify domain ownership via DNS (if not done via Vercel/GoDaddy directly):

```bash
# Get verification TXT record (example workflow)
# Note: This is usually done via the Search Console web UI, but CLI can manage DNS if hosted on Cloud DNS
```

### 2. Gemini AI Quota Management

Check quota usage for Gemini API:

```bash
gcloud services quota list --service=generativelanguage.googleapis.com --consumer=project:[PROJECT_ID]
```

### 3. Cloud Storage (if used for backups)

```bash
# List buckets
gcloud storage ls

# Upload file
gcloud storage cp ./data/backup.csv gs://[BUCKET_NAME]/
```

## Integration with Stratiri Codebase

- **Gemini AI:** The application uses the `@google/generative-ai` SDK. Credentials for this are stored in `.env.local` as `GOOGLE_GENERATIVE_AI_KEY`.
- **CLI Usage:** The `gcloud` CLI is primarily for infrastructure management and developer operations, not runtime application logic.

## Troubleshooting

If `gcloud` command is not found:

```bash
# Add to path (if using Homebrew)
source /opt/homebrew/share/google-cloud-sdk/path.zsh.inc
```

