# 🚀 Stratiri Production Deployment Guide

## Option 1: Vercel (RECOMMENDED - Easiest)

**Perfect for**: Most use cases, fastest deployment, zero config
**Cost**: Free tier or $20/month Pro
**Setup Time**: 10 minutes

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Initialize Git (if not already)

```bash
cd /Users/scottstephens/stratiri

# Initialize git
git init

# Create .gitignore (already exists)
# Add all files
git add .
git commit -m "Initial commit - Stratiri production ready"
```

### Step 3: Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# Questions you'll see:
# ? Set up and deploy "~/stratiri"? [Y/n] Y
# ? Which scope? (Use arrow keys) → Select your account
# ? Link to existing project? [y/N] N
# ? What's your project's name? stratiri
# ? In which directory is your code located? ./
# ? Want to override the settings? [y/N] N
```

**That's it!** Your app will be live at: `https://stratiri-xxxxx.vercel.app`

### Step 4: Add Custom Domain (Optional)

```bash
# In Vercel dashboard or CLI:
vercel domains add yourdomain.com
vercel domains add www.yourdomain.com

# Then add DNS records at your domain registrar:
# A record: @ → 76.76.21.21
# CNAME record: www → cname.vercel-dns.com
```

### Step 5: Production Deploy

```bash
# Deploy to production
vercel --prod

# Your production URL will be: https://stratiri.yourdomain.com
```

---

## Option 2: Vercel + Database (RECOMMENDED for Real Use)

For a production app, you need a real database instead of CSV files.

### Step 1: Set Up Database (Choose One)

#### Option A: Vercel Postgres (Easiest, Integrated)

```bash
# In Vercel Dashboard:
# 1. Go to your project
# 2. Click "Storage" tab
# 3. Click "Create Database"
# 4. Select "Postgres"
# 5. Choose region (closest to users)
# 6. Click "Create"

# Vercel automatically adds DATABASE_URL to your environment
```

#### Option B: Supabase (Free Tier, Full PostgreSQL)

