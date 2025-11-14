# GitHub & Vercel Rename Guide

Complete guide to rename the repository and Vercel project from `treasuryx` to `stratifi`.

---

## 🔄 Step 1: Rename GitHub Repository

### Via GitHub Web Interface

1. Go to: https://github.com/scottystephens/treasuryx

2. Click **"Settings"** tab (far right)

3. Scroll down to **"Danger Zone"** section

4. Click **"Rename repository"**

5. Enter new name: `stratifi`

6. Click **"I understand, rename repository"**

**Result**: Repository will be at https://github.com/scottystephens/stratifi

### Update Local Git Remote

After renaming on GitHub, update your local repository:

```bash
cd /Users/scottstephens/treasuryx

# Update remote URL
git remote set-url origin https://github.com/scottystephens/stratifi.git

# Verify
git remote -v
```

**Note**: GitHub automatically redirects from old URL, but it's best to update.

---

## 🚀 Step 2: Rename Vercel Project

### Via Vercel Dashboard

1. Go to: https://vercel.com/scottystephens-projects/treasuryx

2. Click **"Settings"** tab

3. In the sidebar, click **"General"**

4. Scroll to **"Project Name"** section

5. Click **"Edit"** next to project name

6. Enter new name: `stratifi`

7. Click **"Save"**

**Result**: Project will be at https://vercel.com/scottystephens-projects/stratifi

### Production URL

After renaming, your production URL options:

**Option A - Keep current domain:**
- URL stays: `https://treasuryx-pi.vercel.app`
- Works fine, but name doesn't match

**Option B - Use new auto-generated domain:**
- New URL: `https://stratifi.vercel.app` (or `stratifi-xxxx.vercel.app`)
- Go to Settings → Domains
- Add `stratifi.vercel.app` as primary domain

**Option C - Custom domain (recommended for production):**
- Buy: `stratifi.com` or similar
- Add in Settings → Domains
- Update DNS records
- Professional branded URL

---

## 📝 Step 3: Update Documentation

After renaming, update these references:

### In README.md
```markdown
- Production: https://stratifi.vercel.app (or your custom domain)
- GitHub: https://github.com/scottystephens/stratifi
```

### In package.json
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/scottystephens/stratifi"
  },
  "homepage": "https://stratifi.vercel.app"
}
```

### Update Memory

The Supabase project URLs remain the same:
- Project ID: vnuithaqtpgbwmdvtxik
- Dashboard: https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik

---

## ✅ Verification Checklist

After completing all steps:

- [ ] GitHub repository renamed to `stratifi`
- [ ] Local git remote updated
- [ ] Vercel project renamed to `stratifi`
- [ ] Production URL decided (keep old or use new)
- [ ] README.md updated with new URLs
- [ ] package.json updated with repository info
- [ ] Test deployment works
- [ ] All links in documentation updated

---

## 🔧 If Something Goes Wrong

### GitHub Rename Issues
- GitHub automatically redirects old URLs
- Existing clones still work
- CI/CD may need webhook updates

### Vercel Rename Issues
- Deployments continue automatically
- Old URLs (treasuryx-*.vercel.app) still work
- Can revert name in settings if needed

### Rollback
If you need to rollback:
1. Rename back in GitHub settings
2. Rename back in Vercel settings
3. Update git remote

---

## 📞 After Rename

Update these external references:
- Any bookmarks
- Browser saved passwords
- Team member access links
- API documentation
- Client-facing URLs

---

## 🎉 Completion

Once renamed:
- ✅ Fully branded as Stratifi
- ✅ Consistent naming everywhere
- ✅ Professional appearance
- ✅ No TreasuryX references remaining

**Status**: Ready for official launch! 🚀