1. Go to [https://supabase.com](https://supabase.com)
2. Create account and new project
3. Get database URL from Settings → Database
4. Copy the connection string

```bash
# Add to Vercel environment variables:
# DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
```

#### Option C: Railway (Simple, Affordable)

1. Go to [https://railway.app](https://railway.app)
2. Create new project
3. Add PostgreSQL database
4. Copy DATABASE_URL from variables tab

### Step 2: Update Code for Database

Install PostgreSQL client:

```bash
cd /Users/scottstephens/stratiri
npm install pg
npm install @types/pg --save-dev
```

I'll create database-ready code for you:

```typescript
// lib/db.ts - NEW FILE
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

export async function query(text: string, params?: any[]) {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result.rows
  } finally {
    client.release()
  }
}

// Helper functions for each table
export async function getAccounts() {
  return await query('SELECT * FROM accounts ORDER BY account_id')
}

export async function getEntities() {
  return await query('SELECT * FROM entities ORDER BY entity_id')
}

export async function getTransactions() {
  return await query('SELECT * FROM transactions ORDER BY date DESC')
}

export async function getPayments() {
  return await query('SELECT * FROM payments ORDER BY scheduled_date')
}

export async function getForecasts() {
  return await query('SELECT * FROM forecasts ORDER BY date')
}
```

### Step 3: Create Database Schema

```sql
-- Run this in your database (Supabase SQL editor, Railway dashboard, etc.)

CREATE TABLE entities (
    entity_id VARCHAR(20) PRIMARY KEY,
    entity_name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL,
    tax_id VARCHAR(50),
    entity_type VARCHAR(100),
    parent_entity VARCHAR(20),
    status VARCHAR(50) DEFAULT 'Active',
    incorporation_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounts (
    account_id VARCHAR(20) PRIMARY KEY,
    account_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    entity_id VARCHAR(20) REFERENCES entities(entity_id),
    bank_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
    transaction_id VARCHAR(20) PRIMARY KEY,
    account_id VARCHAR(20) REFERENCES accounts(account_id),
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    type VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Completed',
    reference VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    payment_id VARCHAR(20) PRIMARY KEY,
    from_account VARCHAR(20) REFERENCES accounts(account_id),
    to_entity VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    scheduled_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Draft',
    approver VARCHAR(100),
    description TEXT,
    payment_type VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'Medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE forecasts (
    forecast_id VARCHAR(20) PRIMARY KEY,
    date DATE NOT NULL,
    predicted_balance DECIMAL(15,2) NOT NULL,
    actual_balance DECIMAL(15,2),
    variance DECIMAL(15,2),
    confidence DECIMAL(3,2),
    entity_id VARCHAR(20) REFERENCES entities(entity_id),
    currency VARCHAR(3) NOT NULL,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_accounts_entity ON accounts(entity_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_forecasts_entity ON forecasts(entity_id);
```

### Step 4: Import CSV Data to Database

```bash
# Option A: Using psql (if you have PostgreSQL client)
psql $DATABASE_URL

# Then in psql:
\copy entities FROM '/Users/scottstephens/stratiri/data/entities.csv' CSV HEADER
\copy accounts FROM '/Users/scottstephens/stratiri/data/accounts.csv' CSV HEADER
\copy transactions FROM '/Users/scottstephens/stratiri/data/transactions.csv' CSV HEADER
\copy payments FROM '/Users/scottstephens/stratiri/data/payments.csv' CSV HEADER
\copy forecasts FROM '/Users/scottstephens/stratiri/data/forecast.csv' CSV HEADER

# Option B: Use Supabase dashboard
# 1. Go to Table Editor
# 2. Create tables using SQL editor (paste schema above)
# 3. Use CSV import feature for each table

# Option C: Use a migration script (I'll create this for you)
```

### Step 5: Update API Routes

Change each API route to use database instead of CSV:

```typescript
// app/api/accounts/route.ts
import { NextResponse } from 'next/server'
import { getAccounts } from '@/lib/db'

export async function GET() {
  try {
    const accounts = await getAccounts()
    return NextResponse.json(accounts)
  } catch (error) {
    console.error('Database error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    )
  }
}
```

### Step 6: Set Environment Variables in Vercel

```bash
# Via CLI:
vercel env add DATABASE_URL

# Or via Dashboard:
# 1. Go to project settings
# 2. Click "Environment Variables"
# 3. Add: DATABASE_URL = your_connection_string
# 4. Select: Production, Preview, Development
```

### Step 7: Deploy

```bash
git add .
git commit -m "Added database support"
vercel --prod
```

---

## Option 3: DigitalOcean App Platform

**Perfect for**: Full control, predictable pricing, simple deployment
**Cost**: $5-12/month (includes database)
**Setup Time**: 15 minutes

### Step 1: Push to GitHub

```bash
cd /Users/scottstephens/stratiri

# Create GitHub repo (go to github.com/new)
# Then:
git remote add origin https://github.com/yourusername/stratiri.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on DigitalOcean

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Connect GitHub repository
4. Configure:
   - **Name**: stratiri
   - **Region**: Choose closest to you
   - **Branch**: main
   - **Build Command**: `npm run build`
   - **Run Command**: `npm start`
   - **HTTP Port**: 3000

### Step 3: Add Database

1. In same app, click "Create" → "Database"
2. Choose PostgreSQL
3. Select Dev Database ($7/month) or Production ($15/month)
4. DigitalOcean auto-adds DATABASE_URL

### Step 4: Deploy

Click "Deploy" - takes 5-10 minutes
Your app will be at: `https://stratiri-xxxxx.ondigitalocean.app`

---

## Option 4: AWS (Enterprise-Grade)

**Perfect for**: Large scale, enterprise requirements, full control
**Cost**: Variable ($20-100+/month depending on usage)
**Setup Time**: 30-60 minutes

### Option A: AWS Amplify (Easiest AWS Option)

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Configure
amplify configure

# Initialize
cd /Users/scottstephens/stratiri
amplify init

# Add hosting
amplify add hosting

# Choose:
# ? Select the plugin module to execute: Hosting with Amplify Console
# ? Choose a type: Manual deployment

# Publish
amplify publish
```

### Option B: AWS EC2 + RDS (Full Control)

**Step 1: Launch EC2 Instance**
1. Go to EC2 Console
2. Launch Instance (Ubuntu 22.04 LTS)
3. Choose t2.small or t3.small
4. Configure security group:
   - Port 22 (SSH)
   - Port 80 (HTTP)
   - Port 443 (HTTPS)

**Step 2: Set Up Server**

```bash
# SSH into server
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Clone your repository
git clone https://github.com/yourusername/stratiri.git
cd stratiri

# Install dependencies
npm install

# Build
npm run build

# Start with PM2
pm2 start npm --name "stratiri" -- start
pm2 startup
pm2 save

# Install Nginx
sudo apt update
sudo apt install nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/stratiri
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/stratiri /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Install SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**Step 3: Set Up RDS (Database)**
1. Go to RDS Console
2. Create database (PostgreSQL)
3. Choose db.t3.micro (free tier eligible)
4. Configure:
   - Database name: stratiri
   - Username: postgres
   - Password: (set secure password)
5. Configure security group to allow EC2 access
6. Get endpoint URL

**Step 4: Configure Environment**
```bash
# On EC2
nano /home/ubuntu/stratiri/.env.production

# Add:
DATABASE_URL=postgresql://postgres:password@your-rds-endpoint:5432/stratiri
NODE_ENV=production

# Restart app
pm2 restart stratiri
```

---

## 🔐 Adding Authentication (Critical for Production)

### Option 1: NextAuth.js (Recommended)

```bash
npm install next-auth
```

Create `app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Add your logic here to validate credentials
        // Return user object if valid, null if not
        if (credentials?.email === 'admin@stratiri.com' && credentials?.password === 'password') {
          return { id: '1', name: 'Admin', email: 'admin@stratiri.com' }
        }
        return null
      }
    })
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async session({ session, token }) {
      return session
    }
  }
})

export { handler as GET, handler as POST }
```

Protect pages:

```typescript
// app/dashboard/page.tsx
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await getServerSession()
  
  if (!session) {
    redirect('/api/auth/signin')
  }
  
  // ... rest of your page
}
```

---

## 📊 Monitoring & Analytics

### Add Vercel Analytics (If using Vercel)

```bash
npm install @vercel/analytics
```

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Add Error Tracking (Sentry)

```bash
npx @sentry/wizard@latest -i nextjs
```

---

## 🎯 My Recommendation for You

### **For Quick Demo/MVP (This Week):**
→ **Vercel Free Tier** + CSV data
- Deploy in 2 minutes
- Share link with stakeholders
- $0 cost

### **For Real Use (This Month):**
→ **Vercel Pro ($20/mo)** + **Supabase Free Tier** + **NextAuth.js**
- Professional hosting
- Real database with 500MB free
- User authentication
- Total: $20/month

### **For Production/Enterprise:**
→ **Vercel Pro** + **Vercel Postgres** or **RDS** + **Auth** + **Monitoring**
- Scalable to thousands of users
- Secure and compliant
- Full monitoring
- Total: $50-200/month depending on usage

---

## 📝 Quick Deploy Checklist

- [ ] Code is in Git repository
- [ ] Build succeeds locally (`npm run build`)
- [ ] Environment variables documented
- [ ] Database schema created (if using DB)
- [ ] Data migrated (if using DB)
- [ ] Authentication configured (for production)
- [ ] Domain purchased (if custom domain)
- [ ] DNS configured
- [ ] SSL/HTTPS enabled
- [ ] Monitoring set up

---

## 🚀 Let's Get You Live Right Now!

Want me to walk you through the quickest option? Here's what I recommend:

**5-Minute Deploy to Vercel:**

```bash
# 1. Install Vercel
npm install -g vercel

# 2. Navigate to project
cd /Users/scottstephens/stratiri

# 3. Deploy!
vercel

# That's it! You'll get a live URL instantly.
```

Would you like me to:
1. ✅ Walk you through Vercel deployment right now?
2. ✅ Set up database integration for you?
3. ✅ Add authentication?
4. ✅ Configure a custom domain?

Let me know what you'd like to tackle first!

